const fs = require('fs');
const path = require('path');

const DEFAULT_FOUNDRY_LOCAL_APP_NAME = 'seaotter';
const DEFAULT_FOUNDRY_LOCAL_LOG_LEVEL = 'warn';
const DEFAULT_FOUNDRY_LOCAL_MODEL = 'nemotron-speech-streaming-en-0.6b';
const DEFAULT_FOUNDRY_LOCAL_REALTIME_SAMPLE_RATE = 16000;
const VALID_FOUNDRY_LOCAL_LOG_LEVELS = new Set([
  'trace',
  'debug',
  'info',
  'warn',
  'error',
  'fatal',
]);

let managerPromise = null;
const modelPromiseByAlias = new Map();
const PLATFORM_LIBRARY_EXTENSIONS = {
  win32: '.dll',
  linux: '.so',
  darwin: '.dylib',
};

function getSegmentDurationSeconds(segments) {
  return segments.reduce(
    (max, segment) => Math.max(max, segment.end || segment.start || 0),
    0
  );
}

function getOptionalEnvValue(names) {
  for (const name of names) {
    const value = process.env[name];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return undefined;
}

function getFoundryLocalAppName() {
  return (
    getOptionalEnvValue(['FOUNDRY_LOCAL_APP_NAME']) || DEFAULT_FOUNDRY_LOCAL_APP_NAME
  );
}

function getFoundryLocalLogLevel() {
  const configured =
    getOptionalEnvValue(['FOUNDRY_LOCAL_LOG_LEVEL']) || DEFAULT_FOUNDRY_LOCAL_LOG_LEVEL;

  if (!VALID_FOUNDRY_LOCAL_LOG_LEVELS.has(configured)) {
    throw new Error(
      'Foundry Local log level is invalid. Set FOUNDRY_LOCAL_LOG_LEVEL to trace, debug, info, warn, error, or fatal.'
    );
  }

  return configured;
}

function getFoundryLocalTranscriptionModel() {
  return (
    getOptionalEnvValue([
      'FOUNDRY_LOCAL_TRANSCRIBE_MODEL',
      'FOUNDRY_LOCAL_MODEL',
    ]) || DEFAULT_FOUNDRY_LOCAL_MODEL
  );
}

function getFoundryLocalRealtimeModel() {
  return (
    getOptionalEnvValue([
      'FOUNDRY_LOCAL_REALTIME_MODEL',
      'FOUNDRY_LOCAL_TRANSCRIBE_MODEL',
      'FOUNDRY_LOCAL_MODEL',
    ]) || DEFAULT_FOUNDRY_LOCAL_MODEL
  );
}

function getFoundryLocalTranscriptionLanguage() {
  return getOptionalEnvValue(['FOUNDRY_LOCAL_TRANSCRIBE_LANGUAGE']);
}

function getFoundryLocalRealtimeLanguage() {
  return (
    getOptionalEnvValue([
      'FOUNDRY_LOCAL_REALTIME_LANGUAGE',
      'FOUNDRY_LOCAL_TRANSCRIBE_LANGUAGE',
    ]) || undefined
  );
}

function getFoundryLocalRealtimeSampleRate() {
  return DEFAULT_FOUNDRY_LOCAL_REALTIME_SAMPLE_RATE;
}

function getCurrentPlatformKey() {
  return `${process.platform}-${process.arch}`;
}

function getFoundryLocalCoreFilename() {
  const extension = PLATFORM_LIBRARY_EXTENSIONS[process.platform];
  if (!extension) {
    throw new Error(`Foundry Local is not supported on platform ${process.platform}.`);
  }

  return `Microsoft.AI.Foundry.Local.Core${extension}`;
}

function getFoundryLocalSdkRoot() {
  return path.dirname(require.resolve('foundry-local-sdk/package.json'));
}

function normalizeFoundryLocalLibraryPath(rawValue) {
  if (typeof rawValue !== 'string' || !rawValue.trim()) {
    return undefined;
  }

  const normalized = rawValue.trim();
  try {
    const resolved = path.resolve(normalized);
    if (fs.existsSync(resolved) && fs.statSync(resolved).isDirectory()) {
      return path.join(resolved, getFoundryLocalCoreFilename());
    }

    return resolved;
  } catch {
    return normalized;
  }
}

function resolveInstalledFoundryLocalLibraryPath() {
  try {
    const candidate = path.join(
      getFoundryLocalSdkRoot(),
      'foundry-local-core',
      getCurrentPlatformKey(),
      getFoundryLocalCoreFilename()
    );

    return fs.existsSync(candidate) ? candidate : undefined;
  } catch {
    return undefined;
  }
}

function listInstalledFoundryLocalPlatforms() {
  try {
    const coreRoot = path.join(getFoundryLocalSdkRoot(), 'foundry-local-core');
    if (!fs.existsSync(coreRoot)) {
      return [];
    }

    return fs
      .readdirSync(coreRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .sort();
  } catch {
    return [];
  }
}

function createFoundryLocalPlatformMismatchError() {
  const platformKey = getCurrentPlatformKey();
  const installedPlatforms = listInstalledFoundryLocalPlatforms();

  if (!installedPlatforms.length) {
    return new Error(
      'Foundry Local native libraries were not found in node_modules. Run `npm install` in the same shell environment you use to start the app.'
    );
  }

  if (!installedPlatforms.includes(platformKey)) {
    return new Error(
      `Foundry Local native libraries for ${platformKey} are missing. This install contains ${installedPlatforms.join(', ')}. If you start the app from PowerShell, reinstall dependencies from PowerShell so foundry-local-sdk downloads Windows binaries instead of WSL/Linux binaries.`
    );
  }

  return new Error(
    `Foundry Local native libraries for ${platformKey} were expected but could not be resolved. Set FOUNDRY_LOCAL_LIBRARY_PATH to the full path of ${getFoundryLocalCoreFilename()} if auto-discovery still fails.`
  );
}

function getFoundryLocalManagerConfig() {
  const config = {
    appName: getFoundryLocalAppName(),
    logLevel: getFoundryLocalLogLevel(),
  };

  const appDataDir = getOptionalEnvValue(['FOUNDRY_LOCAL_APP_DATA_DIR']);
  const libraryPathOverride = getOptionalEnvValue(['FOUNDRY_LOCAL_LIBRARY_PATH']);
  const logsDir = getOptionalEnvValue(['FOUNDRY_LOCAL_LOGS_DIR']);
  const modelCacheDir = getOptionalEnvValue(['FOUNDRY_LOCAL_MODEL_CACHE_DIR']);
  const serviceEndpoint = getOptionalEnvValue(['FOUNDRY_LOCAL_SERVICE_ENDPOINT']);
  const webServiceUrls = getOptionalEnvValue(['FOUNDRY_LOCAL_WEB_SERVICE_URLS']);
  const resolvedLibraryPath =
    normalizeFoundryLocalLibraryPath(libraryPathOverride) ||
    resolveInstalledFoundryLocalLibraryPath();

  if (appDataDir) {
    config.appDataDir = appDataDir;
  }
  if (resolvedLibraryPath) {
    config.libraryPath = resolvedLibraryPath;
  }
  if (logsDir) {
    config.logsDir = logsDir;
  }
  if (modelCacheDir) {
    config.modelCacheDir = modelCacheDir;
  }
  if (serviceEndpoint) {
    config.serviceEndpoint = serviceEndpoint;
  }
  if (webServiceUrls) {
    config.webServiceUrls = webServiceUrls;
  }

  return config;
}

async function importFoundryLocalSdk() {
  try {
    return await import('foundry-local-sdk');
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/foundry-local-sdk|ERR_MODULE_NOT_FOUND|Cannot find package/i.test(message)) {
      throw new Error(
        'Foundry Local transcription is enabled but the foundry-local-sdk package is not available. Run `npm install` and make sure Foundry Local is installed on this machine.'
      );
    }

    throw error;
  }
}

async function getFoundryLocalManager() {
  if (!managerPromise) {
    managerPromise = (async () => {
      const resolvedLibraryPath = resolveInstalledFoundryLocalLibraryPath();
      if (!resolvedLibraryPath && !getOptionalEnvValue(['FOUNDRY_LOCAL_LIBRARY_PATH'])) {
        throw createFoundryLocalPlatformMismatchError();
      }

      const { FoundryLocalManager } = await importFoundryLocalSdk();
      if (!FoundryLocalManager) {
        throw new Error('Failed to load the Foundry Local manager from foundry-local-sdk.');
      }

      if (typeof FoundryLocalManager.createAsync === 'function') {
        return FoundryLocalManager.createAsync(getFoundryLocalManagerConfig());
      }

      return FoundryLocalManager.create(getFoundryLocalManagerConfig());
    })().catch((error) => {
      managerPromise = null;
      throw error;
    });
  }

  return managerPromise;
}

async function getLoadedFoundryLocalModel(modelAlias) {
  const alias = String(modelAlias || '').trim();
  if (!alias) {
    throw new Error('Foundry Local model alias is required.');
  }

  if (!modelPromiseByAlias.has(alias)) {
    modelPromiseByAlias.set(
      alias,
      (async () => {
        const manager = await getFoundryLocalManager();
        let model;

        try {
          model = await manager.catalog.getModel(alias);
        } catch (error) {
          throw new Error(
            `Foundry Local model "${alias}" was not found in the local catalog. Set FOUNDRY_LOCAL_MODEL/FOUNDRY_LOCAL_TRANSCRIBE_MODEL to an installed model alias.`,
            { cause: error }
          );
        }

        if (!model.isCached) {
          console.info(`Downloading Foundry Local model "${alias}"...`);
          await model.download();
        }

        if (!(await model.isLoaded())) {
          console.info(`Loading Foundry Local model "${alias}"...`);
          await model.load();
        }

        return model;
      })().catch((error) => {
        modelPromiseByAlias.delete(alias);
        throw error;
      })
    );
  }

  return modelPromiseByAlias.get(alias);
}

function normalizeFoundryLocalTranscriptionResponse(transcription) {
  if (typeof transcription === 'string') {
    return {
      durationSeconds: undefined,
      segments: [],
      transcript: transcription,
    };
  }

  const transcriptFromText =
    transcription && typeof transcription.text === 'string' ? transcription.text : '';
  const segments = Array.isArray(transcription?.segments)
    ? transcription.segments.map((segment) => ({
        end: segment.end,
        start: segment.start,
        text: segment.text || '',
      }))
    : Array.isArray(transcription?.words)
      ? transcription.words.map((word) => ({
          end: word.end,
          start: word.start,
          text: word.word || '',
        }))
      : [];
  const transcript =
    transcriptFromText ||
    segments
      .map((segment) => segment.text.trim())
      .filter(Boolean)
      .join(' ')
      .trim();

  return {
    durationSeconds:
      typeof transcription?.duration === 'number'
        ? transcription.duration
        : segments.length
          ? getSegmentDurationSeconds(segments)
          : undefined,
    segments,
    transcript,
  };
}

async function transcribeAudioFileWithFoundryLocal(audioFilePath) {
  const model = await getLoadedFoundryLocalModel(getFoundryLocalTranscriptionModel());
  const audioClient = model.createAudioClient();
  const language = getFoundryLocalTranscriptionLanguage();

  if (language) {
    audioClient.settings.language = language;
  }

  const response = await audioClient.transcribe(audioFilePath);
  return normalizeFoundryLocalTranscriptionResponse(response);
}

async function createFoundryLocalRealtimeSession() {
  const model = await getLoadedFoundryLocalModel(getFoundryLocalRealtimeModel());
  const audioClient = model.createAudioClient();
  const language = getFoundryLocalRealtimeLanguage();
  const session = audioClient.createLiveTranscriptionSession();

  session.settings.sampleRate = getFoundryLocalRealtimeSampleRate();
  session.settings.channels = 1;
  session.settings.bitsPerSample = 16;

  if (language) {
    audioClient.settings.language = language;
    session.settings.language = language;
  }

  await session.start();

  return {
    sampleRate: getFoundryLocalRealtimeSampleRate(),
    session,
  };
}

module.exports = {
  createFoundryLocalRealtimeSession,
  createFoundryLocalPlatformMismatchError,
  getFoundryLocalAppName,
  getCurrentPlatformKey,
  getFoundryLocalCoreFilename,
  getFoundryLocalLogLevel,
  getFoundryLocalManagerConfig,
  getFoundryLocalRealtimeLanguage,
  getFoundryLocalRealtimeModel,
  getFoundryLocalRealtimeSampleRate,
  getFoundryLocalTranscriptionLanguage,
  getFoundryLocalTranscriptionModel,
  listInstalledFoundryLocalPlatforms,
  normalizeFoundryLocalTranscriptionResponse,
  normalizeFoundryLocalLibraryPath,
  resolveInstalledFoundryLocalLibraryPath,
  transcribeAudioFileWithFoundryLocal,
  __test__: {
    DEFAULT_FOUNDRY_LOCAL_APP_NAME,
    DEFAULT_FOUNDRY_LOCAL_LOG_LEVEL,
    DEFAULT_FOUNDRY_LOCAL_MODEL,
    DEFAULT_FOUNDRY_LOCAL_REALTIME_SAMPLE_RATE,
    createFoundryLocalPlatformMismatchError,
    getCurrentPlatformKey,
    getFoundryLocalCoreFilename,
    getOptionalEnvValue,
    listInstalledFoundryLocalPlatforms,
    normalizeFoundryLocalLibraryPath,
    resolveInstalledFoundryLocalLibraryPath,
  },
};
