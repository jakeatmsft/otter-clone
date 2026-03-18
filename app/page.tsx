'use client';

import Link from 'next/link';
import { useState, useEffect } from 'react';
import RightPanel from './components/layout/RightPanel';

interface Transcript {
  id: string;
  title: string;
  summary: string;
  createdAt: string;
  duration: string;
  speakers: { name: string; percentage: number }[];
  participants?: number;
  comments?: number;
  highlights?: number;
}

export default function Home() {
  const [transcripts, setTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch transcripts
    fetch('/api/transcripts')
      .then(res => res.json())
      .then(data => {
        setTranscripts(data.transcripts || []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  // Group by date
  const groupedTranscripts = transcripts.reduce((acc, transcript) => {
    const date = new Date(transcript.createdAt);
    const dateKey = date.toLocaleDateString('en-US', { 
      weekday: 'long', 
      month: 'short', 
      day: 'numeric' 
    });
    
    if (!acc[dateKey]) {
      acc[dateKey] = [];
    }
    acc[dateKey].push(transcript);
    return acc;
  }, {} as Record<string, Transcript[]>);

  return (
    <>
      <div className="pr-80">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-4">
          <div className="flex items-center justify-between">
            <h1 className="text-2xl font-bold text-gray-900">Conversations</h1>
            <div className="flex items-center gap-2">
              <select className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
                <option>For you</option>
                <option>All conversations</option>
                <option>Shared with me</option>
              </select>
            </div>
          </div>
        </div>

        {/* Conversations List */}
        <div className="px-8 py-6">
          {loading ? (
            <div className="text-center py-12 text-gray-500">Loading conversations...</div>
          ) : Object.keys(groupedTranscripts).length === 0 ? (
            <div className="text-center py-12">
              <div className="text-6xl mb-4">📝</div>
              <h2 className="text-xl font-semibold text-gray-900 mb-2">No conversations yet</h2>
              <p className="text-gray-600 mb-6">Start by recording or importing an audio file</p>
              <Link
                href="/record"
                className="inline-block px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                Start Recording
              </Link>
            </div>
          ) : (
            <div className="space-y-8">
              {Object.entries(groupedTranscripts).map(([date, items]) => (
                <div key={date}>
                  <h2 className="text-sm font-semibold text-gray-500 mb-3">{date}</h2>
                  <div className="space-y-4">
                    {items.map((transcript) => (
                      <ConversationCard key={transcript.id} transcript={transcript} />
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <RightPanel />
    </>
  );
}

function ConversationCard({ transcript }: { transcript: Transcript }) {
  const [showFullSummary, setShowFullSummary] = useState(false);
  const summaryPreview = transcript.summary?.slice(0, 200) || 'No summary available';
  const hasMore = transcript.summary && transcript.summary.length > 200;

  return (
    <Link href={`/transcripts/${transcript.id}`}>
      <div className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow cursor-pointer">
        {/* Header */}
        <div className="flex items-start gap-4 mb-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold flex-shrink-0">
            {transcript.speakers?.[0]?.name?.[0] || 'U'}
          </div>
          <div className="flex-1 min-w-0">
            <h3 className="text-lg font-bold text-gray-900 mb-1">{transcript.title}</h3>
            <div className="flex items-center gap-2 text-sm text-gray-500 flex-wrap">
              <span>{new Date(transcript.createdAt).toLocaleTimeString('en-US', { 
                hour: '2-digit', 
                minute: '2-digit' 
              })}</span>
              <span>·</span>
              <span>{transcript.duration}</span>
              {transcript.speakers?.length > 0 && (
                <>
                  <span>·</span>
                  <span>{transcript.speakers[0].name}</span>
                </>
              )}
              <span>·</span>
              <span># General</span>
            </div>
          </div>
        </div>

        {/* Summary Preview */}
        <div className="text-sm text-gray-700 mb-3">
          <p className="line-clamp-3">
            {showFullSummary ? transcript.summary : summaryPreview}
            {hasMore && !showFullSummary && '...'}
          </p>
          {hasMore && (
            <button
              onClick={(e) => {
                e.preventDefault();
                setShowFullSummary(!showFullSummary);
              }}
              className="text-blue-600 hover:text-blue-700 font-medium mt-1"
            >
              {showFullSummary ? 'Show less' : 'Show more'}
            </button>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center gap-4 text-sm text-gray-500">
          <div className="flex items-center gap-1">
            <div className="flex -space-x-2">
              {transcript.speakers?.slice(0, 3).map((speaker, i) => (
                <div
                  key={i}
                  className="w-6 h-6 rounded-full bg-blue-500 border-2 border-white flex items-center justify-center text-white text-xs font-semibold"
                >
                  {speaker.name[0]}
                </div>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 8h10M7 12h4m1 8l-4-4H5a2 2 0 01-2-2V6a2 2 0 012-2h14a2 2 0 012 2v8a2 2 0 01-2 2h-3l-4 4z" />
            </svg>
            <span>{transcript.comments || 0}</span>
          </div>
          <div className="flex items-center gap-1">
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" />
            </svg>
            <span>{transcript.highlights || 0}</span>
          </div>
        </div>
      </div>
    </Link>
  );
}
