/* Privacy helpers for website analytics.

   The collection is not a web-server access log. It stores the smallest set
   of facts needed to answer traffic and conversion questions:

     - IP addresses are salted-hashed, never stored or logged
     - User-Agent strings are parsed and discarded
     - referral URLs become a hostname
     - page query strings are dropped
     - metadata is allow-listed by key and scrubbed for contact details

   A hash is still personal data under a broad reading of privacy law, which
   is why the salt must be set per deployment and the TTL keeps rows for no
   longer than 400 days. */

import { createHash } from 'node:crypto';
import { hostOf } from '@/lib/dashboard/storefront';

const EMAIL_RE = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi;
/* A run of plain digits is usually a product id, so only phone-shaped values
   (a leading +, or separated groups) are redacted. */
const PHONE_RE = /(?:\+\d[\d\s().-]{7,}\d|\b\d{3}[\s.-]\d{3}[\s.-]\d{4}\b)/g;
const CARD_RE = /\b(?:\d[ -]*?){13,19}\b/g;
const TOKEN_RE = /\b(?:bearer\s+)?[A-Za-z0-9_-]{32,}\b/g;

const CONTROL_RE = /[\u0000-\u001f\u007f]/g;

export function scrubText(value, max = 300) {
  return String(value ?? '')
    .replace(CONTROL_RE, ' ')
    .replace(EMAIL_RE, '[email]')
    .replace(CARD_RE, '[number]')
    .replace(PHONE_RE, '[phone]')
    .replace(TOKEN_RE, '[token]')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

/* A page path only. A full URL is reduced to its pathname; a query string is
   discarded so a reset token or an email address in `?email=` never lands in
   the collection. */
export function sanitisePath(value, max = 300) {
  let raw = String(value || '').trim();
  if (!raw) return '/';
  try {
    if (/^[a-z][a-z0-9+.-]*:\/\//i.test(raw)) {
      raw = new URL(raw).pathname || '/';
    }
  } catch {
    /* a malformed value is scrubbed as text below */
  }
  raw = raw.split('?')[0].split('#')[0];
  raw = scrubText(raw, max);
  if (!raw.startsWith('/')) raw = '/' + raw.replace(/^\/+/, '');
  return raw.replace(/\/{2,}/g, '/');
}

export function sanitiseHost(value) {
  const host = hostOf(value);
  if (!host) return '';
  return /^[a-z0-9.-]{1,253}$/i.test(host) ? host : '';
}

export function validHttpUrl(value) {
  try {
    const url = new URL(String(value));
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

const PII_KEY = /(e-?mail|phone|mobile|contact|name|address|password|token|secret|auth|card|ssn|pan|gst|dob|birth)/i;
const KEY_RE = /^[a-z0-9_.-]{1,40}$/i;

/* Only shallow, primitive metadata survives. A nested object is not walked:
   the tracker has no legitimate need to send one, and refusing it is safer
   than guessing what is inside. */
export function sanitiseMetadata(value, maxKeys = 20) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out = {};
  let count = 0;
  for (const [key, raw] of Object.entries(value)) {
    if (count >= maxKeys) break;
    if (!KEY_RE.test(key) || PII_KEY.test(key)) continue;
    if (raw === null || typeof raw === 'boolean') {
      out[key] = raw;
      count += 1;
      continue;
    }
    if (typeof raw === 'number') {
      if (Number.isFinite(raw)) {
        out[key] = raw;
        count += 1;
      }
      continue;
    }
    if (typeof raw === 'string') {
      out[key] = scrubText(raw, 400);
      count += 1;
      continue;
    }
    if (Array.isArray(raw)) {
      const list = raw
        .filter((item) => ['string', 'number', 'boolean'].includes(typeof item))
        .slice(0, 10)
        .map((item) => (typeof item === 'string' ? scrubText(item, 120) : item));
      out[key] = list;
      count += 1;
    }
  }
  return out;
}

export function clientIp(headers = {}) {
  const get = (name) => {
    if (typeof headers?.get === 'function') return headers.get(name);
    const found = Object.keys(headers || {}).find((key) => key.toLowerCase() === name.toLowerCase());
    const value = found ? headers[found] : '';
    return Array.isArray(value) ? value[0] : value;
  };
  const forwarded = String(get('x-forwarded-for') || '').split(',')[0].trim();
  return forwarded
    || String(get('cf-connecting-ip') || '').trim()
    || String(get('x-real-ip') || '').trim()
    || '';
}

export function hashIp(ip, salt = process.env.WEBSITE_ANALYTICS_HASH_SALT || process.env.AUTH_SECRET || 'we-analytics-dev-salt') {
  if (!ip) return '';
  return createHash('sha256')
    .update(`${salt}|${ip}`)
    .digest('hex')
    .slice(0, 40);
}

const BOT_RE = /bot|crawler|spider|slurp|bingpreview|facebookexternalhit|whatsapp|telegrambot|headlesschrome|phantomjs|lighthouse|pagespeed|curl|wget|python-requests|axios|node-fetch|go-http-client/i;

export function isBotUserAgent(ua) {
  const text = String(ua || '');
  return !text || BOT_RE.test(text);
}

export function parseUserAgent(ua) {
  const text = String(ua || '');
  const browser = /edg\//i.test(text) ? 'Edge'
    : /opr\//i.test(text) ? 'Opera'
    : /chrome\//i.test(text) ? 'Chrome'
    : /safari\//i.test(text) && /version\//i.test(text) ? 'Safari'
    : /firefox\//i.test(text) ? 'Firefox'
    : /msie|trident/i.test(text) ? 'Internet Explorer'
    : 'Other';

  const os = /windows/i.test(text) ? 'Windows'
    : /android/i.test(text) ? 'Android'
    : /iphone|ipad|ipod/i.test(text) ? 'iOS'
    : /mac os x/i.test(text) ? 'macOS'
    : /linux/i.test(text) ? 'Linux'
    : 'Other';

  const deviceType = /ipad|tablet/i.test(text) ? 'tablet'
    : /mobile|iphone|ipod/i.test(text) ? 'mobile'
    : 'desktop';

  return { browser, os, deviceType, isBot: isBotUserAgent(text) };
}

export function internalHosts() {
  return String(process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS || '')
    .split(',')
    .map((host) => sanitiseHost(host))
    .filter(Boolean);
}

export function isInternalHost(host) {
  const clean = sanitiseHost(host);
  if (!clean) return false;
  return internalHosts().some((internal) => clean === internal || clean.endsWith('.' + internal));
}
