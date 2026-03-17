import bcrypt from 'bcryptjs';

function demoUserFromEnv() {
  const email = (process.env.AUTH_DEMO_EMAIL || '').trim().toLowerCase();
  const password = process.env.AUTH_DEMO_PASSWORD || '';
  if (!email || !password) return null;
  return { id: 'demo-user', email, password };
}

let cached = null;

export async function getUsers() {
  if (cached) return cached;
  const demo = demoUserFromEnv();
  if (!demo) {
    cached = [];
    return cached;
  }
  const passwordHash = await bcrypt.hash(demo.password, 10);
  cached = [{ id: demo.id, email: demo.email, passwordHash }];
  return cached;
}

export async function createUser({ email, password }) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  if (!e || !p) {
    const err = new Error('missing_fields');
    err.code = 'missing_fields';
    throw err;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
    const err = new Error('invalid_email');
    err.code = 'invalid_email';
    throw err;
  }
  if (p.length < 4) {
    const err = new Error('weak_password');
    err.code = 'weak_password';
    throw err;
  }

  const users = await getUsers();
  if (users.some((u) => u.email === e)) {
    const err = new Error('email_exists');
    err.code = 'email_exists';
    throw err;
  }

  const passwordHash = await bcrypt.hash(p, 10);
  const id = `user:${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;
  const record = { id, email: e, passwordHash };
  users.push(record);
  return { id: record.id, email: record.email };
}

export async function verifyEmailPassword(email, password) {
  const e = String(email || '').trim().toLowerCase();
  const p = String(password || '');
  const users = await getUsers();
  const u = users.find((x) => x.email === e);
  if (!u) return null;
  const ok = await bcrypt.compare(p, u.passwordHash);
  if (!ok) return null;
  return { id: u.id, email: u.email };
}

