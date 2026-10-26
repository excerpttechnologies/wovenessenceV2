/* Storefront attribution.

   The website tracker sends a source and medium when it can, and a referrer
   otherwise. This module turns those into one channel the analytics screens
   can group by, and it is deliberately conservative: an unknown referrer is
   "Referral", not "Google". A missing referrer is "Direct".

   It never stores a full referrer URL. `hostOf` reduces it to a hostname at
   write time, which keeps search terms and tokens out of the database. */

const SEARCH_HOSTS = /(^|\.)(google\.[a-z.]+|bing\.com|yahoo\.[a-z.]+|duckduckgo\.com|ecosia\.org|yandex\.[a-z.]+|baidu\.com|ask\.com)$/i;
const SOCIAL_HOSTS = /(^|\.)(instagram\.com|facebook\.com|fb\.com|m\.facebook\.com|t\.co|twitter\.com|x\.com|linkedin\.com|lnkd\.in|pinterest\.[a-z.]+|youtube\.com|youtu\.be|tiktok\.com|snapchat\.com|reddit\.com|threads\.net|whatsapp\.com|wa\.me|telegram\.me)$/i;
const EMAIL_HOSTS = /(^|\.)(mail\.google\.com|outlook\.live\.com|outlook\.office\.com|mail\.yahoo\.com|mailchimp\.com|klaviyo\.com|sendgrid\.net|hubspot\.com|zoho\.com)$/i;

const SEARCH_SOURCES = /google|bing|yahoo|duckduckgo|ecosia|yandex|baidu|ask\b/i;
const SOCIAL_SOURCES = /instagram|facebook|meta|tiktok|linkedin|twitter|^x$|pinterest|youtube|snapchat|reddit|threads|whatsapp|telegram/i;
const EMAIL_SOURCES = /newsletter|email|mailchimp|klaviyo|sendgrid|hubspot/i;

const clean = (value, max = 160) => String(value || '').trim().replace(/\s+/g, ' ').slice(0, max);

export function hostOf(value) {
  const raw = clean(value, 500);
  if (!raw) return '';
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(raw) ? raw : `https://${raw}`);
    return url.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

export function displaySource(source, host = '') {
  /* A referrer-only visit has no explicit source, so the hostname is the
     only evidence available. Inspect both, otherwise google.com would be
     shown verbatim instead of "Google". */
  const text = `${clean(source)} ${clean(host)}`.trim().toLowerCase();
  if (/google/.test(text)) return 'Google';
  if (/bing/.test(text)) return 'Bing';
  if (/yahoo/.test(text)) return 'Yahoo';
  if (/duckduckgo/.test(text)) return 'DuckDuckGo';
  if (/instagram/.test(text)) return 'Instagram';
  if (/facebook|meta/.test(text)) return 'Facebook';
  if (/whatsapp|wa\.me/.test(text)) return 'WhatsApp';
  if (/linkedin/.test(text)) return 'LinkedIn';
  if (/twitter|^x$/.test(text)) return 'X / Twitter';
  if (/youtube/.test(text)) return 'YouTube';
  if (/pinterest/.test(text)) return 'Pinterest';
  if (/tiktok/.test(text)) return 'TikTok';
  if (/newsletter|email/.test(text)) return 'Email';
  if (host) return host;
  return 'Direct';
}

export function classifyChannel({ source, medium, referrer, siteHost } = {}) {
  const s = clean(source).toLowerCase();
  const m = clean(medium).toLowerCase();
  const host = hostOf(referrer);
  const site = hostOf(siteHost);

  if (m === 'email' || EMAIL_SOURCES.test(s) || EMAIL_HOSTS.test(host)) return 'Email';
  if (m === 'social' || SOCIAL_SOURCES.test(s) || SOCIAL_HOSTS.test(host)) return 'Social';
  if (m === 'cpc' || m === 'paid' || m === 'ppc' || m === 'display') return 'Paid';
  if (m === 'organic' || SEARCH_SOURCES.test(s) || SEARCH_HOSTS.test(host)) return 'Search';

  /* attributionFrom() labels an untagged, referrer-less visit "Direct" as
     its source. That source must classify as Direct itself - otherwise the
     most common traffic on the site lands in Referral. */
  if (s === 'direct') return 'Direct';
  if (!host && !s) return 'Direct';

  /* A link from another page on the same site is not an acquisition source.
     Check it before falling through to Referral: attributionFrom() derives
     medium "referral" from the host itself. */
  if (site && (host === site || host.endsWith('.' + site))) return 'Direct';
  return 'Referral';
}

export function attributionFrom({
  referrer,
  source,
  medium,
  campaign,
  siteHost,
} = {}) {
  const rawHost = hostOf(referrer);
  const cleanSource = clean(source) || (rawHost ? displaySource('', rawHost) : 'Direct');
  const cleanMedium = clean(medium) || (rawHost ? 'referral' : 'none');
  const channel = classifyChannel({ source: cleanSource, medium: cleanMedium, referrer: rawHost, siteHost });
  /* A same-site referrer is navigation, not acquisition. Do not store the
     storefront's own host as a referrer, and do not call the internal page a
     traffic source; both would pollute the referrer and source reports. */
  const direct = channel === 'Direct';
  return {
    source: direct ? 'Direct' : cleanSource,
    medium: direct ? 'none' : cleanMedium,
    campaign: direct ? '' : clean(campaign),
    referrerHost: direct ? '' : rawHost,
    channel,
  };
}

export function utmFromSearchParams(input) {
  let params;
  try {
    params = input instanceof URLSearchParams ? input : new URLSearchParams(String(input || ''));
  } catch {
    params = new URLSearchParams();
  }
  const get = (key) => clean(params.get(key), 120);
  return {
    source: get('utm_source'),
    medium: get('utm_medium'),
    campaign: get('utm_campaign'),
    content: get('utm_content'),
    term: get('utm_term'),
  };
}

/* Used when an event was stored before a channel was resolved. */
export function channelForEvent(event = {}, siteHost = '') {
  const stored = clean(event.channel);
  if (stored) return stored;
  return classifyChannel({
    source: event.source,
    medium: event.medium,
    referrer: event.referrerHost || event.referrer,
    siteHost,
  });
}

export const TRAFFIC_CHANNELS = ['Direct', 'Search', 'Social', 'Email', 'Paid', 'Referral'];
