import { getQuote } from '../data/mock.js';

export function createMockStreamer({ onTick, intervalMs = 1000 } = {}) {
  let timer = null;
  const subs = new Set();
  const lastBySymbol = new Map();

  function start() {
    if (timer) return;
    timer = setInterval(() => {
      for (const symbol of subs) {
        const base = getQuote(symbol);
        const baseLast = base?.last ?? 100 + (symbol.charCodeAt(0) % 25) * 3.7;
        const baseChg = base?.chg ?? (Math.random() - 0.5) * 2;

        const last = lastBySymbol.get(symbol) ?? baseLast;
        const next = Math.max(
          0.01,
          last + (Math.random() - 0.5) * Math.max(0.05, Math.abs(baseChg) * 0.06)
        );
        lastBySymbol.set(symbol, next);

        onTick?.({
          symbol,
          price: Number(next.toFixed(2)),
          ts: Date.now(),
        });
      }
    }, intervalMs);
  }

  function stop() {
    if (!timer) return;
    clearInterval(timer);
    timer = null;
  }

  function subscribe(symbol) {
    subs.add(String(symbol || '').toUpperCase());
    start();
  }

  function unsubscribe(symbol) {
    subs.delete(String(symbol || '').toUpperCase());
    if (subs.size === 0) stop();
  }

  function shutdown() {
    subs.clear();
    stop();
  }

  return { subscribe, unsubscribe, shutdown };
}

