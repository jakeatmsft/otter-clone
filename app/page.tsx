import Link from 'next/link';

export default function Home() {
  return (
    <main className="min-h-screen">
      {/* Hero Section */}
      <section className="bg-gradient-to-br from-indigo-600 via-purple-600 to-indigo-800 text-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-20 md:py-32">
          <div className="text-center">
            <h1 className="text-5xl md:text-6xl lg:text-7xl font-bold mb-6 leading-tight">
              AI-Powered Audio
              <br />
              <span className="bg-gradient-to-r from-yellow-200 to-pink-200 bg-clip-text text-transparent">
                Transcription
              </span>
            </h1>
            <p className="text-xl md:text-2xl text-indigo-100 mb-10 max-w-3xl mx-auto">
              Transform your audio and video files into accurate transcripts with intelligent AI summaries
            </p>
            <div className="flex flex-col sm:flex-row gap-4 justify-center">
              <Link
                href="/upload"
                className="bg-white text-indigo-600 px-8 py-4 rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all"
              >
                Start Transcribing
              </Link>
              <Link
                href="/dashboard"
                className="bg-indigo-500/30 backdrop-blur-sm text-white border-2 border-white/30 px-8 py-4 rounded-full font-bold text-lg hover:bg-indigo-500/50 transition-all"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <h2 className="text-4xl font-bold text-center text-gray-900 mb-4">
            Powerful Features
          </h2>
          <p className="text-xl text-center text-gray-600 mb-16 max-w-2xl mx-auto">
            Everything you need to transcribe, understand, and organize your audio content
          </p>

          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-8">
            {/* Feature 1 */}
            <div className="bg-gradient-to-br from-indigo-50 to-purple-50 p-8 rounded-2xl border border-indigo-100 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">🎙️</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Real-time Transcription
              </h3>
              <p className="text-gray-600">
                Get accurate transcriptions powered by advanced speech recognition technology
              </p>
            </div>

            {/* Feature 2 */}
            <div className="bg-gradient-to-br from-purple-50 to-pink-50 p-8 rounded-2xl border border-purple-100 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">🤖</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                AI Summaries
              </h3>
              <p className="text-gray-600">
                Automatically generate intelligent summaries from your transcripts with AI
              </p>
            </div>

            {/* Feature 3 */}
            <div className="bg-gradient-to-br from-pink-50 to-red-50 p-8 rounded-2xl border border-pink-100 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">🌍</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Multi-language Support
              </h3>
              <p className="text-gray-600">
                Transcribe audio in multiple languages with high accuracy
              </p>
            </div>

            {/* Feature 4 */}
            <div className="bg-gradient-to-br from-blue-50 to-indigo-50 p-8 rounded-2xl border border-blue-100 hover:shadow-xl transition-shadow">
              <div className="text-4xl mb-4">📤</div>
              <h3 className="text-xl font-bold text-gray-900 mb-3">
                Easy Upload
              </h3>
              <p className="text-gray-600">
                Upload audio and video files in multiple formats with drag-and-drop support
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20 bg-gradient-to-r from-indigo-600 to-purple-600 text-white">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-4xl font-bold mb-6">
            Ready to get started?
          </h2>
          <p className="text-xl text-indigo-100 mb-8">
            Upload your first audio file and experience the power of AI transcription
          </p>
          <Link
            href="/upload"
            className="inline-block bg-white text-indigo-600 px-10 py-4 rounded-full font-bold text-lg hover:shadow-2xl hover:scale-105 transition-all"
          >
            Upload Now
          </Link>
        </div>
      </section>
    </main>
  );
}
