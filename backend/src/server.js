import express from 'express';
import cors from 'cors';
import http from 'http';
import WebSocket, { WebSocketServer } from 'ws';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';
import { getBearerToken, signToken, verifyToken } from './auth/jwt.js';
import { createUser, verifyEmailPassword } from './auth/users.js';
import { OAuth2Client } from 'google-auth-library';
import { aiChatAnswer, aiMarketSummary } from './ai/openai.js';
import { geminiChatAnswer, geminiMarketSummary } from './ai/gemini.js';
import {
  getChart as mockChart,
  getDailyHistory as mockDailyHistory,
  getNews as mockNews,
  getQuote as mockQuote,
  getWatchlist as mockWatchlist,
  isKnownSymbol,
} from './data/mock.js';
import {
  finnhubCandles,
  finnhubCompanyNews,
  finnhubConfig,
  finnhubDailyHistory,
  finnhubQuote,
} from './providers/finnhub.js';
import { createMockStreamer } from './realtime/mockStream.js';

const app = express();

// Always load backend/.env regardless of current working directory
dotenv.config({
  path: path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../.env'),
});
app.use(cors());
app.use(express.json());

const googleClientId = process.env.GOOGLE_CLIENT_ID || '';
const googleClient = googleClientId ? new OAuth2Client(googleClientId) : null;

app.get('/health', (_req, res) => res.json({ ok: true }));

app.post('/api/auth/login', (req, res) => {
  (async () => {
    const { email, password } = req.body || {};
    const user = await verifyEmailPassword(email, password);
    if (!user) return res.status(401).json({ error: 'invalid_credentials' });
    const token = signToken({ sub: user.id, email: user.email });
    return res.json({ token, user });
  })().catch(() => res.status(500).json({ error: 'server_error' }));
});

app.post('/api/auth/signup', (req, res) => {
  (async () => {
    const { email, password } = req.body || {};
    const user = await createUser({ email, password });
    return res.status(201).json({ user });
  })().catch((e) => {
    const code = e?.code || '';
    if (code === 'email_exists') return res.status(409).json({ error: 'email_exists' });
    if (code === 'invalid_email') return res.status(400).json({ error: 'invalid_email' });
    if (code === 'weak_password') return res.status(400).json({ error: 'weak_password' });
    if (code === 'missing_fields') return res.status(400).json({ error: 'missing_fields' });
    return res.status(500).json({ error: 'server_error' });
  });
});

app.post('/api/auth/google', (req, res) => {
  (async () => {
    if (!googleClient) return res.status(500).json({ error: 'google_not_configured' });
    const { idToken } = req.body || {};
    if (!idToken) return res.status(400).json({ error: 'missing_id_token' });

    const ticket = await googleClient.verifyIdToken({
      idToken: String(idToken),
      audience: googleClientId,
    });
    const payload = ticket.getPayload();
    if (!payload?.sub || !payload?.email) return res.status(401).json({ error: 'invalid_google_token' });

    const user = { id: `google:${payload.sub}`, email: payload.email };
    const token = signToken({ sub: user.id, email: user.email });
    return res.json({ token, user });
  })().catch(() => res.status(401).json({ error: 'invalid_google_token' }));
});

function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) return res.status(401).json({ error: 'missing_token' });
    req.user = verifyToken(token);
    return next();
  } catch {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

app.get('/api/auth/me', requireAuth, (req, res) => {
  res.json({ user: { id: req.user?.sub, email: req.user?.email } });
});

// Protect all data APIs
app.use('/api', (req, res, next) => {
  if (req.path.startsWith('/auth/')) return next();
  return requireAuth(req, res, next);
});

app.get('/api/watchlist', (req, res) => {
  (async () => {
    const base = mockWatchlist();
    const total = base.length;
    const limit = Math.min(50, Math.max(1, Number(req.query.limit || 10)));
    const offset = Math.max(0, Number(req.query.offset || 0));
    const slice = base.slice(offset, offset + limit);
    const nextOffset = offset + slice.length < total ? offset + slice.length : null;
    // If Finnhub is configured, enrich watchlist with live quotes.
    // Fallback to mock values on any error (rate limits, missing symbol, etc.).
    if (!fh.enabled)
      return res.json({ data: slice, source: 'mock', pagination: { total, limit, offset, nextOffset } });

    const concurrency = 4;
    const out = new Array(slice.length);
    let i = 0;

    async function worker() {
      while (i < slice.length) {
        const idx = i++;
        const row = slice[idx];
        try {
          const q = await finnhubQuote(row.symbol);
          if (q?.last != null) {
            out[idx] = {
              ...row,
              px: Number(q.last.toFixed(2)),
              chg: Number((q.chg ?? 0).toFixed(2)),
            };
          } else {
            out[idx] = row;
          }
        } catch {
          out[idx] = row;
        }
      }
    }

    await Promise.all(Array.from({ length: Math.min(concurrency, slice.length) }, () => worker()));
    res.json({ data: out, source: 'finnhub', pagination: { total, limit, offset, nextOffset } });
  })().catch(() => {
    const base = mockWatchlist();
    const total = base.length;
    const limit = 10;
    const offset = 0;
    const data = base.slice(0, limit);
    const nextOffset = data.length < total ? data.length : null;
    res.json({ data, source: 'mock', pagination: { total, limit, offset, nextOffset } });
  });
});

app.get('/api/quote/:symbol', (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  (async () => {
    try {
      const live = await finnhubQuote(symbol);
      const fallback = mockQuote(symbol) ?? {
        symbol,
        name: symbol,
        last: 0,
        prev: 0,
        chg: 0,
        chgPct: 0,
        ts: Date.now(),
      };
      res.json({ data: live ?? fallback, source: live ? 'finnhub' : 'mock' });
    } catch (_e) {
      res.json({ data: mockQuote(symbol), source: 'mock' });
    }
  })();
});

app.get('/api/chart/:symbol', (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  const points = Math.min(300, Math.max(10, Number(req.query.points || 90)));
  (async () => {
    try {
      const live = await finnhubCandles(symbol, points);
      const mock = mockChart(symbol, points) ?? [];
      res.json({ data: live?.length ? live : mock, source: live?.length ? 'finnhub' : 'mock' });
    } catch (_e) {
      res.json({ data: mockChart(symbol, points), source: 'mock' });
    }
  })();
});

app.get('/api/news/:symbol?', (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  (async () => {
    try {
      const live = symbol ? await finnhubCompanyNews(symbol) : null;
      res.json({ data: live?.length ? live : mockNews(symbol), source: live?.length ? 'finnhub' : 'mock' });
    } catch (_e) {
      res.json({ data: mockNews(symbol), source: 'mock' });
    }
  })();
});

app.get('/api/ai/summary/:symbol', (req, res) => {
  const symbol = String(req.params.symbol || '').toUpperCase();
  (async () => {
    // Build context from existing providers (all authed already via /api middleware)
    const quote = (await finnhubQuote(symbol).catch(() => null)) ?? mockQuote(symbol);
    const news = (await finnhubCompanyNews(symbol).catch(() => null)) ?? mockNews(symbol);
    const history =
      (await finnhubDailyHistory(symbol, { months: 6 }).catch(() => null)) ?? mockDailyHistory(symbol, 6);
    const historyStats = computeHistoryStats(history);

    let text = null;
    try {
      text =
        (await geminiMarketSummary({ symbol, quote, news, historyStats }).catch(() => null)) ??
        (await aiMarketSummary({ symbol, quote, news, historyStats }).catch(() => null));
    } catch (e) {
      const status = e?.status ? ` (OpenAI ${e.status})` : '';
      text = `AI request failed${status}. Check OPENAI_API_KEY/OPENAI_MODEL and restart backend.`;
    }
    if (!text) {
      text =
        `${symbol} is showing a ${(quote?.chg ?? 0) >= 0 ? 'positive' : 'negative'} move. ` +
        `Set GEMINI_API_KEY (AIza...) or OPENAI_API_KEY (sk-...) in backend/.env and restart the backend.`;
    }

    res.json({
      data: { symbol, text },
      source: text.includes('Set GEMINI_API_KEY') ? 'mock' : 'ai',
    });
  })().catch(() => res.status(500).json({ error: 'server_error' }));
});

function computeHistoryStats(history) {
  if (!Array.isArray(history) || history.length < 10) return null;
  const closes = history.map((p) => Number(p.close)).filter((x) => Number.isFinite(x));
  if (closes.length < 10) return null;

  const first = closes[0];
  const last = closes[closes.length - 1];
  const retPct = first ? ((last - first) / first) * 100 : null;

  const rets = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (!prev) continue;
    rets.push((cur - prev) / prev);
  }
  const mean = rets.reduce((a, b) => a + b, 0) / (rets.length || 1);
  const variance =
    rets.reduce((a, r) => a + (r - mean) * (r - mean), 0) / Math.max(1, rets.length - 1);
  const dailyVol = Math.sqrt(Math.max(0, variance));
  const annVol = dailyVol * Math.sqrt(252);

  let peak = closes[0];
  let maxDd = 0;
  for (const c of closes) {
    if (c > peak) peak = c;
    const dd = peak ? (c - peak) / peak : 0;
    if (dd < maxDd) maxDd = dd;
  }

  return {
    points: closes.length,
    start: Number(first.toFixed(2)),
    end: Number(last.toFixed(2)),
    returnPct: retPct == null ? null : Number(retPct.toFixed(2)),
    annVolPct: Number((annVol * 100).toFixed(2)),
    maxDrawdownPct: Number((maxDd * 100).toFixed(2)),
  };
}

app.post('/api/ai/chat', (req, res) => {
  (async () => {
    const { symbol, question, history } = req.body || {};
    const s = String(symbol || '').toUpperCase();
    const qText = String(question || '').trim();
    if (!s || !/^[A-Z.-]{1,10}$/.test(s)) return res.status(400).json({ error: 'invalid_symbol' });
    if (!qText) return res.status(400).json({ error: 'missing_question' });

    const quote = (await finnhubQuote(s).catch(() => null)) ?? mockQuote(s);
    const news = (await finnhubCompanyNews(s).catch(() => null)) ?? mockNews(s);

    let answer = null;
    try {
      answer =
        (await geminiChatAnswer({
          symbol: s,
          quote,
          news,
          question: qText,
          history: Array.isArray(history) ? history : [],
        }).catch(() => null)) ??
        (await aiChatAnswer({
          symbol: s,
          quote,
          news,
          question: qText,
          history: Array.isArray(history) ? history : [],
        }).catch(() => null));
    } catch (e) {
      const status = e?.status ? `AI ${e.status}` : 'AI error';
      answer = `${status}. Check GEMINI_API_KEY/OPENAI_API_KEY and restart backend.`;
    }
    if (!answer) {
      answer = `AI is not configured. Set GEMINI_API_KEY (AIza...) or OPENAI_API_KEY (sk-...) in backend/.env and restart the backend.`;
    }

    res.json({ data: { symbol: s, answer }, source: answer.includes('Set GEMINI_API_KEY') ? 'mock' : 'ai' });
  })().catch(() => res.status(500).json({ error: 'server_error' }));
});

const port = Number(process.env.PORT || 4000);

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

const fh = finnhubConfig();
let finnhubSocket = null;
const finnhubSubsCount = new Map(); // symbol -> count

const mockStreamer = createMockStreamer({
  onTick: (tick) => {
    const msg = JSON.stringify({ type: 'tick', ...tick });
    for (const ws of wss.clients) {
      if (ws.readyState !== WebSocket.OPEN) continue;
      if (ws._subs?.has(tick.symbol)) ws.send(msg);
    }
  },
  intervalMs: 900,
});

function ensureFinnhubSocket() {
  if (!fh.enabled) return null;
  if (finnhubSocket && finnhubSocket.readyState === WebSocket.OPEN) return finnhubSocket;
  finnhubSocket = new WebSocket(`${fh.wsBase}?token=${fh.token}`);

  finnhubSocket.on('message', (buf) => {
    let data;
    try {
      data = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    if (data?.type !== 'trade' || !Array.isArray(data.data)) return;
    for (const t of data.data) {
      const symbol = String(t.s || '').toUpperCase();
      const price = Number(t.p);
      const ts = Number(t.t);
      if (!symbol || !Number.isFinite(price) || !Number.isFinite(ts)) continue;
      const msg = JSON.stringify({ type: 'tick', symbol, price, ts });
      for (const ws of wss.clients) {
        if (ws.readyState !== WebSocket.OPEN) continue;
        if (ws._subs?.has(symbol)) ws.send(msg);
      }
    }
  });

  finnhubSocket.on('close', () => {
    finnhubSocket = null;
  });

  finnhubSocket.on('error', () => {
    // silent; fallback to mock streaming
  });

  return finnhubSocket;
}

async function fhSub(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (!fh.enabled) {
    mockStreamer.subscribe(s);
    return;
  }
  const c = finnhubSubsCount.get(s) ?? 0;
  finnhubSubsCount.set(s, c + 1);
  if (c > 0) return;

  try {
    const sock = ensureFinnhubSocket();
    sock?.send(JSON.stringify({ type: 'subscribe', symbol: s }));
  } catch {
    mockStreamer.subscribe(s);
  }
}

async function fhUnsub(symbol) {
  const s = String(symbol || '').toUpperCase();
  if (!fh.enabled) {
    mockStreamer.unsubscribe(s);
    return;
  }
  const c = finnhubSubsCount.get(s) ?? 0;
  const next = Math.max(0, c - 1);
  if (next === 0) finnhubSubsCount.delete(s);
  else finnhubSubsCount.set(s, next);
  if (c <= 1) {
    try {
      finnhubSocket?.send(JSON.stringify({ type: 'unsubscribe', symbol: s }));
    } catch {
      // ignore
    }
  }
}

wss.on('connection', (ws, req) => {
  ws._subs = new Set();

  // WS auth: token in query string (?token=...)
  try {
    const url = new URL(req?.url || '', 'http://localhost');
    const token = url.searchParams.get('token');
    if (!token) {
      ws.close(4401, 'missing_token');
      return;
    }
    ws._user = verifyToken(token);
  } catch {
    ws.close(4401, 'invalid_token');
    return;
  }

  ws.send(
    JSON.stringify({
      type: 'hello',
      provider: fh.enabled ? 'finnhub' : 'mock',
      serverTime: Date.now(),
    })
  );

  ws.on('message', async (buf) => {
    let msg;
    try {
      msg = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    const type = String(msg?.type || '');
    const symbol = String(msg?.symbol || '').toUpperCase();
    if (!symbol || !/^[A-Z.-]{1,10}$/.test(symbol)) return;

    if (type === 'subscribe') {
      if (ws._subs.has(symbol)) return;
      ws._subs.add(symbol);
      await fhSub(symbol);
      ws.send(JSON.stringify({ type: 'subscribed', symbol }));
    } else if (type === 'unsubscribe') {
      if (!ws._subs.has(symbol)) return;
      ws._subs.delete(symbol);
      await fhUnsub(symbol);
      ws.send(JSON.stringify({ type: 'unsubscribed', symbol }));
    }
  });

  ws.on('close', async () => {
    for (const s of ws._subs) await fhUnsub(s);
    ws._subs.clear();
  });
});

server.listen(port, () => {
  // eslint-disable-next-line no-console
  console.log(`Backend listening on http://localhost:${port}`);
  // eslint-disable-next-line no-console
  console.log(`WebSocket streaming at ws://localhost:${port}/ws`);
});

