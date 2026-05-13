const DEFAULT_TRANSCRIPTION_PROVIDER = 'azure';
const SUPPORTED_TRANSCRIPTION_PROVIDERS = new Set(['azure', 'foundry-local']);

const PROVIDER_ALIASES = {
  azure: 'azure',
  'azure-openai': 'azure',
  azureopenai: 'azure',
  'foundry-local': 'foundry-local',
  foundrylocal: 'foundry-local',
  foundry_local: 'foundry-local',
  local: 'foundry-local',
};

function normalizeTranscriptionProvider(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase();

  if (!normalized) {
    return DEFAULT_TRANSCRIPTION_PROVIDER;
  }

  const resolved = PROVIDER_ALIASES[normalized] || normalized;
  if (!SUPPORTED_TRANSCRIPTION_PROVIDERS.has(resolved)) {
    throw new Error(
      `Unsupported transcription provider "${value}". Set TRANSCRIPTION_PROVIDER to "azure" or "foundry-local".`
    );
  }

  return resolved;
}

function getTranscriptionProvider() {
  return normalizeTranscriptionProvider(process.env.TRANSCRIPTION_PROVIDER);
}

function isFoundryLocalTranscriptionProvider() {
  return getTranscriptionProvider() === 'foundry-local';
}

module.exports = {
  DEFAULT_TRANSCRIPTION_PROVIDER,
  SUPPORTED_TRANSCRIPTION_PROVIDERS,
  getTranscriptionProvider,
  isFoundryLocalTranscriptionProvider,
  normalizeTranscriptionProvider,
};
