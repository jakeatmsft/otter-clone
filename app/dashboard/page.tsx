import { readdir, readFile } from 'fs/promises';
import { join } from 'path';
import Link from 'next/link';

interface TranscriptData {
  id: string;
  transcript: string;
  summary: string;
  createdAt: string;
}

async function getTranscripts(): Promise<TranscriptData[]> {
  try {
    const transcriptsDir = join(process.cwd(), 'data', 'transcripts');
    const files = await readdir(transcriptsDir);
    const jsonFiles = files.filter((file) => file.endsWith('.json'));

    const transcripts = await Promise.all(
      jsonFiles.map(async (file) => {
        const filepath = join(transcriptsDir, file);
        const data = await readFile(filepath, 'utf-8');
        return JSON.parse(data) as TranscriptData;
      })
    );

    // Sort by creation date (newest first)
    return transcripts.sort(
      (a, b) =>
        new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  } catch (error) {
    console.error('Error reading transcripts:', error);
    return [];
  }
}

export default async function DashboardPage() {
  const transcripts = await getTranscripts();

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Your Transcripts
          </h1>
          <p className="text-xl text-gray-600">
            View and manage all your transcribed audio files
          </p>
        </div>

        {/* Transcripts List */}
        {transcripts.length === 0 ? (
          // Empty State
          <div className="bg-white rounded-2xl shadow-lg p-12 text-center border-2 border-gray-200">
            <div className="text-8xl mb-6">📝</div>
            <h2 className="text-3xl font-bold text-gray-900 mb-4">
              No transcripts yet
            </h2>
            <p className="text-xl text-gray-600 mb-8 max-w-md mx-auto">
              Upload your first audio file to get started with AI-powered transcription
            </p>
            <Link
              href="/upload"
              className="inline-block bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-8 py-4 rounded-full font-bold text-lg hover:shadow-xl hover:scale-105 transition-all"
            >
              Upload Your First File
            </Link>
          </div>
        ) : (
          // Transcripts Grid
          <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
            {transcripts.map((transcript) => (
              <Link
                key={transcript.id}
                href={`/transcripts/${transcript.id}`}
                className="bg-white rounded-2xl shadow-lg border-2 border-gray-200 hover:border-indigo-400 hover:shadow-xl transition-all group"
              >
                <div className="p-6">
                  {/* Date Badge */}
                  <div className="flex items-center justify-between mb-4">
                    <span className="inline-block bg-indigo-100 text-indigo-700 text-sm font-medium px-3 py-1 rounded-full">
                      {new Date(transcript.createdAt).toLocaleDateString(
                        'en-US',
                        {
                          month: 'short',
                          day: 'numeric',
                          year: 'numeric',
                        }
                      )}
                    </span>
                    <span className="text-2xl group-hover:scale-110 transition-transform">
                      📄
                    </span>
                  </div>

                  {/* Title */}
                  <h3 className="text-xl font-bold text-gray-900 mb-3 group-hover:text-indigo-600 transition-colors">
                    Transcript #{transcript.id.slice(0, 8)}
                  </h3>

                  {/* Time */}
                  <p className="text-sm text-gray-500 mb-4">
                    {new Date(transcript.createdAt).toLocaleTimeString('en-US', {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>

                  {/* Summary Preview */}
                  <div className="bg-gray-50 rounded-lg p-4 mb-4">
                    <p className="text-sm text-gray-700 line-clamp-3">
                      {transcript.summary}
                    </p>
                  </div>

                  {/* Transcript Preview */}
                  <div className="border-t border-gray-200 pt-4">
                    <p className="text-sm text-gray-600 line-clamp-2">
                      {transcript.transcript}
                    </p>
                  </div>

                  {/* View Button */}
                  <div className="mt-4 flex items-center text-indigo-600 font-medium group-hover:text-indigo-700">
                    <span>View Details</span>
                    <svg
                      className="w-5 h-5 ml-2 group-hover:translate-x-1 transition-transform"
                      fill="none"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                    >
                      <path d="M9 5l7 7-7 7" />
                    </svg>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
