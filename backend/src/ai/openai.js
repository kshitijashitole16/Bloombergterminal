function getOpenAIConfig() {
  const apiKey = process.env.OPENAI_API_KEY;
  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const key = String(apiKey || '').trim();
  const looksPlaceholder = /^PASTE_/i.test(key) || key.includes('YOUR_OPENAI_API_KEY');
  const looksLikeKey = /^sk-/.test(key);
  return {
    enabled: Boolean(key) && !looksPlaceholder && looksLikeKey,
    apiKey: key,
    model,
  };
}

async function callOpenAIChat({ apiKey, model, messages, temperature = 0.2 }) {
  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature,
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`OpenAI HTTP ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  const json = await res.json();
  const content = json?.choices?.[0]?.message?.content;
  return typeof content === 'string' ? content : '';
}

export async function aiMarketSummary({ symbol, quote, news, historyStats }) {
  const cfg = getOpenAIConfig();
  if (!cfg.enabled) return null;

  const safeSymbol = String(symbol || '').toUpperCase();
  const q = quote
    ? {
        last: quote.last,
        prev: quote.prev,
        chg: quote.chg,
        chgPct: quote.chgPct,
        ts: quote.ts,
      }
    : null;
  const n = Array.isArray(news)
    ? news.slice(0, 8).map((x) => ({
        time: x.time,
        source: x.source,
        headline: x.headline,
      }))
    : [];

  const system = [
    'You are a financial markets assistant inside a Bloomberg-like terminal demo.',
    'Give concise, neutral summaries. Do not give investment advice (no buy/sell). If data is insufficient, say so.',
    'Output plain text with short bullet points (no markdown headings).',
  ].join(' ');

  const user = [
    `Create a short market/risk summary for ${safeSymbol}.`,
    'Use ONLY the provided quote, headlines, and 6M stats. Do not hallucinate facts.',
    'If asked about "trustable to invest", respond with risk considerations and what additional info is needed (fundamentals, horizon, diversification).',
    '',
    `QUOTE: ${q ? JSON.stringify(q) : 'null'}`,
    `HEADLINES: ${JSON.stringify(n)}`,
    `HISTORY_6M_STATS: ${historyStats ? JSON.stringify(historyStats) : 'null'}`,
  ].join('\n');

  return callOpenAIChat({
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    temperature: 0.2,
  });
}

export async function aiChatAnswer({ symbol, quote, news, question, history = [] }) {
  const cfg = getOpenAIConfig();
  if (!cfg.enabled) return null;

  const safeSymbol = String(symbol || '').toUpperCase();
  const q = quote
    ? {
        last: quote.last,
        prev: quote.prev,
        chg: quote.chg,
        chgPct: quote.chgPct,
        ts: quote.ts,
      }
    : null;
  const n = Array.isArray(news)
    ? news.slice(0, 10).map((x) => ({
        time: x.time,
        source: x.source,
        headline: x.headline,
      }))
    : [];

  const system = [
    'You are a financial markets assistant inside a Bloomberg-like terminal demo.',
    'Answer the user’s question about the selected symbol using ONLY the provided quote + headlines.',
    'If the question requires info not present, say what’s missing and suggest what to ask next.',
    'Avoid investment advice. Be concise.',
  ].join(' ');

  const context = [
    `SYMBOL: ${safeSymbol}`,
    `QUOTE: ${q ? JSON.stringify(q) : 'null'}`,
    `HEADLINES: ${JSON.stringify(n)}`,
  ].join('\n');

  const trimmedHistory = Array.isArray(history) ? history.slice(-6) : [];
  const messages = [
    { role: 'system', content: system },
    { role: 'user', content: context },
    ...trimmedHistory
      .map((m) => ({
        role: m?.role === 'assistant' ? 'assistant' : 'user',
        content: String(m?.content || ''),
      }))
      .filter((m) => m.content.trim()),
    { role: 'user', content: String(question || '') },
  ];

  return callOpenAIChat({
    apiKey: cfg.apiKey,
    model: cfg.model,
    messages,
    temperature: 0.2,
  });
}

