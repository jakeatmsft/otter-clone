import { NextRequest, NextResponse } from 'next/server';
import { createReadStream } from 'fs';
import { join } from 'path';
import {
  createAzureTranscriptionClient,
  getAzureOpenAIEndpoint,
  getAzureTranscriptionDeployment,
  getAzureTranscriptionScope,
  getAzureTranscriptionResponseFormat,
  normalizeAzureCredentialError,
} from '@/lib/azure-openai';

const { transcribeAudioFileWithFoundryLocal } = require('@/lib/foundry-local');
const { getTranscriptionProvider } = require('@/lib/transcription-provider');

type RawTranscriptionResponse = {
  duration?: number;
  segments?: Array<{ start?: number; end?: number; text?: string }>;
  text?: string;
  words?: Array<{ start?: number; end?: number; word?: string }>;
};

let cachedTranscriptionResponseFormat: 'json' | 'text' | 'verbose_json' | null = null;

function getSegmentDurationSeconds(
  segments: Array<{ start?: number; end?: number; text?: string }>
) {
  return segments.reduce((max, segment) => Math.max(max, segment.end || segment.start || 0), 0);
}

function normalizeTranscriptionResponse(transcription: string | RawTranscriptionResponse) {
  if (typeof transcription === 'string') {
    return {
      durationSeconds: undefined,
      segments: [],
      transcript: transcription,
    };
  }

  const transcriptFromText = typeof transcription.text === 'string' ? transcription.text : '';
  const segments = Array.isArray(transcription.segments)
    ? transcription.segments.map((segment) => ({
        end: segment.end,
        start: segment.start,
        text: segment.text || '',
      }))
    : Array.isArray(transcription.words)
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
      typeof transcription.duration === 'number'
        ? transcription.duration
        : segments.length
          ? getSegmentDurationSeconds(segments)
          : undefined,
    segments,
    transcript,
  };
}

function shouldRetryWithJson(message: string, responseFormat: 'json' | 'text' | 'verbose_json') {
  return (
    responseFormat === 'verbose_json' &&
    /response_format .* not compatible/i.test(message)
  );
}

async function transcribeWithAzure(filepath: string) {
  const openai = createAzureTranscriptionClient();
  const model = getAzureTranscriptionDeployment();

  const transcribeWithFormat = async (responseFormat: 'json' | 'text' | 'verbose_json') => {
    return openai.audio.transcriptions.create({
      file: createReadStream(filepath) as any,
      model,
      response_format: responseFormat,
      ...(responseFormat === 'verbose_json'
        ? { timestamp_granularities: ['segment'] as const }
        : {}),
    });
  };

  let responseFormat = cachedTranscriptionResponseFormat || getAzureTranscriptionResponseFormat();
  let transcription: string | RawTranscriptionResponse;

  try {
    transcription = await transcribeWithFormat(responseFormat);
    cachedTranscriptionResponseFormat = responseFormat;
  } catch (error) {
    const message = (error as Error).message;

    if (!shouldRetryWithJson(message, responseFormat)) {
      throw error;
    }

    console.warn(
      `Transcription deployment "${model}" does not support ${responseFormat}; retrying with json.`
    );

    responseFormat = 'json';
    transcription = await transcribeWithFormat(responseFormat);
    cachedTranscriptionResponseFormat = responseFormat;
  }

  return normalizeTranscriptionResponse(transcription);
}

export async function POST(request: NextRequest) {
  let provider = 'azure';

  try {
    provider = getTranscriptionProvider();
    const { filename } = await request.json();

    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    const filepath = join(process.cwd(), 'public', 'uploads', filename);
    const normalized =
      provider === 'foundry-local'
        ? await transcribeAudioFileWithFoundryLocal(filepath)
        : await transcribeWithAzure(filepath);

    return NextResponse.json({
      durationSeconds: normalized.durationSeconds,
      segments: normalized.segments,
      transcript: normalized.transcript,
    });
  } catch (error) {
    const message = (error as Error).message;

    if (/Unsupported transcription provider/i.test(message)) {
      return NextResponse.json(
        { error: 'Transcription failed: ' + message },
        { status: 500 }
      );
    }

    if (provider === 'foundry-local') {
      console.error('Foundry Local transcription error:', error);
      return NextResponse.json(
        {
          error:
            'Transcription failed: ' +
            (message || 'Foundry Local transcription failed.'),
        },
        { status: 500 }
      );
    }

    const normalizedAuthError = normalizeAzureCredentialError(error, {
      scope: getAzureTranscriptionScope(),
      surface: 'batch transcription',
    });

    if (normalizedAuthError !== message) {
      return NextResponse.json(
        { error: `Transcription failed: ${normalizedAuthError}` },
        { status: 500 }
      );
    }

    if (/deployment for this resource does not exist/i.test(message)) {
      return NextResponse.json(
        {
          error: `Transcription failed: Azure could not find deployment "${getAzureTranscriptionDeployment()}" on ${getAzureOpenAIEndpoint()}. Set AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT to the exact Azure deployment name for your speech-to-text model, or point AZURE_OPENAI_ENDPOINT at the Azure OpenAI resource that hosts that deployment.`,
        },
        { status: 500 }
      );
    }

    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed: ' + message },
      { status: 500 }
    );
  }
}
