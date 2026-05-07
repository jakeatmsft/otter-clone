'use client';

import { useState, useEffect } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import RightPanel from '@/app/components/layout/RightPanel';

interface TranscriptData {
  id: string;
  title: string;
  transcript: string;
  audioUrl?: string;
  summary?: string;
  actionItems?: string[];
  outline?: { topic: string; points: string[] }[];
  keywords?: string[];
  speakers?: { name: string; percentage: number }[];
  segments?: { speaker: string; timestamp: string; text: string }[];
  duration?: string;
  createdAt: string;
}

export default function TranscriptDetail() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<TranscriptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'summary' | 'transcript'>('summary');

  useEffect(() => {
    // Fetch transcript data
    fetch(`/api/transcripts/${id}`)
      .then(res => res.json())
      .then(data => {
        setData(data);
        setActiveTab(
          typeof data.summary === 'string' && data.summary.trim() ? 'summary' : 'transcript'
        );
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, [id]);

  if (loading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="text-2xl font-bold text-gray-900 mb-4">Transcript not found</h1>
        <Link href="/" className="text-blue-600 hover:text-blue-700">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="pr-80 pb-24">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="max-w-5xl">
            <h1 className="text-3xl font-bold text-gray-900 mb-3 focus:outline-none" contentEditable suppressContentEditableWarning>
              {data.title}
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-600 mb-4">
              <span className="flex items-center gap-1">
                <span>👤</span>
                {data.speakers?.[0]?.name || 'Unknown'}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span>📅</span>
                {new Date(data.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span>·</span>
              <span className="flex items-center gap-1">
                <span>⏱️</span>
                {data.duration || '0 min'}
              </span>
              <span>·</span>
              <button className="flex items-center gap-1 text-blue-600 hover:text-blue-700">
                <span>📋</span>
                copy summary
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button className="px-4 py-2 bg-blue-50 text-blue-600 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors">
                Share
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <svg className="w-5 h-5 text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white border-b border-gray-200 px-8">
          <div className="flex items-center justify-between max-w-5xl">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('summary')}
                className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('transcript')}
                className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-gray-600 hover:text-gray-900'
                }`}
              >
                Transcript
              </button>
            </div>
            <select className="px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500">
              <option>Template: General</option>
              <option>Template: Meeting</option>
              <option>Template: Interview</option>
            </select>
          </div>
        </div>

        {/* Content */}
        <div className="px-8 py-6">
          <div className="max-w-5xl">
            {activeTab === 'summary' ? (
              <SummaryTab data={data} />
            ) : (
              <TranscriptTab data={data} />
            )}
          </div>
        </div>
      </div>

      {/* Audio Player */}
      <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-8 py-4 z-20">
        <div className="max-w-5xl mx-auto">
          {data.audioUrl ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Playback
              </div>
              <audio
                key={data.audioUrl}
                controls
                preload="metadata"
                className="w-full"
                src={data.audioUrl}
              >
                Your browser does not support audio playback.
              </audio>
            </div>
          ) : (
            <div className="rounded-lg border border-dashed border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600">
              No saved audio is attached to this transcript.
            </div>
          )}
        </div>
      </div>

      <RightPanel tabs={['Chat', 'Outline', 'Comments']} defaultTab="Chat" />
    </>
  );
}

function SummaryTab({ data }: { data: TranscriptData }) {
  return (
    <div className="space-y-8">
      {/* Overview */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
          <span className="text-xl">≡</span>
          Overview
        </h2>
        <div className="bg-gray-50 rounded-lg p-6 text-gray-700 leading-relaxed">
          {data.summary || data.transcript || 'No summary available'}
        </div>
      </section>

      {/* Action Items */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
          <span className="text-xl">☑</span>
          Action Items
        </h2>
        <div className="space-y-3">
          {data.actionItems && data.actionItems.length > 0 ? (
            data.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <input
                  type="checkbox"
                  className="mt-1 w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <span className="flex-1 text-gray-700">{item}</span>
                <button className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-100 rounded transition-all">
                  <svg className="w-4 h-4 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No action items</p>
          )}
          <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
            + Add action item
          </button>
        </div>
      </section>

      {/* Outline */}
      <section>
        <h2 className="flex items-center gap-2 text-lg font-semibold text-gray-900 mb-4">
          <span className="text-xl">≡</span>
          Outline
        </h2>
        <div className="space-y-4">
          {data.outline && data.outline.length > 0 ? (
            data.outline.map((section, i) => (
              <div key={i}>
                <h3 className="font-semibold text-gray-900 mb-2">{section.topic}</h3>
                <ul className="space-y-1.5 ml-4">
                  {section.points.map((point, j) => (
                    <li key={j} className="text-gray-700 flex items-start gap-2">
                      <span className="text-gray-400 mt-1.5">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-gray-500 text-sm">No outline available</p>
          )}
        </div>
      </section>
    </div>
  );
}

function TranscriptTab({ data }: { data: TranscriptData }) {
  const speakerColors = ['bg-blue-500', 'bg-orange-500', 'bg-green-500', 'bg-purple-500'];
  
  return (
    <div className="space-y-6">
      {/* Keywords */}
      {data.keywords && data.keywords.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold text-gray-700 mb-2">Keywords</h3>
          <p className="text-gray-600">{data.keywords.join(', ')}</p>
        </div>
      )}

      {/* Speakers */}
      {data.speakers && data.speakers.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">Speakers</h3>
            <p className="text-gray-600">
              {data.speakers.map((s, i) => (
                <span key={i}>
                  {s.name} ({s.percentage}%)
                  {i < data.speakers!.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </div>
          <button className="px-4 py-2 text-sm text-blue-600 hover:text-blue-700 font-medium flex items-center gap-2">
            <span>✏️</span>
            Edit Transcript
          </button>
        </div>
      )}

      {/* Transcript Segments */}
      <div className="space-y-4 border-t border-gray-200 pt-6">
        {data.segments && data.segments.length > 0 ? (
          data.segments.map((segment, i) => {
            const speakerIndex = parseInt(segment.speaker.replace(/\D/g, '')) - 1 || 0;
            const colorClass = speakerColors[speakerIndex % speakerColors.length];
            
            return (
              <div key={i} className="flex gap-4 group">
                <div className={`w-10 h-10 rounded-full ${colorClass} flex items-center justify-center text-white font-semibold flex-shrink-0`}>
                  S
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium text-gray-900">{segment.speaker}</span>
                    <span className="text-sm text-gray-500">{segment.timestamp}</span>
                  </div>
                  <p className="text-gray-700 leading-relaxed">{segment.text}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="text-gray-600 whitespace-pre-wrap">{data.transcript}</div>
        )}
      </div>
    </div>
  );
}
