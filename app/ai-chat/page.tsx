'use client';

import RightPanel from '../components/layout/RightPanel';

export default function AIChatPage() {
  return (
    <>
      <div className="pr-80">
        <div className="flex items-center justify-center h-screen">
          <div className="text-center">
            <div className="text-6xl mb-6">🤖</div>
            <h1 className="text-3xl font-bold text-gray-900 mb-4">AI Chat</h1>
            <p className="text-gray-600 max-w-md">
              Chat with AI about your conversations, get insights, and ask questions about your transcripts.
            </p>
            <p className="text-sm text-gray-500 mt-6">Coming soon!</p>
          </div>
        </div>
      </div>
      <RightPanel defaultTab="Chat" />
    </>
  );
}
