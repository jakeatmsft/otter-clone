import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';
import fs from 'fs';

export async function POST(request: NextRequest) {
  try {
    const anthropicKey = process.env.ANTHROPIC_API_KEY;
    if (!anthropicKey || /your_anthropic_api_key_here/i.test(anthropicKey)) {
      return NextResponse.json(
        {
          error:
            'ANTHROPIC_API_KEY is missing or invalid. Update .env.local with a real key and restart the server.',
        },
        { status: 500 }
      );
    }

    const { transcript, title, duration, speakers, segments } = await request.json();
    
    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      );
    }

    // Generate summary with Claude
    const anthropic = new Anthropic({ apiKey: anthropicKey });
    const message = await anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: `Analyze this transcript and provide:

1. **Summary** (2-3 sentences)
2. **Key Points** (bullet list)
3. **Action Items** (if any)
4. **Speakers** (estimate number of distinct speakers)

Transcript:
${transcript}

Format your response clearly with headers.`
      }],
    });

    const summary = message.content[0].type === 'text' 
      ? message.content[0].text 
      : '';

    // Save transcript + summary
    const id = Date.now().toString();
    const data = {
      id,
      title: typeof title === 'string' && title.trim() ? title.trim() : 'Untitled',
      transcript,
      summary,
      duration: typeof duration === 'string' && duration.trim() ? duration : '0 min',
      speakers: Array.isArray(speakers) ? speakers : [],
      segments: Array.isArray(segments) ? segments : [],
      createdAt: new Date().toISOString(),
    };

    const dataDir = join(process.cwd(), 'data', 'transcripts');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    const filepath = join(dataDir, `${id}.json`);
    await writeFile(filepath, JSON.stringify(data, null, 2));

    return NextResponse.json({ summary, id });
  } catch (error) {
    console.error('Summarization error:', error);
    return NextResponse.json(
      { error: 'Summarization failed: ' + (error as Error).message },
      { status: 500 }
    );
  }
}
