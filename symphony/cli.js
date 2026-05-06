#!/usr/bin/env node

const { createLogger } = require("./logger");
const { WorkflowStore } = require("./workflow-store");
const { resolveWorkflowPath } = require("./workflow");
const { Orchestrator } = require("./orchestrator");
const { formatError } = require("./errors");
const { loadSymphonyEnv } = require("./env-loader");

async function main() {
  const logger = createLogger();
  const workflowArg = process.argv[2];
  const workflowPath = resolveWorkflowPath(workflowArg, process.cwd());

  const workflowStore = new WorkflowStore({
    workflowPath,
    logger,
  });

  let orchestrator;

  try {
    await loadSymphonyEnv({
      cwd: process.cwd(),
      workflowPath,
      logger,
    });

    await workflowStore.init();

    orchestrator = new Orchestrator({
      workflowStore,
      logger,
    });

    await orchestrator.start();
  } catch (error) {
    logger.error("Failed to start Symphony", {
      workflow_path: workflowPath,
      error_code: error.code || "startup_failed",
      error: formatError(error),
    });
    process.exitCode = 1;
    return;
  }

  logger.info("Symphony started", {
    workflow_path: workflowPath,
  });

  const shutdown = async (signal) => {
    logger.info("Stopping Symphony", { signal });
    workflowStore.stop();

    if (orchestrator) {
      await orchestrator.stop();
    }
  };

  process.on("SIGINT", () => {
    shutdown("SIGINT")
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
  });

  process.on("SIGTERM", () => {
    shutdown("SIGTERM")
      .then(() => {
        process.exit(0);
      })
      .catch(() => {
        process.exit(1);
      });
  });
}

main().catch((error) => {
  const logger = createLogger();
  logger.error("Symphony exited abnormally", {
    error_code: error.code || "cli_failed",
    error: formatError(error),
  });
  process.exit(1);
});
