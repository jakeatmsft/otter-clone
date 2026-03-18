'use client';

import { useState, useEffect } from 'react';
import RightPanel from '../components/layout/RightPanel';

interface Message {
  id: string;
  speaker: string;
  timestamp: string;
  text: string;
}

export default function RecordPage() {
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [duration, setDuration] = useState(0);
  const [messages, setMessages] = useState<Message[]>([]);

  // Mock recording timer
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (isRecording && !isPaused) {
      interval = setInterval(() => {
        setDuration(prev => prev + 1);
      }, 1000);
    }
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Mock message generator
  useEffect(() => {
    if (!isRecording || isPaused) return;

    const mockMessages = [
      "Hello, this is a test recording.",
      "The quick brown fox jumps over the lazy dog.",
      "We're demonstrating the Otter.ai recording interface.",
      "Messages will appear here in real-time as you speak.",
      "This is a placeholder for actual speech recognition.",
    ];

    let messageIndex = 0;
    const interval = setInterval(() => {
      if (messageIndex < mockMessages.length) {
        const newMessage: Message = {
          id: Date.now().toString(),
          speaker: 'Unknown',
          timestamp: formatDuration(duration),
          text: mockMessages[messageIndex],
        };
        setMessages(prev => [...prev, newMessage]);
        messageIndex++;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, duration]);

  const handleStart = () => {
    setIsRecording(true);
    setIsPaused(false);
  };

  const handlePause = () => {
    setIsPaused(!isPaused);
  };

  const handleStop = () => {
    setIsRecording(false);
    setIsPaused(false);
    // Here you would save the recording
    alert('Recording stopped! In a real app, this would save your recording.');
  };

  const formatDuration = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <>
      <div className="pr-80 pb-24">
        {/* Header */}
        <div className="bg-white border-b border-gray-200 px-8 py-6">
          <div className="max-w-5xl">
            <h1 className="text-3xl font-bold italic text-gray-900 mb-3">
              Note
            </h1>
            <div className="flex items-center gap-3 text-sm text-gray-600">
              <span className="flex items-center gap-1">
                <span>📅</span>
                {new Date().toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </span>
              <span>·</span>
              <span>Owner: You</span>
            </div>
          </div>
        </div>

        {/* Recording Area */}
        <div className="px-8 py-6">
          <div className="max-w-5xl">
            {!isRecording ? (
              <div className="text-center py-20">
                <div className="text-6xl mb-6">🎙️</div>
                <h2 className="text-2xl font-bold text-gray-900 mb-4">
                  Ready to record
                </h2>
                <p className="text-gray-600 mb-8">
                  Click the button below to start recording your conversation
                </p>
                <button
                  onClick={handleStart}
                  className="px-8 py-4 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium text-lg flex items-center gap-3 mx-auto"
                >
                  <span className="w-3 h-3 bg-red-500 rounded-full animate-pulse"></span>
                  Start Recording
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {messages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="animate-pulse">Listening...</div>
                  </div>
                ) : (
                  messages.map((message) => (
                    <div key={message.id} className="flex gap-4">
                      <div className="w-10 h-10 rounded-full bg-gray-400 flex items-center justify-center text-white flex-shrink-0">
                        <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                          <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" />
                        </svg>
                      </div>
                      <div className="flex-1 bg-white rounded-lg border border-gray-200 p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <span className="font-medium text-gray-900">{message.speaker}</span>
                          <span className="text-sm text-gray-500">{message.timestamp}</span>
                        </div>
                        <p className="text-gray-700">{message.text}</p>
                      </div>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Recording Controls */}
      {isRecording && (
        <div className="fixed bottom-0 left-60 right-0 bg-white border-t border-gray-200 px-8 py-6 z-20">
          <div className="flex items-center gap-6 max-w-5xl mx-auto">
            <button
              onClick={handlePause}
              className="p-4 bg-gray-100 hover:bg-gray-200 rounded-full transition-colors"
              title={isPaused ? 'Resume' : 'Pause'}
            >
              {isPaused ? (
                <svg className="w-6 h-6 text-gray-700" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M8 5v14l11-7z" />
                </svg>
              ) : (
                <svg className="w-6 h-6 text-gray-700" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 9v6m4-6v6" />
                </svg>
              )}
            </button>

            <button
              onClick={handleStop}
              className="p-4 bg-red-500 hover:bg-red-600 rounded-full transition-colors"
              title="Stop"
            >
              <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" />
              </svg>
            </button>

            <div className="flex-1 flex items-center gap-4">
              <div className="flex items-center gap-2">
                <span className={`w-3 h-3 rounded-full ${isPaused ? 'bg-yellow-500' : 'bg-red-500 animate-pulse'}`}></span>
                <span className="text-sm font-medium text-gray-700">
                  {isPaused ? 'Paused' : 'Recording'}
                </span>
              </div>
              
              <div className="flex-1 bg-gray-200 rounded-full h-2">
                <div 
                  className={`h-2 rounded-full transition-all ${isPaused ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: '100%', animation: isPaused ? 'none' : 'pulse 2s ease-in-out infinite' }}
                ></div>
              </div>
              
              <span className="text-sm font-mono text-gray-700 min-w-[4rem]">
                {formatDuration(duration)}
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Bookmark">
                <span className="text-gray-600">📌</span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Comment">
                <span className="text-gray-600">💬</span>
              </button>
              <button className="p-2 hover:bg-gray-100 rounded-lg transition-colors" title="Screenshot">
                <span className="text-gray-600">📸</span>
              </button>
            </div>
          </div>
        </div>
      )}

      <RightPanel />
    </>
  );
}
