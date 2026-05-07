const test = require('node:test');
const assert = require('node:assert/strict');

const {
  DEFAULT_AZURE_AI_PROJECT_SCOPE,
  DEFAULT_AZURE_OPENAI_SCOPE,
  isAzureAIProjectEndpoint,
  normalizeAzureCredentialError,
  resolveAzureScope,
} = require('./azure-auth');

test('resolveAzureScope defaults Azure OpenAI resource endpoints to cognitiveservices', () => {
  assert.equal(
    resolveAzureScope({
      endpoint: 'https://eu2-oai.openai.azure.com',
    }),
    DEFAULT_AZURE_OPENAI_SCOPE
  );
});

test('resolveAzureScope defaults Azure AI project endpoints to ai.azure.com', () => {
  const endpoint = 'https://workspace.services.ai.azure.com/api/projects/demo-project';

  assert.equal(isAzureAIProjectEndpoint(endpoint), true);
  assert.equal(
    resolveAzureScope({
      endpoint,
    }),
    DEFAULT_AZURE_AI_PROJECT_SCOPE
  );
});

test('resolveAzureScope preserves an explicit override', () => {
  assert.equal(
    resolveAzureScope({
      endpoint: 'https://eu2-oai.openai.azure.com',
      explicitScope: 'https://example.com/.default',
    }),
    'https://example.com/.default'
  );
});

test('normalizeAzureCredentialError collapses chained credential failures', () => {
  const message = normalizeAzureCredentialError(
    new Error(
      'ChainedTokenCredential authentication failed.\nCredentialUnavailableError: WSL Azure CLI fallback failed.'
    ),
    {
      scope: DEFAULT_AZURE_OPENAI_SCOPE,
      surface: 'realtime transcription',
    }
  );

  assert.match(message, /Azure authentication failed for realtime transcription/);
  assert.match(message, /bearer token/);
});
