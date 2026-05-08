'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function Sidebar() {
  const pathname = usePathname();

  const isActive = (path: string) => pathname === path;

  return (
    <aside className="fixed left-0 top-0 flex h-screen w-60 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4">
        <div className="px-2 space-y-1">
          <Link
            href="/"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/')
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-lg">🏠</span>
            <span>Home</span>
          </Link>

          <Link
            href="/ai-chat"
            className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
              isActive('/ai-chat')
                ? 'bg-blue-50 text-blue-600 dark:bg-blue-500/10 dark:text-blue-300'
                : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800'
            }`}
          >
            <span className="text-lg">🤖</span>
            <span>AI Chat</span>
          </Link>
        </div>

        {/* Direct Messages */}
        <div className="mt-6 px-2">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Direct Messages
          </div>
          <div className="space-y-1 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="text-xs">No messages yet</span>
          </div>
        </div>

        {/* Folders */}
        <div className="mt-6 px-2">
          <div className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-500 dark:text-slate-400">
            Folders
          </div>
          <div className="space-y-1 px-3 py-2 text-sm text-slate-500 dark:text-slate-400">
            <span className="text-xs">No folders yet</span>
          </div>
        </div>
      </nav>

      {/* Usage Display */}
      <div className="border-t border-slate-200 p-4 dark:border-slate-800">
        <div className="mb-2 text-xs text-slate-600 dark:text-slate-400">
          0 of 300 minutes used
        </div>
        <div className="h-2 w-full rounded-full bg-slate-200 dark:bg-slate-800">
          <div className="h-2 rounded-full bg-blue-500" style={{ width: '0%' }}></div>
        </div>
      </div>
    </aside>
  );
}
