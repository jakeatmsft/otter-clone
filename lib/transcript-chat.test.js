const test = require('node:test');
const assert = require('node:assert/strict');

const {
  TRANSCRIPT_CHAT_SYSTEM_PROMPT,
  buildTranscriptChatInput,
  normalizeTranscriptChatHistory,
} = require('./transcript-chat');

test('normalizeTranscriptChatHistory keeps only valid recent chat turns', () => {
  assert.deepEqual(
    normalizeTranscriptChatHistory([
      { role: 'user', content: ' First question ' },
      { role: 'assistant', content: ' First answer ' },
      { role: 'system', content: 'ignore me' },
      { role: 'user', content: '' },
      null,
    ]),
    [
      { role: 'user', content: 'First question' },
      { role: 'assistant', content: 'First answer' },
    ]
  );
});

test('buildTranscriptChatInput includes transcript, summary, history, and current question', () => {
  const input = buildTranscriptChatInput({
    history: [
      { role: 'user', content: 'Who joined?' },
      { role: 'assistant', content: 'Alice and Bob were mentioned.' },
    ],
    question: 'What action items were assigned?',
    summary: 'A quick status review with two decisions.',
    title: 'Weekly sync',
    transcript: 'Alice will send the update. Bob will schedule the demo.',
  });

  assert.match(TRANSCRIPT_CHAT_SYSTEM_PROMPT, /Use the transcript as the primary source of truth/);
  assert.match(input, /Transcript title: Weekly sync/);
  assert.match(input, /Saved summary:\nA quick status review with two decisions\./);
  assert.match(input, /User: Who joined\?/);
  assert.match(input, /Assistant: Alice and Bob were mentioned\./);
  assert.match(input, /Full transcript:\nAlice will send the update\. Bob will schedule the demo\./);
  assert.match(input, /Current user question:\nWhat action items were assigned\?/);
});
