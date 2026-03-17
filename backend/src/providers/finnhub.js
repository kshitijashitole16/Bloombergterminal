const FINNHUB_REST = 'https://finnhub.io/api/v1';
const FINNHUB_WS = 'wss://ws.finnhub.io';

function toISODate(d) {
  return d.toISOString().slice(0, 10);
}

export function finnhubConfig() {
  const token = process.env.FINNHUB_TOKEN;
  return {
    enabled: Boolean(token),
    token,
    restBase: FINNHUB_REST,
    wsBase: FINNHUB_WS,
  };
}

async function finnhubGet(path, token, params = {}) {
  const url = new URL(`${FINNHUB_REST}${path}`);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, String(v));
  url.searchParams.set('token', token);

  const res = await fetch(url.toString(), { headers: { Accept: 'application/json' } });
  if (!res.ok) {
    const text = await res.text().catch(() => '');
    const err = new Error(`Finnhub HTTP ${res.status}: ${path}`);
    err.status = res.status;
    err.body = text;
    throw err;
  }
  return res.json();
}

export async function finnhubQuote(symbol) {
  const { token, enabled } = finnhubConfig();
  if (!enabled) return null;
  const s = String(symbol || '').toUpperCase();
  const q = await finnhubGet('/quote', token, { symbol: s });
  // Finnhub returns: c(current), d(change), dp(percent), h, l, o, pc(prev close), t
  if (!q || typeof q.c !== 'number') return null;
  return {
    symbol: s,
    last: q.c,
    prev: q.pc,
    chg: q.d ?? (q.c - q.pc),
    chgPct: q.dp ?? (q.pc ? ((q.c - q.pc) / q.pc) * 100 : 0),
    ts: (q.t ?? Math.floor(Date.now() / 1000)) * 1000,
  };
}

export async function finnhubCandles(symbol, points = 90) {
  const { token, enabled } = finnhubConfig();
  if (!enabled) return null;
  const s = String(symbol || '').toUpperCase();

  // 1-minute candles over last ~points minutes
  const to = Math.floor(Date.now() / 1000);
  const from = to - points * 60;
  const c = await finnhubGet('/stock/candle', token, {
    symbol: s,
    resolution: 1,
    from,
    to,
  });

  if (!c || c.s !== 'ok' || !Array.isArray(c.c) || !Array.isArray(c.t)) return [];
  return c.t.map((ts, i) => {
    const d = new Date(ts * 1000);
    return {
      t: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      px: Number(c.c[i].toFixed(2)),
    };
  });
}

export async function finnhubCompanyNews(symbol) {
  const { token, enabled } = finnhubConfig();
  if (!enabled) return null;
  const s = String(symbol || '').toUpperCase();

  const to = new Date();
  const from = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
  const items = await finnhubGet('/company-news', token, {
    symbol: s,
    from: toISODate(from),
    to: toISODate(to),
  });

  if (!Array.isArray(items)) return [];
  return items.slice(0, 8).map((n) => {
    const d = new Date((n.datetime ?? Math.floor(Date.now() / 1000)) * 1000);
    return {
      time: d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      source: n.source || 'News',
      headline: n.headline || '',
      url: n.url || '',
    };
  });
}

