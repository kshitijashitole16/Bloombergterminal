/** email (lowercase) -> { code, expiresAt } */
const store = new Map();

const OTP_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEND_COOLDOWN_MS = 60 * 1000; // 1 minute between sends per email

const lastSent = new Map();

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function isValidEmail(e) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e);
}

export function requestOtp(email) {
  const e = normalizeEmail(email);
  if (!e || !isValidEmail(e)) {
    const err = new Error('invalid_email');
    err.code = 'invalid_email';
    throw err;
  }

  const now = Date.now();
  const last = lastSent.get(e) ?? 0;
  if (now - last < RESEND_COOLDOWN_MS && store.has(e)) {
    const err = new Error('rate_limited');
    err.code = 'rate_limited';
    err.retryAfterSec = Math.ceil((RESEND_COOLDOWN_MS - (now - last)) / 1000);
    throw err;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  store.set(e, { code, expiresAt: now + OTP_TTL_MS });
  lastSent.set(e, now);

  // eslint-disable-next-line no-console
  console.log(`[OTP] ${e} → ${code} (expires in ${OTP_TTL_MS / 60000} min)`);

  return { code, email: e };
}

/**
 * @returns {true} verified | {false} wrong code | {null} missing/expired
 */
export function verifyOtpCode(email, otp) {
  const e = normalizeEmail(email);
  const row = store.get(e);
  if (!row) return null;
  if (Date.now() > row.expiresAt) {
    store.delete(e);
    return null;
  }
  if (String(otp).trim() !== row.code) return false;
  store.delete(e);
  return true;
}

export function peekDebugOtp(email) {
  const e = normalizeEmail(email);
  return store.get(e)?.code ?? null;
}
