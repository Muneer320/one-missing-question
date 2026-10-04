const findingSchema = {
  type: 'object',
  properties: {
    agreed: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          detail: { type: 'string' },
          evidence: { type: 'string' }
        },
        required: ['detail', 'evidence']
      }
    },
    unclear: { type: 'array', items: { type: 'string' } },
    question: { type: 'string' }
  },
  required: ['agreed', 'unclear', 'question']
};

const systemPrompt = `You help a person organize a group plan from a pasted chat. Be careful with uncertainty.
Return only JSON matching the supplied schema.
"agreed" may contain only concrete logistics explicitly supported by the chat. For each item, copy a short, exact, contiguous quote into "evidence". Do not treat one person's suggestion as group agreement.
Put missing details and contradictions in "unclear". Include the competing possibilities when a conflict exists.
Write one short, friendly question that resolves the most important uncertainty. Address the group directly. Do not invent a time, place, person, or commitment.
Keep each list to at most four items. If nothing is agreed, return an empty agreed list.`;

function cleanText(value, maxLength) {
  return typeof value === 'string' ? value.trim().slice(0, maxLength) : '';
}

export function validateFindings(raw, source) {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.agreed) || !Array.isArray(raw.unclear)) {
    throw new Error('The model returned an unexpected format. Please try again.');
  }

  const agreed = raw.agreed.slice(0, 4).flatMap((item) => {
    const detail = cleanText(item?.detail, 180);
    const evidence = cleanText(item?.evidence, 220);
    return detail && evidence && source.includes(evidence) ? [{ detail, evidence }] : [];
  });

  const unclear = raw.unclear.slice(0, 4).map((item) => cleanText(item, 180)).filter(Boolean);
  const question = cleanText(raw.question, 300);

  return {
    agreed,
    unclear,
    question: question || 'What is the one detail we still need to confirm?',
    discarded: Math.min(raw.agreed.length, 4) - agreed.length
  };
}

export async function analyzeChat(chat, options = {}) {
  const configuredUrl = options.baseUrl || process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434';
  const baseUrl = /^https?:\/\//.test(configuredUrl) ? configuredUrl : `http://${configuredUrl}`;
  const model = options.model || process.env.OLLAMA_MODEL || 'gemma4:e2b';
  const fetcher = options.fetcher || fetch;
  const response = await fetcher(new URL('/api/chat', baseUrl), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      model,
      stream: false,
      format: findingSchema,
      options: { temperature: 0 },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Read this conversation:\n\n${chat}` }
      ]
    }),
    signal: AbortSignal.timeout(90000)
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
