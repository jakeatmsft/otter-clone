'use client';

import Link from 'next/link';
import { useState } from 'react';

export default function Navbar() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  return (
    <nav className="bg-white shadow-sm border-b border-gray-200">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <span className="text-2xl">🦦</span>
            <span className="text-xl font-bold bg-gradient-to-r from-indigo-600 to-purple-600 bg-clip-text text-transparent">
              Otter Clone
            </span>
          </Link>

          {/* Desktop Navigation */}
          <div className="hidden md:flex items-center gap-8">
            <Link
              href="/"
              className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="text-gray-700 hover:text-indigo-600 font-medium transition-colors"
            >
              Dashboard
            </Link>
            <Link
              href="/upload"
              className="bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-full font-medium hover:shadow-lg transition-all"
            >
              Upload
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
          >
            <svg
              className="w-6 h-6 text-gray-700"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth="2"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              {mobileMenuOpen ? (
                <path d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path d="M4 6h16M4 12h16M4 18h16" />
              )}
            </svg>
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden py-4 space-y-3">
            <Link
              href="/"
              className="block text-gray-700 hover:text-indigo-600 font-medium py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Home
            </Link>
            <Link
              href="/dashboard"
              className="block text-gray-700 hover:text-indigo-600 font-medium py-2"
              onClick={() => setMobileMenuOpen(false)}
            >
              Dashboard
            </Link>
            <Link
              href="/upload"
              className="block bg-gradient-to-r from-indigo-600 to-purple-600 text-white px-6 py-2 rounded-full font-medium text-center"
              onClick={() => setMobileMenuOpen(false)}
            >
              Upload
            </Link>
          </div>
        )}
      </div>
    </nav>
  );
}
