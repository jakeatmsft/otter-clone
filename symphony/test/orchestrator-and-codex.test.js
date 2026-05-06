const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createLogger } = require("../logger");
const { defaultTurnSandboxPolicy } = require("../config");
const {
  CodexAppServerClient,
  isNonFatalBubblewrapWarning,
  isNonFatalModelRefreshWarning,
  normalizeStderrLine,
  summarizeStderrLine,
} = require("../codex-app-server");
const { executeDynamicTool } = require("../dynamic-tool");
const {
  calculateRetryDelay,
  extractTokenUsage,
  sortIssuesForDispatch,
  todoIssueBlockedByNonTerminal,
} = require("../orchestrator");

function createSilentLogger() {
  return createLogger({
    level: "debug",
    sink() {},
  });
}

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

test("orchestrator helper functions follow dispatch and retry rules", () => {
  const settings = {
    tracker: {
      active_states: ["Todo", "In Progress"],
      terminal_states: ["Done", "Closed"],
    },
    agent: {
      max_retry_backoff_ms: 25_000,
    },
  };

  const sorted = sortIssuesForDispatch([
    {
      id: "3",
      identifier: "ABC-3",
      priority: null,
      created_at: new Date("2026-01-03T00:00:00.000Z"),
    },
    {
      id: "2",
      identifier: "ABC-2",
      priority: 1,
      created_at: new Date("2026-01-02T00:00:00.000Z"),
    },
    {
      id: "1",
      identifier: "ABC-1",
      priority: 1,
      created_at: new Date("2026-01-01T00:00:00.000Z"),
    },
  ]);

  assert.deepEqual(
    sorted.map((issue) => issue.identifier),
    ["ABC-1", "ABC-2", "ABC-3"]
  );

  assert.equal(
    todoIssueBlockedByNonTerminal(
      {
        state: "Todo",
        blocked_by: [{ state: "In Progress" }],
      },
      settings
    ),
    true
  );
  assert.equal(
    todoIssueBlockedByNonTerminal(
      {
        state: "Todo",
        blocked_by: [{ state: "Done" }],
      },
      settings
    ),
    false
  );

  assert.equal(calculateRetryDelay(1, settings.agent.max_retry_backoff_ms, "continuation"), 1000);
  assert.equal(calculateRetryDelay(4, settings.agent.max_retry_backoff_ms), 25_000);

  assert.deepEqual(
    extractTokenUsage({
      payload: {
        params: {
          tokenUsage: {
            total: {
              input_tokens: 5,
              outputTokens: "3",
              total: 8,
            },
          },
        },
      },
    }),
    {
      inputTokens: 5,
      outputTokens: 3,
      totalTokens: 8,
    }
  );

  assert.equal(
    extractTokenUsage({
      usage: {
        input_tokens: 99,
      },
    }),
    null
  );
});

test("executeDynamicTool supports the linear_graphql extension and rejects invalid multi-operation input", async () => {
  const success = await executeDynamicTool(
    "linear_graphql",
    {
      query: "query Viewer { viewer { id } }",
      variables: {
        includeTeams: false,
      },
    },
    {
      linearClient: {
        async graphql(query, variables) {
          return {
            data: {
              query,
              variables,
            },
          };
        },
      },
    }
  );

  assert.equal(success.success, true);
  assert.match(success.output, /viewer/);
  assert.match(success.output, /includeTeams/);

  const failure = await executeDynamicTool(
    "linear_graphql",
    {
      query: "query One { viewer { id } } query Two { teams { nodes { id } } }",
    },
    {
      linearClient: {
        async graphql() {
          throw new Error("should not be called");
        },
      },
    }
  );

  assert.equal(failure.success, false);
  assert.match(failure.output, /exactly one GraphQL operation/);
});

test("codex app-server stderr helpers strip ANSI and downgrade the Azure model refresh warning", () => {
  const line =
    "\u001b[31mERROR\u001b[0m codex_models_manager::manager: failed to refresh available models: missing field `models` at line 1 column 1; body: {\"data\":[{\"id\":\"gpt-4\"}],\"object\":\"list\"}";

  const normalized = normalizeStderrLine(line);

  assert.match(normalized, /^ERROR codex_models_manager::manager:/);
  assert.equal(isNonFatalModelRefreshWarning(normalized), true);
  assert.equal(summarizeStderrLine(normalized).includes("body: <omitted>"), true);
  assert.equal(
    isNonFatalBubblewrapWarning(
      "ERROR codex_app_server: Codex could not find bubblewrap on PATH. Codex will use the vendored bubblewrap in the meantime."
    ),
    true
  );
});

test("CodexAppServerClient runs a turn, handles unsupported tool calls, and surfaces usage and rate limits", async (t) => {
  const tempDir = await createTempDir("symphony-codex-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const workspacePath = path.join(tempDir, "workspace");
  await fs.mkdir(workspacePath, { recursive: true });

  const fakeServerPath = path.join(__dirname, "fixtures", "fake-codex-app-server.js");
  const settings = {
    tracker: {
      kind: "linear",
      endpoint: "https://linear.example/graphql",
      api_key: "linear-token",
      project_slug: "demo",
      active_states: ["Todo", "In Progress"],
      terminal_states: ["Done"],
    },
    polling: {
      interval_ms: 1_000,
    },
    workspace: {
      root: tempDir,
    },
    hooks: {
      after_create: null,
      before_run: null,
      after_run: null,
      before_remove: null,
      timeout_ms: 5_000,
    },
    agent: {
      max_concurrent_agents: 2,
      max_turns: 2,
      max_retry_backoff_ms: 30_000,
      max_concurrent_agents_by_state: {},
    },
    codex: {
      command: `SYMPHONY_FAKE_APP_SERVER_MODE=tool-and-notify node ${JSON.stringify(fakeServerPath)}`,
      approval_policy: "never",
      thread_sandbox: "workspace-write",
      turn_sandbox_policy: defaultTurnSandboxPolicy(workspacePath),
      turn_timeout_ms: 5_000,
      read_timeout_ms: 2_500,
      stall_timeout_ms: 30_000,
    },
  };

  const events = [];
  const client = new CodexAppServerClient({
    settings,
    logger: createSilentLogger(),
    linearClient: {
      async graphql() {
        return {
          data: {
            viewer: {
              id: "viewer-1",
            },
          },
        };
      },
    },
  });

  t.after(async () => {
    await client.stop().catch(() => undefined);
  });

  const session = await client.startSession(workspacePath);
  assert.equal(session.threadId, "thread-1");

  const result = await client.runTurn(
    "Implement the issue",
    {
      id: "issue-1",
      identifier: "ABC-123",
      title: "Implement the issue",
    },
    {
      onMessage(update) {
        events.push(update);
      },
    }
  );

  await client.stop();

  assert.equal(result.threadId, "thread-1");
  assert.equal(result.turnId, "turn-1");
  assert.equal(result.sessionId, "thread-1-turn-1");
  assert.ok(events.some((event) => event.event === "session_started"));
  assert.ok(
    events.some(
      (event) => event.event === "unsupported_tool_call" && event.tool === "not_supported"
    )
  );

  const tokenEvent = events.find(
    (event) => event.payload && event.payload.method === "thread/tokenUsage/updated"
  );
  assert.deepEqual(tokenEvent.usage, {
    inputTokens: 11,
    outputTokens: 7,
    totalTokens: 18,
  });

  const rateLimitEvent = events.find(
    (event) => event.payload && event.payload.method === "account/rateLimits/updated"
  );
  assert.equal(rateLimitEvent.rate_limits.primary.remaining, 42);
  assert.ok(events.some((event) => event.event === "turn_completed"));
});
