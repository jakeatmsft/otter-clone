'use client';

import RightPanel from '../components/layout/RightPanel';

export default function IntegrationsPage() {
  return (
    <>
      <div className="pr-80">
        <div className="p-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-6">Integrations</h1>
          
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {/* Placeholder integrations */}
            {[
              { name: 'Zoom', icon: '📹', description: 'Auto-record and transcribe Zoom meetings' },
              { name: 'Google Meet', icon: '🎥', description: 'Capture Google Meet conversations' },
              { name: 'Microsoft Teams', icon: '💼', description: 'Transcribe Teams meetings' },
              { name: 'Slack', icon: '💬', description: 'Share transcripts in Slack channels' },
              { name: 'Google Drive', icon: '📁', description: 'Save transcripts to Google Drive' },
              { name: 'Dropbox', icon: '📦', description: 'Sync transcripts with Dropbox' },
            ].map((integration) => (
              <div
                key={integration.name}
                className="bg-white rounded-lg border border-gray-200 p-6 hover:shadow-lg transition-shadow"
              >
                <div className="text-4xl mb-3">{integration.icon}</div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">{integration.name}</h3>
                <p className="text-sm text-gray-600 mb-4">{integration.description}</p>
                <button className="w-full px-4 py-2 text-sm font-medium text-blue-600 bg-blue-50 rounded-lg hover:bg-blue-100 transition-colors">
                  Connect
                </button>
              </div>
            ))}
          </div>
        </div>
      </div>
      <RightPanel />
    </>
  );
}
