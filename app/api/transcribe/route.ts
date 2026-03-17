import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { createReadStream } from 'fs';
import { join } from 'path';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { filename } = await request.json();
    
    if (!filename) {
      return NextResponse.json(
        { error: 'No filename provided' },
        { status: 400 }
      );
    }

    const filepath = join(process.cwd(), 'public', 'uploads', filename);
    
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
