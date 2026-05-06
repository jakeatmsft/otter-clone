const { createError } = require("./errors");

async function executeDynamicTool(toolName, argumentsValue, context = {}) {
  try {
    const definition = toolDefinition(toolName);

    if (!definition) {
      return failureResult({
        error: {
          message: `Unsupported dynamic tool: ${JSON.stringify(toolName)}.`,
          supportedTools: supportedTools(context),
        },
      });
    }

    const normalized = normalizeGraphqlArguments(toolName, argumentsValue);
    const client = resolveClient(definition.kind, context);

    if (!client || typeof client.graphql !== "function") {
      return failureResult({
        error: {
          message: definition.missingClientMessage,
        },
      });
    }

    const response = await client.graphql(normalized.query, normalized.variables);
    return successResult(response, Array.isArray(response?.errors) && response.errors.length > 0 ? false : true);
  } catch (error) {
    if (error && error.code === "missing_tracker_api_key") {
      return failureResult({
        error: {
          message: missingAuthMessage(toolName),
        },
      });
    }

    return failureResult({
      error: {
        message: `${toolDisplayName(toolName)} GraphQL tool execution failed.`,
        code: error?.code || `${toolName || "graphql"}_failed`,
        reason: error?.message || String(error),
      },
    });
  }
}

function normalizeGraphqlArguments(toolName, argumentsValue) {
  if (typeof argumentsValue === "string") {
    const query = argumentsValue.trim();

    if (!query) {
      throw createError("missing_query", `\`${toolName}\` requires a non-empty \`query\` string.`);
    }

    return {
      query,
      variables: {},
    };
  }

  if (!argumentsValue || typeof argumentsValue !== "object" || Array.isArray(argumentsValue)) {
    throw createError(
      "invalid_arguments",
      `\`${toolName}\` expects a query string or an object with \`query\` and optional \`variables\`.`
    );
  }

  const query = typeof argumentsValue.query === "string" ? argumentsValue.query.trim() : "";

  if (!query) {
    throw createError("missing_query", `\`${toolName}\` requires a non-empty \`query\` string.`);
  }

  const variables =
    argumentsValue.variables === undefined || argumentsValue.variables === null
      ? {}
      : argumentsValue.variables;

  if (!variables || typeof variables !== "object" || Array.isArray(variables)) {
    throw createError("invalid_variables", `\`${toolName}.variables\` must be a JSON object.`);
  }

  const operationCount = countGraphQLOperations(query);
  if (operationCount > 1) {
    throw createError(
      "multiple_operations",
      `\`${toolName}\` accepts exactly one GraphQL operation per tool call.`
    );
  }

  return {
    query,
    variables,
  };
}

function countGraphQLOperations(query) {
  const matches = query.match(/\b(query|mutation|subscription)\b/g);
  return matches ? matches.length : 1;
}

function toolDefinition(toolName) {
  switch (toolName) {
    case "github_graphql":
      return {
        kind: "github",
        missingClientMessage:
          "Symphony is missing a GitHub GraphQL client. Configure tracker.kind=github with GitHub Projects v2 settings and auth.",
      };
    case "linear_graphql":
      return {
        kind: "linear",
        missingClientMessage:
          "Symphony is missing a Linear GraphQL client. Configure tracker.kind=linear with valid auth.",
      };
    default:
      return null;
  }
}

function resolveClient(kind, context) {
  if (kind === "github") {
    return context.githubClient || (context.trackerClient?.kind === "github" ? context.trackerClient : null);
  }

  if (kind === "linear") {
    return context.linearClient || (context.trackerClient?.kind === "linear" ? context.trackerClient : null);
  }

  return null;
}

function supportedTools(context) {
  const trackerKind = context?.trackerClient?.kind;

  if (trackerKind === "github") {
    return ["github_graphql"];
  }

  if (trackerKind === "linear") {
    return ["linear_graphql"];
  }

  return ["github_graphql", "linear_graphql"];
}

function missingAuthMessage(toolName) {
  if (toolName === "github_graphql") {
    return "Symphony is missing GitHub auth. Set `tracker.api_key` in `WORKFLOW.md` or export `GITHUB_TOKEN`.";
  }

  return "Symphony is missing Linear auth. Set `tracker.api_key` in `WORKFLOW.md` or export `LINEAR_API_KEY`.";
}

function toolDisplayName(toolName) {
  if (toolName === "github_graphql") {
    return "GitHub";
  }

  if (toolName === "linear_graphql") {
    return "Linear";
  }

  return "Dynamic";
}

function successResult(payload, success = true) {
  return formatToolResult(success, payload);
}

function failureResult(payload) {
  return formatToolResult(false, payload);
}

function formatToolResult(success, payload) {
  const text = JSON.stringify(payload, null, 2);

  return {
    success,
    output: text,
    contentItems: [
      {
        type: "inputText",
        text,
      },
    ],
  };
}

module.exports = {
  executeDynamicTool,
};
