# 🦊 Otter Clone - AI Transcription App

A Next.js application that transcribes audio and generates AI summaries using Azure OpenAI.

## Features

- 🎙️ Audio file upload (MP3, WAV, M4A, MP4)
- 🔴 Live recording with Azure Realtime transcription over WebSocket
- 📝 Azure OpenAI transcription with timestamped segments
- 🧠 Azure OpenAI summaries via the Responses API
- 💾 Download transcripts as TXT
- 🎨 Clean, modern UI with Tailwind CSS

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
   
   Then edit `.env.local` with your Azure values:
   - `AZURE_AI_PROJECT_ENDPOINT` for summarization
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

   If you already have `AZURE_OPENAI_API_BASE`, the app can still use it as a fallback for summarization and for deriving the transcription endpoint.

   Authentication uses `DefaultAzureCredential`, so your local environment also needs a working Azure identity source such as `az login`, `azd auth login --scope https://cognitiveservices.azure.com/.default`, managed identity, or the standard service principal environment variables supported by the Azure SDK.
   When the server runs on Windows, it can also fall back to an authenticated WSL Azure CLI via `wsl.exe az` if Windows-side developer credentials are unavailable.

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:3000**

For production:
```bash
npm run build
npm start
```

## Usage

1. Use **Upload** for batch transcription + summarization.
2. Use **Record** for live websocket transcription.
3. After a live recording stops, the app saves the realtime transcript directly.
4. View or download the saved transcript.

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **APIs:** 
  - Azure OpenAI audio transcription via `AzureOpenAI` and `DefaultAzureCredential`
  - Azure OpenAI realtime transcription over a server-side WebSocket bridge
  - Azure AI project summarization via `OpenAI` pointed at `/openai/v1`
- **TypeScript** for type safety

## Project Structure

```
otter-clone/
├── app/
│   ├── page.tsx                  # Upload page
│   ├── layout.tsx                # Root layout
│   ├── globals.css               # Global styles
│   ├── api/
│   │   ├── upload/route.ts       # File upload handler
│   │   ├── transcribe/route.ts   # Batch Azure OpenAI transcription
│   │   ├── summarize/route.ts    # Azure OpenAI summarization
│   │   └── transcripts/route.ts  # Transcript list + save endpoint
│   ├── record/                   # Live recording page
│   └── transcripts/
│       └── [id]/
│           ├── page.tsx          # Transcript viewer
│           └── download-button.tsx
├── realtime-bridge.js            # Azure realtime websocket bridge
├── server.js                     # Custom Next server with WS upgrade handling
├── public/uploads/               # Uploaded files (temp)
├── data/transcripts/             # Saved transcripts
└── package.json
```

## Notes

- Files are saved locally in `public/uploads/` and `data/transcripts/`
- For production, consider using cloud storage (S3, etc.)
- Transcription time depends on audio length (typically 1-2 min per 10 min of audio)
- `npm run dev` and `npm start` both go through `server.js` so the `/api/realtime-transcription` websocket route works

---

Built with 🦊 by Kip
