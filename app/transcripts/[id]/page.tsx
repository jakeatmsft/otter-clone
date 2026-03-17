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

  // Split transcript into paragraphs for better display
  const paragraphs = data.transcript.split('\n').filter((p) => p.trim());

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-5xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <Link
            href="/dashboard"
            className="inline-flex items-center gap-2 text-indigo-600 hover:text-indigo-700 font-medium mb-6 group"
          >
            <svg
              className="w-5 h-5 group-hover:-translate-x-1 transition-transform"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path d="M15 19l-7-7 7-7" />
            </svg>
            Back to Dashboard
          </Link>

          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            <div>
              <h1 className="text-4xl font-bold text-gray-900 mb-2">
                Transcript
              </h1>
              <div className="flex items-center gap-4 text-gray-600">
                <span className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                  </svg>
                  {new Date(data.createdAt).toLocaleDateString('en-US', {
                    month: 'long',
                    day: 'numeric',
                    year: 'numeric',
                  })}
                </span>
                <span className="flex items-center gap-2">
                  <svg
                    className="w-5 h-5"
                    fill="none"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  {new Date(data.createdAt).toLocaleTimeString('en-US', {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            </div>
            <DownloadButton transcript={data.transcript} id={data.id} />
          </div>
        </div>

        {/* Audio Player Placeholder */}
        <div className="bg-gradient-to-r from-indigo-500 to-purple-500 rounded-2xl shadow-lg p-8 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button className="w-14 h-14 bg-white/20 hover:bg-white/30 backdrop-blur-sm rounded-full flex items-center justify-center transition-colors">
                <svg
                  className="w-6 h-6"
                  fill="currentColor"
                  viewBox="0 0 24 24"
                >
                  <path d="M8 5v14l11-7z" />
                </svg>
              </button>
              <div>
                <p className="text-sm text-indigo-100">Audio Player</p>
                <p className="font-medium">Ready to play</p>
              </div>
            </div>
            <div className="hidden md:block text-sm text-indigo-100">
              🎵 Audio playback coming soon
            </div>
          </div>
          <div className="mt-4 h-2 bg-white/20 rounded-full overflow-hidden">
            <div className="h-full bg-white/40 rounded-full" style={{ width: '0%' }} />
          </div>
        </div>

        {/* AI Summary Section */}
        <div className="bg-gradient-to-br from-indigo-50 to-purple-50 border-2 border-indigo-200 rounded-2xl shadow-lg p-8 mb-8">
          <div className="flex items-center gap-3 mb-4">
            <div className="w-10 h-10 bg-gradient-to-r from-indigo-600 to-purple-600 rounded-full flex items-center justify-center text-white text-xl">
              🤖
            </div>
            <h2 className="text-2xl font-bold text-gray-900">AI Summary</h2>
          </div>
          <div className="prose prose-lg max-w-none text-gray-800 leading-relaxed whitespace-pre-wrap">
            {data.summary}
          </div>
        </div>

        {/* Full Transcript Section */}
        <div className="bg-white border-2 border-gray-200 rounded-2xl shadow-lg p-8">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-gradient-to-r from-blue-500 to-cyan-500 rounded-full flex items-center justify-center text-white text-xl">
              📝
            </div>
            <h2 className="text-2xl font-bold text-gray-900">
              Full Transcript
            </h2>
          </div>

          <div className="space-y-6">
            {paragraphs.map((paragraph, index) => (
              <div
                key={index}
                className="flex gap-4 group hover:bg-gray-50 -mx-4 px-4 py-3 rounded-lg transition-colors"
              >
                {/* Timestamp placeholder */}
                <div className="flex-shrink-0 w-20">
                  <span className="inline-block bg-gray-200 text-gray-700 text-xs font-mono px-2 py-1 rounded">
                    {String(Math.floor(index * 30 / 60)).padStart(2, '0')}:
                    {String((index * 30) % 60).padStart(2, '0')}
                  </span>
                </div>

                {/* Text */}
                <p className="flex-1 text-gray-800 leading-relaxed">
                  {paragraph}
                </p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
