const { execFile } = require('child_process');
const { promisify } = require('util');

const DEFAULT_AZURE_OPENAI_SCOPE = 'https://cognitiveservices.azure.com/.default';
const DEFAULT_AZURE_AI_PROJECT_SCOPE = 'https://ai.azure.com/.default';
const PLACEHOLDER_PATTERN = /^(your[-_].*|replace-with-.*)$/i;
const WSL_AZURE_CLI_TIMEOUT_MS = 10000;
const WSL_TOKEN_REFRESH_BUFFER_MS = 60000;
const execFileAsync = promisify(execFile);
const wslTokenCache = new Map();

function isMissingOrPlaceholder(value) {
  return !value || !value.trim() || PLACEHOLDER_PATTERN.test(value.trim());
}

function isAzureAIProjectEndpoint(value) {
  if (isMissingOrPlaceholder(value)) {
    return false;
  }

  const trimmed = value.trim();

  try {
    const url = new URL(trimmed);
    return (
      /\.services\.ai\.azure\.com$/i.test(url.hostname) ||
      /\/api\/projects\/[^/]+/i.test(url.pathname)
    );
  } catch {
    return /services\.ai\.azure\.com|\/api\/projects\//i.test(trimmed);
  }
}

function resolveAzureScope({ endpoint, explicitScope } = {}) {
  if (!isMissingOrPlaceholder(explicitScope)) {
    return explicitScope.trim();
  }

  return isAzureAIProjectEndpoint(endpoint)
    ? DEFAULT_AZURE_AI_PROJECT_SCOPE
    : DEFAULT_AZURE_OPENAI_SCOPE;
}

function isTruthy(value) {
  return /^(1|true|yes|on)$/i.test(value.trim());
}

function shouldUseWslAzureCliFallback() {
  const configured =
    process.env.AZURE_OPENAI_USE_WSL_AZ_CLI || process.env.AZURE_USE_WSL_AZ_CLI;

  if (!isMissingOrPlaceholder(configured)) {
    return isTruthy(configured);
  }

  return process.platform === 'win32';
}

function hasServicePrincipalCredentialConfig() {
  return (
    !isMissingOrPlaceholder(process.env.AZURE_TENANT_ID) &&
    !isMissingOrPlaceholder(process.env.AZURE_CLIENT_ID) &&
    (!isMissingOrPlaceholder(process.env.AZURE_CLIENT_SECRET) ||
      !isMissingOrPlaceholder(process.env.AZURE_CLIENT_CERTIFICATE_PATH))
  );
}

function hasWorkloadIdentityCredentialConfig() {
  return (
    !isMissingOrPlaceholder(process.env.AZURE_TENANT_ID) &&
    !isMissingOrPlaceholder(process.env.AZURE_CLIENT_ID) &&
    !isMissingOrPlaceholder(process.env.AZURE_FEDERATED_TOKEN_FILE)
  );
}

function hasManagedIdentityCredentialConfig() {
  return [
    'IDENTITY_ENDPOINT',
    'IDENTITY_HEADER',
    'MSI_ENDPOINT',
    'MSI_SECRET',
    'IMDS_ENDPOINT',
    'AZURE_POD_IDENTITY_AUTHORITY_HOST',
    'WEBSITE_INSTANCE_ID',
  ].some((name) => !isMissingOrPlaceholder(process.env[name]));
}

function normalizeTokenScope(scopes) {
  if (Array.isArray(scopes)) {
    return scopes.length === 1 ? scopes[0] : undefined;
  }

  return scopes;
}

function getAccessTokenExpiryTimestamp(tokenResponse) {
  if (typeof tokenResponse.expires_on === 'number' && Number.isFinite(tokenResponse.expires_on)) {
    return tokenResponse.expires_on * 1000;
  }

  if (typeof tokenResponse.expiresOn !== 'string' || !tokenResponse.expiresOn.trim()) {
    return undefined;
  }

  const parsed = Date.parse(`${tokenResponse.expiresOn.trim().replace(' ', 'T')}Z`);
  return Number.isNaN(parsed) ? undefined : parsed;
}

function parseAzureCliJson(stdout) {
  const trimmed = stdout.trim();
  if (!trimmed) {
    throw new Error('Azure CLI returned an empty response.');
  }

  try {
    return JSON.parse(trimmed);
  } catch (error) {
    const jsonStart = trimmed.indexOf('{');
    if (jsonStart >= 0) {
      return JSON.parse(trimmed.slice(jsonStart));
    }

    throw error;
  }
}

class WslAzureCliCredential {
  async getToken(scopes) {
    const { CredentialUnavailableError } = require('@azure/identity');

    if (process.platform !== 'win32') {
      throw new CredentialUnavailableError('WSL Azure CLI fallback is only available on Windows.');
    }

    const scope = normalizeTokenScope(scopes);
    if (!scope) {
      throw new CredentialUnavailableError(
        'WSL Azure CLI fallback only supports a single Azure scope.'
      );
    }

    const cachedToken = wslTokenCache.get(scope);
    if (
      cachedToken &&
      typeof cachedToken.expiresOnTimestamp === 'number' &&
      cachedToken.expiresOnTimestamp - Date.now() > WSL_TOKEN_REFRESH_BUFFER_MS
    ) {
      return cachedToken;
    }

    try {
      const { stdout } = await execFileAsync(
        'wsl.exe',
        ['az', 'account', 'get-access-token', '--scope', scope, '-o', 'json'],
        {
          maxBuffer: 1024 * 1024,
          timeout: WSL_AZURE_CLI_TIMEOUT_MS,
          windowsHide: true,
        }
      );
      const tokenResponse = parseAzureCliJson(stdout);
      const expiresOnTimestamp = getAccessTokenExpiryTimestamp(tokenResponse);

      if (!tokenResponse.accessToken || !expiresOnTimestamp) {
        throw new Error('Azure CLI did not return a usable access token payload.');
      }

      const accessToken = {
        expiresOnTimestamp,
        token: tokenResponse.accessToken,
      };
      wslTokenCache.set(scope, accessToken);
      return accessToken;
    } catch (error) {
      wslTokenCache.delete(scope);
      const message = [
        error && error.message ? error.message : 'Unknown error.',
        error && error.stdout ? error.stdout : '',
        error && error.stderr ? error.stderr : '',
      ]
        .filter(Boolean)
        .join('\n')
        .trim();

      throw new CredentialUnavailableError(`WSL Azure CLI fallback failed. ${message}`);
    }
  }
}

function createUnavailableCredential(name, error) {
  return {
    async getToken() {
      const { CredentialUnavailableError } = require('@azure/identity');
      const message =
        error && error.message ? error.message : `Failed to initialize ${name}.`;
      throw new CredentialUnavailableError(`${name}: ${message}`);
    },
  };
}

function createOptionalCredential(name, factory) {
  try {
    return factory();
  } catch (error) {
    return createUnavailableCredential(name, error);
  }
}

function createAzureCredential(options) {
  const {
    ChainedTokenCredential,
    DefaultAzureCredential,
    EnvironmentCredential,
    ManagedIdentityCredential,
    WorkloadIdentityCredential,
  } = require('@azure/identity');

  if (!shouldUseWslAzureCliFallback()) {
    return new DefaultAzureCredential(options);
  }

  const credentials = [];

  if (hasServicePrincipalCredentialConfig()) {
    credentials.push(
      createOptionalCredential('EnvironmentCredential', () => new EnvironmentCredential(options))
    );
  }

  if (hasWorkloadIdentityCredentialConfig()) {
    credentials.push(
      createOptionalCredential(
        'WorkloadIdentityCredential',
        () => new WorkloadIdentityCredential(options)
      )
    );
  }

  if (hasManagedIdentityCredentialConfig()) {
    credentials.push(
      createOptionalCredential(
        'ManagedIdentityCredential',
        () => new ManagedIdentityCredential(options)
      )
    );
  }

  credentials.push(new WslAzureCliCredential());

  if (credentials.length === 1) {
    return credentials[0];
  }

  return new ChainedTokenCredential(
    ...credentials
  );
}

function createAzureTokenProvider(scope, credential) {
  const { getBearerTokenProvider } = require('@azure/identity');
  return getBearerTokenProvider(credential || createAzureCredential(), scope);
}

function isAzureCredentialError(error) {
  const message = error && error.message ? error.message : '';
  return (
    /ChainedTokenCredential authentication failed/i.test(message) ||
    /CredentialUnavailableError:/i.test(message) ||
    /Failed to acquire an Azure .* bearer token/i.test(message) ||
    /WSL Azure CLI fallback failed/i.test(message)
  );
}

function normalizeAzureCredentialError(error, options = {}) {
  const message =
    error && error.message ? error.message : 'Azure authentication failed.';

  if (!isAzureCredentialError(error)) {
    return message;
  }

  const surface = options.surface ? ` for ${options.surface}` : '';
  const scope = options.scope || DEFAULT_AZURE_OPENAI_SCOPE;
  const authHint =
    process.platform === 'win32' && shouldUseWslAzureCliFallback()
      ? `The Windows server could not get a bearer token. Verify WSL Azure CLI auth with "wsl az account get-access-token --scope ${scope}", or configure AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET.`
      : `The server could not get a bearer token. Verify local auth with "az account get-access-token --scope ${scope}", or configure AZURE_CLIENT_ID, AZURE_TENANT_ID, and AZURE_CLIENT_SECRET.`;

  return `Azure authentication failed${surface}. ${authHint}`;
}

module.exports = {
  DEFAULT_AZURE_AI_PROJECT_SCOPE,
  DEFAULT_AZURE_OPENAI_SCOPE,
  createAzureCredential,
  createAzureTokenProvider,
  isAzureAIProjectEndpoint,
  isAzureCredentialError,
  isMissingOrPlaceholder,
  normalizeAzureCredentialError,
  resolveAzureScope,
};
