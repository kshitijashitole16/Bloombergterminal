const WATCHLIST = [
  { symbol: 'AAPL', name: 'Apple', px: 173.22, chg: 1.14 },
  { symbol: 'MSFT', name: 'Microsoft', px: 413.84, chg: -2.38 },
  { symbol: 'NVDA', name: 'NVIDIA', px: 879.55, chg: 9.61 },
  { symbol: 'TSLA', name: 'Tesla', px: 188.17, chg: -1.06 },
  { symbol: 'AMZN', name: 'Amazon', px: 175.48, chg: 0.92 },
  { symbol: 'GOOGL', name: 'Alphabet', px: 145.21, chg: -0.44 },
  { symbol: 'META', name: 'Meta', px: 492.18, chg: 2.31 },
  { symbol: 'NFLX', name: 'Netflix', px: 608.73, chg: 4.12 },
  { symbol: 'AMD', name: 'AMD', px: 178.92, chg: -1.67 },
  { symbol: 'INTC', name: 'Intel', px: 44.15, chg: 0.31 },
  { symbol: 'JPM', name: 'JPMorgan', px: 186.64, chg: 0.56 },
  { symbol: 'BAC', name: 'Bank of America', px: 34.22, chg: -0.18 },
  { symbol: 'XOM', name: 'Exxon Mobil', px: 112.07, chg: 0.41 },
  { symbol: 'KO', name: 'Coca-Cola', px: 61.84, chg: -0.09 },
  { symbol: 'SPY', name: 'S&P 500 ETF', px: 506.71, chg: 0.88 },
  { symbol: 'QQQ', name: 'Nasdaq 100 ETF', px: 440.39, chg: 1.32 },
  { symbol: 'IWM', name: 'Russell 2000 ETF', px: 205.11, chg: 0.38 },
  { symbol: 'DIA', name: 'Dow ETF', px: 391.72, chg: -0.21 },
  { symbol: 'TLT', name: '20+ Year Treasury ETF', px: 93.44, chg: -0.33 },
  { symbol: 'GLD', name: 'Gold ETF', px: 197.66, chg: 0.27 }
];

const NEWS = [
  {
    time: '08:41',
    source: 'Markets',
    headline: 'Mega-cap tech leads premarket; yields steady ahead of data.'
  },
  {
    time: '09:12',
    source: 'FX',
    headline: 'Dollar mixed as traders weigh rate path and risk appetite.'
  },
  {
    time: '10:03',
    source: 'Energy',
    headline: 'Oil edges higher on inventory draw; OPEC+ compliance in focus.'
  },
  {
    time: '11:17',
    source: 'Rates',
    headline: 'Curve flattens slightly; front-end pricing shifts on speakers.'
  }
];

function makeSeries({ start = 450, points = 60, volatility = 0.5, drift = 0.04, seed = 0 }) {
  // deterministic-ish pseudo random based on seed
  let s = (seed || 1) % 2147483647;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;

  const out = [];
  let v = start;
  const now = Date.now();
  for (let i = points - 1; i >= 0; i -= 1) {
    const t = new Date(now - i * 60_000);
    v = Math.max(1, v + (rnd() - 0.5) * volatility + drift);
    out.push({
      t: t.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      px: Number(v.toFixed(2))
    });
  }
  return out;
}

function makeDailySeries({ start = 450, days = 180, volatility = 1.8, drift = 0.02, seed = 0 }) {
  let s = (seed || 1) % 2147483647;
  const rnd = () => (s = (s * 48271) % 2147483647) / 2147483647;

  const out = [];
  let v = start;
  const now = new Date();
  for (let i = days - 1; i >= 0; i -= 1) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    v = Math.max(1, v + (rnd() - 0.5) * volatility + drift);
    out.push({
      date: d.toISOString().slice(0, 10),
      close: Number(v.toFixed(2))
    });
  }
  return out;
}

export function getWatchlist() {
  return WATCHLIST;
}

export function isKnownSymbol(symbol) {
  return WATCHLIST.some((w) => w.symbol === symbol);
}

export function getQuote(symbol) {
  const s = String(symbol || '').toUpperCase();
  const row = WATCHLIST.find((w) => w.symbol === s);
  if (!row) return null;
  const last = row.px;
  const prev = row.px - row.chg;
  const chgPct = prev ? ((last - prev) / prev) * 100 : 0;
  return {
    symbol: row.symbol,
    name: row.name,
    last,
    prev,
    chg: Number((last - prev).toFixed(2)),
    chgPct: Number(chgPct.toFixed(2)),
    ts: Date.now()
  };
}

export function getChart(symbol, points = 90) {
  const s = String(symbol || '').toUpperCase();
  const q = getQuote(s);
  if (!q) return null;
  const base = q.prev || q.last;
  return makeSeries({
    start: base,
    points,
    volatility: Math.max(0.2, Math.abs(q.chg) * 0.4),
    drift: q.chg >= 0 ? 0.06 : -0.03,
    seed: s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0)
  });
}

export function getDailyHistory(symbol, months = 6) {
  const s = String(symbol || '').toUpperCase();
  const q = getQuote(s);
  if (!q) return null;
  const base = q.prev || q.last;
  const days = Math.max(20, Math.floor(Number(months || 6) * 30));
  return makeDailySeries({
    start: base,
    days,
    volatility: Math.max(0.6, Math.abs(q.chg) * 0.9),
    drift: q.chg >= 0 ? 0.08 : -0.04,
    seed: s.split('').reduce((acc, c) => acc + c.charCodeAt(0), 0) + 42
  });
}

export function getNews(symbol) {
  const s = String(symbol || '').toUpperCase();
  return NEWS.map((n) => ({ ...n, symbol: s || null }));
}

