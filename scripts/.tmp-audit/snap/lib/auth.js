import crypto from 'crypto';

/* ==========================================================================
   Auth with zero dependencies - Node's built-in crypto only.
     password : scrypt with a per-user random salt, stored "salt:hash"
     session  : base64url(JSON payload) + "." + HMAC-SHA256, in an
                httpOnly cookie. Same scheme is verified in middleware.js
                using Web Crypto, so the edge runtime can check it too.
   ========================================================================== */

const SECRET = process.env.AUTH_SECRET || 'orbit-dev-secret-change-me';
export const COOKIE = 'orbit_session';
const MAX_AGE = 60 * 60 * 12; // 12 hours

export function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = crypto.scryptSync(String(password), salt, 64).toString('hex');
  return salt + ':' + hash;
}

export function verifyPassword(password, stored) {
  if (!stored || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const check = crypto.scryptSync(String(password), salt, 64).toString('hex');
  /* timingSafeEqual throws on length mismatch, so guard first */
  const a = Buffer.from(hash, 'hex');
  const b = Buffer.from(check, 'hex');
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

const b64url = (buf) => Buffer.from(buf).toString('base64url');

export function signSession(payload) {
  const body = b64url(JSON.stringify({ ...payload, exp: Date.now() + MAX_AGE * 1000 }));
  const mac = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  return body + '.' + mac;
}

export function readSession(token) {
  if (!token || !token.includes('.')) return null;
  const [body, mac] = token.split('.');
  const expect = crypto.createHmac('sha256', SECRET).update(body).digest('hex');
  if (mac.length !== expect.length) return null;
  if (!crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(expect))) return null;
  try {
    const data = JSON.parse(Buffer.from(body, 'base64url').toString());
    if (!data.exp || data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

export const cookieOptions = {
  httpOnly: true,
  sameSite: 'lax',
  path: '/',
  maxAge: MAX_AGE,
  secure: process.env.NODE_ENV === 'production',
};
