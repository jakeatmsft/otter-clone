import { NextRequest, NextResponse } from 'next/server';
import {
  createAzureSummarizationClient,
  getAzureSummarizationModel,
  getAzureSummarizationScope,
  normalizeAzureCredentialError,
} from '@/lib/azure-openai';
import { readTranscriptRecord } from '@/lib/transcript-store';

const {
  TRANSCRIPT_CHAT_SYSTEM_PROMPT,
  buildTranscriptChatInput,
  normalizeTranscriptChatHistory,
} = require('@/lib/transcript-chat');

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const { history, question } = await request.json();
    const normalizedQuestion =
      typeof question === 'string' ? question.trim() : '';

    if (!normalizedQuestion) {
      return NextResponse.json(
        { error: 'Question is required.' },
        { status: 400 }
      );
    }

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
      instructions: TRANSCRIPT_CHAT_SYSTEM_PROMPT,
      max_output_tokens: 500,
      input: buildTranscriptChatInput({
        history: normalizeTranscriptChatHistory(history),
        question: normalizedQuestion,
        summary: transcript.summary,
        title: transcript.title,
        transcript: transcript.transcript,
      }),
    });

    const answer = response.output_text.trim();

    if (!answer) {
      throw new Error('Azure OpenAI returned an empty answer.');
    }

    return NextResponse.json({ answer });
  } catch (error) {
    let scope: string | undefined;
    try {
      scope = getAzureSummarizationScope();
    } catch {
      scope = undefined;
    }

    const message = normalizeAzureCredentialError(error, {
      scope,
      surface: 'transcript chat',
    });
    const status =
      error instanceof Error && /not found/i.test(error.message) ? 404 : 500;

    console.error('Transcript chat error:', error);
    return NextResponse.json(
      { error: message },
      { status }
    );
  }
}
