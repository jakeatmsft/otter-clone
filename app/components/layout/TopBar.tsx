'use client';

import Link from 'next/link';
import ThemeToggle from '../theme/ThemeToggle';

export default function TopBar() {
  return (
    <header className="fixed left-60 right-0 top-0 z-10 flex h-16 items-center justify-between border-b border-slate-200 bg-white px-6 dark:border-slate-800 dark:bg-slate-900">
      {/* Search */}
      <div className="flex-1 max-w-2xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            className="w-full rounded-lg border border-slate-200 bg-slate-50 px-4 py-2 pl-10 text-sm text-slate-900 placeholder:text-slate-400 focus:border-transparent focus:outline-none focus:ring-2 focus:ring-blue-500 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
          />
          <svg
            className="absolute left-3 top-2.5 h-4 w-4 text-slate-400 dark:text-slate-500"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <kbd className="absolute right-3 top-2 rounded border border-slate-200 bg-white px-1.5 py-0.5 text-xs text-slate-400 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-500">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="ml-6 flex items-center gap-3">
        <ThemeToggle />
        <Link
          href="/upload"
          className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-200 dark:hover:bg-slate-800"
        >
          Import
        </Link>
        <Link
          href="/record"
          className="flex items-center gap-2 rounded-lg bg-blue-500 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-600"
        >
          <span className="h-2 w-2 rounded-full bg-red-500 animate-pulse"></span>
          Record
        </Link>
      </div>
    </header>
  );
}
