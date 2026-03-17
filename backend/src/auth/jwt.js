import jwt from 'jsonwebtoken';

function secret() {
  const s = process.env.AUTH_JWT_SECRET;
  if (!s) throw new Error('AUTH_JWT_SECRET is required');
  return s;
}

export function signToken(payload, { expiresIn = '7d' } = {}) {
  return jwt.sign(payload, secret(), { expiresIn });
}

export function verifyToken(token) {
  return jwt.verify(token, secret());
}

export function getBearerToken(req) {
  const h = req.headers.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  return m?.[1] || null;
}

