const { AgentRunner } = require("./agent-runner");
const {
  maxConcurrentAgentsForState,
  normalizeIssueState,
  parseSettings,
  validateSettings,
} = require("./config");
const { formatError } = require("./errors");
const { createTrackerClient } = require("./tracker-client");
const { WorkspaceManager } = require("./workspace");

const CONTINUATION_RETRY_DELAY_MS = 1000;
const FAILURE_RETRY_BASE_MS = 10000;

class Orchestrator {
  constructor(options) {
    this.workflowStore = options.workflowStore;
    this.logger = options.logger;
    this.createTrackerClient =
      options.createTrackerClient ||
      ((settings) =>
        createTrackerClient({
          settings,
          logger: this.logger,
        }));
    this.createWorkspaceManager =
      options.createWorkspaceManager ||
      ((settings) =>
        new WorkspaceManager({
          settings,
          logger: this.logger,
        }));
    this.createAgentRunner =
      options.createAgentRunner ||
      ((runnerOptions) =>
        new AgentRunner({
          ...runnerOptions,
          logger: this.logger,
        }));

    this.running = new Map();
    this.claimed = new Set();
    this.retryAttempts = new Map();
    this.completed = new Set();
    this.tickTimer = null;
    this.stopped = false;
    this.codexTotals = {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
      seconds_running: 0,
    };
    this.codexRateLimits = null;
  }

  async start() {
    const settings = await this.workflowStore.currentSettings();
    validateSettings(settings);
    await this.#runStartupTerminalWorkspaceCleanup(settings);
    this.#scheduleTick(0);
  }

  async stop() {
    this.stopped = true;

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
      this.tickTimer = null;
    }

    for (const retryEntry of this.retryAttempts.values()) {
      clearTimeout(retryEntry.timerHandle);
    }
    this.retryAttempts.clear();

    for (const runningEntry of this.running.values()) {
      runningEntry.abortController.abort();
    }
    this.running.clear();
    this.claimed.clear();
  }

  snapshot() {
    const now = Date.now();
    const liveSeconds =
      this.codexTotals.seconds_running +
      [...this.running.values()].reduce((sum, entry) => sum + runningSeconds(entry.startedAt, now), 0);

    return {
      running: [...this.running.values()].map((entry) => ({
        issue_id: entry.issue.id,
        issue_identifier: entry.issue.identifier,
        state: entry.issue.state,
        session_id: entry.session_id,
        turn_count: entry.turn_count,
        last_event: entry.last_codex_event,
        last_message: entry.last_codex_message,
        started_at: new Date(entry.startedAt).toISOString(),
        last_event_at: entry.last_codex_timestamp
          ? new Date(entry.last_codex_timestamp).toISOString()
          : null,
        tokens: {
          input_tokens: entry.codex_input_tokens,
          output_tokens: entry.codex_output_tokens,
          total_tokens: entry.codex_total_tokens,
        },
        workspace_path: entry.workspace_path,
      })),
      retrying: [...this.retryAttempts.values()].map((entry) => ({
        issue_id: entry.issue_id,
        issue_identifier: entry.identifier,
        attempt: entry.attempt,
        due_at: new Date(entry.dueAtMs).toISOString(),
        error: entry.error,
      })),
      codex_totals: {
        ...this.codexTotals,
        seconds_running: liveSeconds,
      },
      rate_limits: this.codexRateLimits,
    };
  }

  async #tick() {
    if (this.stopped) {
      return;
    }

    const storeState = await this.workflowStore.current();
    const settings = storeState.settings;
    await this.#reconcileRunningIssues(settings);

    try {
      validateSettings(settings);
    } catch (error) {
      this.logger.error("Dispatch preflight validation failed", {
        error_code: error.code,
        error: formatError(error),
      });
      this.#scheduleTick(settings.polling.interval_ms);
      return;
    }

    const trackerClient = this.createTrackerClient(settings);

    let issues;
    try {
      issues = await trackerClient.fetchCandidateIssues();
    } catch (error) {
      this.logger.error("Failed to fetch candidate issues", {
        error_code: error.code,
        error: formatError(error),
      });
      this.#scheduleTick(settings.polling.interval_ms);
      return;
    }

    const sortedIssues = sortIssuesForDispatch(issues);
    for (const issue of sortedIssues) {
      if (availableSlots(this.running.size, settings.agent.max_concurrent_agents) <= 0) {
        break;
      }

      if (this.#shouldDispatchIssue(issue, settings)) {
        await this.#dispatchIssue(issue, null, settings);
      }
    }

    this.#scheduleTick(settings.polling.interval_ms);
  }

  async #dispatchIssue(issue, attempt, settings) {
    const trackerClient = this.createTrackerClient(settings);
    const workspaceManager = this.createWorkspaceManager(settings);
    const agentRunner = this.createAgentRunner({
      workflowStore: this.workflowStore,
      workspaceManager,
      trackerClient,
      settings,
    });

    let refreshedIssue = issue;
    try {
      const refreshed = await trackerClient.fetchIssueStatesByIds([issue.id]);
      if (refreshed[0]) {
        refreshedIssue = refreshed[0];
      }
    } catch (error) {
      this.logger.warn("Skipping dispatch; issue refresh failed", {
        issue_id: issue.id,
        issue_identifier: issue.identifier,
        error: formatError(error),
      });
      return;
    }

    if (!isCandidateIssue(refreshedIssue, settings) || todoIssueBlockedByNonTerminal(refreshedIssue, settings)) {
      this.logger.info("Skipping dispatch after issue refresh", {
        issue_id: refreshedIssue.id,
        issue_identifier: refreshedIssue.identifier,
        state: refreshedIssue.state,
      });
      return;
    }

    const abortController = new AbortController();
    const runningEntry = {
      issue: refreshedIssue,
      identifier: refreshedIssue.identifier,
      startedAt: Date.now(),
      abortController,
      retry_attempt: normalizeRetryAttempt(attempt),
      session_id: null,
      last_codex_event: null,
      last_codex_timestamp: null,
      last_codex_message: null,
      codex_app_server_pid: null,
      codex_input_tokens: 0,
      codex_output_tokens: 0,
      codex_total_tokens: 0,
      last_reported_input_tokens: 0,
      last_reported_output_tokens: 0,
      last_reported_total_tokens: 0,
      turn_count: 0,
      workspace_path: null,
    };

    this.running.set(refreshedIssue.id, runningEntry);
    this.claimed.add(refreshedIssue.id);
    this.retryAttempts.delete(refreshedIssue.id);

    this.logger.info("Dispatching issue to agent", {
      issue_id: refreshedIssue.id,
      issue_identifier: refreshedIssue.identifier,
      attempt,
    });

    agentRunner
      .runIssue(refreshedIssue, attempt, {
        signal: abortController.signal,
        onUpdate: (update) => {
          this.#integrateCodexUpdate(refreshedIssue.id, update);
        },
      })
      .then(() => {
        this.#handleWorkerExit(refreshedIssue.id, null);
      })
      .catch((error) => {
        this.#handleWorkerExit(refreshedIssue.id, error);
      });
  }

  async #reconcileRunningIssues(settings) {
    this.#reconcileStalledRuns(settings);

    if (this.running.size === 0) {
      return;
    }

    const trackerClient = this.createTrackerClient(settings);

    let issues;
    try {
      issues = await trackerClient.fetchIssueStatesByIds([...this.running.keys()]);
    } catch (error) {
      this.logger.debug("Failed to refresh running issue states; keeping workers running", {
        error: formatError(error),
      });
      return;
    }

    const visibleIds = new Set(issues.map((issue) => issue.id));

    for (const issue of issues) {
      if (isTerminalIssueState(issue.state, settings)) {
        this.logger.info("Issue moved to terminal state; stopping active agent", {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          state: issue.state,
        });
        await this.#terminateRunningIssue(issue.id, true, settings);
      } else if (isActiveIssueState(issue.state, settings)) {
        const runningEntry = this.running.get(issue.id);
        if (runningEntry) {
          runningEntry.issue = issue;
        }
      } else {
        this.logger.info("Issue moved to non-active state; stopping active agent", {
          issue_id: issue.id,
          issue_identifier: issue.identifier,
          state: issue.state,
        });
        await this.#terminateRunningIssue(issue.id, false, settings);
      }
    }

    for (const issueId of [...this.running.keys()]) {
      if (!visibleIds.has(issueId)) {
        this.logger.info("Issue no longer visible during running-state refresh; stopping active agent", {
          issue_id: issueId,
        });
        await this.#terminateRunningIssue(issueId, false, settings);
      }
    }
  }

  #reconcileStalledRuns(settings) {
    if (settings.codex.stall_timeout_ms <= 0) {
      return;
    }

    const now = Date.now();

    for (const [issueId, entry] of this.running.entries()) {
      const lastActivity = entry.last_codex_timestamp || entry.startedAt;
      const elapsedMs = now - lastActivity;

      if (elapsedMs <= settings.codex.stall_timeout_ms) {
        continue;
      }

      this.logger.warn("Issue stalled; restarting with backoff", {
        issue_id: issueId,
        issue_identifier: entry.identifier,
        session_id: entry.session_id,
        elapsed_ms: elapsedMs,
      });

      this.#terminateRunningIssue(issueId, false, settings).catch(() => undefined);
      this.#scheduleRetry(issueId, nextRetryAttemptFromRunning(entry), {
        identifier: entry.identifier,
        error: `stalled for ${elapsedMs}ms without codex activity`,
      }, settings);
    }
  }

  async #terminateRunningIssue(issueId, cleanupWorkspace, settings) {
    const entry = this.running.get(issueId);

    if (!entry) {
      this.claimed.delete(issueId);
      this.retryAttempts.delete(issueId);
      return;
    }

    this.#recordSessionCompletion(entry);
    this.running.delete(issueId);
    this.claimed.delete(issueId);
    this.retryAttempts.delete(issueId);

    entry.abortController.abort();

    if (cleanupWorkspace && entry.identifier) {
      const workspaceManager = this.createWorkspaceManager(settings);
      await workspaceManager.removeByIdentifier(entry.identifier).catch((error) => {
        this.logger.warn("Failed to remove workspace", {
          issue_identifier: entry.identifier,
          error: formatError(error),
        });
      });
    }
  }

  #handleWorkerExit(issueId, error) {
    const entry = this.running.get(issueId);

    if (!entry) {
      return;
    }

    this.#recordSessionCompletion(entry);
    this.running.delete(issueId);

    if (!error) {
      this.completed.add(issueId);
      this.#scheduleRetry(issueId, 1, {
        identifier: entry.identifier,
        delayType: "continuation",
      }, parseSettingsFromEntry(entry, this.workflowStore));

      this.logger.info("Agent task completed; scheduling continuation check", {
        issue_id: issueId,
        issue_identifier: entry.identifier,
        session_id: entry.session_id,
      });
      return;
    }

    const code = error.code || "worker_failed";
    if (code === "turn_cancelled" && !this.claimed.has(issueId)) {
      return;
    }

    this.#scheduleRetry(issueId, nextRetryAttemptFromRunning(entry), {
      identifier: entry.identifier,
      error: `agent exited: ${formatError(error)}`,
    }, parseSettingsFromEntry(entry, this.workflowStore));

    this.logger.warn("Agent task exited; scheduling retry", {
      issue_id: issueId,
      issue_identifier: entry.identifier,
      session_id: entry.session_id,
      error_code: code,
      error: formatError(error),
    });
  }

  #scheduleRetry(issueId, attempt, metadata, settings) {
    const currentSettingsPromise =
      settings instanceof Promise ? settings : Promise.resolve(settings || this.workflowStore.currentSettings());

    currentSettingsPromise
      .then((resolvedSettings) => {
        const previous = this.retryAttempts.get(issueId);
        if (previous) {
          clearTimeout(previous.timerHandle);
        }

        const nextAttempt =
          Number.isInteger(attempt) && attempt > 0 ? attempt : (previous?.attempt || 0) + 1;
        const delayMs = calculateRetryDelay(
          nextAttempt,
          resolvedSettings.agent.max_retry_backoff_ms,
          metadata.delayType
        );

        const dueAtMs = Date.now() + delayMs;
        const timerHandle = setTimeout(() => {
          this.#handleRetryTimer(issueId).catch((error) => {
            this.logger.error("Retry timer handling failed", {
              issue_id: issueId,
              error: formatError(error),
            });
          });
        }, delayMs);

        const entry = {
          issue_id: issueId,
          identifier: metadata.identifier || previous?.identifier || issueId,
          attempt: nextAttempt,
          dueAtMs,
          timerHandle,
          error: metadata.error || previous?.error || null,
        };

        this.retryAttempts.set(issueId, entry);
        this.claimed.add(issueId);

        this.logger.warn("Retrying issue", {
          issue_id: issueId,
          issue_identifier: entry.identifier,
          attempt: nextAttempt,
          delay_ms: delayMs,
          error: entry.error,
        });
      })
      .catch((error) => {
        this.logger.error("Failed to schedule retry", {
          issue_id: issueId,
          error: formatError(error),
        });
      });
  }

  async #handleRetryTimer(issueId) {
    const retryEntry = this.retryAttempts.get(issueId);

    if (!retryEntry || this.stopped) {
      return;
    }

    this.retryAttempts.delete(issueId);

    const settings = await this.workflowStore.currentSettings();
    const trackerClient = this.createTrackerClient(settings);

    let issues;
    try {
      issues = await trackerClient.fetchCandidateIssues();
    } catch (error) {
      this.#scheduleRetry(issueId, retryEntry.attempt + 1, {
        identifier: retryEntry.identifier,
        error: `retry poll failed: ${formatError(error)}`,
      }, settings);
      return;
    }

    const issue = issues.find((candidate) => candidate.id === issueId);

    if (!issue) {
      this.claimed.delete(issueId);
      return;
    }

    if (!this.#retryCandidateIssue(issue, settings)) {
      this.claimed.delete(issueId);
      return;
    }

    if (availableSlots(this.running.size, settings.agent.max_concurrent_agents) <= 0 || !stateSlotsAvailable(issue, this.running, settings)) {
      this.#scheduleRetry(issueId, retryEntry.attempt + 1, {
        identifier: issue.identifier,
        error: "no available orchestrator slots",
      }, settings);
      return;
    }

    await this.#dispatchIssue(issue, retryEntry.attempt, settings);
  }

  #integrateCodexUpdate(issueId, update) {
    const entry = this.running.get(issueId);

    if (!entry || !update || typeof update !== "object") {
      return;
    }

    if (update.workspace_path) {
      entry.workspace_path = update.workspace_path;
    }

    entry.last_codex_event = update.event || entry.last_codex_event;
    entry.last_codex_timestamp = Date.parse(update.timestamp || new Date().toISOString()) || Date.now();
    entry.codex_app_server_pid = update.codex_app_server_pid || entry.codex_app_server_pid;
    entry.last_codex_message = summarizeUpdate(update);

    if (update.event === "session_started") {
      entry.session_id = update.session_id;
      entry.turn_count += 1;
    }

    const usage = extractTokenUsage(update);
    if (usage) {
      const input = computeTokenDelta(entry.last_reported_input_tokens, usage.inputTokens);
      const output = computeTokenDelta(entry.last_reported_output_tokens, usage.outputTokens);
      const total = computeTokenDelta(entry.last_reported_total_tokens, usage.totalTokens);

      entry.codex_input_tokens += input.delta;
      entry.codex_output_tokens += output.delta;
      entry.codex_total_tokens += total.delta;

      entry.last_reported_input_tokens = input.reported;
      entry.last_reported_output_tokens = output.reported;
      entry.last_reported_total_tokens = total.reported;

      this.codexTotals.input_tokens += input.delta;
      this.codexTotals.output_tokens += output.delta;
      this.codexTotals.total_tokens += total.delta;
    }

    const rateLimits = update.rate_limits || update.rateLimits || update?.payload?.params?.rateLimits;
    if (rateLimits) {
      this.codexRateLimits = rateLimits;
    }

    this.#logCodexUpdate(entry, update);
  }

  #logCodexUpdate(entry, update) {
    const context = {
      issue_id: entry.issue.id,
      issue_identifier: entry.issue.identifier,
      session_id: entry.session_id,
      event: update.event || null,
      workspace_path: entry.workspace_path,
    };

    switch (update.event) {
      case "session_started":
        this.logger.info("Codex session started", {
          ...context,
          session_id: update.session_id || entry.session_id,
          thread_id: update.thread_id || null,
          turn_id: update.turn_id || null,
          codex_app_server_pid: update.codex_app_server_pid || null,
        });
        return;

      case "turn_completed":
        this.logger.info("Codex turn completed", {
          ...context,
          last_event_at: update.timestamp || null,
          total_tokens: entry.codex_total_tokens,
        });
        return;

      case "startup_failed":
        this.logger.warn("Codex startup failed", {
          ...context,
          error_code: update.error_code || "startup_failed",
          error: update.summary || summarizeUpdate(update),
        });
        return;

      case "turn_failed":
        this.logger.warn("Codex turn failed", {
          ...context,
          error: summarizeUpdate(update),
        });
        return;

      case "turn_cancelled":
        this.logger.warn("Codex turn cancelled", context);
        return;

      case "turn_input_required":
        this.logger.warn("Codex requested input during non-interactive turn", context);
        return;

      default:
        return;
    }
  }

  #recordSessionCompletion(entry) {
    this.codexTotals.seconds_running += runningSeconds(entry.startedAt, Date.now());
  }

  #shouldDispatchIssue(issue, settings) {
    if (!isCandidateIssue(issue, settings)) {
      return false;
    }

    if (todoIssueBlockedByNonTerminal(issue, settings)) {
      return false;
    }

    if (this.claimed.has(issue.id) || this.running.has(issue.id)) {
      return false;
    }

    if (availableSlots(this.running.size, settings.agent.max_concurrent_agents) <= 0) {
      return false;
    }

    return stateSlotsAvailable(issue, this.running, settings);
  }

  #retryCandidateIssue(issue, settings) {
    return isCandidateIssue(issue, settings) && !todoIssueBlockedByNonTerminal(issue, settings);
  }

  #scheduleTick(delayMs) {
    if (this.stopped) {
      return;
    }

    if (this.tickTimer) {
      clearTimeout(this.tickTimer);
    }

    this.tickTimer = setTimeout(() => {
      this.#tick().catch((error) => {
        this.logger.error("Orchestrator tick failed", {
          error_code: error.code || "tick_failed",
          error: formatError(error),
        });
      });
    }, delayMs);
  }

  async #runStartupTerminalWorkspaceCleanup(settings) {
    const trackerClient = this.createTrackerClient(settings);
    const workspaceManager = this.createWorkspaceManager(settings);

    try {
      const issues = await trackerClient.fetchIssuesByStates(settings.tracker.terminal_states);
      for (const issue of issues) {
        if (issue?.identifier) {
          await workspaceManager.removeByIdentifier(issue.identifier).catch(() => undefined);
        }
      }
    } catch (error) {
      this.logger.warn("Skipping startup terminal workspace cleanup", {
        error: formatError(error),
      });
    }
  }
}

function sortIssuesForDispatch(issues) {
  return [...issues].sort((left, right) => {
    const leftRank = priorityRank(left?.priority);
    const rightRank = priorityRank(right?.priority);

    if (leftRank !== rightRank) {
      return leftRank - rightRank;
    }

    const leftCreated = issueCreatedAtSortKey(left);
    const rightCreated = issueCreatedAtSortKey(right);
    if (leftCreated !== rightCreated) {
      return leftCreated - rightCreated;
    }

    return String(left?.identifier || left?.id || "").localeCompare(String(right?.identifier || right?.id || ""));
  });
}

function priorityRank(priority) {
  return Number.isInteger(priority) && priority >= 1 && priority <= 4 ? priority : 5;
}

function issueCreatedAtSortKey(issue) {
  if (issue?.created_at instanceof Date && !Number.isNaN(issue.created_at.valueOf())) {
    return issue.created_at.valueOf();
  }

  return Number.MAX_SAFE_INTEGER;
}

function isCandidateIssue(issue, settings) {
  return (
    issue &&
    typeof issue.id === "string" &&
    typeof issue.identifier === "string" &&
    typeof issue.title === "string" &&
    typeof issue.state === "string" &&
    isActiveIssueState(issue.state, settings) &&
    !isTerminalIssueState(issue.state, settings)
  );
}

function isActiveIssueState(stateName, settings) {
  return new Set(settings.tracker.active_states.map(normalizeIssueState)).has(
    normalizeIssueState(stateName)
  );
}

function isTerminalIssueState(stateName, settings) {
  return new Set(settings.tracker.terminal_states.map(normalizeIssueState)).has(
    normalizeIssueState(stateName)
  );
}

function todoIssueBlockedByNonTerminal(issue, settings) {
  if (normalizeIssueState(issue?.state) !== "todo") {
    return false;
  }

  return (issue?.blocked_by || []).some((blocker) => {
    if (typeof blocker?.state !== "string") {
      return true;
    }

    return !isTerminalIssueState(blocker.state, settings);
  });
}

function stateSlotsAvailable(issue, runningMap, settings) {
  const limit = maxConcurrentAgentsForState(settings, issue.state);
  let used = 0;

  for (const runningEntry of runningMap.values()) {
    if (normalizeIssueState(runningEntry.issue.state) === normalizeIssueState(issue.state)) {
      used += 1;
    }
  }

  return limit > used;
}

function availableSlots(runningCount, maxConcurrentAgents) {
  return Math.max(maxConcurrentAgents - runningCount, 0);
}

function normalizeRetryAttempt(attempt) {
  return Number.isInteger(attempt) && attempt > 0 ? attempt : 0;
}

function nextRetryAttemptFromRunning(entry) {
  return entry.retry_attempt > 0 ? entry.retry_attempt + 1 : null;
}

function calculateRetryDelay(attempt, maxRetryBackoffMs, delayType) {
  if (delayType === "continuation" && attempt === 1) {
    return CONTINUATION_RETRY_DELAY_MS;
  }

  return Math.min(
    FAILURE_RETRY_BASE_MS * 2 ** Math.min(Math.max(attempt - 1, 0), 10),
    maxRetryBackoffMs
  );
}

function runningSeconds(startedAtMs, nowMs) {
  return Math.max(0, Math.round((nowMs - startedAtMs) / 1000));
}

function parseSettingsFromEntry(_entry, workflowStore) {
  return workflowStore.currentSettings();
}

function summarizeUpdate(update) {
  if (typeof update.summary === "string" && update.summary.trim() !== "") {
    return update.summary.trim();
  }

  if (typeof update.raw === "string" && update.raw.trim() !== "") {
    return update.raw.trim().slice(0, 300);
  }

  if (update.payload && typeof update.payload.method === "string") {
    return update.payload.method;
  }

  return update.event || null;
}

function extractTokenUsage(update) {
  const usage =
    update?.payload?.params?.tokenUsage?.total ||
    update?.payload?.tokenUsage?.total ||
    null;

  if (!usage || typeof usage !== "object") {
    return null;
  }

  return {
    inputTokens: integerLike(
      usage.input_tokens ?? usage.prompt_tokens ?? usage.inputTokens ?? usage.promptTokens
    ),
    outputTokens: integerLike(
      usage.output_tokens ??
        usage.completion_tokens ??
        usage.outputTokens ??
        usage.completionTokens
    ),
    totalTokens: integerLike(usage.total_tokens ?? usage.totalTokens ?? usage.total),
  };
}

function computeTokenDelta(previous, next) {
  if (!Number.isInteger(next) || next < previous) {
    return {
      delta: 0,
      reported: previous,
    };
  }

  return {
    delta: next - previous,
    reported: next,
  };
}

function integerLike(value) {
  if (Number.isInteger(value) && value >= 0) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : null;
  }

  return null;
}

module.exports = {
  CONTINUATION_RETRY_DELAY_MS,
  FAILURE_RETRY_BASE_MS,
  Orchestrator,
  availableSlots,
  calculateRetryDelay,
  computeTokenDelta,
  extractTokenUsage,
  isActiveIssueState,
  isCandidateIssue,
  isTerminalIssueState,
  normalizeRetryAttempt,
  sortIssuesForDispatch,
  stateSlotsAvailable,
  todoIssueBlockedByNonTerminal,
};
