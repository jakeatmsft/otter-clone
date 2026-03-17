# 🦊 Otter Clone - AI Transcription App

A Next.js application that transcribes audio files using OpenAI Whisper and generates AI summaries with Claude.

## Features

- 🎙️ Audio file upload (MP3, WAV, M4A, MP4)
- 📝 AI transcription with OpenAI Whisper
- 🧠 Smart summaries with Claude AI
- 💾 Download transcripts as TXT
- 🎨 Clean, modern UI with Tailwind CSS

## Setup

1. **Install dependencies:**
   ```bash
   npm install
   ```

2. **Set up environment variables:**
   
   Copy `.env.local.example` to `.env.local` and add your API keys:
   ```bash
   cp .env.local.example .env.local
   ```
   
   Then edit `.env.local` with your keys:
   - `OPENAI_API_KEY` - Get from https://platform.openai.com/api-keys
   - `ANTHROPIC_API_KEY` - Get from https://console.anthropic.com/

3. **Run the development server:**
   ```bash
   npm run dev
   ```

4. **Open http://localhost:3000**

## Usage

1. Click to upload an audio file
2. Click "Transcribe" and wait (usually 10-30 seconds)
3. View your transcript with AI summary
4. Download as TXT if needed

## Tech Stack

- **Framework:** Next.js 15 (App Router)
- **Styling:** Tailwind CSS
- **APIs:** 
  - OpenAI Whisper API (transcription)
  - Anthropic Claude API (summarization)
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
│   │   ├── transcribe/route.ts   # Whisper integration
│   │   └── summarize/route.ts    # Claude integration
│   └── transcripts/
│       └── [id]/
│           ├── page.tsx          # Transcript viewer
│           └── download-button.tsx
├── public/uploads/               # Uploaded files (temp)
├── data/transcripts/             # Saved transcripts
└── package.json
```

## Notes

- Files are saved locally in `public/uploads/` and `data/transcripts/`
- For production, consider using cloud storage (S3, etc.)
- Transcription time depends on audio length (typically 1-2 min per 10 min of audio)

---

Built with 🦊 by Kip
