import { NextRequest, NextResponse } from 'next/server';
import Anthropic from '@anthropic-ai/sdk';
import { writeFile } from 'fs/promises';
import { join } from 'path';

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

export async function POST(request: NextRequest) {
  try {
    const { transcript } = await request.json();
    
    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      );
    }

    // Generate summary with Claude
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
      transcript,
      summary,
      createdAt: new Date().toISOString(),
    };

    const filepath = join(process.cwd(), 'data', 'transcripts', `${id}.json`);
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
