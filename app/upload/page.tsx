'use client';

import { FormEvent, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import RightPanel from '../components/layout/RightPanel';

type TranscriptSegment = {
  start?: number;
  end?: number;
  text?: string;
};

function formatClockDuration(totalSeconds: number) {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

function formatHumanDuration(totalSeconds: number) {
  if (totalSeconds < 60) {
    return `${Math.max(1, totalSeconds)} sec`;
  }
  const mins = Math.floor(totalSeconds / 60);
  return `${mins} min`;
}

function defaultTitleFromFile(filename: string) {
  const dotIndex = filename.lastIndexOf('.');
  return (dotIndex > 0 ? filename.slice(0, dotIndex) : filename).replace(/[-_]+/g, ' ');
}

export default function UploadPage() {
  const router = useRouter();

  const [file, setFile] = useState<File | null>(null);
  const [title, setTitle] = useState('Untitled upload');
  const [isProcessing, setIsProcessing] = useState(false);
  const [statusMessage, setStatusMessage] = useState('Select an audio file to begin');
  const [errorMessage, setErrorMessage] = useState('');
  const [previewTranscript, setPreviewTranscript] = useState('');

  const fileDetails = useMemo(() => {
    if (!file) {
      return '';
    }
    const mb = (file.size / (1024 * 1024)).toFixed(2);
    return `${file.name} (${mb} MB)`;
  }, [file]);

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    if (!file) {
      setErrorMessage('Choose an audio file first.');
      return;
    }

    setIsProcessing(true);
    setErrorMessage('');
    setPreviewTranscript('');

    try {
      setStatusMessage('Uploading file...');
      const uploadForm = new FormData();
      uploadForm.append('file', file);

      const uploadResponse = await fetch('/api/upload', {
        method: 'POST',
        body: uploadForm,
      });
      const uploadData = await uploadResponse.json();

      if (!uploadResponse.ok || !uploadData.filename) {
        throw new Error(uploadData.error || 'Upload failed.');
      }

      setStatusMessage('Transcribing audio...');
      const transcribeResponse = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename: uploadData.filename }),
      });
      const transcribeData = await transcribeResponse.json();

      if (!transcribeResponse.ok) {
        throw new Error(transcribeData.error || 'Transcription failed.');
      }

      const transcript = String(transcribeData.transcript || '').trim();
      if (!transcript) {
        throw new Error('No transcription text was returned.');
      }

      setPreviewTranscript(transcript.slice(0, 500));

      const rawSegments = Array.isArray(transcribeData.segments)
        ? (transcribeData.segments as TranscriptSegment[])
        : [];

      const segments = rawSegments.map((segment) => ({
        speaker: 'Speaker 1',
        timestamp: formatClockDuration(Math.round(segment.start || 0)),
        text: segment.text || '',
      }));

      const derivedDurationSeconds = Math.round(
        rawSegments.reduce(
          (max, segment) => Math.max(max, segment.end || segment.start || 0),
          0
        )
      );
      const durationSeconds =
        typeof transcribeData.durationSeconds === 'number'
          ? Math.max(1, Math.round(transcribeData.durationSeconds))
          : derivedDurationSeconds > 0
            ? Math.max(1, derivedDurationSeconds)
            : null;

      setStatusMessage('Generating summary and saving transcript...');
      const summarizeResponse = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          audioFilename: uploadData.filename,
          title: title.trim() || defaultTitleFromFile(file.name),
          transcript,
          duration: durationSeconds ? formatHumanDuration(durationSeconds) : 'Unknown duration',
          speakers: [{ name: 'Speaker 1', percentage: 100 }],
          segments,
        }),
      });
      const summarizeData = await summarizeResponse.json();

      if (!summarizeResponse.ok || !summarizeData.id) {
        throw new Error(summarizeData.error || 'Failed to save transcript.');
      }

      setStatusMessage('Saved. Opening transcript...');
      router.push(`/transcripts/${summarizeData.id}`);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'An unexpected error occurred.';
      setErrorMessage(message);
      setStatusMessage('Upload failed');
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <>
      <div className="pr-80">
        <div className="border-b border-slate-200 bg-white px-8 py-4 dark:border-slate-800 dark:bg-slate-900">
          <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Import Audio</h1>
          <p className="mt-1 text-sm text-slate-600 dark:text-slate-400">
            Upload audio files and generate a transcript with summary.
          </p>
        </div>

        <div className="px-8 py-6">
          <form onSubmit={handleSubmit} className="max-w-3xl space-y-6">
            <div>
              <label htmlFor="title" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Conversation title
              </label>
              <input
                id="title"
                type="text"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Weekly team sync"
                className="w-full rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                disabled={isProcessing}
              />
            </div>

            <div>
              <label htmlFor="audioFile" className="mb-2 block text-sm font-medium text-slate-700 dark:text-slate-300">
                Audio file
              </label>
              <input
                id="audioFile"
                type="file"
                accept=".mp3,.wav,.m4a,.mp4,.webm,audio/*"
                className="block w-full text-sm text-slate-700 file:mr-4 file:rounded-lg file:border-0 file:bg-blue-50 file:px-4 file:py-2 file:font-medium file:text-blue-600 hover:file:bg-blue-100 dark:text-slate-300 dark:file:bg-blue-500/10 dark:file:text-blue-300 dark:hover:file:bg-blue-500/20"
                onChange={(event) => {
                  const selected = event.target.files?.[0] || null;
                  setFile(selected);
                  if (selected && title === 'Untitled upload') {
                    setTitle(defaultTitleFromFile(selected.name));
                  }
                  setErrorMessage('');
                }}
                disabled={isProcessing}
              />
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
                Supported formats: MP3, WAV, M4A, MP4, WEBM
              </p>
              {fileDetails && (
                <p className="mt-2 rounded-lg bg-slate-100 px-3 py-2 text-sm text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                  Selected: {fileDetails}
                </p>
              )}
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={isProcessing || !file}
                className="rounded-lg bg-blue-500 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300"
              >
                {isProcessing ? 'Processing...' : 'Transcribe File'}
              </button>
              <span className="text-sm text-slate-600 dark:text-slate-400">{statusMessage}</span>
            </div>

            {errorMessage && (
              <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {errorMessage}
              </p>
            )}
          </form>

          {previewTranscript && (
            <div className="mt-8 max-w-3xl rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-800 dark:bg-slate-900">
              <h2 className="mb-2 text-sm font-semibold text-slate-900 dark:text-slate-100">Transcript preview</h2>
              <p className="text-sm leading-relaxed text-slate-700 dark:text-slate-300">{previewTranscript}...</p>
            </div>
          )}
        </div>
      </div>
      <RightPanel />
    </>
  );
}
