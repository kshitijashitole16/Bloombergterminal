/**
 * Send OTP by email. Tries in order:
 * 1. Resend — RESEND_API_KEY (+ optional RESEND_FROM)
 * 2. SMTP — SMTP_HOST (+ SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM)
 *
 * If neither works or nothing is configured, returns { sent: false } (OTP still valid via devOtp / logs).
 */

async function sendViaResend(to, code) {
  const key = process.env.RESEND_API_KEY?.trim();
  if (!key) return null;

  const from = process.env.RESEND_FROM?.trim() || 'onboarding@resend.dev';
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from,
      to: [to],
      subject: 'Your Bloomberg Terminal login code',
      text: `Your one-time code is: ${code}\n\nIt expires in 10 minutes.`,
      html: `<p>Your one-time code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>It expires in 10 minutes.</p>`,
    }),
  });

  const raw = await res.text();
  if (!res.ok) {
    const err = new Error(raw || 'resend_failed');
    err.code = 'resend_failed';
    throw err;
  }
  return { sent: true, provider: 'resend' };
}

async function sendViaSmtp(to, code) {
  const host = process.env.SMTP_HOST?.trim();
  if (!host) return null;

  const nodemailer = await import('nodemailer');
  const port = Number(process.env.SMTP_PORT || 587);
  const secure = String(process.env.SMTP_SECURE || 'false') === 'true';
  const user = process.env.SMTP_USER || '';
  const pass = process.env.SMTP_PASS || '';
  const from = process.env.SMTP_FROM || user || 'noreply@localhost';

  const auth = user && pass ? { user, pass } : undefined;
  const transporter = nodemailer.createTransport({
    host,
    port,
    secure,
    auth,
  });

  await transporter.sendMail({
    from,
    to,
    subject: 'Your Bloomberg Terminal login code',
    text: `Your one-time code is: ${code}\n\nIt expires in 10 minutes. If you didn't request this, ignore this email.`,
    html: `<p>Your one-time code is:</p><p style="font-size:24px;font-weight:bold;letter-spacing:4px;">${code}</p><p>It expires in 10 minutes.</p>`,
  });

  return { sent: true, provider: 'smtp' };
}

export async function sendOtpEmail(to, code) {
  if (process.env.RESEND_API_KEY?.trim()) {
    try {
      const r = await sendViaResend(to, code);
      if (r?.sent) return r;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[OTP] Resend failed, trying SMTP if configured:', e?.message || e);
    }
  }

  if (process.env.SMTP_HOST?.trim()) {
    try {
      const r = await sendViaSmtp(to, code);
      if (r?.sent) return r;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.warn('[OTP] SMTP failed:', e?.message || e);
      throw e;
    }
  }

  return { sent: false, reason: 'no_mailer_config' };
}
