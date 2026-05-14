'use client';

import { KeyboardEvent, useEffect, useRef, useState } from 'react';

type ChatMessage = {
  content: string;
  role: 'assistant' | 'user';
};

interface RightPanelProps {
  tabs?: string[];
  defaultTab?: string;
  transcriptId?: string;
  transcriptTitle?: string;
}

export default function RightPanel({
  tabs = ['Chat', 'Comments'],
  defaultTab = 'Chat',
  transcriptId,
  transcriptTitle,
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([]);
  const [chatError, setChatError] = useState('');
  const [isCollapsed, setIsCollapsed] = useState(false);
  const [isSendingChat, setIsSendingChat] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const isTranscriptChatEnabled = Boolean(transcriptId);

  useEffect(() => {
    if (activeTab !== 'Chat') {
      return;
    }

    messagesEndRef.current?.scrollIntoView({
      behavior: 'smooth',
      block: 'end',
    });
  }, [activeTab, chatMessages, isSendingChat]);

  useEffect(() => {
    setChatInput('');
    setChatMessages([]);
    setChatError('');
    setIsSendingChat(false);
  }, [transcriptId]);

  const handleResetChat = () => {
    if (isSendingChat) {
      return;
    }

    setChatInput('');
    setChatMessages([]);
    setChatError('');
  };

  const handleSendChat = async () => {
    const question = chatInput.trim();

    if (!question || !transcriptId || isSendingChat) {
      return;
    }

    const nextUserMessage: ChatMessage = {
      content: question,
      role: 'user',
    };

    setChatMessages((current) => [...current, nextUserMessage]);
    setChatInput('');
    setChatError('');
    setIsSendingChat(true);

    try {
      const response = await fetch(`/api/transcripts/${transcriptId}/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          history: chatMessages,
          question,
        }),
      });
      const result = await response.json();

      if (!response.ok || !result.answer) {
        throw new Error(result.error || 'Failed to answer the question.');
      }

      setChatMessages((current) => [
        ...current,
        {
          content: String(result.answer).trim(),
          role: 'assistant',
        },
      ]);
    } catch (error) {
      setChatError(
        error instanceof Error ? error.message : 'Failed to answer the question.'
      );
    } finally {
      setIsSendingChat(false);
    }
  };

  const handleChatKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key !== 'Enter' || event.shiftKey) {
      return;
    }

    event.preventDefault();
    void handleSendChat();
  };

  if (isCollapsed) {
    return (
      <aside className="fixed bottom-0 right-0 top-16 flex w-12 items-start justify-center border-l border-slate-200 bg-white pt-4 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Expand panel"
        >
          <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed bottom-0 right-0 top-16 flex w-80 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                activeTab === tab
                  ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                  : 'text-slate-600 hover:bg-slate-50 dark:text-slate-400 dark:hover:bg-slate-800'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Collapse panel"
        >
          <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'Chat' && (
          <div className="flex h-full flex-col">
            <div className="flex items-center justify-between gap-3">
              <button
                onClick={handleResetChat}
                disabled={!isTranscriptChatEnabled || isSendingChat}
                className="rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-400 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
              >
                + New chat
              </button>
              <div className="text-right text-xs text-slate-500 dark:text-slate-400">
                {isTranscriptChatEnabled
                  ? 'Uses the full transcript on every question'
                  : 'Open a transcript to enable chat'}
              </div>
            </div>

            <div className="mt-4 flex-1 overflow-y-auto pr-1">
              {!isTranscriptChatEnabled ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                  Open a saved transcript to ask questions about it from this panel.
                </div>
              ) : chatMessages.length === 0 ? (
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-600 dark:border-slate-700 dark:bg-slate-800/70 dark:text-slate-400">
                  <div className="font-medium text-slate-900 dark:text-slate-100">
                    Ask about this transcript
                  </div>
                  <p className="mt-2 leading-relaxed">
                    Questions here are sent to the summarizer model together with the full
                    transcript{transcriptTitle ? ` for "${transcriptTitle}"` : ''}.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {chatMessages.map((message, index) => (
                    <div
                      key={`${message.role}-${index}`}
                      className={`flex ${
                        message.role === 'user' ? 'justify-end' : 'justify-start'
                      }`}
                    >
                      <div
                        className={`max-w-[90%] rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                          message.role === 'user'
                            ? 'bg-blue-500 text-white'
                            : 'bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-200'
                        }`}
                      >
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                          {message.role === 'user' ? 'You' : 'AI'}
                        </div>
                        <div className="whitespace-pre-wrap">{message.content}</div>
                      </div>
                    </div>
                  ))}

                  {isSendingChat && (
                    <div className="flex justify-start">
                      <div className="max-w-[90%] rounded-2xl bg-slate-100 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                        <div className="mb-1 text-[11px] font-semibold uppercase tracking-wide opacity-70">
                          AI
                        </div>
                        Thinking...
                      </div>
                    </div>
                  )}
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {chatError && (
              <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-500/40 dark:bg-red-500/10 dark:text-red-300">
                {chatError}
              </div>
            )}

            <div className="mt-4 border-t border-slate-200 pt-4 dark:border-slate-800">
              <textarea
                value={chatInput}
                onChange={(event) => setChatInput(event.target.value)}
                onKeyDown={handleChatKeyDown}
                disabled={!isTranscriptChatEnabled || isSendingChat}
                placeholder={
                  isTranscriptChatEnabled
                    ? 'Ask a question about this transcript'
                    : 'Open a transcript to chat about it'
                }
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:cursor-not-allowed disabled:bg-slate-100 disabled:text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:disabled:bg-slate-800 dark:disabled:text-slate-500"
                rows={4}
              />
              <div className="mt-3 flex items-center justify-between gap-3">
                <div className="text-xs text-slate-500 dark:text-slate-400">
                  Press Enter to send, Shift+Enter for a new line.
                </div>
                <button
                  onClick={() => {
                    void handleSendChat();
                  }}
                  disabled={!isTranscriptChatEnabled || isSendingChat || !chatInput.trim()}
                  className="rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600 disabled:cursor-not-allowed disabled:bg-blue-300 dark:disabled:bg-blue-500/40"
                >
                  {isSendingChat ? 'Sending...' : 'Ask'}
                </button>
              </div>
            </div>
          </div>
        )}

        {activeTab === 'Comments' && (
          <div className="py-8 text-center text-sm text-slate-500 dark:text-slate-400">
            No comments yet
          </div>
        )}

        {activeTab === 'Outline' && (
          <div className="text-sm text-slate-500 dark:text-slate-400">
            <div className="mb-2 font-semibold text-slate-900 dark:text-slate-100">Outline</div>
            <p className="text-xs">Summary outline will appear here</p>
          </div>
        )}
      </div>
    </aside>
  );
}
