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
      <aside className="w-12 bg-white border-l border-gray-200 fixed right-0 top-16 bottom-0 flex items-start justify-center pt-4">
        <button
          onClick={() => setIsCollapsed(false)}
          className="p-2 text-gray-400 hover:text-gray-600 transition-colors"
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
    <aside className="w-80 bg-white border-l border-gray-200 fixed right-0 top-16 bottom-0 flex flex-col">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-gray-200">
        <div className="flex gap-2">
          {tabs.map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1.5 text-sm font-medium rounded-lg transition-colors ${
                activeTab === tab
                  ? 'bg-blue-50 text-blue-600'
                  : 'text-gray-600 hover:bg-gray-50'
              }`}
            >
              {tab}
            </button>
          ))}
        </div>
        <button
          onClick={() => setIsCollapsed(true)}
          className="p-1 text-gray-400 hover:text-gray-600 transition-colors"
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
            <button className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
              + New chat
            </button>
            <div className="relative">
              <textarea
                placeholder="Ask anything about your conversations"
                className="w-full px-4 py-3 border border-gray-200 rounded-lg text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                rows={4}
              />
            </div>
            <button className="text-sm text-blue-600 hover:text-blue-700 font-medium">
              Advanced →
            </button>
          </div>
        )}

        {activeTab === 'Comments' && (
          <div className="text-center text-sm text-gray-500 py-8">
            No comments yet
          </div>
        )}

        {activeTab === 'Outline' && (
          <div className="text-sm text-gray-500">
            <div className="font-semibold text-gray-900 mb-2">Outline</div>
            <p className="text-xs">Summary outline will appear here</p>
          </div>
        )}
      </div>
    </aside>
  );
}
