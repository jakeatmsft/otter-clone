const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { maxConcurrentAgentsForState, parseSettings } = require("../config");
const { createLogger } = require("../logger");
const { buildPrompt } = require("../prompt-builder");
const { parseWorkflow } = require("../workflow");
const { WorkflowStore } = require("../workflow-store");

function createSilentLogger() {
  return createLogger({
    level: "debug",
    sink() {},
  });
}

async function createTempDir(prefix) {
  return fs.mkdtemp(path.join(os.tmpdir(), prefix));
}

function minimalWorkflow(source) {
  return `---
tracker:
  kind: linear
  api_key: $LINEAR_API_KEY
  project_slug: test-project
polling:
  interval_ms: 100
---
${source}
`;
}

function minimalGitHubWorkflow(source) {
  return `---
tracker:
  kind: github
  api_key: $GITHUB_TOKEN
  project_owner: octo-org
  project_number: 12
polling:
  interval_ms: 100
---
${source}
`;
}

test("parseWorkflow parses YAML front matter and trims the prompt body", () => {
  const workflow = parseWorkflow(`---
tracker:
  kind: linear
extra:
  enabled: true
---

Hello {{ issue.identifier }}
`);

  assert.equal(workflow.config.tracker.kind, "linear");
  assert.equal(workflow.config.extra.enabled, true);
  assert.equal(workflow.prompt_template, "Hello {{ issue.identifier }}");
});

test("parseWorkflow rejects non-map front matter", () => {
  assert.throws(
    () =>
      parseWorkflow(`---
- invalid
---
Body
`),
    (error) => error && error.code === "workflow_front_matter_not_a_map"
  );
});

test("parseSettings resolves env-backed secrets, relative workspace roots, and state limits", async (t) => {
  process.env.SYMPHONY_TEST_LINEAR_KEY = "linear-secret";
  t.after(() => {
    delete process.env.SYMPHONY_TEST_LINEAR_KEY;
  });

  const repoDir = await createTempDir("symphony-config-");
  const workflowPath = path.join(repoDir, "WORKFLOW.md");

  const settings = parseSettings(
    {
      tracker: {
        kind: "linear",
        api_key: "$SYMPHONY_TEST_LINEAR_KEY",
        project_slug: "demo",
      },
      workspace: {
        root: "./workspaces",
      },
      agent: {
        max_concurrent_agents_by_state: {
          "In Progress": "2",
          Invalid: 0,
        },
      },
    },
    { workflowPath }
  );

  assert.equal(settings.tracker.api_key, "linear-secret");
  assert.equal(settings.workspace.root, path.join(repoDir, "workspaces"));
  assert.equal(maxConcurrentAgentsForState(settings, "in progress"), 2);
  assert.equal(maxConcurrentAgentsForState(settings, "todo"), settings.agent.max_concurrent_agents);
  assert.equal(settings.codex.command, "codex app-server");
});

test("parseSettings supports GitHub Projects v2 with GITHUB_TOKEN auth and project defaults", (t) => {
  process.env.SYMPHONY_TEST_GITHUB_TOKEN = "github-secret";
  t.after(() => {
    delete process.env.SYMPHONY_TEST_GITHUB_TOKEN;
  });

  const settings = parseSettings({
    tracker: {
      kind: "github",
      api_key: "$SYMPHONY_TEST_GITHUB_TOKEN",
      project_owner: "octo-org",
      project_repository: "otter-clone",
      project_number: "7",
    },
  });

  assert.equal(settings.tracker.endpoint, "https://api.github.com/graphql");
  assert.equal(settings.tracker.api_key, "github-secret");
  assert.equal(settings.tracker.project_owner, "octo-org");
  assert.equal(settings.tracker.project_repository, "otter-clone");
  assert.equal(settings.tracker.project_number, 7);
  assert.equal(settings.tracker.status_field_name, "Status");
  assert.equal(settings.tracker.priority_field_name, "Priority");
});

test("buildPrompt falls back to the default prompt template when the workflow body is empty", async () => {
  const prompt = await buildPrompt(
    {
      prompt_template: "",
    },
    {
      identifier: "ABC-123",
      title: "Fix the failing test",
      description: null,
    }
  );

  assert.match(prompt, /Identifier: ABC-123/);
  assert.match(prompt, /Title: Fix the failing test/);
  assert.match(prompt, /No description provided\./);
});

test("buildPrompt fails on unknown template variables", async () => {
  await assert.rejects(
    () =>
      buildPrompt(
        {
          prompt_template: "Issue: {{ missing }}",
        },
        {
          identifier: "ABC-123",
          title: "Fix the failing test",
        }
      ),
    (error) => error && error.code === "template_render_error"
  );
});

test("WorkflowStore reloads valid workflow changes and keeps the last known good state on invalid reload", async (t) => {
  const repoDir = await createTempDir("symphony-workflow-store-");
  t.after(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  const previousLinearKey = process.env.LINEAR_API_KEY;
  process.env.LINEAR_API_KEY = "reload-secret";
  t.after(() => {
    if (previousLinearKey === undefined) {
      delete process.env.LINEAR_API_KEY;
    } else {
      process.env.LINEAR_API_KEY = previousLinearKey;
    }
  });

  const workflowPath = path.join(repoDir, "WORKFLOW.md");
  await fs.writeFile(workflowPath, minimalWorkflow("Prompt A\n"), "utf8");

  const store = new WorkflowStore({
    workflowPath,
    logger: createSilentLogger(),
    pollIntervalMs: 60_000,
  });
  t.after(() => {
    store.stop();
  });

  const initial = await store.init();
  assert.equal(initial.workflow.prompt_template, "Prompt A");

  await fs.writeFile(workflowPath, minimalWorkflow("Prompt B\n"), "utf8");
  const reloaded = await store.current();
  assert.equal(reloaded.workflow.prompt_template, "Prompt B");

  await fs.writeFile(
    workflowPath,
    `---
- invalid
---
Broken
`,
    "utf8"
  );

  const afterInvalidReload = await store.current();
  assert.equal(afterInvalidReload.workflow.prompt_template, "Prompt B");
  assert.equal(afterInvalidReload.settings.tracker.project_slug, "test-project");
});

test("WorkflowStore accepts GitHub tracker workflows", async (t) => {
  const repoDir = await createTempDir("symphony-github-workflow-store-");
  t.after(async () => {
    await fs.rm(repoDir, { recursive: true, force: true });
  });

  const previousGitHubToken = process.env.GITHUB_TOKEN;
  process.env.GITHUB_TOKEN = "github-reload-secret";
  t.after(() => {
    if (previousGitHubToken === undefined) {
      delete process.env.GITHUB_TOKEN;
    } else {
      process.env.GITHUB_TOKEN = previousGitHubToken;
    }
  });

  const workflowPath = path.join(repoDir, "WORKFLOW.md");
  await fs.writeFile(workflowPath, minimalGitHubWorkflow("Prompt G\n"), "utf8");

  const store = new WorkflowStore({
    workflowPath,
    logger: createSilentLogger(),
    pollIntervalMs: 60_000,
  });
  t.after(() => {
    store.stop();
  });

  const initial = await store.init();
  assert.equal(initial.workflow.prompt_template, "Prompt G");
  assert.equal(initial.settings.tracker.kind, "github");
  assert.equal(initial.settings.tracker.project_number, 12);
});
