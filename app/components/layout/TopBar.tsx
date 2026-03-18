'use client';

import Link from 'next/link';

export default function TopBar() {
  return (
    <header className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-6 fixed top-0 left-60 right-0 z-10">
      {/* Search */}
      <div className="flex-1 max-w-2xl">
        <div className="relative">
          <input
            type="text"
            placeholder="Search..."
            className="w-full px-4 py-2 pl-10 bg-gray-50 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
          <svg
            className="absolute left-3 top-2.5 w-4 h-4 text-gray-400"
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
          <kbd className="absolute right-3 top-2 text-xs text-gray-400 bg-white border border-gray-200 rounded px-1.5 py-0.5">
            Ctrl+K
          </kbd>
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex items-center gap-3 ml-6">
        <Link
          href="/upload"
          className="px-4 py-2 text-sm font-medium text-gray-700 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
        >
          Import
        </Link>
        <Link
          href="/record"
          className="px-4 py-2 text-sm font-medium text-white bg-blue-500 rounded-lg hover:bg-blue-600 transition-colors flex items-center gap-2"
        >
          <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></span>
          Record
        </Link>
      </div>
    </header>
  );
}
