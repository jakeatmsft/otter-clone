const { createError } = require("./errors");
const { GitHubClient } = require("./github-client");
const { LinearClient } = require("./linear-client");

function createTrackerClient(options) {
  const trackerKind = options?.settings?.tracker?.kind;

  switch (trackerKind) {
    case "github":
      return new GitHubClient(options);
    case "linear":
      return new LinearClient(options);
    default:
      throw createError(
        "unsupported_tracker_kind",
        `Unsupported tracker kind: ${String(trackerKind || "")}`,
        {
          trackerKind,
        }
      );
  }
}

module.exports = {
  createTrackerClient,
};
