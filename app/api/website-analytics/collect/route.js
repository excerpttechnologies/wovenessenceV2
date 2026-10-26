import crypto from 'crypto';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import WebsiteEvent from '@/models/WebsiteEvent';

export const dynamic = 'force-dynamic';

/* ==========================================================================
   Public event ingestion for https://wovenessence.in.

   This endpoint is deliberately public: a browser on the storefront has no
   ERP session. It is therefore written to be cheap to reject:

     - only a fixed event vocabulary is accepted
     - every field is length-clamped, and the body is capped at 8 KB
     - timestamps must be within two days of now
     - a unique dedupe key makes a retried beacon a no-op
     - each IP is limited in memory and crawler user agents are dropped
     - no cookies, no IP storage, no query strings

   A purchase is only marked verified when its order reference exists in the
   orders collection. A browser claim can never create an order or change one.
   ========================================================================== */

const EVENTS = new Set([
  'page_view', 'session_start', 'product_list_view', 'product_view', 'search',
  'login_success', 'sign_up_success', 'add_to_cart', 'remove_from_cart', 'view_cart',
  'begin_checkout', 'add_shipping_info', 'add_payment_info', 'purchase', 'refund', 'logout',
]);

const SOURCES = new Set(['direct', 'organic', 'paid', 'instagram', 'facebook', 'referral', 'email', 'social', 'unknown']);
const DEVICES = new Set(['desktop', 'mobile', 'tablet', 'unknown']);
const PAGE_TYPES = new Set(['home', 'catalog', 'product', 'account', 'cart', 'checkout', 'other']);
const CONSENT = new Set(['granted', 'denied', 'unknown']);

const MAX_BODY_BYTES = 8192;
const RATE_LIMIT = 120;
const RATE_WINDOW_MS = 60_000;
const MAX_CLOCK_SKEW_MS = 48 * 60 * 60 * 1000;

const buckets = new Map();
let lastSweep = 0;

function allowedOrigin(origin) {
  if (!origin) return '';
  const configured = String(process.env.WEBSITE_ANALYTICS_ORIGINS
    || 'https://wovenessence.in,https://www.wovenessence.in,https://wovenessence.etpl.ai')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);
  return configured.includes(origin) ? origin : '';
}

function headers(origin) {
  const base = {
    'Cache-Control': 'no-store, max-age=0',
    Vary: 'Origin',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    /* navigator.sendBeacon always sends in credentials mode, so the preflight
       only passes when this is present next to an explicit origin. */
    'Access-Control-Allow-Credentials': 'true',
    'Access-Control-Max-Age': '86400',
  };
  if (origin) base['Access-Control-Allow-Origin'] = origin;
  return base;
}

function noContent(origin) {
  return new Response(null, { status: 204, headers: headers(origin) });
}

function tooMany(origin) {
  return Response.json({ error: 'Too many events.' }, { status: 429, headers: headers(origin) });
}

function rateLimited(ip) {
  const now = Date.now();
  if (now - lastSweep > RATE_WINDOW_MS * 5) {
    buckets.forEach((bucket, key) => {
      if (bucket.reset < now) buckets.delete(key);
    });
    lastSweep = now;
  }
  const bucket = buckets.get(ip);
  if (!bucket || bucket.reset < now) {
    buckets.set(ip, { count: 1, reset: now + RATE_WINDOW_MS });
    return false;
  }
  bucket.count += 1;
  return bucket.count > RATE_LIMIT;
}

function clean(value, max) {
  return String(value ?? '').slice(0, max);
}

function numberOrNull(value, max = 1e9) {
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= max ? n : null;
}

function identifier(value) {
  const text = String(value || '');
  return /^[A-Za-z0-9_-]{8,64}$/.test(text) ? text : '';
}

const BOT_RE = /bot|crawler|spider|crawl|headless|monitor|preview|slurp|bing|yandex|lighthouse/i;

export async function OPTIONS(req) {
  return new Response(null, { status: 204, headers: headers(allowedOrigin(req.headers.get('origin'))) });
}

export async function POST(req) {
  const origin = allowedOrigin(req.headers.get('origin'));
  const bodyText = await req.text();
  if (!bodyText || bodyText.length > MAX_BODY_BYTES) return noContent(origin);

  const userAgent = clean(req.headers.get('user-agent'), 300);
  if (!userAgent || BOT_RE.test(userAgent)) return noContent(origin);

  const ip = clean(
    req.headers.get('x-forwarded-for')?.split(',')[0]
    || req.headers.get('x-real-ip')
    || 'anonymous',
    80
  );
  if (rateLimited(ip)) return tooMany(origin);

  let payload;
  try {
    payload = JSON.parse(bodyText);
  } catch {
    return noContent(origin);
  }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return noContent(origin);

  const event = clean(payload.event, 40);
  if (!EVENTS.has(event)) return noContent(origin);

  const visitorId = identifier(payload.visitorId);
  if (!visitorId) return noContent(origin);

  const sessionId = identifier(payload.sessionId);
  const at = Number(payload.ts);
  const now = Date.now();
  if (!Number.isFinite(at) || at > now + MAX_CLOCK_SKEW_MS || at < now - MAX_CLOCK_SKEW_MS) return noContent(origin);

  const rawPath = String(payload.path || '');
  /* Pathname only: a reset token or an email address in a query string must
     never be stored. */
  const path = clean(rawPath.split('?')[0].split('#')[0], 512);
  if (path && !path.startsWith('/')) return noContent(origin);

  const pageType = PAGE_TYPES.has(payload.pageType) ? payload.pageType : 'other';
  const source = SOURCES.has(payload.source) ? payload.source : 'unknown';
  const device = DEVICES.has(payload.device) ? payload.device : 'unknown';
  const consent = CONSENT.has(payload.consent) ? payload.consent : 'unknown';
  if (consent === 'denied') return noContent(origin);

  const product = payload.product && typeof payload.product === 'object' ? {
    id: clean(payload.product.id, 64),
    itemCode: clean(payload.product.itemCode, 64),
    name: clean(payload.product.name, 200),
  } : { id: '', itemCode: '', name: '' };

  const orderId = clean(payload.orderId, 80);
  const customerId = clean(payload.customerId, 64);
  const campaign = payload.campaign && typeof payload.campaign === 'object' ? {
    source: clean(payload.campaign.source, 80),
    medium: clean(payload.campaign.medium, 80),
    name: clean(payload.campaign.name, 120),
  } : { source: '', medium: '', name: '' };

  const ts = new Date(at);
  const dedupeKey = crypto.createHash('sha1').update([
    visitorId, event, String(ts.getTime()), path, sessionId, product.id, orderId,
  ].join('|')).digest('hex');

  let verified = false;
  let value = numberOrNull(payload.value);

  try {
    await dbConnect();
    const db = mongoose.connection.db;

    /* Server-side confirmation of a purchase: the order must exist, and its
       own total wins over anything the browser reported.

       Two order shapes are in play. ERP sales orders use `orderNumber` and
       `amounts.grandTotal`; storefront orders are written with `orderNo` and
       `netAmount` (see the storefront's order repository). The storefront also
       keeps its own database, which on a shared cluster is a sibling of this
       one, so it is consulted when its name differs. A reference that matches
       neither stays unverified. */
    if (event === 'purchase' && orderId) {
      const storefrontDbName = String(process.env.STOREFRONT_DB_NAME || 'woven_essence_web').trim();
      const databases = [db];
      if (storefrontDbName && storefrontDbName !== db.databaseName) {
        databases.push(mongoose.connection.useDb(storefrontDbName, { useCache: true }));
      }
      for (const database of databases) {
        const order = await database.collection('orders').findOne(
          { $or: [{ orderNumber: orderId }, { orderNo: orderId }] },
          { projection: { 'amounts.grandTotal': 1, netAmount: 1, status: 1 } }
        );
        if (!order) continue;
        verified = true;
        const stored = Number(order?.amounts?.grandTotal ?? order?.netAmount);
        if (Number.isFinite(stored)) value = stored;
        break;
      }
    }

    await WebsiteEvent.updateOne(
      { dedupeKey },
      {
        $setOnInsert: {
          event, ts, visitorId, sessionId, path, pageType,
          source, referrer: clean(payload.referrer, 300), campaign,
          device,
          country: clean(payload.country, 64),
          state: clean(payload.state, 64),
          city: clean(payload.city, 64),
          product,
          orderId, verified, value,
          customerId, consent, schemaVersion: 1,
          dedupeKey,
        },
      },
      { upsert: true }
    );
  } catch (err) {
    /* Analytics must never fail a visitor's page load. A duplicate key from a
       retried beacon is expected; anything else is logged and swallowed. */
    if (err?.code !== 11000) console.error('[website-analytics/collect]', err?.message || err);
  }

  return noContent(origin);
}
