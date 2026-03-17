import { readFile } from 'fs/promises';
import { join } from 'path';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import DownloadButton from './download-button';

interface TranscriptData {
  id: string;
  transcript: string;
  summary: string;
  createdAt: string;
}

async function getTranscript(id: string): Promise<TranscriptData | null> {
  try {
    const filepath = join(process.cwd(), 'data', 'transcripts', `${id}.json`);
    const data = await readFile(filepath, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

export default async function TranscriptPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const resolvedParams = await params;
  const data = await getTranscript(resolvedParams.id);

  if (!data) {
    notFound();
  }

  return (
    <main className="min-h-screen bg-gray-50 py-8 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <Link 
            href="/"
            className="text-blue-600 hover:text-blue-700 flex items-center gap-2 mb-4"
          >
            ← Back to upload
          </Link>
          <h1 className="text-3xl font-bold text-gray-900">Transcript</h1>
          <p className="text-gray-600 text-sm mt-1">
            Created {new Date(data.createdAt).toLocaleString()}
          </p>
        </div>

        {/* Summary Section */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <h2 className="text-xl font-semibold text-gray-900 mb-3">
            📝 AI Summary
          </h2>
          <div className="prose prose-sm max-w-none text-gray-800 whitespace-pre-wrap">
            {data.summary}
          </div>
        </div>

        {/* Transcript Section */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-xl font-semibold text-gray-900">
              Full Transcript
            </h2>
            <DownloadButton 
              transcript={data.transcript}
              id={data.id}
            />
          </div>
          <div className="prose max-w-none text-gray-800 whitespace-pre-wrap">
            {data.transcript}
          </div>
        </div>
      </div>
    </main>
  );
}
