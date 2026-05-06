const util = require("node:util");

const LEVEL_PRIORITY = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function createLogger(options = {}) {
  const level = normalizeLevel(options.level || process.env.SYMPHONY_LOG_LEVEL || "info");
  const sink = typeof options.sink === "function" ? options.sink : defaultSink;

  function shouldLog(messageLevel) {
    return LEVEL_PRIORITY[messageLevel] >= LEVEL_PRIORITY[level];
  }

  function emit(messageLevel, message, context = {}) {
    if (!shouldLog(messageLevel)) {
      return;
    }

    const timestamp = new Date().toISOString();
    const line = [
      `ts=${timestamp}`,
      `level=${messageLevel}`,
      `msg=${quoteValue(message)}`,
      formatContext(context),
    ]
      .filter(Boolean)
      .join(" ");

    sink(line);
  }

  return {
    level,
    debug(message, context) {
      emit("debug", message, context);
    },
    info(message, context) {
      emit("info", message, context);
    },
    warn(message, context) {
      emit("warn", message, context);
    },
    error(message, context) {
      emit("error", message, context);
    },
  };
}

function defaultSink(line) {
  process.stderr.write(`${line}\n`);
}

function normalizeLevel(level) {
  return Object.prototype.hasOwnProperty.call(LEVEL_PRIORITY, level) ? level : "info";
}

function formatContext(context) {
  if (!context || typeof context !== "object") {
    return "";
  }

  return Object.entries(context)
    .filter(([, value]) => value !== undefined)
    .map(([key, value]) => `${key}=${quoteValue(value)}`)
    .join(" ");
}

function quoteValue(value) {
  if (value === null) {
    return "null";
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const text =
    typeof value === "string" ? value : util.inspect(value, { depth: 4, breakLength: Infinity });

  return JSON.stringify(text.length > 600 ? `${text.slice(0, 600)}...<truncated>` : text);
}

module.exports = {
  createLogger,
};
