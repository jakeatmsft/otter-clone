const { getCodexRuntimeSettings, normalizeIssueState } = require("./config");
const { buildPrompt } = require("./prompt-builder");
const { CodexAppServerClient } = require("./codex-app-server");
const { formatError } = require("./errors");

class AgentRunner {
  constructor(options) {
    this.workflowStore = options.workflowStore;
    this.workspaceManager = options.workspaceManager;
    this.trackerClient = options.trackerClient;
    this.settings = options.settings;
    this.logger = options.logger;
  }

  async runIssue(issue, attempt, options = {}) {
    const onUpdate = typeof options.onUpdate === "function" ? options.onUpdate : () => {};
    const signal = options.signal || null;

    const workspace = await this.workspaceManager.createForIssue(issue);

    onUpdate({
      event: "runtime_info",
      timestamp: new Date().toISOString(),
      workspace_path: workspace.path,
    });

    await this.workspaceManager.runBeforeRunHook(workspace.path, issue);

    const currentSettings = await this.workflowStore.currentSettings();
    const maxTurns = currentSettings.agent.max_turns;
    const appServer = new CodexAppServerClient({
      settings: currentSettings,
      logger: this.logger,
      trackerClient: this.trackerClient,
    });

    try {
      try {
        await appServer.startSession(workspace.path);
      } catch (error) {
        onUpdate({
          event: "startup_failed",
          timestamp: new Date().toISOString(),
          summary: formatError(error),
          error_code: error.code || "startup_failed",
          workspace_path: workspace.path,
        });
        throw error;
      }

      for (let turnNumber = 1; turnNumber <= maxTurns; turnNumber += 1) {
        throwIfAborted(signal);

        const workflow = await this.workflowStore.currentWorkflow();
        const prompt =
          turnNumber === 1
            ? await buildPrompt(workflow, issue, attempt)
            : continuationPrompt(turnNumber, maxTurns);

        await appServer.runTurn(prompt, issue, {
          onMessage: onUpdate,
          signal,
        });

        throwIfAborted(signal);

        const refreshedIssues = await this.trackerClient.fetchIssueStatesByIds([issue.id]);
        const refreshedIssue = refreshedIssues[0] || issue;

        if (!isActiveIssue(refreshedIssue, currentSettings)) {
          return;
        }

        issue = refreshedIssue;
      }
    } finally {
      await appServer.stop().catch(() => undefined);
      await this.workspaceManager.runAfterRunHook(workspace.path, issue);
    }
  }
}

function continuationPrompt(turnNumber, maxTurns) {
  return [
    "Continuation guidance:",
    "",
    "- The previous Codex turn completed normally, but the Linear issue is still in an active state.",
    `- This is continuation turn #${turnNumber} of ${maxTurns} for the current agent run.`,
    "- Resume from the current workspace and workpad state instead of restarting from scratch.",
    "- The original task instructions and prior turn context are already present in this thread, so do not restate them before acting.",
    "- Focus on the remaining ticket work and do not end the turn while the issue stays active unless you are truly blocked.",
  ].join("\n");
}

function isActiveIssue(issue, settings) {
  const activeStates = new Set(settings.tracker.active_states.map(normalizeIssueState));
  return activeStates.has(normalizeIssueState(issue?.state));
}

function throwIfAborted(signal) {
  if (signal && signal.aborted) {
    const error = new Error("Agent run was cancelled");
    error.code = "turn_cancelled";
    throw error;
  }
}

module.exports = {
  AgentRunner,
  continuationPrompt,
};
