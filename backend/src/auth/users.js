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

