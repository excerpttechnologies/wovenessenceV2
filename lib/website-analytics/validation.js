/* Validation and normalisation for a storefront event.

   This is the boundary between an untrusted public request and the database.
   It rejects what it cannot understand, drops what consent or Do Not Track
   forbids, and rebuilds the event from allow-listed fields - it never spreads
   the request body into the document. */

import { isValidObjectId } from 'mongoose';
import { WEBSITE_EVENT_TYPES } from '@/models/WebsiteEvent';
import { attributionFrom } from '@/lib/dashboard/storefront';
import {
  clientIp,
  hashIp,
  isInternalHost,
  parseUserAgent,
  sanitiseHost,
  sanitiseMetadata,
  sanitisePath,
  scrubText,
} from './privacy';

const TYPES = new Set(WEBSITE_EVENT_TYPES);

function header(headers, name) {
  if (!headers) return '';
  if (typeof headers.get === 'function') return String(headers.get(name) || '');
  const key = Object.keys(headers).find((k) => k.toLowerCase() === name.toLowerCase());
  const value = key ? headers[key] : '';
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

const cleanId = (value, max = 100) => String(value || '').trim().replace(/[^A-Za-z0-9._:-]/g, '').slice(0, max);

const TRUE_WORDS = new Set(['true', '1', 'yes', 'granted', 'accept', 'accepted']);
const FALSE_WORDS = new Set(['false', '0', 'no', 'denied', 'decline', 'declined', 'reject', 'rejected']);

function consentValue(value) {
  if (value === true) return true;
  if (value === false) return false;
  const text = String(value ?? '').trim().toLowerCase();
  if (!text) return null;
  if (TRUE_WORDS.has(text)) return true;
  if (FALSE_WORDS.has(text)) return false;
  return null;
}

function objectIdOrNull(value) {
  return value && isValidObjectId(String(value)) ? String(value) : null;
}

function clampNumber(value, min, max, fallback = 0) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function skip(reason, message) {
  return { ok: false, skipped: reason, reason: message };
}

function fail(error) {
  return { ok: false, error };
}

/**
 * @returns {{ok:true,event:object}|{ok:false,error?:string,skipped?:string,reason?:string}}
 */
export function normaliseWebsiteEvent(body = {}, { headers = {}, now = new Date() } = {}) {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return fail('invalid_payload');

  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) return fail('invalid_clock');

  const type = String(body.type || 'pageview').trim().toLowerCase();
  if (!TYPES.has(type)) return fail('unknown_event_type');

  const ua = header(headers, 'user-agent');
  const parsedUa = parseUserAgent(ua);
  if (parsedUa.isBot) return skip('bot', 'Bot traffic is not recorded.');

  const dnt = body.dnt === true
    || header(headers, 'dnt') === '1'
    || header(headers, 'sec-gpc') === '1';
  if (dnt) return skip('dnt', 'Do Not Track is enabled.');

  const consent = consentValue(body.consent);
  if (consent === false) return skip('consent_denied', 'Analytics consent was declined.');
  if (consent !== true) {
    /* Missing consent is not consent. A deployment that may rely on another
       lawful basis can set WEBSITE_ANALYTICS_IMPLIED_CONSENT=true, but the
       default is to collect nothing until the visitor says yes. */
    if (String(process.env.WEBSITE_ANALYTICS_IMPLIED_CONSENT || '').toLowerCase() !== 'true') {
      return skip('consent_required', 'Analytics consent has not been granted.');
    }
  }

  const sessionId = cleanId(body.sessionId, 120);
  if (!sessionId) return fail('session_required');

  const visitorId = cleanId(body.visitorId, 120);
  const eventId = cleanId(body.eventId, 120) || undefined;

  const orderId = cleanId(body.orderId, 120);
  if (type === 'purchase' && !orderId) return fail('order_required');

  const rawOccurred = body.occurredAt ? new Date(body.occurredAt) : nowDate;
  const occurredAt = Number.isNaN(rawOccurred.getTime())
    ? nowDate
    : new Date(Math.min(nowDate.getTime() + 300000, Math.max(nowDate.getTime() - 7 * 86400000, rawOccurred.getTime())));

  const path = sanitisePath(body.path);
  const referrerHost = sanitiseHost(body.referrerHost || body.referrer);
  const source = scrubText(body.source || body.utmSource, 120);
  const medium = scrubText(body.medium || body.utmMedium, 120);
  const campaign = scrubText(body.campaign || body.utmCampaign, 120);
  const siteHost = sanitiseHost(process.env.WEBSITE_ANALYTICS_SITE_HOST)
    || sanitiseHost(header(headers, 'origin'));
  const attribution = attributionFrom({ referrer: referrerHost, source, medium, campaign, siteHost });

  const ip = clientIp(headers);
  const ipHash = hashIp(ip);
  const country = scrubText(
    body.country || header(headers, 'cf-ipcountry') || header(headers, 'x-vercel-ip-country'),
    2
  ).toUpperCase();

  const productId = cleanId(body.productId, 120);
  const productName = scrubText(body.productName || body.product, 160);
  const value = clampNumber(body.value, 0, 1e12, 0);
  const quantity = clampNumber(body.quantity, 0, 1e6, 0);
  const currency = String(body.currency || 'INR').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || 'INR';

  const event = {
    businessId: objectIdOrNull(body.businessId || body.business),
    locationId: objectIdOrNull(body.locationId || body.location),
    eventId,
    dedupeKey: type === 'purchase' && orderId
      ? `purchase:${orderId}`
      : (eventId ? `event:${eventId}` : undefined),
    type,
    name: scrubText(body.name, 80),
    path,
    title: scrubText(body.title, 160),
    referrerHost: attribution.referrerHost,
    source: attribution.source,
    medium: attribution.medium,
    campaign: attribution.campaign,
    channel: attribution.channel,
    sessionId,
    visitorId,
    deviceType: parsedUa.deviceType,
    browser: parsedUa.browser,
    os: parsedUa.os,
    country,
    productId,
    productName,
    orderId,
    value: Math.round(value * 100) / 100,
    currency,
    quantity: Math.round(quantity * 1000) / 1000,
    searchQuery: type === 'search' ? scrubText(body.query || body.searchQuery || body.term, 200) : '',
    consent: true,
    dnt: false,
    isBot: false,
    isInternal: isInternalHost(attribution.referrerHost) || isInternalHost(header(headers, 'origin')),
    ipHash,
    metadata: sanitiseMetadata(body.metadata),
    occurredAt,
    receivedAt: nowDate,
  };

  return { ok: true, event };
}
