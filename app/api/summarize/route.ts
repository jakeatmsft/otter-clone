import { NextRequest, NextResponse } from 'next/server';
import {
  createAzureSummarizationClient,
  getAzureSummarizationModel,
  getAzureSummarizationScope,
  normalizeAzureCredentialError,
} from '@/lib/azure-openai';
import { saveTranscriptRecord } from '@/lib/transcript-store';

export async function POST(request: NextRequest) {
  try {
    const { audioFilename, transcript, title, duration, speakers, segments } =
      await request.json();

    if (!transcript) {
      return NextResponse.json(
        { error: 'No transcript provided' },
        { status: 400 }
      );
    }

    const openai = await createAzureSummarizationClient();
    const model = getAzureSummarizationModel();
    const prompt = `Analyze this transcript and provide:

1. **Summary** (2-3 sentences)
2. **Key Points** (bullet list)
3. **Action Items** (if any)
4. **Speakers** (estimate number of distinct speakers)

Transcript:
${transcript}

Format your response clearly with headers.`;
    const response = await openai.responses.create({
      model,
      max_output_tokens: 500,
      input: prompt,
    });

    const summary = response.output_text.trim();

    if (!summary) {
      throw new Error('Azure OpenAI returned an empty summary.');
    }

    const saved = await saveTranscriptRecord({
      audioFilename,
      duration,
      segments,
      speakers,
      summary,
      title,
      transcript,
    });

    return NextResponse.json({ summary, id: saved.id });
  } catch (error) {
    const message = normalizeAzureCredentialError(error, {
      scope: getAzureSummarizationScope(),
      surface: 'summarization',
    });
    console.error('Summarization error:', error);
    return NextResponse.json(
      { error: 'Summarization failed: ' + message },
      { status: 500 }
    );
  }
}
