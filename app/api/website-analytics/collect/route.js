import { apiError, json } from '@/lib/apiError';
import { recordWebsiteEvent } from '@/lib/website-analytics/collect';

/* /api/website-analytics/collect

   The one public, unauthenticated write endpoint in the project. It accepts
   a single storefront event and can be called from a page nobody has signed
   into, so it is deliberately narrow:

     - POST only, JSON only, 16 KB maximum body
     - an Origin that is the same site or on WEBSITE_ANALYTICS_ALLOWED_ORIGINS
     - consent checked before any database connection is opened
     - bot traffic, Do Not Track and declined consent are acknowledged but
       not stored
     - the event id and purchase order id are unique, so a sendBeacon retry
       cannot double-count

   It never returns anything about existing data: 202 for accepted, skipped
   or duplicate alike. That stops the endpoint being usable to probe whether
   an order id has been seen. */

const MAX_BODY_BYTES = 16 * 1024;

function allowedOrigins() {
  return String(process.env.WEBSITE_ANALYTICS_ALLOWED_ORIGINS || '')
    .split(',')
    .map((value) => value.trim().replace(/\/+$/, ''))
    .filter(Boolean);
}

function originOf(req) {
  return String(req.headers.get('origin') || '').trim().replace(/\/+$/, '');
}

function originAllowed(req) {
  const origin = originOf(req);
  if (!origin) return true;                    // server-side or same-origin form post
  try {
    if (origin === new URL(req.url).origin) return true;
  } catch { /* malformed request URL - fall through to the allow-list */ }
  if (allowedOrigins().includes(origin)) return true;
  return String(process.env.WEBSITE_ANALYTICS_ALLOW_ANY_ORIGIN || '').toLowerCase() === 'true';
}

function cors(req, res) {
  const origin = originOf(req);
  if (origin && originAllowed(req)) {
    res.headers.set('Access-Control-Allow-Origin', origin);
    res.headers.set('Vary', 'Origin');
  } else if (origin) {
    res.headers.set('Vary', 'Origin');
  }
  res.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  res.headers.set('Access-Control-Max-Age', '86400');
  res.headers.set('Cache-Control', 'no-store');
  return res;
}

export async function OPTIONS(req) {
  if (!originAllowed(req)) {
    return cors(req, json({ error: 'Origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403));
  }
  return cors(req, new Response(null, { status: 204 }));
}

export async function POST(req) {
  try {
    if (!originAllowed(req)) {
      return cors(req, json({ error: 'Origin is not allowed.', code: 'ORIGIN_NOT_ALLOWED' }, 403));
    }

    const type = String(req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
    if (type !== 'application/json' && type !== 'text/plain') {
      return cors(req, json({ error: 'Send application/json.', code: 'BAD_CONTENT_TYPE' }, 415));
    }

    const declared = Number(req.headers.get('content-length') || 0);
    if (declared > MAX_BODY_BYTES) {
      return cors(req, json({ error: 'Event payload is too large.', code: 'PAYLOAD_TOO_LARGE' }, 413));
    }

    const text = await req.text();
    if (Buffer.byteLength(text, 'utf8') > MAX_BODY_BYTES) {
      return cors(req, json({ error: 'Event payload is too large.', code: 'PAYLOAD_TOO_LARGE' }, 413));
    }

    let body;
    try {
      body = JSON.parse(text || '{}');
    } catch {
      return cors(req, json({ error: 'Malformed JSON.', code: 'BAD_JSON' }, 400));
    }

    const result = await recordWebsiteEvent({ body, headers: req.headers });

    if (result.status === 429) {
      const res = json(
        { ok: false, outcome: result.outcome, error: 'Too many events. Try again shortly.' },
        429,
      );
      res.headers.set('Retry-After', String(result.retryAfterSeconds || 60));
      return cors(req, res);
    }

    if (result.outcome === 'invalid') {
      return cors(req, json({ ok: false, outcome: result.outcome, error: result.error }, result.status));
    }

    /* accepted, skipped and duplicate are indistinguishable on purpose */
    return cors(req, json({ ok: true, outcome: result.outcome }, 202));
  } catch (err) {
    return cors(req, apiError(err));
  }
}
