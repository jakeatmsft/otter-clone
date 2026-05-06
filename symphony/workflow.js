const fs = require("node:fs/promises");
const path = require("node:path");
const YAML = require("yaml");

const { createError } = require("./errors");

const DEFAULT_WORKFLOW_FILE = "WORKFLOW.md";

function resolveWorkflowPath(explicitPath, cwd = process.cwd()) {
  if (typeof explicitPath === "string" && explicitPath.trim() !== "") {
    return path.resolve(cwd, explicitPath);
  }

  return path.resolve(cwd, DEFAULT_WORKFLOW_FILE);
}

async function loadWorkflow(workflowPath) {
  let content;

  try {
    content = await fs.readFile(workflowPath, "utf8");
  } catch (error) {
    throw createError("missing_workflow_file", `Missing workflow file at ${workflowPath}`, {
      workflowPath,
      cause: error,
    });
  }

  return parseWorkflow(content, workflowPath);
}

function parseWorkflow(content, workflowPath = null) {
  const { frontMatterLines, promptLines } = splitFrontMatter(content);
  const rawFrontMatter = frontMatterLines.join("\n");

  let config = {};

  if (rawFrontMatter.trim() !== "") {
    let decoded;

    try {
      decoded = YAML.parse(rawFrontMatter);
    } catch (error) {
      throw createError("workflow_parse_error", "Failed to parse workflow front matter", {
        workflowPath,
        cause: error,
      });
    }

    if (decoded !== null && typeof decoded === "object" && !Array.isArray(decoded)) {
      config = decoded;
    } else {
      throw createError(
        "workflow_front_matter_not_a_map",
        "Workflow front matter must decode to a map",
        { workflowPath }
      );
    }
  }

  return {
    config,
    prompt_template: promptLines.join("\n").trim(),
    workflowPath,
  };
}

function splitFrontMatter(content) {
  const lines = String(content).split(/\r?\n/);

  if (lines[0] !== "---") {
    return {
      frontMatterLines: [],
      promptLines: lines,
    };
  }

  const frontMatterLines = [];
  let cursor = 1;

  while (cursor < lines.length && lines[cursor] !== "---") {
    frontMatterLines.push(lines[cursor]);
    cursor += 1;
  }

  if (lines[cursor] !== "---") {
    return {
      frontMatterLines,
      promptLines: [],
    };
  }

  return {
    frontMatterLines,
    promptLines: lines.slice(cursor + 1),
  };
}

module.exports = {
  DEFAULT_WORKFLOW_FILE,
  loadWorkflow,
  parseWorkflow,
  resolveWorkflowPath,
};
