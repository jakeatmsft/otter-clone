const { normalizeIssueState } = require("./config");
const { createError } = require("./errors");

const ISSUE_PAGE_SIZE = 50;
const LABEL_PAGE_SIZE = 50;
const NETWORK_TIMEOUT_MS = 30000;

const PROJECT_ITEM_FIELDS_FRAGMENT = `
fragment SymphonyGitHubProjectItemFields on ProjectV2Item {
  id
  isArchived
  type
  createdAt
  updatedAt
  statusField: fieldValueByName(name: $statusFieldName) {
    __typename
    ... on ProjectV2ItemFieldSingleSelectValue {
      name
      optionId
    }
    ... on ProjectV2ItemFieldTextValue {
      text
    }
    ... on ProjectV2ItemFieldNumberValue {
      number
    }
    ... on ProjectV2ItemFieldIterationValue {
      title
    }
  }
  priorityField: fieldValueByName(name: $priorityFieldName) {
    __typename
    ... on ProjectV2ItemFieldSingleSelectValue {
      name
      optionId
    }
    ... on ProjectV2ItemFieldTextValue {
      text
    }
    ... on ProjectV2ItemFieldNumberValue {
      number
    }
  }
  content {
    __typename
    ... on Issue {
      id
      number
      title
      body
      state
      url
      createdAt
      updatedAt
      repository {
        nameWithOwner
      }
      labels(first: $labelFirst) {
        nodes {
          name
        }
      }
    }
    ... on DraftIssue {
      id
      title
      body
      createdAt
      updatedAt
    }
    ... on PullRequest {
      id
      number
      title
      state
      url
      createdAt
      updatedAt
      repository {
        nameWithOwner
      }
    }
  }
}
`;

const OWNER_PROJECT_ITEMS_QUERY = `
query SymphonyGitHubOwnerProjectItems(
  $projectOwner: String!
  $projectNumber: Int!
  $statusFieldName: String!
  $priorityFieldName: String!
  $labelFirst: Int!
  $first: Int!
  $after: String
) {
  organization(login: $projectOwner) {
    projectV2(number: $projectNumber) {
      title
      items(first: $first, after: $after) {
        nodes {
          ...SymphonyGitHubProjectItemFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
  user(login: $projectOwner) {
    projectV2(number: $projectNumber) {
      title
      items(first: $first, after: $after) {
        nodes {
          ...SymphonyGitHubProjectItemFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}

${PROJECT_ITEM_FIELDS_FRAGMENT}
`;

const REPOSITORY_PROJECT_ITEMS_QUERY = `
query SymphonyGitHubRepositoryProjectItems(
  $projectOwner: String!
  $projectRepository: String!
  $projectNumber: Int!
  $statusFieldName: String!
  $priorityFieldName: String!
  $labelFirst: Int!
  $first: Int!
  $after: String
) {
  repository(owner: $projectOwner, name: $projectRepository) {
    projectV2(number: $projectNumber) {
      title
      items(first: $first, after: $after) {
        nodes {
          ...SymphonyGitHubProjectItemFields
        }
        pageInfo {
          hasNextPage
          endCursor
        }
      }
    }
  }
}

${PROJECT_ITEM_FIELDS_FRAGMENT}
`;

const PROJECT_ITEMS_BY_IDS_QUERY = `
query SymphonyGitHubProjectItemsById(
  $ids: [ID!]!
  $statusFieldName: String!
  $priorityFieldName: String!
  $labelFirst: Int!
) {
  nodes(ids: $ids) {
    __typename
    ... on ProjectV2Item {
      ...SymphonyGitHubProjectItemFields
    }
  }
}

${PROJECT_ITEM_FIELDS_FRAGMENT}
`;

class GitHubClient {
  constructor(options) {
    this.kind = "github";
    this.settings = options.settings;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async fetchCandidateIssues() {
    return this.fetchIssuesByStates(this.settings.tracker.active_states);
  }

  async fetchIssuesByStates(stateNames) {
    this.#assertAuth();

    const normalizedStates = new Set(
      (Array.isArray(stateNames) ? stateNames : [])
        .map((stateName) => normalizeIssueState(stateName))
        .filter(Boolean)
    );

    if (normalizedStates.size === 0) {
      return [];
    }

    const issues = await this.#fetchAllProjectItems();
    return issues.filter((issue) => normalizedStates.has(normalizeIssueState(issue.state)));
  }

  async fetchIssueStatesByIds(issueIds) {
    const ids = [...new Set((issueIds || []).filter((issueId) => typeof issueId === "string"))];

    if (ids.length === 0) {
      return [];
    }

    this.#assertAuth();

    const batches = [];
    for (let index = 0; index < ids.length; index += ISSUE_PAGE_SIZE) {
      batches.push(ids.slice(index, index + ISSUE_PAGE_SIZE));
    }

    const issues = [];

    for (const batchIds of batches) {
      const body = await this.graphql(PROJECT_ITEMS_BY_IDS_QUERY, {
        ids: batchIds,
        statusFieldName: this.settings.tracker.status_field_name,
        priorityFieldName: this.settings.tracker.priority_field_name,
        labelFirst: LABEL_PAGE_SIZE,
      });

      const pageIssues = decodeGitHubItemsByIdResponse(body).map(normalizeIssue).filter(Boolean);
      issues.push(...pageIssues);
    }

    const order = new Map(ids.map((id, index) => [id, index]));
    issues.sort(
      (left, right) =>
        (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) -
        (order.get(right.id) ?? Number.MAX_SAFE_INTEGER)
    );

    return issues;
  }

  async graphql(query, variables = {}, options = {}) {
    this.#assertAuth();

    const payload = {
      query,
      variables,
    };

    if (typeof options.operationName === "string" && options.operationName.trim() !== "") {
      payload.operationName = options.operationName.trim();
    }

    let response;

    try {
      response = await this.fetchImpl(this.settings.tracker.endpoint, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.settings.tracker.api_key}`,
          "Content-Type": "application/json",
          "User-Agent": "symphony-orchestrator/0.1.0",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
    } catch (error) {
      throw createError(
        "github_api_request",
        "GitHub GraphQL request failed before receiving a response",
        { cause: error }
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error("GitHub GraphQL request failed", {
        status: response.status,
        body: summarizeBody(text),
      });

      throw createError(
        "github_api_status",
        `GitHub GraphQL request failed with HTTP ${response.status}`,
        {
          status: response.status,
        }
      );
    }

    let body;

    try {
      body = await response.json();
    } catch (error) {
      throw createError("github_unknown_payload", "GitHub returned non-JSON payload", {
        cause: error,
      });
    }

    if (body && Array.isArray(body.errors) && body.errors.length > 0) {
      throw createError("github_graphql_errors", "GitHub GraphQL returned errors", {
        errors: body.errors,
        body,
      });
    }

    return body;
  }

  async #fetchAllProjectItems() {
    const issues = [];
    let after = null;

    while (true) {
      const body = await this.graphql(this.#projectItemsQuery(), {
        projectOwner: this.settings.tracker.project_owner,
        projectRepository: this.settings.tracker.project_repository,
        projectNumber: this.settings.tracker.project_number,
        statusFieldName: this.settings.tracker.status_field_name,
        priorityFieldName: this.settings.tracker.priority_field_name,
        labelFirst: LABEL_PAGE_SIZE,
        first: ISSUE_PAGE_SIZE,
        after,
      });

      const { pageItems, pageInfo } = decodeGitHubProjectPageResponse(body);
      issues.push(...pageItems.map(normalizeIssue).filter(Boolean));

      if (!pageInfo.hasNextPage) {
        break;
      }

      if (!pageInfo.endCursor) {
        throw createError(
          "github_missing_end_cursor",
          "GitHub pagination reported hasNextPage=true without an endCursor"
        );
      }

      after = pageInfo.endCursor;
    }

    return issues;
  }

  #projectItemsQuery() {
    return this.settings.tracker.project_repository
      ? REPOSITORY_PROJECT_ITEMS_QUERY
      : OWNER_PROJECT_ITEMS_QUERY;
  }

  #assertAuth() {
    if (!this.settings.tracker.api_key) {
      throw createError("missing_tracker_api_key", "GitHub token is not configured");
    }

    if (!this.settings.tracker.project_owner) {
      throw createError("missing_tracker_project_owner", "GitHub project owner is not configured");
    }

    if (!Number.isInteger(this.settings.tracker.project_number) || this.settings.tracker.project_number <= 0) {
      throw createError(
        "missing_tracker_project_number",
        "GitHub project number is not configured"
      );
    }
  }
}

function decodeGitHubProjectPageResponse(body) {
  const project = extractProjectFromBody(body);
  const items = project?.items;

  if (Array.isArray(items?.nodes) && items?.pageInfo && typeof items.pageInfo === "object") {
    return {
      pageItems: items.nodes,
      pageInfo: {
        hasNextPage: items.pageInfo.hasNextPage === true,
        endCursor: typeof items.pageInfo.endCursor === "string" ? items.pageInfo.endCursor : null,
      },
    };
  }

  if (Array.isArray(body?.errors)) {
    throw createError("github_graphql_errors", "GitHub GraphQL returned errors", {
      errors: body.errors,
      body,
    });
  }

  if (body?.data && project === null) {
    throw createError("github_project_not_found", "GitHub project was not found", { body });
  }

  throw createError(
    "github_unknown_payload",
    "GitHub payload did not contain project items.pageInfo",
    { body }
  );
}

function decodeGitHubItemsByIdResponse(body) {
  const nodes = body?.data?.nodes;

  if (Array.isArray(nodes)) {
    return nodes
      .filter((node) => node && typeof node === "object" && node.__typename === "ProjectV2Item")
      .map((node) => ({
        ...node,
        __typename: undefined,
      }));
  }

  if (Array.isArray(body?.errors)) {
    throw createError("github_graphql_errors", "GitHub GraphQL returned errors", {
      errors: body.errors,
      body,
    });
  }

  throw createError("github_unknown_payload", "GitHub payload did not contain nodes", { body });
}

function extractProjectFromBody(body) {
  if (!body || typeof body !== "object") {
    return null;
  }

  const repositoryProject = body?.data?.repository?.projectV2;
  if (repositoryProject) {
    return repositoryProject;
  }

  const organizationProject = body?.data?.organization?.projectV2;
  if (organizationProject) {
    return organizationProject;
  }

  const userProject = body?.data?.user?.projectV2;
  if (userProject) {
    return userProject;
  }

  return null;
}

function normalizeIssue(item) {
  if (!item || typeof item !== "object" || item.isArchived === true) {
    return null;
  }

  const content = item.content;

  if (content?.__typename !== "Issue") {
    return null;
  }

  const identifier = buildIdentifier(content);
  const title = stringOrNull(content.title);
  const state = resolveIssueState(item, content);

  if (!item.id || !identifier || !title || !state) {
    return null;
  }

  return {
    id: item.id,
    tracker_issue_id: stringOrNull(content.id),
    identifier,
    title,
    description: stringOrNull(content.body),
    priority: normalizePriority(item.priorityField),
    state,
    branch_name: null,
    url: stringOrNull(content.url),
    labels: extractLabels(content),
    blocked_by: [],
    created_at: parseDate(content.createdAt || item.createdAt),
    updated_at: parseDate(item.updatedAt || content.updatedAt),
  };
}

function buildIdentifier(content) {
  const repositoryName = stringOrNull(content?.repository?.nameWithOwner);
  const issueNumber =
    Number.isInteger(content?.number) && content.number > 0 ? String(content.number) : null;

  if (repositoryName && issueNumber) {
    return `${repositoryName}#${issueNumber}`;
  }

  if (issueNumber) {
    return `#${issueNumber}`;
  }

  return stringOrNull(content?.id);
}

function resolveIssueState(item, content) {
  const projectState = fieldDisplayValue(item.statusField);

  if (projectState) {
    return projectState;
  }

  const fallbackState = stringOrNull(content?.state);
  if (!fallbackState) {
    return null;
  }

  switch (fallbackState.toUpperCase()) {
    case "OPEN":
      return "Open";
    case "CLOSED":
      return "Closed";
    case "MERGED":
      return "Merged";
    default:
      return fallbackState;
  }
}

function normalizePriority(field) {
  if (!field || typeof field !== "object") {
    return null;
  }

  if (field.__typename === "ProjectV2ItemFieldNumberValue") {
    return normalizeNumericPriority(field.number);
  }

  const value = fieldDisplayValue(field);
  if (!value) {
    return null;
  }

  const normalized = value.trim().toLowerCase();
  const pMatch = normalized.match(/^p\s*([0-9]+)$/);
  if (pMatch) {
    const level = Number.parseInt(pMatch[1], 10);
    if (level === 0) {
      return 1;
    }
    if (level === 1) {
      return 2;
    }
    if (level === 2) {
      return 3;
    }
    if (level >= 3) {
      return 4;
    }
  }

  if (/\b(urgent|critical|blocker|highest)\b/.test(normalized)) {
    return 1;
  }

  if (/\bhigh\b/.test(normalized)) {
    return 2;
  }

  if (/\bmedium\b|\bnormal\b/.test(normalized)) {
    return 3;
  }

  if (/\blow\b|\blowest\b/.test(normalized)) {
    return 4;
  }

  return null;
}

function normalizeNumericPriority(value) {
  const parsed = typeof value === "number" ? value : Number(value);

  if (!Number.isFinite(parsed)) {
    return null;
  }

  const rounded = Math.round(parsed);

  if (rounded === 0) {
    return 1;
  }

  return rounded >= 1 && rounded <= 4 ? rounded : null;
}

function fieldDisplayValue(field) {
  if (!field || typeof field !== "object") {
    return null;
  }

  switch (field.__typename) {
    case "ProjectV2ItemFieldSingleSelectValue":
      return stringOrNull(field.name);
    case "ProjectV2ItemFieldTextValue":
      return stringOrNull(field.text);
    case "ProjectV2ItemFieldIterationValue":
      return stringOrNull(field.title);
    case "ProjectV2ItemFieldNumberValue":
      return Number.isFinite(field.number) ? String(field.number) : null;
    default:
      return null;
  }
}

function extractLabels(content) {
  const nodes = content?.labels?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((label) => (typeof label?.name === "string" ? label.name.toLowerCase() : null))
    .filter(Boolean);
}

function parseDate(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function stringOrNull(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed === "" ? null : trimmed;
}

function summarizeBody(body) {
  if (typeof body !== "string") {
    return "";
  }

  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 1000 ? `${compact.slice(0, 1000)}...<truncated>` : compact;
}

module.exports = {
  GitHubClient,
  ISSUE_PAGE_SIZE,
  LABEL_PAGE_SIZE,
  OWNER_PROJECT_ITEMS_QUERY,
  PROJECT_ITEMS_BY_IDS_QUERY,
  REPOSITORY_PROJECT_ITEMS_QUERY,
  decodeGitHubItemsByIdResponse,
  decodeGitHubProjectPageResponse,
  normalizeIssue,
  normalizePriority,
};
