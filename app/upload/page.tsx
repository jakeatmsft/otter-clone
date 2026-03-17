'use client';

import { useState, useRef, DragEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState('');
  const [dragActive, setDragActive] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const router = useRouter();

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setFile(e.target.files[0]);
    }
  };

  const handleDrag = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setDragActive(true);
    } else if (e.type === 'dragleave') {
      setDragActive(false);
    }
  };

  const handleDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      setFile(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async () => {
    if (!file) return;

    setUploading(true);
    setProgress('Uploading file...');

    try {
      // Step 1: Upload file
      const formData = new FormData();
      formData.append('file', file);

      const uploadRes = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      if (!uploadRes.ok) throw new Error('Upload failed');
      const { filename } = await uploadRes.json();

      // Step 2: Transcribe
      setProgress('Transcribing audio...');
      const transcribeRes = await fetch('/api/transcribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ filename }),
      });

      if (!transcribeRes.ok) throw new Error('Transcription failed');
      const { transcript } = await transcribeRes.json();

      // Step 3: Summarize
      setProgress('Generating AI summary...');
      const summarizeRes = await fetch('/api/summarize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });

      if (!summarizeRes.ok) throw new Error('Summarization failed');
      const { summary, id } = await summarizeRes.json();

      // Navigate to transcript page
      router.push(`/transcripts/${id}`);
    } catch (error) {
      console.error(error);
      setProgress('Error: ' + (error as Error).message);
      setUploading(false);
    }
  };

  const handleRecordClick = () => {
    // Placeholder for recording functionality
    alert('Recording feature coming soon! 🎤');
  };

  return (
    <main className="min-h-screen py-12 px-4">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="text-center mb-12">
          <h1 className="text-4xl md:text-5xl font-bold text-gray-900 mb-4">
            Upload Your Audio
          </h1>
          <p className="text-xl text-gray-600">
            Upload a file or record directly to get started
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6 mb-8">
          {/* Upload Section */}
          <div
            className={`bg-white rounded-2xl shadow-lg p-8 border-2 transition-all ${
              dragActive
                ? 'border-indigo-500 bg-indigo-50'
                : 'border-gray-200 hover:border-indigo-300'
            }`}
            onDragEnter={handleDrag}
            onDragLeave={handleDrag}
            onDragOver={handleDrag}
            onDrop={handleDrop}
          >
            <div className="text-center">
              <div className="text-6xl mb-4">📤</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Upload File
              </h2>

              <input
                ref={fileInputRef}
                type="file"
                accept="audio/*,video/*"
                onChange={handleFileChange}
                className="hidden"
                id="file-upload"
                disabled={uploading}
              />

              {file ? (
                <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4 mb-4">
                  <p className="font-medium text-gray-900 truncate">
                    {file.name}
                  </p>
                  <p className="text-sm text-gray-600 mt-1">
                    {(file.size / 1024 / 1024).toFixed(2)} MB
                  </p>
                  <button
                    onClick={() => setFile(null)}
                    className="text-sm text-indigo-600 hover:text-indigo-800 mt-2"
                  >
                    Remove
                  </button>
                </div>
              ) : (
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-gray-300 rounded-lg p-8 cursor-pointer hover:border-indigo-400 transition-colors"
                >
                  <p className="text-gray-700 font-medium">
                    Click or drag file here
                  </p>
                  <p className="text-sm text-gray-500 mt-2">
                    MP3, WAV, M4A, MP4 supported
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Record Section */}
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-gray-200 hover:border-purple-300 transition-all">
            <div className="text-center">
              <div className="text-6xl mb-4">🎙️</div>
              <h2 className="text-2xl font-bold text-gray-900 mb-4">
                Record Audio
              </h2>
              <button
                onClick={handleRecordClick}
                className={`w-full py-4 px-6 rounded-full font-bold text-lg transition-all ${
                  isRecording
                    ? 'bg-red-500 hover:bg-red-600 text-white'
                    : 'bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white'
                }`}
              >
                {isRecording ? '⏹️ Stop Recording' : '🎤 Start Recording'}
              </button>
              <p className="text-sm text-gray-500 mt-4">
                Click to start recording from your microphone
              </p>
            </div>
          </div>
        </div>

        {/* Upload Button */}
        {file && (
          <div className="bg-white rounded-2xl shadow-lg p-8 border-2 border-gray-200">
            <button
              onClick={handleUpload}
              disabled={uploading}
              className="w-full bg-gradient-to-r from-indigo-600 to-purple-600 text-white py-4 px-8 rounded-full font-bold text-lg hover:shadow-xl hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 transition-all"
            >
              {uploading ? (
                <span className="flex items-center justify-center gap-3">
                  <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                    <circle
                      className="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      strokeWidth="4"
                      fill="none"
                    />
                    <path
                      className="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    />
                  </svg>
                  {progress}
                </span>
              ) : (
                '🚀 Start Transcription'
              )}
            </button>

            {/* Progress */}
            {uploading && (
              <div className="mt-4 bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <div className="flex items-center justify-center gap-3">
                  <div className="h-2 flex-1 bg-indigo-200 rounded-full overflow-hidden">
                    <div className="h-full bg-gradient-to-r from-indigo-600 to-purple-600 animate-pulse" />
                  </div>
                </div>
                <p className="text-indigo-800 text-center text-sm mt-2">
                  {progress}
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
