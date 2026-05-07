import fs from 'fs';
import { readFile, writeFile } from 'fs/promises';
import { join } from 'path';
import { createDefaultTranscriptTitle } from '@/lib/transcript-title';

type TranscriptSpeaker = {
  name: string;
  percentage: number;
};

type TranscriptSegment = {
  speaker: string;
  timestamp: string;
  text: string;
};

type SaveTranscriptInput = {
  audioFilename?: string;
  duration?: string;
  segments?: unknown;
  speakers?: unknown;
  summary?: string;
  title?: string;
  transcript: string;
};

export type TranscriptRecord = Record<string, unknown> & {
  id: string;
  title: string;
  transcript: string;
  summary: string;
  duration: string;
  audioFilename?: string;
  speakers: TranscriptSpeaker[];
  segments: TranscriptSegment[];
  createdAt: string;
};

function getTranscriptDataDir() {
  return join(process.cwd(), 'data', 'transcripts');
}

function ensureTranscriptDataDir() {
  const dataDir = getTranscriptDataDir();
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  return dataDir;
}

function getTranscriptFilePath(id: string) {
  return join(getTranscriptDataDir(), `${id}.json`);
}

function normalizeTranscriptRecord(
  data: Record<string, unknown>,
  idFallback: string
): TranscriptRecord {
  return {
    ...data,
    id: typeof data.id === 'string' && data.id.trim() ? data.id : idFallback,
    title:
      typeof data.title === 'string' && data.title.trim()
        ? data.title
        : createDefaultTranscriptTitle(),
    transcript: typeof data.transcript === 'string' ? data.transcript : '',
    summary: typeof data.summary === 'string' ? data.summary : '',
    duration: typeof data.duration === 'string' && data.duration.trim() ? data.duration : '0 min',
    audioFilename: normalizeAudioFilename(data.audioFilename),
    speakers: Array.isArray(data.speakers) ? (data.speakers as TranscriptSpeaker[]) : [],
    segments: Array.isArray(data.segments) ? (data.segments as TranscriptSegment[]) : [],
    createdAt:
      typeof data.createdAt === 'string' && data.createdAt.trim()
        ? data.createdAt
        : new Date().toISOString(),
  };
}

export function normalizeAudioFilename(audioFilename: unknown) {
  if (typeof audioFilename !== 'string') {
    return undefined;
  }

  const normalized = audioFilename.trim();
  return normalized ? normalized : undefined;
}

export function buildUploadedAudioUrl(audioFilename: unknown) {
  const normalized = normalizeAudioFilename(audioFilename);
  return normalized ? `/uploads/${encodeURIComponent(normalized)}` : undefined;
}

export async function readTranscriptRecord(id: string) {
  const filePath = getTranscriptFilePath(id);

  if (!fs.existsSync(filePath)) {
    throw new Error(`Transcript ${id} not found.`);
  }

  const content = await readFile(filePath, 'utf-8');
  return normalizeTranscriptRecord(JSON.parse(content) as Record<string, unknown>, id);
}

export async function updateTranscriptRecord(
  id: string,
  updates: Partial<TranscriptRecord>
) {
  const existing = await readTranscriptRecord(id);
  const next = normalizeTranscriptRecord({ ...existing, ...updates }, id);
  await writeFile(getTranscriptFilePath(id), JSON.stringify(next, null, 2));
  return next;
}

export async function saveTranscriptRecord({
  audioFilename,
  duration,
  segments,
  speakers,
  summary,
  title,
  transcript,
}: SaveTranscriptInput) {
  const id = Date.now().toString();
  const data = normalizeTranscriptRecord(
    {
      id,
      title:
        typeof title === 'string' && title.trim()
          ? title.trim()
          : createDefaultTranscriptTitle(),
      transcript,
      summary: typeof summary === 'string' ? summary : '',
      duration: typeof duration === 'string' && duration.trim() ? duration : '0 min',
      audioFilename: normalizeAudioFilename(audioFilename),
      speakers: Array.isArray(speakers) ? (speakers as TranscriptSpeaker[]) : [],
      segments: Array.isArray(segments) ? (segments as TranscriptSegment[]) : [],
      createdAt: new Date().toISOString(),
    },
    id
  );

  const dataDir = ensureTranscriptDataDir();
  const filepath = join(dataDir, `${id}.json`);
  await writeFile(filepath, JSON.stringify(data, null, 2));

  return data;
}
