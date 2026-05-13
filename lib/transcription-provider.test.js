const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getTranscriptionProvider,
  normalizeTranscriptionProvider,
} = require('./transcription-provider');

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

test('getTranscriptionProvider defaults to azure', () => {
  withEnv({ TRANSCRIPTION_PROVIDER: undefined }, () => {
    assert.equal(getTranscriptionProvider(), 'azure');
  });
});

test('normalizeTranscriptionProvider accepts foundry-local aliases', () => {
  assert.equal(normalizeTranscriptionProvider('foundry-local'), 'foundry-local');
  assert.equal(normalizeTranscriptionProvider('local'), 'foundry-local');
  assert.equal(normalizeTranscriptionProvider('foundry_local'), 'foundry-local');
});

test('normalizeTranscriptionProvider rejects unsupported values', () => {
  assert.throws(
    () => normalizeTranscriptionProvider('whisper'),
    /Unsupported transcription provider/
  );
});
