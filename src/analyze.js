const findingSchema = {
  type: 'object',
  properties: {
    quotes: { type: 'array', items: { type: 'string' } },
    unclear: { type: 'array', items: { type: 'string' } },
    question: { type: 'string' }
  },
  required: ['quotes', 'unclear', 'question']
};

const systemPrompt = `You help a person organize a group plan from a pasted chat. Be careful with uncertainty.
Return only JSON matching the supplied schema.
For "quotes", copy up to four exact, contiguous excerpts from the chat that matter to the plan. When two messages suggest different venues or times, include both of those messages before generic invitations. A quote can be a proposal, question, or commitment; do not claim the group agreed.
For "unclear", write complete, specific sentences about unresolved time, place, attendance, or task ownership. Name the people or competing options. Never return bare labels like "time", "place", or "attendance". Do not add side questions such as weather, prices, or agenda unless a speaker raised them.
Before writing the question, compare every speaker's time and place. A question about a conflicting venue must name both venues. A question about time must respect every stated availability limit. Ask only about details still open in this conversation.
Write one short, friendly question to the group that resolves the most important open logistics. If both time and place are open, ask about both in one sentence. Never suggest a time that someone said they cannot make. Do not ask for a detail already explicit in the chat or invent a commitment.
Keep each list to at most four items. If the plan is fully settled, "unclear" must be empty and the question should simply confirm the plan.`;

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function validateFindings(raw, source) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.quotes) || !Array.isArray(raw.unclear)) {
    throw new Error('The model returned an unexpected format. Please try again.');
  }

  const quotes = raw.quotes.slice(0, 4).map((item) => cleanText(item, 220)).filter((quote) => quote && source.includes(quote));

  const unclear = [...new Set(raw.unclear.slice(0, 4).map((item) => cleanText(item, 180)).filter((item) => item.length > 12))];
  const question = cleanText(raw.question, 300);

  return {
    quotes,
    unclear,
    question: question || 'What is the one detail we still need to confirm?',
    discarded: Math.min(raw.quotes.length, 4) - quotes.length
  };
}

export async function analyzeChat(chat, options = {}) {
  const configuredUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const baseUrl = /^https?:\/\//.test(configuredUrl) ? configuredUrl : `http://${configuredUrl}`;
  const model = options.model || process.env.OLLAMA_MODEL || 'gemma2:2b-instruct-q3_K_S';
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(new URL('/api/chat', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: findingSchema,
      options: { temperature: 0, num_ctx: 4096, num_predict: 512 },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Read this conversation:\n\n${chat}` }
      ]
    }),
    signal: AbortSignal.timeout(180000)
  });

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}. Check that ${model} is installed and the model service is running.`);
  }

  const payload = await response.json();
  let raw;
  try {
    raw = JSON.parse(payload?.message?.content || '');
  } catch {
    throw new Error('The model response was not valid JSON. Please try again.');
  }
  return { ...validateFindings(raw, chat), model };
}
