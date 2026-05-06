const { Liquid } = require("liquidjs");

const { defaultPromptTemplate } = require("./config");
const { createError } = require("./errors");

const liquidEngine = new Liquid({
  strictVariables: true,
  strictFilters: true,
});

async function buildPrompt(workflow, issue, attempt = null) {
  const templateSource =
    workflow && typeof workflow.prompt_template === "string" && workflow.prompt_template.trim() !== ""
      ? workflow.prompt_template
      : defaultPromptTemplate();

  let parsedTemplate;

  try {
    parsedTemplate = liquidEngine.parse(templateSource);
  } catch (error) {
    throw createError("template_parse_error", "Failed to parse workflow prompt template", {
      cause: error,
    });
  }

  try {
    return await liquidEngine.render(parsedTemplate, {
      issue: toTemplateValue(issue),
      attempt,
    });
  } catch (error) {
    throw createError("template_render_error", "Failed to render workflow prompt template", {
      cause: error,
    });
  }
}

function toTemplateValue(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(toTemplateValue);
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nestedValue]) => [String(key), toTemplateValue(nestedValue)])
    );
  }

  return value;
}

module.exports = {
  buildPrompt,
};
