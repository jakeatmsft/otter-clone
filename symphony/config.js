const os = require("node:os");
const path = require("node:path");

const { createError } = require("./errors");

const DEFAULT_WORKSPACE_ROOT = path.join(os.tmpdir(), "symphony_workspaces");

const DEFAULTS = {
  tracker: {
    kind: null,
    linear_endpoint: "https://api.linear.app/graphql",
    github_endpoint: "https://api.github.com/graphql",
    api_key: null,
    project_slug: null,
    project_owner: null,
    project_number: null,
    project_repository: null,
    status_field_name: "Status",
    priority_field_name: "Priority",
    active_states: ["Todo", "In Progress"],
    terminal_states: ["Closed", "Cancelled", "Canceled", "Duplicate", "Done"],
  },
  polling: {
    interval_ms: 30000,
  },
  workspace: {
    root: DEFAULT_WORKSPACE_ROOT,
  },
  hooks: {
    after_create: null,
    before_run: null,
    after_run: null,
    before_remove: null,
    timeout_ms: 60000,
  },
  agent: {
    max_concurrent_agents: 10,
    max_turns: 20,
    max_retry_backoff_ms: 300000,
    max_concurrent_agents_by_state: {},
  },
  codex: {
    command: "codex app-server",
    approval_policy: "never",
    thread_sandbox: "workspace-write",
    turn_sandbox_policy: null,
    turn_timeout_ms: 3600000,
    read_timeout_ms: 5000,
    stall_timeout_ms: 300000,
  },
};

function parseSettings(workflowConfig, options = {}) {
  const config = workflowConfig && typeof workflowConfig === "object" ? workflowConfig : {};
  const workflowPath = options.workflowPath ? path.resolve(options.workflowPath) : null;
  const workflowDir = workflowPath ? path.dirname(workflowPath) : process.cwd();
  const trackerKind = stringOrNull(config?.tracker?.kind);

  const settings = {
    tracker: {
      kind: trackerKind,
      endpoint: stringOrDefault(config?.tracker?.endpoint, defaultTrackerEndpoint(trackerKind)),
      api_key: resolveSecretValue(config?.tracker?.api_key, defaultTrackerApiKey(trackerKind)),
      project_slug: stringOrNull(config?.tracker?.project_slug),
      project_owner: stringOrNull(config?.tracker?.project_owner),
      project_number: integerOrDefault(config?.tracker?.project_number, null),
      project_repository: stringOrNull(config?.tracker?.project_repository),
      status_field_name: stringOrDefault(
        config?.tracker?.status_field_name,
        DEFAULTS.tracker.status_field_name
      ),
      priority_field_name: stringOrDefault(
        config?.tracker?.priority_field_name,
        DEFAULTS.tracker.priority_field_name
      ),
      active_states: stringListOrDefault(
        config?.tracker?.active_states,
        DEFAULTS.tracker.active_states
      ),
      terminal_states: stringListOrDefault(
        config?.tracker?.terminal_states,
        DEFAULTS.tracker.terminal_states
      ),
    },
    polling: {
      interval_ms: integerOrDefault(config?.polling?.interval_ms, DEFAULTS.polling.interval_ms),
    },
    workspace: {
      root: resolveWorkspaceRoot(config?.workspace?.root, workflowDir),
    },
    hooks: {
      after_create: stringOrNull(config?.hooks?.after_create),
      before_run: stringOrNull(config?.hooks?.before_run),
      after_run: stringOrNull(config?.hooks?.after_run),
      before_remove: stringOrNull(config?.hooks?.before_remove),
      timeout_ms: integerOrDefault(config?.hooks?.timeout_ms, DEFAULTS.hooks.timeout_ms),
    },
    agent: {
      max_concurrent_agents: integerOrDefault(
        config?.agent?.max_concurrent_agents,
        DEFAULTS.agent.max_concurrent_agents
      ),
      max_turns: integerOrDefault(config?.agent?.max_turns, DEFAULTS.agent.max_turns),
      max_retry_backoff_ms: integerOrDefault(
        config?.agent?.max_retry_backoff_ms,
        DEFAULTS.agent.max_retry_backoff_ms
      ),
      max_concurrent_agents_by_state: normalizeStateLimits(
        config?.agent?.max_concurrent_agents_by_state
      ),
    },
    codex: {
      command: stringOrDefault(config?.codex?.command, DEFAULTS.codex.command),
      approval_policy:
        normalizeKeys(config?.codex?.approval_policy) ?? DEFAULTS.codex.approval_policy,
      thread_sandbox: stringOrDefault(
        config?.codex?.thread_sandbox,
        DEFAULTS.codex.thread_sandbox
      ),
      turn_sandbox_policy: normalizeOptionalMap(config?.codex?.turn_sandbox_policy),
      turn_timeout_ms: integerOrDefault(
        config?.codex?.turn_timeout_ms,
        DEFAULTS.codex.turn_timeout_ms
      ),
      read_timeout_ms: integerOrDefault(
        config?.codex?.read_timeout_ms,
        DEFAULTS.codex.read_timeout_ms
      ),
      stall_timeout_ms: integerOrDefault(
        config?.codex?.stall_timeout_ms,
        DEFAULTS.codex.stall_timeout_ms
      ),
    },
    workflow_path: workflowPath,
  };

  validateSettings(settings);
  return settings;
}

function validateSettings(settings) {
  const trackerKind = stringOrNull(settings?.tracker?.kind);

  if (!trackerKind) {
    throw createError("missing_tracker_kind", "tracker.kind is required");
  }

  switch (trackerKind) {
    case "linear":
      if (!stringOrNull(settings?.tracker?.api_key)) {
        throw createError("missing_tracker_api_key", "tracker.api_key is required for Linear");
      }

      if (!stringOrNull(settings?.tracker?.project_slug)) {
        throw createError(
          "missing_tracker_project_slug",
          "tracker.project_slug is required for Linear"
        );
      }
      break;

    case "github":
      if (!stringOrNull(settings?.tracker?.api_key)) {
        throw createError(
          "missing_tracker_api_key",
          "tracker.api_key is required for GitHub Projects v2"
        );
      }

      if (!stringOrNull(settings?.tracker?.project_owner)) {
        throw createError(
          "missing_tracker_project_owner",
          "tracker.project_owner is required for GitHub Projects v2"
        );
      }

      assertPositiveInteger(settings?.tracker?.project_number, "tracker.project_number");
      break;

    default:
      throw createError(
        "unsupported_tracker_kind",
        `Unsupported tracker kind: ${trackerKind}`,
        { trackerKind }
      );
  }

  if (!stringOrNull(settings?.codex?.command)) {
    throw createError("missing_codex_command", "codex.command must be a non-empty string");
  }

  assertPositiveInteger(settings?.polling?.interval_ms, "polling.interval_ms");
  assertPositiveInteger(settings?.hooks?.timeout_ms, "hooks.timeout_ms");
  assertPositiveInteger(settings?.agent?.max_concurrent_agents, "agent.max_concurrent_agents");
  assertPositiveInteger(settings?.agent?.max_turns, "agent.max_turns");
  assertPositiveInteger(settings?.agent?.max_retry_backoff_ms, "agent.max_retry_backoff_ms");
  assertPositiveInteger(settings?.codex?.turn_timeout_ms, "codex.turn_timeout_ms");
  assertPositiveInteger(settings?.codex?.read_timeout_ms, "codex.read_timeout_ms");
  assertNonNegativeInteger(settings?.codex?.stall_timeout_ms, "codex.stall_timeout_ms");
}

function defaultPromptTemplate() {
  return [
    "You are working on an issue from the configured tracker.",
    "",
    "Identifier: {{ issue.identifier }}",
    "Title: {{ issue.title }}",
    "",
    "Body:",
    "{% if issue.description %}",
    "{{ issue.description }}",
    "{% else %}",
    "No description provided.",
    "{% endif %}",
  ].join("\n");
}

function getCodexRuntimeSettings(settings, workspacePath) {
  const runtimeWorkspace = workspacePath ? path.resolve(workspacePath) : settings.workspace.root;

  return {
    approval_policy: settings.codex.approval_policy,
    thread_sandbox: settings.codex.thread_sandbox,
    turn_sandbox_policy:
      settings.codex.turn_sandbox_policy || defaultTurnSandboxPolicy(runtimeWorkspace),
  };
}

function defaultTurnSandboxPolicy(workspacePath) {
  return {
    type: "workspaceWrite",
    writableRoots: [path.resolve(workspacePath)],
    networkAccess: false,
    excludeTmpdirEnvVar: false,
    excludeSlashTmp: false,
  };
}

function defaultTrackerApiKey(trackerKind) {
  switch (trackerKind) {
    case "github":
      return process.env.GITHUB_TOKEN;
    case "linear":
    default:
      return process.env.LINEAR_API_KEY;
  }
}

function defaultTrackerEndpoint(trackerKind) {
  switch (trackerKind) {
    case "github":
      return DEFAULTS.tracker.github_endpoint;
    case "linear":
    default:
      return DEFAULTS.tracker.linear_endpoint;
  }
}

function maxConcurrentAgentsForState(settings, stateName) {
  const normalizedState = normalizeIssueState(stateName);
  return (
    settings.agent.max_concurrent_agents_by_state[normalizedState] ||
    settings.agent.max_concurrent_agents
  );
}

function normalizeIssueState(stateName) {
  return typeof stateName === "string" ? stateName.trim().toLowerCase() : "";
}

function stringOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function stringOrDefault(value, fallback) {
  return stringOrNull(value) || fallback;
}

function stringListOrDefault(value, fallback) {
  if (!Array.isArray(value)) {
    return [...fallback];
  }

  const items = value.map((item) => stringOrNull(item)).filter(Boolean);
  return items.length > 0 ? items : [...fallback];
}

function integerOrDefault(value, fallback) {
  if (Number.isInteger(value)) {
    return value;
  }

  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number.parseInt(value, 10);
    if (Number.isInteger(parsed)) {
      return parsed;
    }
  }

  return fallback;
}

function assertPositiveInteger(value, fieldName) {
  if (!Number.isInteger(value) || value <= 0) {
    throw createError(
      "invalid_workflow_config",
      `${fieldName} must be a positive integer`,
      { fieldName, value }
    );
  }
}

function assertNonNegativeInteger(value, fieldName) {
  if (!Number.isInteger(value) || value < 0) {
    throw createError(
      "invalid_workflow_config",
      `${fieldName} must be a non-negative integer`,
      { fieldName, value }
    );
  }
}

function resolveSecretValue(value, fallback) {
  if (typeof value !== "string") {
    return normalizeSecretValue(fallback);
  }

  const envName = envReferenceName(value);

  if (envName) {
    const resolved = process.env[envName];
    return normalizeSecretValue(resolved === undefined ? fallback : resolved);
  }

  return normalizeSecretValue(value);
}

function normalizeSecretValue(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function resolveWorkspaceRoot(value, workflowDir) {
  const defaultRoot = DEFAULT_WORKSPACE_ROOT;
  let resolved = value;

  if (typeof resolved === "string") {
    const envName = envReferenceName(resolved);
    if (envName) {
      resolved = process.env[envName];
    }
  }

  if (typeof resolved !== "string" || resolved.trim() === "") {
    resolved = defaultRoot;
  }

  const expandedTilde = expandHomeDirectory(resolved.trim());
  const expandedPath = path.isAbsolute(expandedTilde)
    ? expandedTilde
    : path.resolve(workflowDir, expandedTilde);

  return path.normalize(expandedPath);
}

function expandHomeDirectory(value) {
  if (value === "~") {
    return os.homedir();
  }

  if (value.startsWith("~/")) {
    return path.join(os.homedir(), value.slice(2));
  }

  return value;
}

function envReferenceName(value) {
  const match = typeof value === "string" ? value.match(/^\$([A-Za-z_][A-Za-z0-9_]*)$/) : null;
  return match ? match[1] : null;
}

function normalizeStateLimits(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized = {};

  for (const [rawStateName, rawLimit] of Object.entries(value)) {
    const stateName = normalizeIssueState(rawStateName);
    const limit = integerOrDefault(rawLimit, null);

    if (!stateName || !Number.isInteger(limit) || limit <= 0) {
      continue;
    }

    normalized[stateName] = limit;
  }

  return normalized;
}

function normalizeKeys(value) {
  if (Array.isArray(value)) {
    return value.map(normalizeKeys);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [String(key), normalizeKeys(nestedValue)])
    );
  }

  return value;
}

function normalizeOptionalMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return normalizeKeys(value);
}

module.exports = {
  DEFAULTS,
  DEFAULT_WORKSPACE_ROOT,
  defaultPromptTemplate,
  defaultTrackerApiKey,
  defaultTrackerEndpoint,
  defaultTurnSandboxPolicy,
  getCodexRuntimeSettings,
  maxConcurrentAgentsForState,
  normalizeIssueState,
  parseSettings,
  validateSettings,
};
