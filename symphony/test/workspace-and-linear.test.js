const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { createLogger } = require("../logger");
const { LinearClient } = require("../linear-client");
const { ensurePathWithinRoot, sanitizeWorkspaceKey } = require("../path-safety");
const { WorkspaceManager } = require("../workspace");

function createSilentLogger() {
  return createLogger({
    level: "debug",
    sink() {},
  });
}

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function baseWorkspaceSettings(rootPath, hooks = {}) {
  return {
    workspace: {
      root: rootPath,
    },
    hooks: {
      after_create: null,
      before_run: null,
      after_run: null,
      before_remove: null,
      timeout_ms: 5_000,
      ...hooks,
    },
  };
}

function baseLinearSettings() {
  return {
    tracker: {
      endpoint: "https://linear.example/graphql",
      api_key: "linear-token",
      project_slug: "demo",
      active_states: ["Todo", "In Progress"],
      terminal_states: ["Done"],
    },
  };
}

test("WorkspaceManager runs after_create only once and ignores before_remove failures", async (t) => {
  const tempDir = await createTempDir("symphony-workspace-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const settings = baseWorkspaceSettings(path.join(tempDir, "workspaces"), {
    after_create: "printf 'created\\n' >> after_create.log",
    before_remove: "exit 7",
  });

  const manager = new WorkspaceManager({
    settings,
    logger: createSilentLogger(),
  });

  const issue = {
    id: "issue-1",
    identifier: "ABC-123",
  };

  const first = await manager.createForIssue(issue);
  const second = await manager.createForIssue(issue);

  assert.equal(first.createdNow, true);
  assert.equal(second.createdNow, false);
  assert.equal(first.path, second.path);

  const hookLog = await fs.readFile(path.join(first.path, "after_create.log"), "utf8");
  assert.equal(hookLog.trim(), "created");

  await manager.removeByIdentifier(issue.identifier);
  await assert.rejects(fs.stat(first.path), /ENOENT/);
});

test("ensurePathWithinRoot rejects symlink escapes and workspace keys are sanitized", async (t) => {
  const tempDir = await createTempDir("symphony-path-");
  t.after(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  const rootPath = path.join(tempDir, "root");
  const outsidePath = path.join(tempDir, "outside");
  const symlinkPath = path.join(rootPath, "link");

  await fs.mkdir(rootPath, { recursive: true });
  await fs.mkdir(outsidePath, { recursive: true });
  await fs.symlink(outsidePath, symlinkPath, "dir");

  await assert.rejects(
    () => ensurePathWithinRoot(path.join(symlinkPath, "nested"), rootPath),
    (error) => error && error.code === "workspace_outside_root"
  );

  assert.equal(sanitizeWorkspaceKey("ABC/123:? test"), "ABC_123___test");
});

test("LinearClient skips empty state queries without making a network request", async () => {
  let called = 0;

  const client = new LinearClient({
    settings: baseLinearSettings(),
    logger: createSilentLogger(),
    fetchImpl: async () => {
      called += 1;
      throw new Error("fetch should not be called");
    },
  });

  const issues = await client.fetchIssuesByStates([]);
  assert.deepEqual(issues, []);
  assert.equal(called, 0);
});

test("LinearClient paginates fetchIssuesByStates and normalizes labels, blockers, and timestamps", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        issues: {
          nodes: [
            {
              id: "1",
              identifier: "ABC-1",
              title: "First",
              description: "First issue",
              priority: 1,
              state: { name: "Todo" },
              branchName: "feature/abc-1",
              url: "https://linear.app/issue/ABC-1",
              labels: {
                nodes: [{ name: "Backend" }],
              },
              inverseRelations: {
                nodes: [
                  {
                    type: "blocks",
                    issue: {
                      id: "2",
                      identifier: "ABC-2",
                      state: { name: "In Progress" },
                    },
                  },
                ],
              },
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z",
            },
          ],
          pageInfo: {
            hasNextPage: true,
            endCursor: "cursor-1",
          },
        },
      },
    },
    {
      data: {
        issues: {
          nodes: [
            {
              id: "3",
              identifier: "ABC-3",
              title: "Second",
              description: null,
              priority: "high",
              state: { name: "In Progress" },
              branchName: null,
              url: null,
              labels: {
                nodes: [{ name: "Frontend" }],
              },
              inverseRelations: {
                nodes: [],
              },
              createdAt: "2026-01-03T00:00:00.000Z",
              updatedAt: "2026-01-04T00:00:00.000Z",
            },
          ],
          pageInfo: {
            hasNextPage: false,
            endCursor: null,
          },
        },
      },
    },
  ];

  const client = new LinearClient({
    settings: baseLinearSettings(),
    logger: createSilentLogger(),
    fetchImpl: async (_url, options) => {
      calls.push(JSON.parse(options.body));
      const body = responses.shift();
      return {
        ok: true,
        async json() {
          return body;
        },
      };
    },
  });

  const issues = await client.fetchIssuesByStates(["Todo", "Todo"]);

  assert.equal(calls.length, 2);
  assert.deepEqual(calls[0].variables.stateNames, ["Todo"]);
  assert.equal(calls[1].variables.after, "cursor-1");
  assert.equal(issues.length, 2);
  assert.deepEqual(issues[0].labels, ["backend"]);
  assert.deepEqual(issues[0].blocked_by, [
    {
      id: "2",
      identifier: "ABC-2",
      state: "In Progress",
    },
  ]);
  assert.equal(issues[1].priority, null);
  assert.ok(issues[0].created_at instanceof Date);
  assert.ok(issues[1].updated_at instanceof Date);
});
