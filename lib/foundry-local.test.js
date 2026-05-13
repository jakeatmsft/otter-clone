const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  getFoundryLocalLogLevel,
  getFoundryLocalManagerConfig,
  getFoundryLocalRealtimeSampleRate,
  normalizeFoundryLocalTranscriptionResponse,
  __test__,
} = require('./foundry-local');

function withEnv(overrides, callback) {
  const previous = new Map();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);
    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  try {
    return callback();
  } finally {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  }
}

test('normalizeFoundryLocalTranscriptionResponse preserves text-only transcripts', () => {
  assert.deepEqual(
    normalizeFoundryLocalTranscriptionResponse({ text: 'hello world' }),
    {
      durationSeconds: undefined,
      segments: [],
      transcript: 'hello world',
    }
  );
});

test('normalizeFoundryLocalTranscriptionResponse falls back to segment text and duration', () => {
  assert.deepEqual(
    normalizeFoundryLocalTranscriptionResponse({
      segments: [
        { start: 0, end: 1.2, text: 'hello' },
        { start: 1.2, end: 2.8, text: 'world' },
      ],
    }),
    {
      durationSeconds: 2.8,
      segments: [
        { start: 0, end: 1.2, text: 'hello' },
        { start: 1.2, end: 2.8, text: 'world' },
      ],
      transcript: 'hello world',
    }
  );
});

test('getFoundryLocalLogLevel validates configured values', () => {
  withEnv({ FOUNDRY_LOCAL_LOG_LEVEL: 'warn' }, () => {
    assert.equal(getFoundryLocalLogLevel(), 'warn');
  });

  withEnv({ FOUNDRY_LOCAL_LOG_LEVEL: 'loud' }, () => {
    assert.throws(
      () => getFoundryLocalLogLevel(),
      /Foundry Local log level is invalid/
    );
  });
});

test('getFoundryLocalManagerConfig includes configured directories and sample rate stays fixed', () => {
  withEnv(
    {
      FOUNDRY_LOCAL_APP_NAME: 'otter-local',
      FOUNDRY_LOCAL_APP_DATA_DIR: '/tmp/foundry-app',
      FOUNDRY_LOCAL_MODEL_CACHE_DIR: '/tmp/foundry-cache',
      FOUNDRY_LOCAL_LOGS_DIR: '/tmp/foundry-logs',
      FOUNDRY_LOCAL_LIBRARY_PATH: '/tmp/foundry-lib',
      FOUNDRY_LOCAL_SERVICE_ENDPOINT: 'http://127.0.0.1:5273',
      FOUNDRY_LOCAL_WEB_SERVICE_URLS: 'http://127.0.0.1:8080',
    },
    () => {
      assert.deepEqual(getFoundryLocalManagerConfig(), {
        appName: 'otter-local',
        appDataDir: '/tmp/foundry-app',
        libraryPath: '/tmp/foundry-lib',
        logLevel: 'warn',
        logsDir: '/tmp/foundry-logs',
        modelCacheDir: '/tmp/foundry-cache',
        serviceEndpoint: 'http://127.0.0.1:5273',
        webServiceUrls: 'http://127.0.0.1:8080',
      });
      assert.equal(getFoundryLocalRealtimeSampleRate(), 16000);
    }
  );
});

test('normalizeFoundryLocalLibraryPath accepts both directories and file paths', () => {
  const expectedFilename = __test__.getFoundryLocalCoreFilename();
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'foundry-local-test-'));

  assert.equal(
    __test__.normalizeFoundryLocalLibraryPath(tempDir),
    path.join(tempDir, expectedFilename)
  );
  assert.equal(
    __test__.normalizeFoundryLocalLibraryPath(path.join(tempDir, expectedFilename)),
    path.join(tempDir, expectedFilename)
  );
});

test('platform mismatch error mentions the current platform and installed platforms', () => {
  const error = __test__.createFoundryLocalPlatformMismatchError();
  assert.match(error.message, /Foundry Local native libraries/);
});
