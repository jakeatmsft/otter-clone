import fs from 'fs';
import { writeFile } from 'fs/promises';
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
  const data = {
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
  };

  const dataDir = join(process.cwd(), 'data', 'transcripts');
  if (!fs.existsSync(dataDir)) {
    fs.mkdirSync(dataDir, { recursive: true });
  }

  const filepath = join(dataDir, `${id}.json`);
  await writeFile(filepath, JSON.stringify(data, null, 2));

  return data;
}
