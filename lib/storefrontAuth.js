import { timingSafeEqual } from 'node:crypto';

/* STOREFRONT AUTH (12-11-2026)

   Server-to-server bearer auth for /api/v1/storefront/*. The ecommerce
   website keeps STOREFRONT_API_KEY on its server only - it is never sent to
   a browser. Comparison is constant-time. */

export const STOREFRONT_KEY_ENV = 'STOREFRONT_API_KEY';

export function storefrontKeyConfigured() {
  return Boolean(process.env[STOREFRONT_KEY_ENV]);
}

export function validStorefrontKey(req) {
  const expected = process.env[STOREFRONT_KEY_ENV] || '';
  const supplied = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}
