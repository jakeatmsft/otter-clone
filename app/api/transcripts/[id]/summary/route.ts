import { NextResponse } from 'next/server';
import {
  createAzureSummarizationClient,
  getAzureSummarizationModel,
  getAzureSummarizationScope,
  normalizeAzureCredentialError,
} from '@/lib/azure-openai';
import { readTranscriptRecord, updateTranscriptRecord } from '@/lib/transcript-store';

const CONCISE_BULLET_SUMMARY_PROMPT = `Summarize the transcript as a concise bullet list.

Requirements:
- Return only 3 to 6 bullets.
- Each bullet must be one sentence.
- Focus on the most important takeaways, decisions, updates, and action items.
- Do not include headings, labels, or any intro or outro text.`;

export async function POST(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const transcript = await readTranscriptRecord(id);

    if (!transcript.transcript.trim()) {
      return NextResponse.json(
        { error: 'Transcript is empty.' },
        { status: 400 }
      );
    }

    const openai = await createAzureSummarizationClient();
    const model = getAzureSummarizationModel();
    const response = await openai.responses.create({
      model,
      max_output_tokens: 300,
      input: `${CONCISE_BULLET_SUMMARY_PROMPT}\n\nTranscript:\n${transcript.transcript}`,
    });

    const summary = response.output_text.trim();

    if (!summary) {
      throw new Error('Azure OpenAI returned an empty summary.');
    }

    const updated = await updateTranscriptRecord(id, { summary });
    return NextResponse.json({ id: updated.id, summary: updated.summary });
  } catch (error) {
    let scope: string | undefined;
    try {
      scope = getAzureSummarizationScope();
    } catch {
      scope = undefined;
    }

    const message = normalizeAzureCredentialError(error, {
      scope,
      surface: 'summarization',
    });
    const status =
      error instanceof Error && /not found/i.test(error.message) ? 404 : 500;

    console.error('Transcript summary generation error:', error);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
