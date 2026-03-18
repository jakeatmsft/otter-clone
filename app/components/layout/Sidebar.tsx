'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <aside className="w-60 bg-white border-r border-gray-200 flex flex-col h-screen fixed left-0 top-0">
      {/* User Profile */}
      <div className="p-4 border-b border-gray-200">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-blue-500 flex items-center justify-center text-white font-semibold">
            Y
          </div>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900 truncate">
              Yuki
            </div>
            <div className="text-xs text-gray-500 truncate">
              yuki@example.com
            </div>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-2 space-y-1">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/')
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-lg">🏠</span>
            <span>Home</span>
          </Link>

          <Link
            href="/ai-chat"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/ai-chat')
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-lg">🤖</span>
            <span>AI Chat</span>
          </Link>

          <Link
            href="/integrations"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/integrations')
                ? 'bg-blue-50 text-blue-600'
                : 'text-gray-700 hover:bg-gray-50'
            }`}
          >
            <span className="text-lg">🔗</span>
            <span>Integrations</span>
          </Link>
        </div>

        {/* Channels */}
        <div className="mt-6 px-2">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Channels
          </div>
          <div className="space-y-1">
            <Link
              href="/channels/general"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-gray-700 hover:bg-gray-50 transition-colors"
            >
              <span className="text-gray-400">#</span>
              <span>General</span>
            </Link>
          </div>
        </div>

        {/* Direct Messages */}
        <div className="mt-6 px-2">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Direct Messages
          </div>
          <div className="space-y-1 text-sm text-gray-500 px-3 py-2">
            <span className="text-xs">No messages yet</span>
          </div>
        </div>

        {/* Folders */}
        <div className="mt-6 px-2">
          <div className="px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
            Folders
          </div>
          <div className="space-y-1 text-sm text-gray-500 px-3 py-2">
            <span className="text-xs">No folders yet</span>
          </div>
        </div>
      </nav>

      {/* Usage Display */}
      <div className="p-4 border-t border-gray-200">
        <div className="text-xs text-gray-600 mb-2">
          0 of 300 minutes used
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div className="bg-blue-500 h-2 rounded-full" style={{ width: '0%' }}></div>
        </div>
      </div>
    </aside>
  );
}
