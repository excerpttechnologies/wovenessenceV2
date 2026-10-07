import { NextResponse } from 'next/server';

/* Gates /admin/* behind a valid session cookie and bounces signed-in users
   away from /login. Verifies the same HMAC that lib/auth.js signs, using Web
   Crypto because middleware runs on the edge runtime (no node:crypto). */

const COOKIE = 'orbit_session';
const SECRET = process.env.AUTH_SECRET || 'orbit-dev-secret-change-me';

const toHex = (buf) =>
  Array.from(new Uint8Array(buf)).map((b) => b.toString(16).padStart(2, '0')).join('');

async function valid(token) {
  if (!token || !token.includes('.')) return false;
  const [body, mac] = token.split('.');
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(SECRET),
    { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']
  );
  const sig = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(body));
  if (toHex(sig) !== mac) return false;
  try {
    const json = JSON.parse(
      atob(body.replace(/-/g, '+').replace(/_/g, '/'))
    );
    return Boolean(json.exp && json.exp > Date.now());
  } catch {
    return false;
  }
}

export async function middleware(req) {
  const { pathname, search } = req.nextUrl;
  const ok = await valid(req.cookies.get(COOKIE)?.value);

  if (pathname.startsWith('/admin')) {
    if (ok) return NextResponse.next();
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.search = '?next=' + encodeURIComponent(pathname + search);
    return NextResponse.redirect(url);
  }

  if (pathname === '/login' && ok) {
    const url = req.nextUrl.clone();
    url.pathname = '/admin';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*', '/login'],
};
