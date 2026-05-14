const TRANSCRIPT_CHAT_SYSTEM_PROMPT = `You answer questions about a meeting or conversation transcript.

Requirements:
- Use the transcript as the primary source of truth.
- Answer the user's question directly and concisely.
- If the transcript does not contain enough information to answer confidently, say that clearly.
- Do not invent names, decisions, dates, or action items that are not supported by the transcript.
- When useful, quote or paraphrase relevant parts of the transcript.`;

function normalizeChatText(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeTranscriptChatHistory(history, limit = 10) {
  if (!Array.isArray(history)) {
    return [];
  }

  return history
    .map((entry) => {
      if (!entry || (entry.role !== 'user' && entry.role !== 'assistant')) {
        return null;
      }

      const content = normalizeChatText(entry.content);
      if (!content) {
        return null;
      }

      return {
        role: entry.role,
        content,
      };
    })
    .filter(Boolean)
    .slice(-limit);
}

function formatHistory(history) {
  if (!history.length) {
    return 'No previous chat turns.';
  }

  return history
    .map((entry) => `${entry.role === 'user' ? 'User' : 'Assistant'}: ${entry.content}`)
    .join('\n');
}

function buildTranscriptChatInput({
  history,
  question,
  summary,
  title,
  transcript,
}) {
  const normalizedQuestion = normalizeChatText(question);
  const normalizedTranscript = normalizeChatText(transcript);
  const normalizedTitle = normalizeChatText(title) || 'Untitled transcript';
  const normalizedSummary = normalizeChatText(summary);
  const normalizedHistory = normalizeTranscriptChatHistory(history);

  return [
    `Transcript title: ${normalizedTitle}`,
    normalizedSummary ? `Saved summary:\n${normalizedSummary}` : 'Saved summary:\nNone',
    `Previous chat turns:\n${formatHistory(normalizedHistory)}`,
    `Full transcript:\n${normalizedTranscript}`,
    `Current user question:\n${normalizedQuestion}`,
  ].join('\n\n');
}

module.exports = {
  TRANSCRIPT_CHAT_SYSTEM_PROMPT,
  buildTranscriptChatInput,
  normalizeTranscriptChatHistory,
};
