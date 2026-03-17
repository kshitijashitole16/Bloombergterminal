function getGeminiConfig() {
  const apiKey = String(process.env.GEMINI_API_KEY || '').trim();
  const model = String(process.env.GEMINI_MODEL || 'gemini-1.5-flash').trim();
  const looksPlaceholder = /^PASTE_/i.test(apiKey) || apiKey.includes('YOUR_') || apiKey.length < 20;
  return {
    enabled: Boolean(apiKey) && !looksPlaceholder,
    apiKey,
    model,
  };
}

async function callGemini({ apiKey, model, contents, temperature = 0.2 }) {
  const url = new URL(
    `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`
  );
  url.searchParams.set('key', apiKey);

  const res = await fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents,
      generationConfig: { temperature },
    }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Gemini HTTP ${res.status}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }

  const json = await res.json();
  const text = json?.candidates?.[0]?.content?.parts?.map((p) => p?.text).filter(Boolean).join('');
  return typeof text === 'string' ? text : '';
}

export async function geminiMarketSummary({ symbol, quote, news, historyStats }) {
  const cfg = getGeminiConfig();
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

  const prompt = [
    'You are a financial markets assistant inside a Bloomberg-like terminal demo.',
    'Give concise, neutral summaries. Do not give investment advice (no buy/sell).',
    'Output plain text with short bullet points.',
    '',
    `Create a short market/risk summary for ${safeSymbol}.`,
    'Use ONLY the provided quote, headlines, and 6M stats. Do not hallucinate facts.',
    '',
    `QUOTE: ${q ? JSON.stringify(q) : 'null'}`,
    `HEADLINES: ${JSON.stringify(n)}`,
    `HISTORY_6M_STATS: ${historyStats ? JSON.stringify(historyStats) : 'null'}`,
  ].join('\n');

  return callGemini({
    apiKey: cfg.apiKey,
    model: cfg.model,
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    temperature: 0.2,
  });
}

export async function geminiChatAnswer({ symbol, quote, news, question, history = [] }) {
  const cfg = getGeminiConfig();
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

  const systemish = [
    'You are a financial markets assistant inside a Bloomberg-like terminal demo.',
    'Answer using ONLY the provided quote + headlines.',
    'If info is missing, say what’s missing. Avoid investment advice.',
  ].join(' ');

  const context = [
    `SYMBOL: ${safeSymbol}`,
    `QUOTE: ${q ? JSON.stringify(q) : 'null'}`,
    `HEADLINES: ${JSON.stringify(n)}`,
  ].join('\n');

  const trimmed = Array.isArray(history) ? history.slice(-6) : [];
  const contents = [
    { role: 'user', parts: [{ text: `${systemish}\n\n${context}` }] },
    ...trimmed.map((m) => ({
      role: m?.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: String(m?.content || '') }],
    })),
    { role: 'user', parts: [{ text: String(question || '') }] },
  ].filter((c) => String(c?.parts?.[0]?.text || '').trim());

  return callGemini({
    apiKey: cfg.apiKey,
    model: cfg.model,
    contents,
    temperature: 0.2,
  });
}

