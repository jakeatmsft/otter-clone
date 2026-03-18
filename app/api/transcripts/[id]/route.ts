import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const dataDir = path.join(process.cwd(), 'data', 'transcripts');
    const filePath = path.join(dataDir, `${id}.json`);

    if (!fs.existsSync(filePath)) {
      return NextResponse.json(
        { error: 'Transcript not found' },
        { status: 404 }
      );
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    const data = JSON.parse(content);

    // Ensure all expected fields exist
    const transcript = {
      id: data.id || id,
      title: data.title || 'Untitled',
      transcript: data.transcript || '',
      summary: data.summary || '',
      actionItems: data.actionItems || [],
      outline: data.outline || [],
      keywords: data.keywords || [],
      speakers: data.speakers || [],
      segments: data.segments || [],
      duration: data.duration || '0 min',
      createdAt: data.createdAt || new Date().toISOString(),
    };

    return NextResponse.json(transcript);
  } catch (error) {
    console.error('Error reading transcript:', error);
    return NextResponse.json(
      { error: 'Failed to load transcript' },
      { status: 500 }
    );
  }
}
