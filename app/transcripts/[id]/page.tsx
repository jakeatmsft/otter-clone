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
  const [isGeneratingSummary, setIsGeneratingSummary] = useState(false);
  const [summaryError, setSummaryError] = useState('');

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

  const handleGenerateSummary = async () => {
    if (!data || isGeneratingSummary) {
      return;
    }

    setIsGeneratingSummary(true);
    setSummaryError('');

    try {
      const response = await fetch(`/api/transcripts/${id}/summary`, {
        method: 'POST',
      });
      const result = await response.json();

      if (!response.ok || !result.summary) {
        throw new Error(result.error || 'Failed to generate summary.');
      }

      setData((current) =>
        current
          ? {
              ...current,
              summary: String(result.summary).trim(),
            }
          : current
      );
      setActiveTab('summary');
    } catch (error) {
      setSummaryError(
        error instanceof Error ? error.message : 'Failed to generate summary.'
      );
    } finally {
      setIsGeneratingSummary(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center text-slate-600 dark:text-slate-400">
        Loading...
      </div>
    );
  }

  if (!data) {
    return (
      <div className="flex flex-col items-center justify-center h-screen">
        <h1 className="mb-4 text-2xl font-bold text-slate-900 dark:text-slate-100">Transcript not found</h1>
        <Link href="/" className="text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
          ← Back to home
        </Link>
      </div>
    );
  }

  return (
    <>
      <div className="pr-80 pb-24">
        {/* Header */}
        <div className="border-b border-slate-200 bg-white px-8 py-6 dark:border-slate-800 dark:bg-slate-900">
          <div className="max-w-5xl">
            <h1 className="mb-3 text-3xl font-bold text-slate-900 focus:outline-none dark:text-slate-100" contentEditable suppressContentEditableWarning>
              {data.title}
            </h1>
            <div className="mb-4 flex items-center gap-3 text-sm text-slate-600 dark:text-slate-400">
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
              <button className="flex items-center gap-1 text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
                <span>📋</span>
                copy summary
              </button>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleGenerateSummary}
                disabled={isGeneratingSummary}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors disabled:bg-blue-300"
              >
                {isGeneratingSummary
                  ? 'Summarizing...'
                  : data.summary?.trim()
                    ? 'Regenerate with Azure OpenAI'
                    : 'Summarize with Azure OpenAI'}
              </button>
              <button className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
                Share
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
                </svg>
              </button>
              <button className="rounded-lg p-2 transition-colors hover:bg-slate-100 dark:hover:bg-slate-800">
                <svg className="w-5 h-5 text-slate-600 dark:text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                </svg>
              </button>
            </div>
            {summaryError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {summaryError}
              </div>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="border-b border-slate-200 bg-white px-8 dark:border-slate-800 dark:bg-slate-900">
          <div className="flex items-center justify-between max-w-5xl">
            <div className="flex gap-6">
              <button
                onClick={() => setActiveTab('summary')}
                className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'summary'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Summary
              </button>
              <button
                onClick={() => setActiveTab('transcript')}
                className={`py-4 px-1 text-sm font-medium border-b-2 transition-colors ${
                  activeTab === 'transcript'
                    ? 'border-blue-500 text-blue-600'
                    : 'border-transparent text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-slate-100'
                }`}
              >
                Transcript
              </button>
            </div>
            <select className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-700 focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200">
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
      <div className="fixed bottom-0 left-60 right-0 z-20 border-t border-slate-200 bg-white px-8 py-4 dark:border-slate-800 dark:bg-slate-900">
        <div className="max-w-5xl mx-auto">
          {data.audioUrl ? (
            <div>
              <div className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
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
            <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
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
  const hasSummary = typeof data.summary === 'string' && data.summary.trim();

  return (
    <div className="space-y-8">
      {/* Overview */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <span className="text-xl">≡</span>
          Overview
        </h2>
        <div className="whitespace-pre-wrap rounded-lg bg-slate-100 p-6 leading-relaxed text-slate-700 dark:bg-slate-900 dark:text-slate-300">
          {hasSummary
            ? data.summary
            : 'No summary available yet. Generate one to get a concise bullet-point recap.'}
        </div>
      </section>

      {/* Action Items */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <span className="text-xl">☑</span>
          Action Items
        </h2>
        <div className="space-y-3">
          {data.actionItems && data.actionItems.length > 0 ? (
            data.actionItems.map((item, i) => (
              <div key={i} className="flex items-start gap-3 group">
                <input
                  type="checkbox"
                  className="mt-1 h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 dark:border-slate-600 dark:bg-slate-900"
                />
                <span className="flex-1 text-slate-700 dark:text-slate-300">{item}</span>
                <button className="rounded p-1 opacity-0 transition-all group-hover:opacity-100 hover:bg-slate-100 dark:hover:bg-slate-800">
                  <svg className="w-4 h-4 text-slate-400 dark:text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 5v.01M12 12v.01M12 19v.01M12 6a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2zm0 7a1 1 0 110-2 1 1 0 010 2z" />
                  </svg>
                </button>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No action items</p>
          )}
          <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
            + Add action item
          </button>
        </div>
      </section>

      {/* Outline */}
      <section>
        <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-slate-900 dark:text-slate-100">
          <span className="text-xl">≡</span>
          Outline
        </h2>
        <div className="space-y-4">
          {data.outline && data.outline.length > 0 ? (
            data.outline.map((section, i) => (
              <div key={i}>
                <h3 className="mb-2 font-semibold text-slate-900 dark:text-slate-100">{section.topic}</h3>
                <ul className="space-y-1.5 ml-4">
                  {section.points.map((point, j) => (
                    <li key={j} className="flex items-start gap-2 text-slate-700 dark:text-slate-300">
                      <span className="mt-1.5 text-slate-400 dark:text-slate-500">•</span>
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          ) : (
            <p className="text-sm text-slate-500 dark:text-slate-400">No outline available</p>
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
          <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Keywords</h3>
          <p className="text-slate-600 dark:text-slate-400">{data.keywords.join(', ')}</p>
        </div>
      )}

      {/* Speakers */}
      {data.speakers && data.speakers.length > 0 && (
        <div className="flex items-center justify-between">
          <div>
            <h3 className="mb-2 text-sm font-semibold text-slate-700 dark:text-slate-300">Speakers</h3>
            <p className="text-slate-600 dark:text-slate-400">
              {data.speakers.map((s, i) => (
                <span key={i}>
                  {s.name} ({s.percentage}%)
                  {i < data.speakers!.length - 1 ? ', ' : ''}
                </span>
              ))}
            </p>
          </div>
          <button className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
            <span>✏️</span>
            Edit Transcript
          </button>
        </div>
      )}

      {/* Transcript Segments */}
      <div className="space-y-4 border-t border-slate-200 pt-6 dark:border-slate-800">
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
                    <span className="font-medium text-slate-900 dark:text-slate-100">{segment.speaker}</span>
                    <span className="text-sm text-slate-500 dark:text-slate-400">{segment.timestamp}</span>
                  </div>
                  <p className="leading-relaxed text-slate-700 dark:text-slate-300">{segment.text}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="whitespace-pre-wrap text-slate-600 dark:text-slate-400">{data.transcript}</div>
        )}
      </div>
    </div>
  );
}
