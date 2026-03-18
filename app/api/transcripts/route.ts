import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';

export async function GET() {
  try {
    const dataDir = path.join(process.cwd(), 'data', 'transcripts');
    
    // Create directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      return NextResponse.json({ transcripts: [] });
    }

    const files = fs.readdirSync(dataDir).filter(file => file.endsWith('.json'));
    
    const transcripts = files.map(file => {
      const filePath = path.join(dataDir, file);
      const content = fs.readFileSync(filePath, 'utf-8');
      const data = JSON.parse(content);
      
      // Return list view data
      return {
        id: data.id || path.basename(file, '.json'),
        title: data.title || 'Untitled',
        summary: data.summary || data.transcript?.slice(0, 200) || '',
        createdAt: data.createdAt || new Date().toISOString(),
        duration: data.duration || '0 min',
        speakers: data.speakers || [],
        participants: data.speakers?.length || 0,
        comments: data.comments || 0,
        highlights: data.highlights || 0,
      };
    });

    // Sort by date, newest first
    transcripts.sort((a, b) => 
      new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );

    return NextResponse.json({ transcripts });
  } catch (error) {
    console.error('Error reading transcripts:', error);
    return NextResponse.json({ transcripts: [] });
  }
}
