const { WebSocket } = require('ws');
const {
  createAzureCredential,
  isAzureCredentialError,
  normalizeAzureCredentialError,
  resolveAzureScope,
} = require('./lib/azure-auth');

const DEFAULT_REALTIME_API_VERSION = '2024-10-01-preview';
const DEFAULT_REALTIME_TRANSCRIPTION_MODEL = 'gpt-4o-transcribe';
const PLACEHOLDER_PATTERN = /^(your[-_].*|replace-with-.*)$/i;
const CLOSE_DELAY_MS = 100;
const STOP_FALLBACK_MS = 2000;
const AZURE_CONNECT_TIMEOUT_MS = 10000;
const SESSION_READY_TIMEOUT_MS = 10000;
const SUPPORTED_REALTIME_TRANSCRIPTION_MODELS = new Set([
  'gpt-4o-transcribe',
  'gpt-4o-mini-transcribe',
  'whisper-1',
]);

const REALTIME_DEPLOYMENT_ENV_NAMES = [
  'AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT',
  'AZURE_OPENAI_REALTIME_DEPLOYMENT',
  'AZURE_OPENAI_REALTIME_MODEL',
];

function isMissingOrPlaceholder(value) {
  return !value || !value.trim() || PLACEHOLDER_PATTERN.test(value.trim());
}

function requireEnvValue(names, description) {
  for (const name of names) {
    const value = process.env[name];
    if (!isMissingOrPlaceholder(value)) {
      return value.trim();
    }
  }

  throw new Error(`${description} is not configured. Set ${names.join(' or ')} in .env.local.`);
}

function stripOpenAIPath(rawValue) {
  return rawValue
    .trim()
    .replace(/\/+$/, '')
    .replace(/\/openai\/v\d+$/i, '')
    .replace(/\/openai$/i, '');
}

function getAzureOpenAIEndpoint() {
  const endpoint = process.env.AZURE_OPENAI_ENDPOINT;
  if (!isMissingOrPlaceholder(endpoint)) {
    return endpoint.trim().replace(/\/+$/, '');
  }

  const base = process.env.AZURE_OPENAI_API_BASE;
  if (!isMissingOrPlaceholder(base)) {
    return stripOpenAIPath(base);
  }

  throw new Error(
    'Azure OpenAI endpoint is not configured. Set AZURE_OPENAI_ENDPOINT or AZURE_OPENAI_API_BASE in .env.local.'
  );
}

function getAzureRealtimeApiVersion() {
  const value = process.env.AZURE_OPENAI_REALTIME_API_VERSION;
  if (!isMissingOrPlaceholder(value)) {
    return value.trim();
  }

  return DEFAULT_REALTIME_API_VERSION;
}

function getAzureRealtimeScope() {
  return resolveAzureScope({
    explicitScope:
      process.env.AZURE_OPENAI_REALTIME_SCOPE || process.env.AZURE_OPENAI_SCOPE,
    endpoint: getAzureOpenAIEndpoint(),
  });
}

function getAzureRealtimeDeployment() {
  return requireEnvValue(
    REALTIME_DEPLOYMENT_ENV_NAMES,
    'Azure OpenAI realtime deployment'
  );
}

function getAzureRealtimeTranscriptionModel() {
  const configured =
    process.env.AZURE_OPENAI_REALTIME_TRANSCRIBE_MODEL ||
    process.env.AZURE_OPENAI_REALTIME_MODEL_ID;

  if (!isMissingOrPlaceholder(configured)) {
    return configured.trim();
  }

  for (const envName of REALTIME_DEPLOYMENT_ENV_NAMES) {
    const deployment = process.env[envName];
    if (isMissingOrPlaceholder(deployment)) {
      continue;
    }

    const value = deployment.trim();
    if (SUPPORTED_REALTIME_TRANSCRIPTION_MODELS.has(value)) {
      return value;
    }
  }

  return DEFAULT_REALTIME_TRANSCRIPTION_MODEL;
}

function getAzureRealtimeTranscriptionLanguage() {
  const value =
    process.env.AZURE_OPENAI_REALTIME_TRANSCRIBE_LANGUAGE ||
    process.env.AZURE_OPENAI_TRANSCRIBE_LANGUAGE;

  return isMissingOrPlaceholder(value) ? undefined : value.trim();
}

function getAzureRealtimeTranscriptionPrompt() {
  const value =
    process.env.AZURE_OPENAI_REALTIME_TRANSCRIBE_PROMPT ||
    process.env.AZURE_OPENAI_TRANSCRIBE_PROMPT;

  return isMissingOrPlaceholder(value) ? undefined : value.trim();
}

function buildAzureRealtimeUrl() {
  const endpoint = getAzureOpenAIEndpoint().replace(/^http/i, 'ws');
  const url = new URL(`${endpoint}/openai/realtime`);
  url.searchParams.set('api-version', getAzureRealtimeApiVersion());
  url.searchParams.set('deployment', getAzureRealtimeDeployment());
  return url;
}

function buildRealtimeSessionUpdateEvent() {
  const transcription = {
    model: getAzureRealtimeTranscriptionModel(),
  };
  const language = getAzureRealtimeTranscriptionLanguage();
  const prompt = getAzureRealtimeTranscriptionPrompt();

  if (language) {
    transcription.language = language;
  }
  if (prompt) {
    transcription.prompt = prompt;
  }

  return {
    type: 'session.update',
    session: {
      modalities: ['text'],
      input_audio_format: 'pcm16',
      input_audio_noise_reduction: {
        type: 'near_field',
      },
      input_audio_transcription: transcription,
      turn_detection: {
        type: 'server_vad',
        threshold: 0.5,
        prefix_padding_ms: 300,
        silence_duration_ms: 500,
        create_response: false,
        interrupt_response: false,
      },
    },
  };
}

function hasExplicitRealtimeDeployment() {
  return REALTIME_DEPLOYMENT_ENV_NAMES.some(
    (name) => !isMissingOrPlaceholder(process.env[name])
  );
}

function normalizeAzureRealtimeError(error) {
  const message =
    error && error.message ? error.message : 'Azure realtime websocket failed.';

  if (isAzureCredentialError(error)) {
    return normalizeAzureCredentialError(error, {
      scope: getAzureRealtimeScope(),
      surface: 'realtime transcription',
    });
  }

  if (!/unexpected server response: 400/i.test(message)) {
    return message;
  }

  if (!hasExplicitRealtimeDeployment()) {
    return 'Azure rejected the realtime websocket upgrade. Set AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT to a realtime-capable deployment such as gpt-realtime-mini for the Record page.';
  }

  return 'Azure rejected the realtime websocket upgrade. Confirm AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT points to a realtime-capable deployment and that the Record page is not targeting a batch transcription deployment.';
}

function createOrderedTranscript() {
  const itemOrder = [];
  const transcriptByItemId = new Map();

  function ensureItem(itemId, previousItemId) {
    if (!itemId || itemOrder.includes(itemId)) {
      return;
    }

    if (previousItemId === 'root') {
      itemOrder.unshift(itemId);
      return;
    }

    const previousIndex = previousItemId ? itemOrder.indexOf(previousItemId) : -1;
    if (previousIndex >= 0) {
      itemOrder.splice(previousIndex + 1, 0, itemId);
      return;
    }

    itemOrder.push(itemId);
  }

  function setTranscript(itemId, transcript) {
    ensureItem(itemId);
    transcriptByItemId.set(itemId, transcript);
  }

  function appendDelta(itemId, delta) {
    const current = transcriptByItemId.get(itemId) || '';
    setTranscript(itemId, `${current}${delta}`);
  }

  function fullTranscript() {
    return itemOrder
      .map((itemId) => (transcriptByItemId.get(itemId) || '').trim())
      .filter(Boolean)
      .join('\n\n');
  }

  return {
    appendDelta,
    ensureItem,
    fullTranscript,
    setTranscript,
  };
}

async function attachRealtimeBridge(browserSocket) {
  let azureSocket;
  let bridgeReady = false;
  let connectTimeout = null;
  let finalized = false;
  let readyTimeout = null;
  let stopFallbackTimer = null;
  let stopRequested = false;
  let stopCommitItemId = null;
  const orderedTranscript = createOrderedTranscript();

  function clearConnectTimeout() {
    if (connectTimeout) {
      clearTimeout(connectTimeout);
      connectTimeout = null;
    }
  }

  function clearReadyTimeout() {
    if (readyTimeout) {
      clearTimeout(readyTimeout);
      readyTimeout = null;
    }
  }

  function clearStopFallback() {
    if (stopFallbackTimer) {
      clearTimeout(stopFallbackTimer);
      stopFallbackTimer = null;
    }
  }

  function sendBrowser(payload) {
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.send(JSON.stringify(payload));
    }
  }

  function finalizeSession() {
    if (finalized) {
      return;
    }

    finalized = true;
    clearConnectTimeout();
    clearReadyTimeout();
    clearStopFallback();
    const fullTranscript = orderedTranscript.fullTranscript();
    sendBrowser({
      type: 'session.finalized',
      fullTranscript,
    });

    setTimeout(() => {
      if (azureSocket && azureSocket.readyState === WebSocket.OPEN) {
        azureSocket.close(1000, 'Realtime transcription complete');
      }
      if (browserSocket.readyState === WebSocket.OPEN) {
        browserSocket.close(1000, 'Realtime transcription complete');
      }
    }, CLOSE_DELAY_MS);
  }

  function scheduleStopFallback() {
    clearStopFallback();
    stopFallbackTimer = setTimeout(() => {
      finalizeSession();
    }, STOP_FALLBACK_MS);
  }

  function markBridgeReady() {
    if (bridgeReady) {
      return;
    }

    bridgeReady = true;
    clearReadyTimeout();
    sendBrowser({ type: 'session.ready' });
  }

  function scheduleReadyTimeout() {
    clearReadyTimeout();
    readyTimeout = setTimeout(() => {
      handleBridgeError(
        'Timed out establishing the Azure realtime transcription session. Confirm the realtime deployment and model configuration.'
      );
    }, SESSION_READY_TIMEOUT_MS);
  }

  function handleBridgeError(message) {
    clearConnectTimeout();
    clearReadyTimeout();
    clearStopFallback();
    sendBrowser({ type: 'error', error: message });
    if (browserSocket.readyState === WebSocket.OPEN) {
      browserSocket.close(1011, 'Realtime bridge error');
    }
    if (azureSocket && azureSocket.readyState === WebSocket.OPEN) {
      azureSocket.close(1011, 'Realtime bridge error');
    }
  }

  try {
    const tokenResponse = await createAzureCredential().getToken(getAzureRealtimeScope());
    if (!tokenResponse || !tokenResponse.token) {
      throw new Error('Failed to acquire an Azure bearer token for realtime transcription.');
    }

    azureSocket = new WebSocket(buildAzureRealtimeUrl(), {
      headers: {
        Authorization: `Bearer ${tokenResponse.token}`,
        'OpenAI-Beta': 'realtime=v1',
      },
    });
    connectTimeout = setTimeout(() => {
      handleBridgeError(
        'Timed out connecting to Azure realtime transcription. Confirm the endpoint, deployment, and Azure authentication.'
      );
    }, AZURE_CONNECT_TIMEOUT_MS);
  } catch (error) {
    handleBridgeError(normalizeAzureRealtimeError(error));
    return;
  }

  azureSocket.on('open', () => {
    clearConnectTimeout();
    azureSocket.send(JSON.stringify(buildRealtimeSessionUpdateEvent()));
    scheduleReadyTimeout();
  });

  azureSocket.on('message', (rawMessage) => {
    let event;

    try {
      event = JSON.parse(rawMessage.toString());
    } catch (error) {
      handleBridgeError('Received malformed realtime event payload from Azure.');
      return;
    }

    switch (event.type) {
      case 'session.created':
      case 'transcription_session.created':
        break;
      case 'session.updated':
      case 'transcription_session.updated':
        markBridgeReady();
        break;
      case 'input_audio_buffer.speech_started':
        sendBrowser({ type: 'speech.started' });
        break;
      case 'input_audio_buffer.speech_stopped':
        sendBrowser({ type: 'speech.stopped' });
        if (stopRequested) {
          scheduleStopFallback();
        }
        break;
      case 'input_audio_buffer.committed':
        orderedTranscript.ensureItem(event.item_id, event.previous_item_id);
        if (stopRequested && !stopCommitItemId) {
          stopCommitItemId = event.item_id;
          scheduleStopFallback();
        }
        break;
      case 'conversation.item.input_audio_transcription.delta':
        orderedTranscript.appendDelta(event.item_id, event.delta || '');
        sendBrowser({
          type: 'transcript.updated',
          fullTranscript: orderedTranscript.fullTranscript(),
          isFinal: false,
          itemId: event.item_id,
        });
        break;
      case 'conversation.item.input_audio_transcription.completed':
        orderedTranscript.setTranscript(event.item_id, event.transcript || '');
        sendBrowser({
          type: 'transcript.updated',
          fullTranscript: orderedTranscript.fullTranscript(),
          isFinal: true,
          itemId: event.item_id,
        });
        if (stopRequested && (!stopCommitItemId || stopCommitItemId === event.item_id)) {
          finalizeSession();
        }
        break;
      case 'conversation.item.input_audio_transcription.failed':
        if (stopRequested && (!stopCommitItemId || stopCommitItemId === event.item_id)) {
          finalizeSession();
          break;
        }
        handleBridgeError(
          event.error && event.error.message
            ? event.error.message
            : 'Realtime transcription failed.'
        );
        break;
      case 'error': {
        const message =
          event.error && event.error.message
            ? event.error.message
            : 'Realtime transcription session failed.';

        if (stopRequested && /input audio buffer is empty/i.test(message)) {
          finalizeSession();
          break;
        }

        handleBridgeError(message);
        break;
      }
      default:
        break;
    }
  });

  azureSocket.on('error', (error) => {
    handleBridgeError(normalizeAzureRealtimeError(error));
  });

  azureSocket.on('close', () => {
    clearConnectTimeout();
    clearReadyTimeout();
    if (finalized || browserSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (stopRequested) {
      finalizeSession();
      return;
    }

    handleBridgeError('Azure realtime transcription connection closed unexpectedly.');
  });

  browserSocket.on('message', (rawMessage) => {
    let message;

    try {
      message = JSON.parse(rawMessage.toString());
    } catch (error) {
      handleBridgeError('Received malformed browser realtime payload.');
      return;
    }

    if (!azureSocket || azureSocket.readyState !== WebSocket.OPEN) {
      return;
    }

    if (message.type === 'audio.append') {
      if (!bridgeReady || typeof message.audio !== 'string' || !message.audio) {
        return;
      }

      azureSocket.send(
        JSON.stringify({
          type: 'input_audio_buffer.append',
          audio: message.audio,
        })
      );
      return;
    }

    if (message.type === 'audio.stop') {
      if (stopRequested) {
        return;
      }

      stopRequested = true;
      scheduleStopFallback();
      azureSocket.send(
        JSON.stringify({
          type: 'input_audio_buffer.commit',
        })
      );
    }
  });

  browserSocket.on('close', () => {
    clearConnectTimeout();
    clearReadyTimeout();
    clearStopFallback();
    if (azureSocket && azureSocket.readyState === WebSocket.OPEN) {
      azureSocket.close(1000, 'Browser connection closed');
    }
  });

  browserSocket.on('error', () => {
    clearConnectTimeout();
    clearReadyTimeout();
    clearStopFallback();
    if (azureSocket && azureSocket.readyState === WebSocket.OPEN) {
      azureSocket.close(1011, 'Browser websocket error');
    }
  });
}

module.exports = {
  attachRealtimeBridge,
  __test__: {
    buildAzureRealtimeUrl,
    buildRealtimeSessionUpdateEvent,
    getAzureRealtimeDeployment,
    getAzureRealtimeScope,
    getAzureRealtimeTranscriptionModel,
    hasExplicitRealtimeDeployment,
    isMissingOrPlaceholder,
    normalizeAzureRealtimeError,
  },
};
