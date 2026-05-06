const { createError } = require("./errors");

const ISSUE_PAGE_SIZE = 50;
const NETWORK_TIMEOUT_MS = 30000;

const QUERY_BY_STATES = `
query SymphonyLinearPoll($projectSlug: String!, $stateNames: [String!]!, $first: Int!, $relationFirst: Int!, $after: String) {
  issues(filter: {project: {slugId: {eq: $projectSlug}}, state: {name: {in: $stateNames}}}, first: $first, after: $after) {
    nodes {
      id
      identifier
      title
      description
      priority
      state {
        name
      }
      branchName
      url
      labels {
        nodes {
          name
        }
      }
      inverseRelations(first: $relationFirst) {
        nodes {
          type
          issue {
            id
            identifier
            state {
              name
            }
          }
        }
      }
      createdAt
      updatedAt
    }
    pageInfo {
      hasNextPage
      endCursor
    }
  }
}
`;

const QUERY_BY_IDS = `
query SymphonyLinearIssuesById($ids: [ID!]!, $first: Int!, $relationFirst: Int!) {
  issues(filter: {id: {in: $ids}}, first: $first) {
    nodes {
      id
      identifier
      title
      description
      priority
      state {
        name
      }
      branchName
      url
      labels {
        nodes {
          name
        }
      }
      inverseRelations(first: $relationFirst) {
        nodes {
          type
          issue {
            id
            identifier
            state {
              name
            }
          }
        }
      }
      createdAt
      updatedAt
    }
  }
}
`;

class LinearClient {
  constructor(options) {
    this.kind = "linear";
    this.settings = options.settings;
    this.logger = options.logger;
    this.fetchImpl = options.fetchImpl || fetch;
  }

  async fetchCandidateIssues() {
    this.#assertAuth();

    const projectSlug = this.settings.tracker.project_slug;
    const stateNames = this.settings.tracker.active_states;
    const issues = [];
    let after = null;

    while (true) {
      const body = await this.graphql(QUERY_BY_STATES, {
        projectSlug,
        stateNames,
        first: ISSUE_PAGE_SIZE,
        relationFirst: ISSUE_PAGE_SIZE,
        after,
      });

      const { pageIssues, pageInfo } = decodeLinearPageResponse(body);
      issues.push(...pageIssues.map(normalizeIssue).filter(Boolean));

      if (!pageInfo.hasNextPage) {
        break;
      }

      if (!pageInfo.endCursor) {
        throw createError(
          "linear_missing_end_cursor",
          "Linear pagination reported hasNextPage=true without an endCursor"
        );
      }

      after = pageInfo.endCursor;
    }

    return issues;
  }

  async fetchIssuesByStates(stateNames) {
    if (!Array.isArray(stateNames) || stateNames.length === 0) {
      return [];
    }

    this.#assertAuth();

    const body = await this.graphql(QUERY_BY_STATES, {
      projectSlug: this.settings.tracker.project_slug,
      stateNames: [...new Set(stateNames)],
      first: ISSUE_PAGE_SIZE,
      relationFirst: ISSUE_PAGE_SIZE,
      after: null,
    });

    const { pageIssues, pageInfo } = decodeLinearPageResponse(body);
    const issues = pageIssues.map(normalizeIssue).filter(Boolean);

    if (!pageInfo.hasNextPage) {
      return issues;
    }

    let cursor = pageInfo.endCursor;
    let currentPageInfo = pageInfo;
    const allIssues = [...issues];

    while (currentPageInfo.hasNextPage) {
      if (!cursor) {
        throw createError(
          "linear_missing_end_cursor",
          "Linear pagination reported hasNextPage=true without an endCursor"
        );
      }

      const nextBody = await this.graphql(QUERY_BY_STATES, {
        projectSlug: this.settings.tracker.project_slug,
        stateNames: [...new Set(stateNames)],
        first: ISSUE_PAGE_SIZE,
        relationFirst: ISSUE_PAGE_SIZE,
        after: cursor,
      });

      const decoded = decodeLinearPageResponse(nextBody);
      allIssues.push(...decoded.pageIssues.map(normalizeIssue).filter(Boolean));

      currentPageInfo = decoded.pageInfo;

      if (!currentPageInfo.hasNextPage) {
        break;
      }

      cursor = currentPageInfo.endCursor;
    }

    return allIssues;
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
      const body = await this.graphql(QUERY_BY_IDS, {
        ids: batchIds,
        first: batchIds.length,
        relationFirst: ISSUE_PAGE_SIZE,
      });

      const pageIssues = decodeLinearResponse(body).map(normalizeIssue).filter(Boolean);
      issues.push(...pageIssues);
    }

    const order = new Map(ids.map((id, index) => [id, index]));
    issues.sort((left, right) => (order.get(left.id) ?? Number.MAX_SAFE_INTEGER) - (order.get(right.id) ?? Number.MAX_SAFE_INTEGER));

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
          Authorization: this.settings.tracker.api_key,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(NETWORK_TIMEOUT_MS),
      });
    } catch (error) {
      throw createError(
        "linear_api_request",
        "Linear GraphQL request failed before receiving a response",
        { cause: error }
      );
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      this.logger.error("Linear GraphQL request failed", {
        status: response.status,
        body: summarizeBody(text),
      });

      throw createError("linear_api_status", `Linear GraphQL request failed with HTTP ${response.status}`, {
        status: response.status,
      });
    }

    let body;

    try {
      body = await response.json();
    } catch (error) {
      throw createError("linear_unknown_payload", "Linear returned non-JSON payload", {
        cause: error,
      });
    }

    if (body && Array.isArray(body.errors) && body.errors.length > 0) {
      throw createError("linear_graphql_errors", "Linear GraphQL returned errors", {
        errors: body.errors,
        body,
      });
    }

    return body;
  }

  #assertAuth() {
    if (!this.settings.tracker.api_key) {
      throw createError("missing_tracker_api_key", "Linear API key is not configured");
    }

    if (!this.settings.tracker.project_slug) {
      throw createError("missing_tracker_project_slug", "Linear project slug is not configured");
    }
  }
}

function decodeLinearResponse(body) {
  const nodes = body?.data?.issues?.nodes;

  if (Array.isArray(nodes)) {
    return nodes;
  }

  if (Array.isArray(body?.errors)) {
    throw createError("linear_graphql_errors", "Linear GraphQL returned errors", {
      errors: body.errors,
      body,
    });
  }

  throw createError("linear_unknown_payload", "Linear payload did not contain issues.nodes", {
    body,
  });
}

function decodeLinearPageResponse(body) {
  const nodes = body?.data?.issues?.nodes;
  const pageInfo = body?.data?.issues?.pageInfo;

  if (Array.isArray(nodes) && pageInfo && typeof pageInfo === "object") {
    return {
      pageIssues: nodes,
      pageInfo: {
        hasNextPage: pageInfo.hasNextPage === true,
        endCursor: typeof pageInfo.endCursor === "string" ? pageInfo.endCursor : null,
      },
    };
  }

  if (Array.isArray(body?.errors)) {
    throw createError("linear_graphql_errors", "Linear GraphQL returned errors", {
      errors: body.errors,
      body,
    });
  }

  throw createError("linear_unknown_payload", "Linear payload did not contain issues.pageInfo", {
    body,
  });
}

function normalizeIssue(issue) {
  if (!issue || typeof issue !== "object") {
    return null;
  }

  return {
    id: issue.id || null,
    identifier: issue.identifier || null,
    title: issue.title || null,
    description: issue.description || null,
    priority: Number.isInteger(issue.priority) ? issue.priority : null,
    state: issue?.state?.name || null,
    branch_name: issue.branchName || null,
    url: issue.url || null,
    labels: extractLabels(issue),
    blocked_by: extractBlockers(issue),
    created_at: parseDate(issue.createdAt),
    updated_at: parseDate(issue.updatedAt),
  };
}

function extractLabels(issue) {
  const nodes = issue?.labels?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes
    .map((label) => (typeof label?.name === "string" ? label.name.toLowerCase() : null))
    .filter(Boolean);
}

function extractBlockers(issue) {
  const nodes = issue?.inverseRelations?.nodes;

  if (!Array.isArray(nodes)) {
    return [];
  }

  return nodes.flatMap((relation) => {
    if (
      typeof relation?.type === "string" &&
      relation.type.trim().toLowerCase() === "blocks" &&
      relation.issue &&
      typeof relation.issue === "object"
    ) {
      return [
        {
          id: relation.issue.id || null,
          identifier: relation.issue.identifier || null,
          state: relation.issue?.state?.name || null,
        },
      ];
    }

    return [];
  });
}

function parseDate(rawValue) {
  if (typeof rawValue !== "string") {
    return null;
  }

  const parsed = new Date(rawValue);
  return Number.isNaN(parsed.valueOf()) ? null : parsed;
}

function summarizeBody(body) {
  if (typeof body !== "string") {
    return "";
  }

  const compact = body.replace(/\s+/g, " ").trim();
  return compact.length > 1000 ? `${compact.slice(0, 1000)}...<truncated>` : compact;
}

module.exports = {
  ISSUE_PAGE_SIZE,
  LinearClient,
  QUERY_BY_IDS,
  QUERY_BY_STATES,
  decodeLinearPageResponse,
  decodeLinearResponse,
  normalizeIssue,
};
