/**
 * Futures & options fair values from ~1y daily history:
 * - Annualized historical volatility (log returns, √252 scaling)
 * - Black–Scholes European call/put
 * - Cost-of-carry futures fair value F = S·e^((r−q)T)
 */

/** Standard normal CDF (Hart approximation). */
export function normCDF(x) {
  const t = 1 / (1 + 0.2316419 * Math.abs(x));
  const d = 0.3989423 * Math.exp(-0.5 * x * x);
  const p = d * t * (0.3193815 + t * (-0.3565638 + t * (1.781478 + t * (-1.821256 + t * 1.330274))));
  return x >= 0 ? 1 - p : p;
}

export function annualizedVolFromDailyCloses(closes) {
  if (!Array.isArray(closes) || closes.length < 10) return null;
  const rets = [];
  for (let i = 1; i < closes.length; i += 1) {
    const prev = closes[i - 1];
    const cur = closes[i];
    if (prev > 0 && cur > 0) rets.push(Math.log(cur / prev));
  }
  if (rets.length < 5) return null;
  const mean = rets.reduce((a, b) => a + b, 0) / rets.length;
  const variance = rets.reduce((a, r) => a + (r - mean) ** 2, 0) / Math.max(1, rets.length - 1);
  const dailyVol = Math.sqrt(Math.max(0, variance));
  return dailyVol * Math.sqrt(252);
}

export function blackScholesCall(S, K, T, r, sigma, q) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return { price: 0, d1: 0, d2: 0, delta: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discS = Math.exp(-q * T);
  const discK = Math.exp(-r * T);
  const price = S * discS * normCDF(d1) - K * discK * normCDF(d2);
  const delta = discS * normCDF(d1);
  return { price, d1, d2, delta };
}

export function blackScholesPut(S, K, T, r, sigma, q) {
  if (T <= 0 || sigma <= 0 || S <= 0 || K <= 0) return { price: 0, d1: 0, d2: 0, delta: 0 };
  const sqrtT = Math.sqrt(T);
  const d1 = (Math.log(S / K) + (r - q + 0.5 * sigma * sigma) * T) / (sigma * sqrtT);
  const d2 = d1 - sigma * sqrtT;
  const discS = Math.exp(-q * T);
  const discK = Math.exp(-r * T);
  const price = K * discK * normCDF(-d2) - S * discS * normCDF(-d1);
  const delta = discS * (normCDF(d1) - 1);
  return { price, d1, d2, delta };
}

export function futuresFairValue(S, T, r, q) {
  if (S <= 0 || T < 0) return 0;
  return S * Math.exp((r - q) * T);
}

/**
 * @param {Array<{ close: number }>} history - daily closes (e.g. last 12 months)
 * @param {number} spot - current underlying
 * @param {number} strike - option strike (or 0 → default 2% OTM)
 * @param {number} daysToExpiry
 * @param {number} r - risk-free (continuous), e.g. 0.05
 * @param {number} q - dividend yield (continuous)
 */
export function computeDerivativesPayload({ history, spot, strike, daysToExpiry, r, q }) {
  const closes = (history || []).map((p) => Number(p.close)).filter((x) => Number.isFinite(x));
  const sigmaHist = annualizedVolFromDailyCloses(closes);
  const sigma = sigmaHist ?? 0.25;
  const T = Math.max(1e-8, daysToExpiry / 365);
  const S = Number(spot);
  const K = strike > 0 ? Number(strike) : S * 1.02;

  const call = blackScholesCall(S, K, T, r, sigma, q);
  const put = blackScholesPut(S, K, T, r, sigma, q);
  const fut = futuresFairValue(S, T, r, q);

  return {
    spot: Number(S.toFixed(4)),
    strike: Number(K.toFixed(4)),
    daysToExpiry,
    timeYears: Number(T.toFixed(6)),
    riskFreeRate: r,
    dividendYield: q,
    historyPoints: closes.length,
    annualizedVolatility: sigmaHist != null ? Number(sigmaHist.toFixed(6)) : null,
    annualizedVolatilityUsed: Number(sigma.toFixed(6)),
    volatilitySource: sigmaHist != null ? 'historical_1y_log_returns' : 'fallback_25pct',
    futuresFairValue: Number(fut.toFixed(4)),
    blackScholesCall: Number(call.price.toFixed(4)),
    blackScholesPut: Number(put.price.toFixed(4)),
    callDelta: Number(call.delta.toFixed(4)),
    putDelta: Number(put.delta.toFixed(4)),
  };
}
