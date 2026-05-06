const path = require("node:path");
const readline = require("node:readline");
const { spawn } = require("node:child_process");

const { getCodexRuntimeSettings } = require("./config");
const { createError, formatError } = require("./errors");
const { ensurePathWithinRoot } = require("./path-safety");
const { executeDynamicTool } = require("./dynamic-tool");

class CodexAppServerClient {
  constructor(options) {
    this.settings = options.settings;
    this.logger = options.logger;
    this.trackerClient = options.trackerClient || options.linearClient || null;
    this.linearClient =
      options.linearClient || (this.trackerClient?.kind === "linear" ? this.trackerClient : null);
    this.githubClient =
      options.githubClient || (this.trackerClient?.kind === "github" ? this.trackerClient : null);
    this.command = options.command || this.settings.codex.command;
    this.child = null;
    this.pendingRequests = new Map();
    this.nextRequestId = 100;
    this.session = null;
    this.activeTurn = null;
    this.stdoutInterface = null;
    this.stderrInterface = null;
    this.exited = false;
    this.stderrBuffer = [];
  }

  async startSession(workspacePath) {
    const { canonicalTarget } = await ensurePathWithinRoot(
      workspacePath,
      this.settings.workspace.root
    );

    const runtime = getCodexRuntimeSettings(this.settings, canonicalTarget);
    this.#spawn(canonicalTarget);

    try {
      await this.#request("initialize", {
        capabilities: {
          experimentalApi: true,
        },
        clientInfo: {
          name: "symphony-orchestrator",
          title: "Symphony Orchestrator",
          version: "0.1.0",
        },
      });

      this.#notify("initialized");

      const threadStart = await this.#request("thread/start", {
        approvalPolicy: runtime.approval_policy,
        sandbox: runtime.thread_sandbox,
        cwd: canonicalTarget,
        serviceName: "symphony-orchestrator",
      });

      const threadId = threadStart?.thread?.id;

      if (typeof threadId !== "string" || threadId.trim() === "") {
        throw createError("response_error", "thread/start did not return a thread id", {
          response: threadStart,
        });
      }

      this.session = {
        threadId,
        workspacePath: canonicalTarget,
        runtime,
      };

      return {
        threadId,
        workspacePath: canonicalTarget,
        codexAppServerPid: this.child?.pid ? String(this.child.pid) : null,
      };
    } catch (error) {
      await this.stop().catch(() => undefined);
      throw error;
    }
  }

  async runTurn(prompt, issue, options = {}) {
    if (!this.session) {
      throw createError("startup_failed", "Codex session has not been started");
    }

    if (typeof prompt !== "string" || prompt.trim() === "") {
      throw createError("template_render_error", "Cannot start a Codex turn with an empty prompt");
    }

    const title = issueTitle(issue);
    if (title) {
      await this.#maybeSetThreadName(title);
    }

    const turnStart = await this.#request("turn/start", {
      threadId: this.session.threadId,
      input: [
        {
          type: "text",
          text: prompt,
        },
      ],
      cwd: this.session.workspacePath,
      approvalPolicy: this.session.runtime.approval_policy,
      sandboxPolicy: this.session.runtime.turn_sandbox_policy,
    });

    const turnId = turnStart?.turn?.id;

    if (typeof turnId !== "string" || turnId.trim() === "") {
      throw createError("response_error", "turn/start did not return a turn id", {
        response: turnStart,
      });
    }

    const sessionId = `${this.session.threadId}-${turnId}`;
    const onMessage = typeof options.onMessage === "function" ? options.onMessage : () => {};

    this.#emit(
      onMessage,
      "session_started",
      {
        session_id: sessionId,
        thread_id: this.session.threadId,
        turn_id: turnId,
      },
      {}
    );

    return this.#awaitTurnCompletion({
      turnId,
      sessionId,
      onMessage,
      signal: options.signal || null,
    });
  }

  async stop() {
    if (!this.child) {
      return;
    }

    const child = this.child;
    this.child = null;

    if (this.stdoutInterface) {
      this.stdoutInterface.close();
      this.stdoutInterface = null;
    }

    if (this.stderrInterface) {
      this.stderrInterface.close();
      this.stderrInterface = null;
    }

    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(
        createError("port_exit", "Codex app-server stopped before responding", {
          requestId,
        })
      );
    }
    this.pendingRequests.clear();

    if (!child.killed) {
      child.kill("SIGTERM");
      await waitForProcessExit(child, 2000).catch(() => undefined);
      if (!child.killed && child.exitCode === null) {
        child.kill("SIGKILL");
      }
    }

    this.session = null;
    this.activeTurn = null;
  }

  #spawn(cwd) {
    this.exited = false;
    this.stderrBuffer = [];

    const child = spawn("bash", ["-lc", this.command], {
      cwd,
      stdio: ["pipe", "pipe", "pipe"],
      env: process.env,
    });

    this.child = child;

    this.stdoutInterface = readline.createInterface({
      input: child.stdout,
      crlfDelay: Infinity,
    });

    this.stderrInterface = readline.createInterface({
      input: child.stderr,
      crlfDelay: Infinity,
    });

    this.stdoutInterface.on("line", (line) => {
      this.#handleStdoutLine(line);
    });

    this.stderrInterface.on("line", (line) => {
      const text = normalizeStderrLine(line);
      if (!text) {
        return;
      }

      this.stderrBuffer.push(text);
      this.stderrBuffer = this.stderrBuffer.slice(-20);

      if (isNonFatalModelRefreshWarning(text) || isNonFatalBubblewrapWarning(text)) {
        this.logger.debug("Codex app-server non-fatal stderr", {
          line: summarizeStderrLine(text),
        });
      } else if (/\b(error|warn|warning|failed|fatal|panic|exception)\b/i.test(text)) {
        this.logger.warn("Codex app-server stderr", {
          line: summarizeStderrLine(text),
        });
      } else {
        this.logger.debug("Codex app-server stderr", {
          line: summarizeStderrLine(text),
        });
      }
    });

    child.on("error", (error) => {
      this.#handleProcessFailure(
        createError("codex_not_found", "Failed to spawn codex app-server command", {
          cause: error,
        })
      );
    });

    child.on("exit", (code, signal) => {
      this.exited = true;
      this.#handleProcessFailure(this.#exitError(code, signal));
    });
  }

  #handleStdoutLine(line) {
    const raw = String(line).trim();

    if (!raw) {
      return;
    }

    let payload;

    try {
      payload = JSON.parse(raw);
    } catch (_error) {
      this.#emitActive("malformed", { payload: raw, raw });
      return;
    }

    if (payload && Object.prototype.hasOwnProperty.call(payload, "id") && !payload.method) {
      const pending = this.pendingRequests.get(payload.id);

      if (!pending) {
        this.#emitActive("other_message", { payload, raw });
        return;
      }

      this.pendingRequests.delete(payload.id);
      clearTimeout(pending.timer);

      if (payload.error) {
        pending.reject(
          createError("response_error", "Codex app-server request failed", {
            response: payload,
          })
        );
      } else if (Object.prototype.hasOwnProperty.call(payload, "result")) {
        pending.resolve(payload.result);
      } else {
        pending.reject(
          createError("response_error", "Codex app-server response did not include a result", {
            response: payload,
          })
        );
      }

      return;
    }

    if (payload && payload.method && Object.prototype.hasOwnProperty.call(payload, "id")) {
      this.#handleServerRequest(payload, raw).catch((error) => {
        this.logger.warn("Failed to handle app-server request", {
          method: payload.method,
          error: formatError(error),
        });
      });
      return;
    }

    if (payload && payload.method) {
      this.#handleNotification(payload, raw);
      return;
    }

    this.#emitActive("other_message", { payload, raw });
  }

  async #handleServerRequest(payload, raw) {
    const method = payload.method;
    const id = payload.id;
    const params = payload.params || {};

    switch (method) {
      case "item/commandExecution/requestApproval":
        this.#sendResult(id, {
          decision: this.#autoApproveEnabled() ? "acceptForSession" : "cancel",
        });
        this.#emitActive("approval_auto_approved", {
          payload,
          raw,
          decision: this.#autoApproveEnabled() ? "acceptForSession" : "cancel",
        });
        return;

      case "item/fileChange/requestApproval":
        this.#sendResult(id, {
          decision: this.#autoApproveEnabled() ? "acceptForSession" : "cancel",
        });
        this.#emitActive("approval_auto_approved", {
          payload,
          raw,
          decision: this.#autoApproveEnabled() ? "acceptForSession" : "cancel",
        });
        return;

      case "item/permissions/requestApproval":
        this.#sendResult(id, {
          permissions: {},
          scope: "turn",
        });
        this.#emitActive("notification", {
          payload,
          raw,
          summary: "permissions request denied by non-interactive runtime",
        });
        return;

      case "mcpServer/elicitation/request":
        this.#sendResult(id, {
          action: "decline",
        });
        this.#emitActive("notification", {
          payload,
          raw,
          summary: "mcp elicitation declined by non-interactive runtime",
        });
        return;

      case "item/tool/requestUserInput": {
        const answers = chooseUserInputAnswers(params, this.#autoApproveEnabled());
        this.#sendResult(id, { answers });
        this.#emitActive("notification", {
          payload,
          raw,
          summary: "tool user input auto-answered",
        });
        return;
      }

      case "item/tool/call": {
        const toolName = normalizeToolName(params);
        const argumentsValue = normalizeToolArguments(params);
        const result = await executeDynamicTool(toolName, argumentsValue, {
          trackerClient: this.trackerClient,
          githubClient: this.githubClient,
          linearClient: this.linearClient,
        });
        this.#sendResult(id, result);

        this.#emitActive(result.success ? "notification" : "unsupported_tool_call", {
          payload,
          raw,
          tool: toolName,
        });
        return;
      }

      case "execCommandApproval":
        this.#sendResult(id, {
          decision: this.#autoApproveEnabled() ? "approved_for_session" : "cancel",
        });
        this.#emitActive("approval_auto_approved", {
          payload,
          raw,
        });
        return;

      case "applyPatchApproval":
        this.#sendResult(id, {
          decision: this.#autoApproveEnabled() ? "approved_for_session" : "cancel",
        });
        this.#emitActive("approval_auto_approved", {
          payload,
          raw,
        });
        return;

      default:
        this.#sendError(id, -32601, `Unsupported server request: ${method}`);
        this.#emitActive("notification", {
          payload,
          raw,
          summary: `unsupported server request: ${method}`,
        });
    }
  }

  #handleNotification(payload, raw) {
    const method = payload.method;
    const params = payload.params || {};

    if (method === "turn/completed") {
      const turnStatus = params?.turn?.status;

      if (turnStatus === "completed") {
        this.#emitActive("turn_completed", {
          payload,
          raw,
          usage: params?.usage || null,
        });
        this.#finishActiveTurn(null, {
          status: turnStatus,
          payload,
        });
        return;
      }

      if (turnStatus === "interrupted") {
        this.#emitActive("turn_cancelled", {
          payload,
          raw,
        });
        this.#finishActiveTurn(
          createError("turn_cancelled", "Codex turn was interrupted", { payload }),
          null
        );
        return;
      }

      this.#emitActive("turn_failed", {
        payload,
        raw,
      });
      this.#finishActiveTurn(createError("turn_failed", "Codex turn failed", { payload }), null);
      return;
    }

    const details = {
      payload,
      raw,
    };

    if (method === "thread/tokenUsage/updated") {
      details.usage = params?.tokenUsage?.total || null;
    }

    if (method === "account/rateLimits/updated") {
      details.rate_limits = params?.rateLimits || null;
    }

    if (isTurnInputRequiredMessage(method, params)) {
      this.#emitActive("turn_input_required", details);
      this.#finishActiveTurn(
        createError("turn_input_required", "Codex requested input during a non-interactive turn", {
          payload,
        }),
        null
      );
      return;
    }

    this.#emitActive("notification", details);
  }

  #awaitTurnCompletion(context) {
    return new Promise((resolve, reject) => {
      if (context.signal && context.signal.aborted) {
        reject(
          createError("turn_cancelled", "Codex turn was cancelled by orchestration", {
            turnId: context.turnId,
          })
        );
        return;
      }

      const timeoutHandle = setTimeout(() => {
        this.#finishActiveTurn(
          createError("turn_timeout", "Codex turn exceeded turn_timeout_ms", {
            turnId: context.turnId,
          }),
          null
        );
        this.stop().catch(() => undefined);
      }, this.settings.codex.turn_timeout_ms);

      const abortHandler = () => {
        this.#finishActiveTurn(
          createError("turn_cancelled", "Codex turn was cancelled by orchestration", {
            turnId: context.turnId,
          }),
          null
        );
        this.stop().catch(() => undefined);
      };

      if (context.signal) {
        if (context.signal.aborted) {
          abortHandler();
          return;
        }

        context.signal.addEventListener("abort", abortHandler, { once: true });
      }

      this.activeTurn = {
        ...context,
        resolve,
        reject,
        timeoutHandle,
        abortHandler,
      };
    });
  }

  #finishActiveTurn(error, result) {
    if (!this.activeTurn) {
      return;
    }

    const currentTurn = this.activeTurn;
    this.activeTurn = null;

    clearTimeout(currentTurn.timeoutHandle);

    if (currentTurn.signal && currentTurn.abortHandler) {
      currentTurn.signal.removeEventListener("abort", currentTurn.abortHandler);
    }

    if (error) {
      currentTurn.reject(error);
    } else {
      currentTurn.resolve({
        ...result,
        sessionId: currentTurn.sessionId,
        threadId: this.session?.threadId || null,
        turnId: currentTurn.turnId,
      });
    }
  }

  #handleProcessFailure(error) {
    if (!error) {
      return;
    }

    for (const [requestId, pending] of this.pendingRequests.entries()) {
      clearTimeout(pending.timer);
      pending.reject(errorForRequest(error, requestId));
    }
    this.pendingRequests.clear();

    if (this.activeTurn) {
      this.#emitActive("turn_ended_with_error", {
        reason: error.message,
      });
      this.#finishActiveTurn(error, null);
    }
  }

  #exitError(code, signal) {
    if (code === 127 || this.stderrBuffer.some((line) => /command not found/i.test(line))) {
      return createError("codex_not_found", "Codex app-server command was not found", {
        code,
        signal,
      });
    }

    return createError("port_exit", "Codex app-server exited unexpectedly", {
      code,
      signal,
    });
  }

  #request(method, params) {
    return new Promise((resolve, reject) => {
      if (!this.child || this.exited) {
        reject(createError("port_exit", "Codex app-server is not running"));
        return;
      }

      const id = this.nextRequestId;
      this.nextRequestId += 1;

      const timer = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(
          createError("response_timeout", `Timed out waiting for ${method} response`, {
            method,
            requestId: id,
          })
        );
      }, this.settings.codex.read_timeout_ms);

      this.pendingRequests.set(id, {
        resolve,
        reject,
        timer,
      });

      this.#write({
        id,
        method,
        params,
      });
    });
  }

  #notify(method) {
    this.#write({ method });
  }

  #sendResult(id, result) {
    this.#write({
      id,
      result,
    });
  }

  #sendError(id, code, message) {
    this.#write({
      id,
      error: {
        code,
        message,
      },
    });
  }

  #write(message) {
    if (!this.child || !this.child.stdin || this.child.stdin.destroyed) {
      throw createError("port_exit", "Cannot write to stopped codex app-server");
    }

    this.child.stdin.write(`${JSON.stringify(message)}\n`);
  }

  async #maybeSetThreadName(title) {
    if (!title) {
      return;
    }

    try {
      await this.#request("thread/name/set", {
        threadId: this.session.threadId,
        name: title,
      });
    } catch (error) {
      this.logger.debug("Failed to set thread name", {
        error: formatError(error),
      });
    }
  }

  #autoApproveEnabled() {
    return this.session?.runtime?.approval_policy === "never";
  }

  #emitActive(event, details) {
    if (!this.activeTurn) {
      return;
    }

    this.#emit(this.activeTurn.onMessage, event, details, {});
  }

  #emit(onMessage, event, details, metadata) {
    if (typeof onMessage !== "function") {
      return;
    }

    onMessage({
      event,
      timestamp: new Date().toISOString(),
      codex_app_server_pid: this.child?.pid ? String(this.child.pid) : null,
      ...metadata,
      ...details,
    });
  }
}

function chooseUserInputAnswers(params, autoApprove) {
  const questions = Array.isArray(params?.questions) ? params.questions : [];
  const answers = {};

  for (const question of questions) {
    if (!question || typeof question.id !== "string") {
      continue;
    }

    let answer = "This is a non-interactive session. Operator input is unavailable.";

    if (autoApprove) {
      answer =
        pickApprovalLabel(question.options) ||
        "This is a non-interactive session. Operator input is unavailable.";
    }

    answers[question.id] = {
      answers: [answer],
    };
  }

  return answers;
}

function pickApprovalLabel(options) {
  if (!Array.isArray(options)) {
    return null;
  }

  const labels = options
    .map((option) => (typeof option?.label === "string" ? option.label : null))
    .filter(Boolean);

  return (
    labels.find((label) => label === "Approve this Session") ||
    labels.find((label) => label === "Approve Once") ||
    labels.find((label) => /^(approve|allow)/i.test(label)) ||
    null
  );
}

function issueTitle(issue) {
  if (!issue || typeof issue !== "object") {
    return null;
  }

  if (typeof issue.identifier === "string" && typeof issue.title === "string") {
    return `${issue.identifier}: ${issue.title}`;
  }

  return null;
}

function normalizeToolName(params) {
  const value = params?.tool || params?.name;
  return typeof value === "string" && value.trim() !== "" ? value.trim() : null;
}

function normalizeToolArguments(params) {
  return params?.arguments ?? {};
}

function isTurnInputRequiredMessage(method, params) {
  if (typeof method !== "string") {
    return false;
  }

  if (
    [
      "turn/input_required",
      "turn/needs_input",
      "turn/need_input",
      "turn/request_input",
      "turn/request_response",
      "turn/provide_input",
      "turn/approval_required",
    ].includes(method)
  ) {
    return true;
  }

  return (
    params?.requiresInput === true ||
    params?.needsInput === true ||
    params?.input_required === true ||
    params?.inputRequired === true ||
    params?.type === "input_required" ||
    params?.type === "needs_input"
  );
}

function errorForRequest(error, requestId) {
  if (error && error.requestId === requestId) {
    return error;
  }

  return createError(error.code || "port_exit", error.message || "Codex app-server request failed", {
    cause: error,
    requestId,
  });
}

function waitForProcessExit(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error("Timed out waiting for process exit"));
    }, timeoutMs);

    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function normalizeStderrLine(line) {
  return stripAnsi(String(line)).trim();
}

function stripAnsi(value) {
  return String(value).replace(/\u001B\[[0-9;?]*[ -/]*[@-~]/g, "");
}

function isNonFatalModelRefreshWarning(line) {
  return (
    typeof line === "string" &&
    line.includes("codex_models_manager::manager") &&
    line.includes("failed to refresh available models") &&
    line.includes("missing field `models`")
  );
}

function isNonFatalBubblewrapWarning(line) {
  return (
    typeof line === "string" &&
    line.includes("Codex could not find bubblewrap on PATH") &&
    line.includes("will use the vendored bubblewrap in the meantime")
  );
}

function summarizeStderrLine(line) {
  if (typeof line !== "string") {
    return "";
  }

  const withoutBody = line.replace(/\s+body:\s*\{[\s\S]*$/i, " body: <omitted>");
  return withoutBody.length > 800 ? `${withoutBody.slice(0, 800)}...<truncated>` : withoutBody;
}

module.exports = {
  CodexAppServerClient,
  isNonFatalBubblewrapWarning,
  isNonFatalModelRefreshWarning,
  normalizeStderrLine,
  summarizeStderrLine,
};
