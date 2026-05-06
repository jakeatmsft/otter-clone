const crypto = require("node:crypto");
const fs = require("node:fs/promises");

const { formatError } = require("./errors");
const { parseSettings } = require("./config");
const { loadWorkflow } = require("./workflow");

class WorkflowStore {
  constructor(options) {
    this.workflowPath = options.workflowPath;
    this.logger = options.logger;
    this.pollIntervalMs = options.pollIntervalMs || 1000;
    this.state = null;
    this.timer = null;
  }

  async init() {
    this.state = await this.#loadState(this.workflowPath);
    this.#startPolling();
    return this.state;
  }

  async current() {
    return this.#reloadIfChanged();
  }

  async currentWorkflow() {
    const state = await this.current();
    return state.workflow;
  }

  async currentSettings() {
    const state = await this.current();
    return state.settings;
  }

  async forceReload() {
    const nextState = await this.#loadState(this.workflowPath);
    this.state = nextState;
    return nextState;
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  #startPolling() {
    this.timer = setInterval(() => {
      this.#reloadIfChanged().catch((error) => {
        this.logger.error(
          "Failed to reload workflow; keeping last known good configuration",
          {
            workflow_path: this.workflowPath,
            error: formatError(error),
            error_code: error.code || "unknown_error",
          }
        );
      });
    }, this.pollIntervalMs);

    if (typeof this.timer.unref === "function") {
      this.timer.unref();
    }
  }

  async #reloadIfChanged() {
    if (!this.state) {
      return this.init();
    }

    const nextStamp = await currentStamp(this.workflowPath);

    if (sameStamp(this.state.stamp, nextStamp)) {
      return this.state;
    }

    try {
      const nextState = await this.#loadState(this.workflowPath);
      this.state = nextState;
    } catch (error) {
      this.logger.error(
        "Failed to reload workflow; keeping last known good configuration",
        {
          workflow_path: this.workflowPath,
          error: formatError(error),
          error_code: error.code || "unknown_error",
        }
      );
    }

    return this.state;
  }

  async #loadState(workflowPath) {
    const workflow = await loadWorkflow(workflowPath);
    const settings = parseSettings(workflow.config, { workflowPath });
    const stamp = await currentStamp(workflowPath);

    return {
      workflowPath,
      workflow,
      settings,
      stamp,
    };
  }
}

async function currentStamp(workflowPath) {
  const [stat, content] = await Promise.all([
    fs.stat(workflowPath),
    fs.readFile(workflowPath, "utf8"),
  ]);

  return {
    mtimeMs: stat.mtimeMs,
    size: stat.size,
    hash: crypto.createHash("sha1").update(content).digest("hex"),
  };
}

function sameStamp(left, right) {
  return (
    left &&
    right &&
    left.mtimeMs === right.mtimeMs &&
    left.size === right.size &&
    left.hash === right.hash
  );
}

module.exports = {
  WorkflowStore,
  currentStamp,
};
