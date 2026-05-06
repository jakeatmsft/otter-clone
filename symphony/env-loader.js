const fs = require("node:fs/promises");
const path = require("node:path");

async function loadSymphonyEnv(options = {}) {
  const cwd = path.resolve(options.cwd || process.cwd());
  const workflowPath = options.workflowPath ? path.resolve(options.workflowPath) : null;
  const workflowDir = workflowPath ? path.dirname(workflowPath) : cwd;
  const logger = options.logger || null;
  const loaded = [];

  const candidatePaths = uniquePaths([
    path.join(cwd, ".env.local"),
    path.join(workflowDir, ".env.local"),
  ]);

  for (const envPath of candidatePaths) {
    const result = await loadEnvFileIfPresent(envPath);
    if (!result.loaded) {
      continue;
    }

    loaded.push(result);

    if (logger && typeof logger.info === "function") {
      logger.info("Loaded environment file", {
        env_path: envPath,
        loaded_keys: result.loadedKeys.length,
      });
    }
  }

  return {
    loaded,
  };
}

async function loadEnvFileIfPresent(envPath) {
  let content;

  try {
    content = await fs.readFile(envPath, "utf8");
  } catch (error) {
    if (error && error.code === "ENOENT") {
      return {
        loaded: false,
        path: envPath,
        loadedKeys: [],
      };
    }

    throw error;
  }

  const parsed = parseEnvFile(content);
  const loadedKeys = [];

  for (const [key, value] of Object.entries(parsed)) {
    if (isPlaceholderValue(value)) {
      continue;
    }

    if (Object.prototype.hasOwnProperty.call(process.env, key) && process.env[key] !== "") {
      continue;
    }

    process.env[key] = value;
    loadedKeys.push(key);
  }

  return {
    loaded: true,
    path: envPath,
    loadedKeys,
  };
}

function parseEnvFile(content) {
  const values = {};
  const lines = String(content).split(/\r?\n/);

  for (const line of lines) {
    const parsed = parseEnvLine(line);
    if (!parsed) {
      continue;
    }

    values[parsed.key] = parsed.value;
  }

  return values;
}

function parseEnvLine(line) {
  const raw = String(line || "").trim();

  if (!raw || raw.startsWith("#")) {
    return null;
  }

  const normalized = raw.startsWith("export ") ? raw.slice(7).trim() : raw;
  const match = normalized.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);

  if (!match) {
    return null;
  }

  const [, key, valueSource] = match;
  return {
    key,
    value: normalizeEnvValue(valueSource),
  };
}

function normalizeEnvValue(valueSource) {
  const trimmed = String(valueSource || "").trim();

  if (trimmed.length >= 2) {
    if (trimmed.startsWith('"') && trimmed.endsWith('"')) {
      return decodeDoubleQuotedValue(trimmed.slice(1, -1));
    }

    if (trimmed.startsWith("'") && trimmed.endsWith("'")) {
      return trimmed.slice(1, -1);
    }
  }

  return trimmed;
}

function decodeDoubleQuotedValue(value) {
  return value
    .replace(/\\n/g, "\n")
    .replace(/\\r/g, "\r")
    .replace(/\\t/g, "\t")
    .replace(/\\"/g, '"')
    .replace(/\\\\/g, "\\");
}

function uniquePaths(paths) {
  return [...new Set(paths.map((entry) => path.resolve(entry)))];
}

function isPlaceholderValue(value) {
  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim();

  return (
    /^your_[a-z0-9_]+_here$/i.test(normalized) ||
    /^replace-with-[a-z0-9_-]+$/i.test(normalized)
  );
}

module.exports = {
  isPlaceholderValue,
  loadEnvFileIfPresent,
  loadSymphonyEnv,
  parseEnvFile,
  parseEnvLine,
};
