import OpenAI, { AzureOpenAI } from 'openai';
const {
  createAzureCredential,
  normalizeAzureCredentialError,
  createAzureTokenProvider,
  isMissingOrPlaceholder,
  resolveAzureScope,
} = require('./azure-auth');

export { normalizeAzureCredentialError };

const DEFAULT_OPENAI_API_VERSION = '2024-08-01-preview';
const TRANSCRIPTION_RESPONSE_FORMATS = new Set(['json', 'text', 'verbose_json'] as const);

function requireEnvValue(names: string[], description: string) {
  for (const name of names) {
    const value = process.env[name];
    if (!isMissingOrPlaceholder(value)) {
      return value!.trim();
    }
  }

  throw new Error(`${description} is not configured. Set ${names.join(' or ')} in .env.local.`);
}

function stripOpenAIPath(rawValue: string) {
  return rawValue
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/openai\/v\d+$/i, '')
    .replace(/\/openai$/i, '');
}

function normalizeProjectBaseURL(projectEndpoint: string) {
  return `${projectEndpoint.trim().replace(/\/+$/, '')}/openai/v1`;
}

function normalizeOpenAIBaseURL(rawValue: string) {
  const trimmed = rawValue.trim().replace(/\/+$/, '');
  if (/\/openai\/v\d+$/i.test(trimmed)) {
    return trimmed;
  }
  if (/\/openai$/i.test(trimmed)) {
    return `${trimmed}/v1`;
  }
  return `${trimmed}/openai/v1`;
}

export function getAzureSummarizationModel() {
  return requireEnvValue(
    ['AZURE_OPENAI_DEPLOYMENT', 'AZURE_OPENAI_SUMMARIZE_DEPLOYMENT'],
    'Azure OpenAI summarization deployment'
  );
}

export function getAzureTranscriptionDeployment() {
  return requireEnvValue(
    [
      'AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT',
      'AZURE_OPENAI_TRANSCRIBE_MODEL',
      'AZURE_OPENAI_DEPLOYMENT',
    ],
    'Azure OpenAI transcription deployment'
  );
}

export function getAzureTranscriptionResponseFormat() {
  const configured = process.env.AZURE_OPENAI_TRANSCRIBE_RESPONSE_FORMAT;
  if (isMissingOrPlaceholder(configured)) {
    return 'verbose_json' as const;
  }

  const value = configured!.trim().toLowerCase();
  if (!TRANSCRIPTION_RESPONSE_FORMATS.has(value as 'json' | 'text' | 'verbose_json')) {
    throw new Error(
      'Azure OpenAI transcription response format is invalid. Set AZURE_OPENAI_TRANSCRIBE_RESPONSE_FORMAT to json, text, or verbose_json.'
    );
  }

  return value as 'json' | 'text' | 'verbose_json';
}

export function getAzureOpenAIEndpoint() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!isMissingOrPlaceholder(endpoint)) {
    return endpoint!.trim().replace(/\/+$/, '');
  }

  const base = process.env.AZURE_OPENAI_API_BASE;
  if (!isMissingOrPlaceholder(base)) {
    return stripOpenAIPath(base!);
  }

  throw new Error(
    'Azure OpenAI endpoint is not configured. Set AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_BASE in .env.local.'
  );
}

export function getAzureAIProjectEndpoint() {
  return requireEnvValue(
    ['AZURE_AI_PROJECT_ENDPOINT', 'AZURE_OPENAI_PROJECT_ENDPOINT'],
    'Azure AI project endpoint for summarization'
  );
}

export function getAzureTranscriptionScope() {
  return resolveAzureScope({
    explicitScope: process.env.AZURE_OPENAI_TRANSCRIBE_SCOPE || process.env.AZURE_OPENAI_SCOPE,
    endpoint: getAzureOpenAIEndpoint(),
  });
}

export function getAzureSummarizationScope() {
  const projectEndpoint =
    process.env.AZURE_AI_PROJECT_ENDPOINT || process.env.AZURE_OPENAI_PROJECT_ENDPOINT;

  return resolveAzureScope({
    explicitScope: process.env.AZURE_OPENAI_SUMMARIZE_SCOPE || process.env.AZURE_OPENAI_SCOPE,
    endpoint: !isMissingOrPlaceholder(projectEndpoint)
      ? projectEndpoint
      : getAzureOpenAIEndpoint(),
  });
}

export function getAzureSummarizationBaseURL() {
  const projectEndpoint =
    process.env.AZURE_AI_PROJECT_ENDPOINT || process.env.AZURE_OPENAI_PROJECT_ENDPOINT;

  if (!isMissingOrPlaceholder(projectEndpoint)) {
    return normalizeProjectBaseURL(projectEndpoint!);
  }

  const apiBase = process.env.AZURE_OPENAI_API_BASE;
  if (!isMissingOrPlaceholder(apiBase)) {
    return normalizeOpenAIBaseURL(apiBase!);
  }

  return normalizeOpenAIBaseURL(getAzureOpenAIEndpoint());
}

export function getOpenAIApiVersion() {
  const configured = process.env.OPENAI_API_VERSION;
  if (!isMissingOrPlaceholder(configured)) {
    return configured!.trim();
  }

  return DEFAULT_OPENAI_API_VERSION;
}

export function createAzureTranscriptionClient() {
  return new AzureOpenAI({
    endpoint: getAzureOpenAIEndpoint(),
    azureADTokenProvider: createAzureTokenProvider(getAzureTranscriptionScope()),
    apiVersion: getOpenAIApiVersion(),
    deployment: getAzureTranscriptionDeployment(),
  });
}

export async function createAzureSummarizationClient() {
  const tokenResponse = await createAzureCredential().getToken(getAzureSummarizationScope());

  if (!tokenResponse?.token) {
    throw new Error('Failed to acquire an Azure AI bearer token for summarization.');
  }

  return new OpenAI({
    baseURL: getAzureSummarizationBaseURL(),
    apiKey: tokenResponse.token,
  });
}
