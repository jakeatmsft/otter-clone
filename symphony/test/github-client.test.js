const test = require("node:test");
const assert = require("node:assert/strict");

const { createLogger } = require("../logger");
const { executeDynamicTool } = require("../dynamic-tool");
const { GitHubClient } = require("../github-client");

function createSilentLogger() {
  return createLogger({
    level: "debug",
    sink() {},
  });
}

function baseGitHubSettings(trackerOverrides = {}) {
  return {
    tracker: {
      kind: "github",
      endpoint: "https://api.github.example/graphql",
      api_key: "github-token",
      project_owner: "octo-org",
      project_number: 42,
      project_repository: null,
      status_field_name: "Status",
      priority_field_name: "Priority",
      active_states: ["Todo", "In Progress"],
      terminal_states: ["Done", "Closed"],
      ...trackerOverrides,
    },
  };
}

function githubIssueProjectItem({
  itemId,
  repo = "octo-org/otter-clone",
  number,
  title,
  body = null,
  status = "Todo",
  priority,
  labels = [],
  createdAt = "2026-01-01T00:00:00.000Z",
  updatedAt = "2026-01-02T00:00:00.000Z",
  isArchived = false,
}) {
  return {
    __typename: "ProjectV2Item",
    id: itemId,
    isArchived,
    type: "ISSUE",
    createdAt,
    updatedAt,
    statusField:
      status === null
        ? null
        : {
            __typename: "ProjectV2ItemFieldSingleSelectValue",
            name: status,
            optionId: `status-${status}`,
          },
    priorityField:
      typeof priority === "number"
        ? {
            __typename: "ProjectV2ItemFieldNumberValue",
            number: priority,
          }
        : typeof priority === "string"
          ? {
              __typename: "ProjectV2ItemFieldSingleSelectValue",
              name: priority,
              optionId: `priority-${priority}`,
            }
          : null,
    content: {
      __typename: "Issue",
      id: `issue-${number}`,
      number,
      title,
      body,
      state: "OPEN",
      url: `https://github.com/${repo}/issues/${number}`,
      createdAt,
      updatedAt,
      repository: {
        nameWithOwner: repo,
      },
      labels: {
        nodes: labels.map((name) => ({ name })),
      },
    },
  };
}

test("GitHubClient paginates candidate issues and normalizes Project v2 issue items", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        organization: {
          projectV2: {
            title: "Otter Clone",
            items: {
              nodes: [
                githubIssueProjectItem({
                  itemId: "item-1",
                  number: 101,
                  title: "First issue",
                  body: "First body",
                  status: "Todo",
                  priority: "High",
                  labels: ["Backend"],
                }),
                {
                  id: "item-pr",
                  isArchived: false,
                  type: "PULL_REQUEST",
                  createdAt: "2026-01-03T00:00:00.000Z",
                  updatedAt: "2026-01-04T00:00:00.000Z",
                  statusField: {
                    __typename: "ProjectV2ItemFieldSingleSelectValue",
                    name: "Todo",
                  },
                  priorityField: null,
                  content: {
                    __typename: "PullRequest",
                    id: "pr-1",
                    number: 55,
                    title: "Ignore me",
                    state: "OPEN",
                    url: "https://github.com/octo-org/otter-clone/pull/55",
                    createdAt: "2026-01-03T00:00:00.000Z",
                    updatedAt: "2026-01-04T00:00:00.000Z",
                    repository: {
                      nameWithOwner: "octo-org/otter-clone",
                    },
                  },
                },
              ],
              pageInfo: {
                hasNextPage: true,
                endCursor: "cursor-1",
              },
            },
          },
        },
        user: null,
      },
    },
    {
      data: {
        organization: {
          projectV2: {
            title: "Otter Clone",
            items: {
              nodes: [
                githubIssueProjectItem({
                  itemId: "item-2",
                  number: 102,
                  title: "Second issue",
                  status: "In Progress",
                  priority: 1,
                  labels: ["Frontend"],
                  createdAt: "2026-01-05T00:00:00.000Z",
                  updatedAt: "2026-01-06T00:00:00.000Z",
                }),
                githubIssueProjectItem({
                  itemId: "item-done",
                  number: 103,
                  title: "Done issue",
                  status: "Done",
                  priority: "Low",
                }),
                githubIssueProjectItem({
                  itemId: "item-archived",
                  number: 104,
                  title: "Archived issue",
                  status: "Todo",
                  isArchived: true,
                }),
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
        user: null,
      },
    },
  ];

  const client = new GitHubClient({
    settings: baseGitHubSettings(),
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

  const issues = await client.fetchCandidateIssues();

  assert.equal(calls.length, 2);
  assert.equal(calls[0].variables.projectOwner, "octo-org");
  assert.equal(calls[1].variables.after, "cursor-1");
  assert.deepEqual(
    issues.map((issue) => issue.identifier),
    ["octo-org/otter-clone#101", "octo-org/otter-clone#102"]
  );
  assert.equal(issues[0].state, "Todo");
  assert.equal(issues[0].priority, 2);
  assert.deepEqual(issues[0].labels, ["backend"]);
  assert.equal(issues[1].state, "In Progress");
  assert.equal(issues[1].priority, 1);
  assert.ok(issues[0].created_at instanceof Date);
  assert.ok(issues[1].updated_at instanceof Date);
});

test("GitHubClient uses repository-scoped project queries and preserves id order for state refresh", async () => {
  const calls = [];
  const responses = [
    {
      data: {
        repository: {
          projectV2: {
            title: "Repo Project",
            items: {
              nodes: [
                githubIssueProjectItem({
                  itemId: "item-1",
                  number: 201,
                  title: "Repository issue",
                  status: "Todo",
                }),
              ],
              pageInfo: {
                hasNextPage: false,
                endCursor: null,
              },
            },
          },
        },
      },
    },
    {
      data: {
        nodes: [
          githubIssueProjectItem({
            itemId: "item-1",
            number: 201,
            title: "Repository issue",
            status: "Todo",
          }),
          githubIssueProjectItem({
            itemId: "item-2",
            number: 202,
            title: "Second repository issue",
            status: "In Progress",
          }),
        ],
      },
    },
  ];

  const client = new GitHubClient({
    settings: baseGitHubSettings({
      project_owner: "yuki-leong-1",
      project_repository: "otter-clone",
    }),
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

  const candidates = await client.fetchCandidateIssues();
  const refreshed = await client.fetchIssueStatesByIds(["item-2", "item-1"]);

  assert.equal(candidates.length, 1);
  assert.match(calls[0].query, /repository\(owner: \$projectOwner, name: \$projectRepository\)/);
  assert.deepEqual(
    refreshed.map((issue) => issue.id),
    ["item-2", "item-1"]
  );
});

test("executeDynamicTool supports github_graphql and keeps the single-operation guard", async () => {
  const success = await executeDynamicTool(
    "github_graphql",
    {
      query: "query Viewer { viewer { login } }",
      variables: {
        includeRepos: false,
      },
    },
    {
      trackerClient: {
        kind: "github",
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
  assert.match(success.output, /includeRepos/);

  const failure = await executeDynamicTool(
    "github_graphql",
    {
      query: "query One { viewer { login } } query Two { rateLimit { limit } }",
    },
    {
      trackerClient: {
        kind: "github",
        async graphql() {
          throw new Error("should not be called");
        },
      },
    }
  );

  assert.equal(failure.success, false);
  assert.match(failure.output, /exactly one GraphQL operation/);
});
