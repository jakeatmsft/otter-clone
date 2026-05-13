const test = require('node:test');
const assert = require('node:assert/strict');

const { __test__ } = require('./realtime-bridge');

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

test('getAzureRealtimeDeployment requires a realtime deployment env var', () => {
  withEnv(
    {
      AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT: undefined,
      AZURE_OPENAI_REALTIME_DEPLOYMENT: undefined,
      AZURE_OPENAI_REALTIME_MODEL: undefined,
      AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT: 'batch-transcribe',
      AZURE_OPENAI_TRANSCRIBE_MODEL: 'gpt-4o-transcribe-diarize',
    },
    () => {
      assert.throws(
        () => __test__.getAzureRealtimeDeployment(),
        /Azure OpenAI realtime deployment is not configured/
      );
    }
  );

  withEnv(
    {
      AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT: 'gpt-realtime-mini',
      AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT: 'batch-transcribe',
    },
    () => {
      assert.equal(__test__.getAzureRealtimeDeployment(), 'gpt-realtime-mini');
    }
  );
});

test('buildAzureRealtimeUrl targets the realtime deployment without transcription intent', () => {
  withEnv(
    {
      AZURE_OPENAI_API_BASE: 'https://eu2-oai.openai.azure.com/openai/v1/',
      AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT: 'gpt-realtime-mini',
      AZURE_OPENAI_REALTIME_API_VERSION: undefined,
    },
    () => {
      const url = __test__.buildAzureRealtimeUrl();

      assert.equal(url.origin, 'wss://eu2-oai.openai.azure.com');
      assert.equal(url.pathname, '/openai/realtime');
      assert.equal(url.searchParams.get('deployment'), 'gpt-realtime-mini');
      assert.equal(url.searchParams.get('api-version'), '2024-10-01-preview');
      assert.equal(url.searchParams.has('intent'), false);
    }
  );
});

test('buildRealtimeSessionUpdateEvent uses realtime session.update and disables auto responses', () => {
  withEnv(
    {
      AZURE_OPENAI_REALTIME_TRANSCRIBE_MODEL: 'gpt-4o-mini-transcribe',
      AZURE_OPENAI_REALTIME_TRANSCRIBE_LANGUAGE: 'en',
      AZURE_OPENAI_REALTIME_TRANSCRIBE_PROMPT: 'Capture meeting action items.',
    },
    () => {
      const event = __test__.buildRealtimeSessionUpdateEvent();

      assert.equal(event.type, 'session.update');
      assert.deepEqual(event.session.modalities, ['text']);
      assert.deepEqual(event.session.input_audio_noise_reduction, { type: 'near_field' });
      assert.deepEqual(event.session.input_audio_transcription, {
        model: 'gpt-4o-mini-transcribe',
        language: 'en',
        prompt: 'Capture meeting action items.',
      });
      assert.equal(event.session.turn_detection.create_response, false);
      assert.equal(event.session.turn_detection.interrupt_response, false);
    }
  );
});

test('buildSessionReadyPayload includes the provider-specific sample rate', () => {
  assert.deepEqual(
    __test__.buildSessionReadyPayload(__test__.AZURE_REALTIME_SAMPLE_RATE),
    {
      type: 'session.ready',
      sampleRate: 24000,
    }
  );
  assert.equal(__test__.getFoundryLocalRealtimeSampleRate(), 16000);
});
