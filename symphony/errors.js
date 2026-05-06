function createError(code, message, details = {}) {
  const error = new Error(message);
  error.code = code;
  Object.assign(error, details);
  return error;
}

function getErrorCode(error, fallback = "unknown_error") {
  if (error && typeof error === "object" && typeof error.code === "string") {
    return error.code;
  }

  return fallback;
}

function formatError(error) {
  if (!error) {
    return "unknown error";
  }

  if (typeof error === "string") {
    return error;
  }

  if (error instanceof Error) {
    return error.message;
  }

  try {
    return JSON.stringify(error);
  } catch (_error) {
    return String(error);
  }
}

module.exports = {
  createError,
  formatError,
  getErrorCode,
};
