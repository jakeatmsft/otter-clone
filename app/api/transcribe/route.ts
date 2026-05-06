import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { join } from 'path';

export async function POST(request: NextRequest) {
  try {
    const openaiKey = process.env.OPENAI_API_KEY;
    if (!openaiKey || /your_openai_api_key_here/i.test(openaiKey)) {
      return NextResponse.json(
        {
          error:
            'OPENAI_API_KEY is missing or invalid. Update .env.local with a real key and restart the server.',
        },
        { status: 500 }
      );
    }

    const { filename } = await request.json();
    
    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    const filepath = join(process.cwd(), 'public', 'uploads', filename);
    const openai = new OpenAI({ apiKey: openaiKey });
    
    // Transcribe with Whisper
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(filepath) as any,
      model: 'whisper-1',
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    return NextResponse.json({
      transcript: transcription.text,
      segments: transcription.segments || [],
    });
  } catch (error) {
    console.error('Transcription error:', error);
    return NextResponse.json(
      { error: 'Transcription failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
