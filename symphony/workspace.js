const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const { createError, formatError } = require("./errors");
const { ensurePathWithinRoot, sanitizeWorkspaceKey } = require("./path-safety");

const execFileAsync = promisify(execFile);

class WorkspaceManager {
  constructor(options) {
    this.settings = options.settings;
    this.logger = options.logger;
  }

  async createForIssue(issue) {
    const issueContext = normalizeIssueContext(issue);
    const workspaceKey = sanitizeWorkspaceKey(issueContext.issue_identifier);

    await fs.mkdir(this.settings.workspace.root, { recursive: true });

    const workspacePath = path.join(this.settings.workspace.root, workspaceKey);
    const { canonicalTarget } = await ensurePathWithinRoot(
      workspacePath,
      this.settings.workspace.root
    );

    let createdNow = false;

    try {
      const stat = await fs.stat(canonicalTarget);
      if (!stat.isDirectory()) {
        throw createError(
          "workspace_path_conflict",
          `Workspace path exists and is not a directory: ${canonicalTarget}`,
          { workspacePath: canonicalTarget }
        );
      }
    } catch (error) {
      if (error && error.code === "ENOENT") {
        await fs.mkdir(canonicalTarget, { recursive: true });
        createdNow = true;
      } else {
        throw error;
      }
    }

    if (createdNow && this.settings.hooks.after_create) {
      await this.runHook("after_create", canonicalTarget, issueContext, {
        fatal: true,
      });
    }

    return {
      path: canonicalTarget,
      workspaceKey,
      createdNow,
    };
  }

  async removeByIdentifier(identifier) {
    const workspaceKey = sanitizeWorkspaceKey(identifier);
    const workspacePath = path.join(this.settings.workspace.root, workspaceKey);

    await this.removePath(workspacePath);
  }

  async removePath(workspacePath) {
    let exists = false;

    try {
      const stat = await fs.stat(workspacePath);
      exists = stat.isDirectory();
    } catch (error) {
      if (!error || error.code !== "ENOENT") {
        throw error;
      }
    }

    if (!exists) {
      return;
    }

    const { canonicalTarget } = await ensurePathWithinRoot(
      workspacePath,
      this.settings.workspace.root
    );

    if (this.settings.hooks.before_remove) {
      await this.runHook("before_remove", canonicalTarget, {
        issue_id: null,
        issue_identifier: path.basename(canonicalTarget),
      }).catch(() => undefined);
    }

    await fs.rm(canonicalTarget, { recursive: true, force: true });
  }

  async runBeforeRunHook(workspacePath, issue) {
    if (!this.settings.hooks.before_run) {
      return;
    }

    await this.runHook("before_run", workspacePath, normalizeIssueContext(issue), {
      fatal: true,
    });
  }

  async runAfterRunHook(workspacePath, issue) {
    if (!this.settings.hooks.after_run) {
      return;
    }

    try {
      await this.runHook("after_run", workspacePath, normalizeIssueContext(issue));
    } catch (_error) {
      return;
    }
  }

  async runHook(hookName, workspacePath, issueContext, options = {}) {
    const fatal = options.fatal === true;
    const script = this.settings.hooks[hookName];

    if (!script) {
      return;
    }

    const timeoutMs = this.settings.hooks.timeout_ms;

    this.logger.info("Running workspace hook", {
      hook: hookName,
      issue_id: issueContext.issue_id,
      issue_identifier: issueContext.issue_identifier,
      workspace: workspacePath,
    });

    try {
      await execFileAsync("sh", ["-lc", script], {
        cwd: workspacePath,
        timeout: timeoutMs,
        maxBuffer: 2 * 1024 * 1024,
        env: process.env,
      });
    } catch (error) {
      const isTimeout = error && (error.killed || error.signal === "SIGTERM");
      const code = isTimeout ? "workspace_hook_timeout" : "workspace_hook_failed";

      this.logger.warn("Workspace hook failed", {
        hook: hookName,
        issue_id: issueContext.issue_id,
        issue_identifier: issueContext.issue_identifier,
        workspace: workspacePath,
        error: formatError(error),
      });

      const hookError = createError(code, `Workspace hook failed: ${hookName}`, {
        hookName,
        workspacePath,
        cause: error,
      });

      if (fatal) {
        throw hookError;
      }

      throw hookError;
    }
  }
}

function normalizeIssueContext(issue) {
  if (issue && typeof issue === "object") {
    return {
      issue_id: typeof issue.id === "string" ? issue.id : null,
      issue_identifier:
        typeof issue.identifier === "string" && issue.identifier.trim() !== ""
          ? issue.identifier
          : "issue",
    };
  }

  if (typeof issue === "string" && issue.trim() !== "") {
    return {
      issue_id: null,
      issue_identifier: issue,
    };
  }

  return {
    issue_id: null,
    issue_identifier: "issue",
  };
}

module.exports = {
  WorkspaceManager,
};
