'use client';

import RightPanel from '../components/layout/RightPanel';

export default function AIChatPage() {
  return (
    <>
      <div className="pr-80">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-6xl mb-6">🤖</div>
            <h1 className="mb-4 text-3xl font-bold text-slate-900 dark:text-slate-100">AI Chat</h1>
            <p className="max-w-md text-slate-600 dark:text-slate-400">
              Chat with AI about your conversations, get insights, and ask questions about your transcripts.
            </p>
            <p className="mt-6 text-sm text-slate-500 dark:text-slate-400">Coming soon!</p>
          </div>
        </div>
      </div>
      <RightPanel defaultTab="Chat" />
    </>
  );
}
