'use client';

import { useState } from 'react';

interface RightPanelProps {
  tabs?: string[];
  defaultTab?: string;
}

export default function RightPanel({ 
  tabs = ['Chat', 'Comments'], 
  defaultTab = 'Chat' 
}: RightPanelProps) {
  const [activeTab, setActiveTab] = useState(defaultTab);
  const [isCollapsed, setIsCollapsed] = useState(false);

  if (isCollapsed) {
    return (
      <aside className="fixed bottom-0 right-0 top-16 flex w-12 items-start justify-center border-l border-slate-200 bg-white pt-4 dark:border-slate-800 dark:bg-slate-900">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 text-slate-400 transition-colors hover:text-slate-600 dark:text-slate-500 dark:hover:text-slate-300"
          aria-label="Expand panel"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
          </svg>
        </button>
      </aside>
    );
  }

  return (
    <aside className="fixed bottom-0 right-0 top-16 flex w-80 flex-col border-l border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Header */}
      <div className="flex items-center justify-between border-b border-slate-200 p-4 dark:border-slate-800">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
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
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {activeTab === 'Chat' && (
          <div className="space-y-4">
            <button className="w-full rounded-lg bg-blue-50 px-4 py-2 text-sm font-medium text-blue-600 transition-colors hover:bg-blue-100 dark:bg-blue-500/10 dark:text-blue-300 dark:hover:bg-blue-500/20">
              + New chat
            </button>
            <div className="relative">
              <textarea
                placeholder="Ask anything about your conversations"
                className="w-full resize-none rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500"
                rows={4}
              />
            </div>
            <button className="text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-300 dark:hover:text-blue-200">
              Advanced →
            </button>
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
