# seaotter - AI Transcription App

A Next.js application for transcription, live recording, and Azure OpenAI-powered summaries, with Azure OpenAI or Foundry Local as the transcription backend.

## Features

- 🎙️ Audio file upload (MP3, WAV, M4A, MP4)
- 🔴 Live recording with provider-backed realtime transcription over WebSocket and live transcript preview
- 📝 Batch transcription via Azure OpenAI or Foundry Local
- 🧠 Azure OpenAI summaries via the Responses API
- 📌 On-demand concise bullet summaries from the transcript detail page
- 💾 Download transcripts as TXT
- 🎨 Clean, modern UI with Tailwind CSS

## Recent Updates

- The app is branded as `seaotter` in the browser UI and docs.
- Transcript detail pages now include a `Summarize with Azure OpenAI` action that saves a concise bullet summary back onto the current transcript.
- The Record page keeps a live transcript preview while recording and handles long input-device names without overflowing the form card.
- Transcription can now run either against Azure OpenAI or locally via `foundry-local-sdk`, including the Record page's live preview path.

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   
   Copy `.env.local.example` to `.env.local` and add your Azure OpenAI settings:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Then choose a transcription backend:

   Azure OpenAI (default):
   - `AZURE_AI_PROJECT_ENDPOINT` for summarization and transcript-page summary regeneration
   - `AZURE_OPENAI_ENDPOINT` for transcription
   - `OPENAI_API_VERSION` for the Azure OpenAI transcription API version
   - `AZURE_OPENAI_DEPLOYMENT` for summarization
     Use the deployment name, not the raw model ID.
   - `AZURE_OPENAI_TRANSCRIBE_DEPLOYMENT` for transcription
     Use the deployment name, not the raw model ID.
   - `AZURE_OPENAI_REALTIME_TRANSCRIBE_DEPLOYMENT` for the Record page websocket session
     Use the Azure realtime deployment name, such as `gpt-realtime-mini`, not the batch transcription deployment.
   - Optional: `AZURE_OPENAI_REALTIME_TRANSCRIBE_MODEL=gpt-4o-transcribe`
     This is the raw built-in input transcription model ID sent inside the realtime session.
   - Optional: `AZURE_OPENAI_REALTIME_API_VERSION=2024-10-01-preview`
   - Optional: `AZURE_OPENAI_SCOPE=https://cognitiveservices.azure.com/.default`
     Azure OpenAI resource endpoints default to `https://cognitiveservices.azure.com/.default`.
     If summarization uses an Azure AI project endpoint, that path automatically switches to `https://ai.azure.com/.default`.
   - Optional: `AZURE_OPENAI_REALTIME_SCOPE=https://cognitiveservices.azure.com/.default`
     Use this only if you need a Record-page-specific scope override.
   - Optional: `AZURE_OPENAI_TRANSCRIBE_RESPONSE_FORMAT=json`
     Use this if your transcription deployment rejects `verbose_json`.

   Foundry Local:
   - Install [Foundry Local](https://github.com/microsoft/Foundry-Local)
   - Run `npm install` from the same shell/OS you use to start the app
     If you launch from Windows PowerShell, install from PowerShell so `foundry-local-sdk` downloads Windows native libraries instead of WSL/Linux ones.
   - Set `TRANSCRIPTION_PROVIDER=foundry-local`
   - Optional: `FOUNDRY_LOCAL_MODEL=nemotron-speech-streaming-en-0.6b`
   - Optional: `FOUNDRY_LOCAL_TRANSCRIBE_MODEL=...` and `FOUNDRY_LOCAL_REALTIME_MODEL=...`
   - Optional: `FOUNDRY_LOCAL_TRANSCRIBE_LANGUAGE=en`
   - Optional: `FOUNDRY_LOCAL_REALTIME_LANGUAGE=en`
   - Optional SDK config: `FOUNDRY_LOCAL_APP_NAME`, `FOUNDRY_LOCAL_LOG_LEVEL`, `FOUNDRY_LOCAL_APP_DATA_DIR`, `FOUNDRY_LOCAL_MODEL_CACHE_DIR`, `FOUNDRY_LOCAL_LOGS_DIR`, `FOUNDRY_LOCAL_LIBRARY_PATH`, `FOUNDRY_LOCAL_SERVICE_ENDPOINT`, `FOUNDRY_LOCAL_WEB_SERVICE_URLS`

   If you already have `AZURE_OPENAI_API_BASE`, the app can still use it as a fallback for summarization and for deriving the Azure transcription endpoint.

   Azure authentication uses `DefaultAzureCredential`, so your local environment also needs a working Azure identity source such as `az login`, `azd auth login --scope https://cognitiveservices.azure.com/.default`, managed identity, or the standard service principal environment variables supported by the Azure SDK.
   When the server runs on Windows, it can also fall back to an authenticated WSL Azure CLI via `wsl.exe az` if Windows-side developer credentials are unavailable.

   Azure is still the only summarization backend today. If you use Foundry Local for transcription without Azure summary credentials, uploads will still save the transcript but skip summary generation.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:3000**

### Desktop launch on Windows

If you want a one-click desktop launcher instead of opening a terminal each time:

1. From Windows PowerShell in this repo, run:
   ```powershell
   npm run desktop:install
   ```
2. Double-click the `seaotter` shortcut on your desktop.

The launcher will:
- install `node_modules` the first time if needed
- create `.env.local` from `.env.local.example` if it does not exist
- reuse an already-running local server on port `3000`
- otherwise start the app in a server window and open `http://localhost:3000`

For production:
```bash
npm run build
npm start
```

## Usage

1. Use **Upload** for batch transcription and initial summarization when Azure summaries are configured.
2. Use **Record** for live websocket transcription with a live transcript preview.
3. After a live recording stops, the app saves the recording and transcript locally.
4. Open a transcript and click **Summarize with Azure OpenAI** to generate or refresh a concise bullet summary.
5. View or download the saved transcript.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **APIs:** 
  - Azure OpenAI audio transcription via `AzureOpenAI` and `DefaultAzureCredential`
  - Foundry Local transcription via `foundry-local-sdk`
  - Provider-dispatched realtime transcription over a server-side WebSocket bridge
  - Azure AI project summarization via `OpenAI` pointed at `/openai/v1`
- **TypeScript** for type safety

## Project Structure

```
seaotter/
├── app/
│   ├── page.tsx                  # Upload page
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   ├── api/
│   │   ├── upload/route.ts       # File upload handler
│   │   ├── transcribe/route.ts   # Batch transcription backend
│   │   ├── summarize/route.ts    # Azure OpenAI summarization
│   │   └── transcripts/
│   │       ├── route.ts          # Transcript list + save endpoint
│   │       └── [id]/
│   │           ├── route.ts      # Transcript detail endpoint
│   │           └── summary/route.ts # Azure summary regeneration for a saved transcript
│   ├── record/                   # Live recording page
│   └── transcripts/
│       └── [id]/
│           ├── page.tsx          # Transcript viewer + summary trigger
│           └── download-button.tsx
├── lib/
│   ├── azure-openai.ts           # Azure OpenAI clients and config
│   ├── foundry-local.js          # Foundry Local manager + transcription helpers
│   ├── transcription-provider.js # Provider selection helper
│   └── transcript-store.ts       # Transcript persistence helpers
├── realtime-bridge.js            # Azure / Foundry Local realtime websocket bridge
├── server.js                     # Custom Next server with WS upgrade handling
├── public/uploads/               # Uploaded files (temp)
├── data/transcripts/             # Saved transcripts
└── package.json
```

## Notes

- Files are saved locally in `public/uploads/` and `data/transcripts/`
- Transcript-page summary generation updates the existing saved transcript rather than creating a duplicate entry
- The Record page automatically switches its PCM sample rate to match the active realtime backend
- When Azure summarization is unavailable, the Upload flow now falls back to saving the transcript without a summary
- For production, consider using cloud storage (S3, etc.)
- Transcription time depends on audio length (typically 1-2 min per 10 min of audio)
- `npm run dev` and `npm start` both go through `server.js` so the `/api/realtime-transcription` websocket route works

---

Built for seaotter by Kip
