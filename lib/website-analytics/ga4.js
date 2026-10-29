import crypto from 'crypto';
import {
  comparisonRange,
  diffDays,
  eachDay,
  formatDate,
  formatDateRange,
  isDateString,
  monthLabel,
  todayInIndia,
} from '@/lib/dashboard/date';

/* ==========================================================================
   Google Analytics 4 — server-side Data API client.

   This module is the only place that reads GA4. It:

     - authenticates with a service account entirely on the server
     - validates every dimension and metric before it reaches Google
     - caches reports and de-duplicates concurrent identical requests
     - returns an explicit unavailable state instead of inventing a zero
     - never returns credentials, access tokens or raw Google errors to the
       browser

   Configuration is read from environment variables. When it is absent the
   dashboard still works from the ERP/storefront collections and says plainly
   that GA4 is not configured.
   ========================================================================== */

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const DATA_API = 'https://analyticsdata.googleapis.com/v1beta';
const ADMIN_API = 'https://analyticsadmin.googleapis.com/v1beta';
const GA4_SCOPE = 'https://www.googleapis.com/auth/analytics.readonly';
const DEFAULT_SITE = 'https://ecom.wovenessence.in/';
const DEFAULT_TZ = 'Asia/Kolkata';
const DEFAULT_CURRENCY = 'INR';

const DEFAULT_CACHE_SECONDS = 300;
const DEFAULT_REALTIME_SECONDS = 60;
const DEFAULT_STALE_SECONDS = 24 * 60 * 60;
const REQUEST_TIMEOUT_MS = 20_000;

/* --------------------------------------------------------------- errors -- */

export class Ga4Error extends Error {
  constructor(code, message, { status = 502, retryable = false, cause = null } = {}) {
    super(message);
    this.name = 'Ga4Error';
    this.code = code;
    this.status = status;
    this.retryable = retryable;
    this.cause = cause;
  }
}

const ERROR_MESSAGES = {
  GA4_NOT_CONFIGURED: 'Google Analytics 4 is not configured on this server.',
  GA4_INVALID_CREDENTIALS: 'The Google Analytics service-account credentials are invalid.',
  GA4_AUTH_FAILED: 'Google Analytics authentication failed. Check the service-account credentials.',
  GA4_PERMISSION_DENIED: 'The service account cannot read this GA4 property. Grant it Viewer access in GA4 Admin → Property access management.',
  GA4_PROPERTY_NOT_FOUND: 'The configured GA4 property was not found.',
  GA4_QUOTA_EXCEEDED: 'The Google Analytics API quota has been reached. Cached data is shown where available.',
  GA4_API_UNAVAILABLE: 'Google Analytics is temporarily unavailable.',
  GA4_INVALID_REQUEST: 'Google Analytics rejected the configured report request.',
  GA4_REPORT_FAILED: 'The Google Analytics report could not be read.',
  GA4_UNAVAILABLE: 'Google Analytics data is not available for this view.',
};

function ga4Error(code, extra = {}) {
  return new Ga4Error(code, ERROR_MESSAGES[code] || ERROR_MESSAGES.GA4_REPORT_FAILED, extra);
}

export function publicGa4Error(error) {
  if (error instanceof Ga4Error) {
    return {
      code: error.code,
      message: error.message,
      retryable: Boolean(error.retryable),
    };
  }
  return {
    code: 'GA4_REPORT_FAILED',
    message: ERROR_MESSAGES.GA4_REPORT_FAILED,
    retryable: false,
  };
}

/* Maps a Google HTTP failure to a stable, non-secret error code. The raw
   Google message can mention internal identifiers, so it is classified here
   and not returned to the operator. */
export function ga4ErrorFromResponse(status, body = null) {
  const message = String(body?.error?.message || body?.error_description || '').toLowerCase();
  if (status === 401) return ga4Error('GA4_AUTH_FAILED', { status: 401 });
  if (status === 403) return ga4Error('GA4_PERMISSION_DENIED', { status: 403 });
  if (status === 404) return ga4Error('GA4_PROPERTY_NOT_FOUND', { status: 404 });
  if (status === 429) return ga4Error('GA4_QUOTA_EXCEEDED', { status: 429, retryable: true });
  if (status >= 500) return ga4Error('GA4_API_UNAVAILABLE', { status, retryable: true });
  if (status === 400) {
    if (/invalid_grant|invalid_client|unauthorized_client|invalid jwt|jwt/.test(message)) {
      return ga4Error('GA4_INVALID_CREDENTIALS', { status: 400 });
    }
    if (/permission|access|not found|does not exist|unknown property|invalid argument/.test(message)) {
      return ga4Error('GA4_PERMISSION_DENIED', { status: 400 });
    }
    return ga4Error('GA4_INVALID_REQUEST', { status: 400 });
  }
  return ga4Error('GA4_REPORT_FAILED', { status });
}

/* --------------------------------------------------------------- config -- */

let configCache = null;
let configCachedAt = 0;

function positiveNumber(value, fallback) {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

function parseCredentialsJson(raw) {
  let text = String(raw || '').trim();
  if (!text) return { credentials: null, error: '' };
  try {
    if (!text.startsWith('{')) {
      text = Buffer.from(text, 'base64').toString('utf8');
    }
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== 'object') {
      return { credentials: null, error: 'GA4_CREDENTIALS_JSON is not a service-account object.' };
    }
    return { credentials: parsed, error: '' };
  } catch {
    return { credentials: null, error: 'GA4_CREDENTIALS_JSON is not valid JSON or base64 JSON.' };
  }
}

function normalisePrivateKey(value) {
  const key = String(value || '').replace(/\\n/g, '\n').trim();
  return key.includes('BEGIN PRIVATE KEY') ? key : '';
}

function normaliseMeasurementId(value) {
  const id = String(value || '').trim();
  return /^G-[A-Z0-9]{4,}$/i.test(id) ? id.toUpperCase() : '';
}

/**
 * Read GA4 configuration. The returned object contains the private key and is
 * therefore server-only; never send it to a route response.
 */
export function getGa4Config({ fresh = false } = {}) {
  const now = Date.now();
  if (!fresh && configCache && now - configCachedAt < 60_000) return configCache;

  const missing = [];
  const notes = [];
  let credentialError = '';

  const rawProperty = String(process.env.GA4_PROPERTY_ID || '').trim().replace(/^properties\//i, '');
  const propertyId = /^\d{5,20}$/.test(rawProperty) ? rawProperty : '';
  if (!propertyId) missing.push('GA4_PROPERTY_ID');

  const measurementId = normaliseMeasurementId(process.env.GA4_MEASUREMENT_ID);
  if (process.env.GA4_MEASUREMENT_ID && !measurementId) {
    notes.push('GA4_MEASUREMENT_ID is present but is not a valid G- measurement ID.');
  }

  const fromJson = parseCredentialsJson(process.env.GA4_CREDENTIALS_JSON);
  let clientEmail = '';
  let privateKey = '';

  if (fromJson.credentials) {
    clientEmail = String(fromJson.credentials.client_email || '').trim();
    privateKey = normalisePrivateKey(fromJson.credentials.private_key);
    if (fromJson.credentials.type && fromJson.credentials.type !== 'service_account') {
      credentialError = 'GA4_CREDENTIALS_JSON is not a service_account key.';
    }
  } else if (fromJson.error) {
    credentialError = fromJson.error;
  }

  if (!clientEmail) clientEmail = String(process.env.GA4_CLIENT_EMAIL || '').trim();
  if (!privateKey) privateKey = normalisePrivateKey(process.env.GA4_PRIVATE_KEY);

  if (!clientEmail) missing.push('GA4_CREDENTIALS_JSON or GA4_CLIENT_EMAIL');
  if (!privateKey) missing.push('GA4_CREDENTIALS_JSON or GA4_PRIVATE_KEY');
  if (credentialError) notes.push(credentialError);

  const configured = missing.length === 0 && Boolean(clientEmail && privateKey);

  const cacheSeconds = positiveNumber(process.env.GA4_CACHE_TTL_SECONDS, DEFAULT_CACHE_SECONDS);
  const realtimeSeconds = positiveNumber(process.env.GA4_REALTIME_CACHE_TTL_SECONDS, DEFAULT_REALTIME_SECONDS);
  const staleSeconds = positiveNumber(process.env.GA4_STALE_MAX_SECONDS, DEFAULT_STALE_SECONDS);

  const config = {
    configured,
    propertyId,
    measurementId,
    siteUrl: String(process.env.GA4_WEBSITE_URL || DEFAULT_SITE).trim() || DEFAULT_SITE,
    timezone: String(process.env.GA4_TIMEZONE || DEFAULT_TZ).trim() || DEFAULT_TZ,
    currency: String(process.env.GA4_CURRENCY || DEFAULT_CURRENCY).trim() || DEFAULT_CURRENCY,
    clientEmail,
    privateKey,
    tagEnabled: String(process.env.GA4_TRACKING_ENABLED || 'true').toLowerCase() !== 'false',
    missing: [...new Set(missing)],
    notes,
    credentialError,
    cacheTtlMs: Math.min(3600, Math.max(30, cacheSeconds)) * 1000,
    realtimeCacheTtlMs: Math.min(300, Math.max(30, realtimeSeconds)) * 1000,
    staleMaxMs: Math.min(7 * 24 * 60 * 60, Math.max(60, staleSeconds)) * 1000,
  };

  configCache = config;
  configCachedAt = now;
  return config;
}

export function resetGa4Caches() {
  configCache = null;
  configCachedAt = 0;
  reportCache.clear();
  inFlight.clear();
  realtimeCache.clear();
  realtimeInFlight.clear();
  tokenCache = { key: '', token: '', expiresAt: 0 };
  tokenInFlight = null;
  propertyCache.clear();
  lastError = null;
}

/**
 * Safe configuration summary for API responses. Contains no secret.
 */
export function ga4ConfigSummary() {
  const config = getGa4Config();
  return {
    configured: config.configured,
    status: config.configured ? 'configured' : 'not_configured',
    propertyId: config.propertyId || null,
    measurementId: config.measurementId || null,
    websiteUrl: config.siteUrl,
    timezone: config.timezone,
    currency: config.currency,
    missing: config.missing,
    notes: config.notes,
    message: config.configured
      ? 'GA4 Data API credentials are configured. Connection is verified when the first report is read.'
      : 'GA4 is not configured. Set GA4_PROPERTY_ID and a service-account credential in the server environment.',
    cache: {
      standardSeconds: Math.round(config.cacheTtlMs / 1000),
      realtimeSeconds: Math.round(config.realtimeCacheTtlMs / 1000),
    },
  };
}

/**
 * Public tag configuration used by the storefront script. A measurement ID is
 * public by design; the property ID, service account and private key are not.
 */
export function ga4PublicConfig() {
  const config = getGa4Config();
  return {
    enabled: Boolean(config.tagEnabled && config.measurementId),
    measurementId: config.measurementId || null,
    websiteUrl: config.siteUrl,
    timezone: config.timezone,
    currency: config.currency,
    consentDefault: String(process.env.GA4_CONSENT_DEFAULT || 'granted').toLowerCase() === 'denied'
      ? 'denied'
      : 'granted',
  };
}

/* ---------------------------------------------------------------- token -- */

let tokenCache = { key: '', token: '', expiresAt: 0 };
let tokenInFlight = null;

function base64url(value) {
  return Buffer.from(value).toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function credentialsFingerprint(config) {
  return crypto.createHash('sha256')
    .update(`${config.clientEmail}\n${config.privateKey}`)
    .digest('hex')
    .slice(0, 16);
}

export function signServiceAccountAssertion({ clientEmail, privateKey }, now = Math.floor(Date.now() / 1000)) {
  if (!clientEmail || !privateKey) {
    throw ga4Error('GA4_INVALID_CREDENTIALS', { status: 401 });
  }
  const header = base64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const payload = base64url(JSON.stringify({
    iss: clientEmail,
    scope: GA4_SCOPE,
    aud: TOKEN_URL,
    iat: now,
    exp: now + 3600,
  }));
  const input = `${header}.${payload}`;
  let signature;
  try {
    signature = crypto.sign('RSA-SHA256', Buffer.from(input), privateKey).toString('base64')
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
  } catch {
    throw ga4Error('GA4_INVALID_CREDENTIALS', { status: 401 });
  }
  return `${input}.${signature}`;
}

async function fetchJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const response = await fetch(url, { ...options, signal: controller.signal });
    const text = await response.text();
    let body = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {
      body = null;
    }
    if (!response.ok) {
      throw ga4ErrorFromResponse(response.status, body);
    }
    return body;
  } catch (error) {
    if (error instanceof Ga4Error) throw error;
    if (error?.name === 'AbortError') {
      throw ga4Error('GA4_API_UNAVAILABLE', { retryable: true });
    }
    throw ga4Error('GA4_API_UNAVAILABLE', { retryable: true, cause: error });
  } finally {
    clearTimeout(timer);
  }
}

async function getAccessToken(config, { force = false } = {}) {
  const key = credentialsFingerprint(config);
  const now = Date.now();
  if (!force && tokenCache.key === key && tokenCache.token && tokenCache.expiresAt > now + 60_000) {
    return tokenCache.token;
  }
  if (!force && tokenInFlight?.key === key) return tokenInFlight.promise;

  const promise = (async () => {
    const assertion = signServiceAccountAssertion(config);
    const body = new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion,
    });
    let json;
    try {
      json = await fetchJson(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: body.toString(),
        cache: 'no-store',
      });
    } catch (error) {
      if (error instanceof Ga4Error && error.code === 'GA4_INVALID_REQUEST') {
        throw ga4Error('GA4_INVALID_CREDENTIALS', { status: 401 });
      }
      throw error;
    }
    const token = String(json?.access_token || '');
    if (!token) throw ga4Error('GA4_AUTH_FAILED', { status: 401 });
    const expiresIn = Number(json?.expires_in);
    tokenCache = {
      key,
      token,
      expiresAt: Date.now() + (Number.isFinite(expiresIn) ? expiresIn : 3600) * 1000,
    };
    return token;
  })();

  tokenInFlight = { key, promise };
  try {
    return await promise;
  } finally {
    if (tokenInFlight?.promise === promise) tokenInFlight = null;
  }
}

async function authorisedFetch(url, config, options = {}) {
  let token = await getAccessToken(config);
  const request = (bearer) => fetchJson(url, {
    ...options,
    headers: {
      ...(options.headers || {}),
      Authorization: `Bearer ${bearer}`,
    },
    cache: 'no-store',
  });
  try {
    return await request(token);
  } catch (error) {
    if (error instanceof Ga4Error && error.code === 'GA4_AUTH_FAILED') {
      token = await getAccessToken(config, { force: true });
      return request(token);
    }
    throw error;
  }
}

/* ----------------------------------------------------- request validation -- */

/* Only these names are ever sent to Google. A caller cannot turn this route
   into a generic proxy by editing a query string. */
export const ALLOWED_DIMENSIONS = new Set([
  'date', 'isoYearIsoWeek', 'yearMonth', 'newVsReturning', 'eventName',
  'sessionDefaultChannelGroup', 'sessionSource', 'sessionMedium', 'sessionCampaignName',
  'country', 'region', 'city', 'deviceCategory',
  'pagePath',
  'itemName', 'itemId', 'itemCategory',
]);

export const ALLOWED_METRICS = new Set([
  'totalUsers', 'activeUsers', 'newUsers', 'sessions', 'screenPageViews',
  'engagedSessions', 'engagementRate', 'averageSessionDuration', 'userEngagementDuration',
  'eventCount', 'transactions', 'purchaseRevenue', 'totalRevenue',
  'itemsViewed', 'itemsAddedToCart', 'itemsCheckedOut', 'itemsPurchased', 'itemRevenue',
]);

export function buildGa4ReportRequest({
  dimensions = [],
  metrics = [],
  startDate,
  endDate,
  dimensionFilter = null,
  orderBys = [],
  limit = 100,
  keepEmptyRows = false,
} = {}) {
  if (!isDateString(startDate) || !isDateString(endDate)) {
    throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  }
  if (startDate > endDate) {
    throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  }
  const invalidDimension = dimensions.find((name) => !ALLOWED_DIMENSIONS.has(name));
  if (invalidDimension) throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  const invalidMetric = metrics.find((name) => !ALLOWED_METRICS.has(name));
  if (invalidMetric) throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  if (!metrics.length) throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });

  const safeLimit = Math.min(10_000, Math.max(1, Number(limit) || 100));

  return {
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dateRanges: [{ startDate, endDate }],
    ...(dimensionFilter ? { dimensionFilter } : {}),
    ...(orderBys.length ? { orderBys } : {}),
    limit: String(safeLimit),
    keepEmptyRows: Boolean(keepEmptyRows),
    returnPropertyQuota: true,
  };
}

export function normaliseGa4Response(json = {}) {
  const dimensionNames = (json.dimensionHeaders || []).map((header) => header.name);
  const metricNames = (json.metricHeaders || []).map((header) => header.name);

  const rows = (json.rows || []).map((row) => {
    const out = {};
    dimensionNames.forEach((name, index) => {
      out[name] = row?.dimensionValues?.[index]?.value ?? '';
    });
    metricNames.forEach((name, index) => {
      const value = Number(row?.metricValues?.[index]?.value);
      out[name] = Number.isFinite(value) ? value : 0;
    });
    return out;
  });

  const totals = (json.totals || []).map((row) => {
    const out = {};
    metricNames.forEach((name, index) => {
      const value = Number(row?.metricValues?.[index]?.value);
      out[name] = Number.isFinite(value) ? value : 0;
    });
    return out;
  });

  return {
    rows,
    totals,
    rowCount: Number.isFinite(Number(json.rowCount)) ? Number(json.rowCount) : rows.length,
    quota: json.propertyQuota || null,
    metadata: json.metadata || null,
  };
}

/* ---------------------------------------------------------------- cache -- */

const reportCache = new Map();
const inFlight = new Map();
const realtimeCache = new Map();
const realtimeInFlight = new Map();
let lastError = null;

function cacheKeyFor(config, request) {
  const digest = crypto.createHash('sha1').update(JSON.stringify(request)).digest('hex');
  return `${config.propertyId}:${digest}`;
}

async function cachedReport(config, request, { ttlMs, force = false, label = 'report' } = {}) {
  const key = cacheKeyFor(config, request);
  const now = Date.now();
  const existing = reportCache.get(key);

  if (!force && existing && existing.expiresAt > now) {
    return {
      data: existing.data,
      stale: false,
      storedAt: existing.storedAt,
      lastSuccessAt: existing.lastSuccessAt,
    };
  }

  if (inFlight.has(key)) return inFlight.get(key);

  const promise = (async () => {
    try {
      const json = await authorisedFetch(
        `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runReport`,
        config,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(request),
        }
      );
      const data = normaliseGa4Response(json);
      const successAt = Date.now();
      reportCache.set(key, {
        data,
        storedAt: successAt,
        expiresAt: successAt + ttlMs,
        lastSuccessAt: successAt,
      });
      lastError = null;
      return { data, stale: false, storedAt: successAt, lastSuccessAt: successAt };
    } catch (error) {
      lastError = publicGa4Error(error);
      if (existing && now - existing.storedAt <= config.staleMaxMs) {
        return {
          data: existing.data,
          stale: true,
          storedAt: existing.storedAt,
          lastSuccessAt: existing.lastSuccessAt,
          staleError: publicGa4Error(error),
        };
      }
      /* Log the stable code only: the Google message can contain identifiers
         we do not need in application logs. */
      console.error(`[ga4] ${label} failed:`, lastError.code);
      throw error;
    }
  })();

  inFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (inFlight.get(key) === promise) inFlight.delete(key);
  }
}

/* -------------------------------------------------------------- helpers -- */

function numeric(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function round(value, digits = 2) {
  const factor = 10 ** digits;
  return Math.round(numeric(value) * factor) / factor;
}

function rate(numerator, denominator) {
  const n = Number(numerator);
  const d = Number(denominator);
  if (!Number.isFinite(n) || !Number.isFinite(d) || d <= 0) return null;
  return round((n / d) * 100);
}

function maxDate(...values) {
  const dates = values.filter(Boolean).map((value) => new Date(value)).filter((date) => !Number.isNaN(date.getTime()));
  if (!dates.length) return null;
  return new Date(Math.max(...dates.map((date) => date.getTime()))).toISOString();
}

function sectionFailure(error) {
  return {
    available: false,
    error: publicGa4Error(error),
    rows: [],
  };
}

async function safeSection(label, loader) {
  try {
    return await loader();
  } catch (error) {
    if (!(error instanceof Ga4Error)) {
      console.error(`[ga4] ${label} failed unexpectedly`);
    }
    return sectionFailure(error);
  }
}

const REQUESTED_EVENT_NAMES = ['login', 'login_success', 'sign_up', 'sign_up_success'];
const FUNNEL_EVENT_NAMES = ['view_item', 'add_to_cart', 'begin_checkout', 'purchase'];

function inListFilter(fieldName, values) {
  return {
    filter: {
      fieldName,
      inListFilter: { values, caseSensitive: false },
    },
  };
}

function metricOrder(metricName, desc = true) {
  return { metric: { metricName }, desc: Boolean(desc) };
}

function dimensionOrder(dimensionName, desc = false) {
  return { dimension: { dimensionName }, desc: Boolean(desc) };
}

const TOTALS_METRICS = [
  'totalUsers', 'activeUsers', 'newUsers', 'sessions', 'screenPageViews',
  'engagedSessions', 'engagementRate', 'averageSessionDuration', 'eventCount',
  'transactions', 'purchaseRevenue',
];

function totalsFromReport(report) {
  const row = report?.data?.rows?.[0] || report?.data?.totals?.[0] || {};
  const metrics = {};
  TOTALS_METRICS.forEach((name) => { metrics[name] = numeric(row[name]); });
  metrics.purchaseConversionRate = rate(metrics.transactions, metrics.sessions);
  metrics.averageEngagementSeconds = metrics.averageSessionDuration;
  return {
    ...metrics,
    hasData: TOTALS_METRICS.some((name) => metrics[name] > 0),
  };
}

async function readTotals(config, { startDate, endDate }, { force = false } = {}) {
  const request = buildGa4ReportRequest({
    metrics: TOTALS_METRICS,
    startDate,
    endDate,
  });
  const report = await cachedReport(config, request, {
    ttlMs: config.cacheTtlMs,
    force,
    label: 'totals',
  });
  return {
    available: true,
    data: totalsFromReport(report),
    stale: report.stale,
    lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
    staleError: report.staleError || null,
  };
}

async function getTotals(config, period, { force = false } = {}) {
  return safeSection('totals', async () => {
    const current = await readTotals(config, period, { force });
    let comparison = null;
    if (period.comparisonStartDate && period.comparisonEndDate) {
      comparison = await safeSection('totals comparison', () => readTotals(
        config,
        { startDate: period.comparisonStartDate, endDate: period.comparisonEndDate },
        { force }
      ));
    }
    return { ...current, comparison };
  });
}

async function getNewVsReturning(config, period, { force = false } = {}) {
  return safeSection('new vs returning', async () => {
    const request = buildGa4ReportRequest({
      dimensions: ['newVsReturning'],
      metrics: ['totalUsers', 'sessions', 'engagedSessions', 'transactions', 'purchaseRevenue'],
      startDate: period.startDate,
      endDate: period.endDate,
      orderBys: [metricOrder('totalUsers')],
      limit: 10,
    });
    const report = await cachedReport(config, request, {
      ttlMs: config.cacheTtlMs, force, label: 'new-vs-returning',
    });
    const mapRow = (row) => {
      const key = String(row.newVsReturning || 'unknown').toLowerCase();
      return {
        key,
        label: key === 'new' ? 'New' : key === 'returning' ? 'Returning' : '(Not set)',
        users: numeric(row.totalUsers),
        sessions: numeric(row.sessions),
        engagedSessions: numeric(row.engagedSessions),
        purchases: numeric(row.transactions),
        revenue: round(row.purchaseRevenue),
        conversionRate: rate(row.transactions, row.sessions),
      };
    };
    const rows = (report.data.rows || []).map(mapRow).filter((row) => row.key !== '(not set)' || row.users > 0);
    const returning = rows.find((row) => row.key === 'returning') || null;
    const fresh = rows.find((row) => row.key === 'new') || null;
    const notSet = rows.find((row) => row.key === '(not set)') || null;

    let comparison = null;
    if (period.comparisonStartDate && period.comparisonEndDate) {
      const comparisonRequest = { ...request, dateRanges: [{ startDate: period.comparisonStartDate, endDate: period.comparisonEndDate }] };
      const comparisonReport = await cachedReport(config, comparisonRequest, {
        ttlMs: config.cacheTtlMs, force, label: 'new-vs-returning comparison',
      });
      const comparisonRows = (comparisonReport.data.rows || []).map(mapRow);
      comparison = {
        available: true,
        rows: comparisonRows,
        returningUsers: comparisonRows.find((row) => row.key === 'returning')?.users ?? null,
        newUsers: comparisonRows.find((row) => row.key === 'new')?.users ?? null,
        stale: comparisonReport.stale,
      };
    }

    return {
      available: true,
      rows,
      returningUsers: returning?.users ?? null,
      newUsers: fresh?.users ?? null,
      notSetUsers: notSet?.users ?? null,
      comparison,
      stale: report.stale,
      lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
    };
  });
}

function eventRow(rows, names) {
  for (const name of names) {
    const row = rows.find((candidate) => String(candidate.eventName || '').toLowerCase() === name);
    if (row) return row;
  }
  return null;
}

async function readLogins(config, { startDate, endDate }, { force = false } = {}) {
  const request = buildGa4ReportRequest({
    dimensions: ['eventName'],
    metrics: ['eventCount', 'totalUsers'],
    startDate,
    endDate,
    dimensionFilter: inListFilter('eventName', REQUESTED_EVENT_NAMES),
    orderBys: [metricOrder('eventCount')],
    limit: 20,
  });
  const report = await cachedReport(config, request, {
    ttlMs: config.cacheTtlMs, force, label: 'logins',
  });
  const rows = report.data.rows || [];
  const login = eventRow(rows, ['login', 'login_success']);
  const signUp = eventRow(rows, ['sign_up', 'sign_up_success']);
  return {
    available: true,
    events: login ? numeric(login.eventCount) : 0,
    users: login ? numeric(login.totalUsers) : 0,
    signUpEvents: signUp ? numeric(signUp.eventCount) : 0,
    signUpUsers: signUp ? numeric(signUp.totalUsers) : 0,
    eventNames: rows.map((row) => String(row.eventName || '')).filter(Boolean),
    hasData: Boolean(login || signUp),
    stale: report.stale,
    lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
  };
}

async function getLogins(config, period, { force = false } = {}) {
  return safeSection('logins', async () => {
    const current = await readLogins(config, period, { force });
    let comparison = null;
    if (period.comparisonStartDate && period.comparisonEndDate) {
      comparison = await safeSection('logins comparison', () => readLogins(
        config,
        { startDate: period.comparisonStartDate, endDate: period.comparisonEndDate },
        { force }
      ));
    }
    return { ...current, comparison };
  });
}

async function getTrend(config, period, { force = false } = {}) {
  return safeSection('trend', async () => {
    const request = buildGa4ReportRequest({
      dimensions: ['date'],
      metrics: ['totalUsers', 'activeUsers', 'newUsers', 'sessions', 'screenPageViews', 'transactions', 'purchaseRevenue'],
      startDate: period.startDate,
      endDate: period.endDate,
      orderBys: [dimensionOrder('date')],
      limit: 400,
    });
    const report = await cachedReport(config, request, {
      ttlMs: config.cacheTtlMs, force, label: 'trend',
    });
    const byDate = new Map((report.data.rows || []).map((row) => [String(row.date || ''), row]));
    const days = eachDay(period.startDate, period.endDate).map((date) => {
      const row = byDate.get(date) || {};
      return {
        date,
        totalUsers: numeric(row.totalUsers),
        activeUsers: numeric(row.activeUsers),
        newUsers: numeric(row.newUsers),
        sessions: numeric(row.sessions),
        screenPageViews: numeric(row.screenPageViews),
        transactions: numeric(row.transactions),
        purchaseRevenue: round(row.purchaseRevenue),
      };
    });
    return {
      available: true,
      days,
      hasData: (report.data.rows || []).length > 0,
      stale: report.stale,
      lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
    };
  });
}

const GEO_METRICS = ['totalUsers', 'sessions', 'engagedSessions', 'engagementRate', 'transactions', 'purchaseRevenue'];

function mapGeoRow(row, { includeRegion = false, includeCity = false } = {}) {
  return {
    country: String(row.country || ''),
    ...(includeRegion ? { region: String(row.region || '') } : {}),
    ...(includeCity ? { city: String(row.city || '') } : {}),
    users: numeric(row.totalUsers),
    sessions: numeric(row.sessions),
    engagedSessions: numeric(row.engagedSessions),
    engagementRate: numeric(row.engagementRate),
    purchases: numeric(row.transactions),
    revenue: round(row.purchaseRevenue),
    conversionRate: rate(row.transactions, row.sessions),
  };
}

function withShare(rows) {
  const located = rows.reduce((sum, row) => sum + numeric(row.users), 0);
  return rows.map((row) => ({
    ...row,
    share: located ? round((numeric(row.users) / located) * 100) : null,
    isIndia: String(row.country || '').trim().toLowerCase() === 'india',
  }));
}

async function getGeography(config, period, { force = false } = {}) {
  const base = {
    startDate: period.startDate,
    endDate: period.endDate,
    force,
  };
  const [countries, regions, cities] = await Promise.all([
    safeSection('geography countries', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['country'],
        metrics: GEO_METRICS,
        startDate: base.startDate,
        endDate: base.endDate,
        orderBys: [metricOrder('totalUsers')],
        limit: 50,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'geography-countries' });
      return {
        available: true,
        rows: withShare((report.data.rows || []).map((row) => mapGeoRow(row))),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
    safeSection('geography regions', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['country', 'region'],
        metrics: GEO_METRICS,
        startDate: base.startDate,
        endDate: base.endDate,
        orderBys: [metricOrder('totalUsers')],
        limit: 100,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'geography-regions' });
      return {
        available: true,
        rows: withShare((report.data.rows || []).map((row) => mapGeoRow(row, { includeRegion: true }))),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
    safeSection('geography cities', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['country', 'region', 'city'],
        metrics: GEO_METRICS,
        startDate: base.startDate,
        endDate: base.endDate,
        orderBys: [metricOrder('totalUsers')],
        limit: 150,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'geography-cities' });
      return {
        available: true,
        rows: withShare((report.data.rows || []).map((row) => mapGeoRow(row, { includeRegion: true, includeCity: true }))),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
  ]);

  const available = countries.available || regions.available || cities.available;
  return {
    available,
    countries: countries.rows || [],
    states: regions.rows || [],
    cities: cities.rows || [],
    india: {
      users: countries.rows?.filter((row) => row.isIndia).reduce((sum, row) => sum + numeric(row.users), 0) || 0,
      share: countries.rows?.length
        ? round((countries.rows.filter((row) => row.isIndia).reduce((sum, row) => sum + numeric(row.users), 0)
          / Math.max(1, countries.rows.reduce((sum, row) => sum + numeric(row.users), 0))) * 100)
        : null,
    },
    errors: {
      countries: countries.error || null,
      states: regions.error || null,
      cities: cities.error || null,
    },
    stale: Boolean(countries.stale || regions.stale || cities.stale),
    lastSuccessAt: maxDate(countries.lastSuccessAt, regions.lastSuccessAt, cities.lastSuccessAt),
    note: 'GA4 derives geography from the visitor’s network location. It is approximate, may be unavailable, and never identifies an individual address.',
  };
}

function sourceRow(row, { channel = false, campaign = false } = {}) {
  const sessions = numeric(row.sessions);
  return {
    ...(channel ? { channel: String(row.sessionDefaultChannelGroup || '(not set)') } : {}),
    ...(campaign ? { campaign: String(row.sessionCampaignName || '(not set)') } : {}),
    source: String(row.sessionSource || ''),
    medium: String(row.sessionMedium || ''),
    users: numeric(row.totalUsers),
    sessions,
    engagedSessions: numeric(row.engagedSessions),
    engagementRate: numeric(row.engagementRate),
    purchases: numeric(row.transactions),
    revenue: round(row.purchaseRevenue),
    conversionRate: rate(row.transactions, sessions),
  };
}

async function getTrafficSources(config, period, { force = false } = {}) {
  const base = { startDate: period.startDate, endDate: period.endDate };
  const metrics = ['totalUsers', 'sessions', 'engagedSessions', 'engagementRate', 'transactions', 'purchaseRevenue'];

  const [channels, sourceMedium, campaigns] = await Promise.all([
    safeSection('traffic channels', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['sessionDefaultChannelGroup'],
        metrics,
        startDate: base.startDate,
        endDate: base.endDate,
        orderBys: [metricOrder('sessions')],
        limit: 20,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'traffic-channels' });
      return {
        available: true,
        rows: (report.data.rows || []).map((row) => sourceRow(row, { channel: true })),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
    safeSection('traffic source/medium', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['sessionSource', 'sessionMedium'],
        metrics,
        startDate: base.startDate,
        endDate: base.endDate,
        orderBys: [metricOrder('sessions')],
        limit: 100,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'traffic-source-medium' });
      return {
        available: true,
        rows: (report.data.rows || []).map((row) => sourceRow(row)),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
    safeSection('traffic campaigns', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['sessionCampaignName'],
        metrics,
        startDate: base.startDate,
        endDate: base.endDate,
       dimensionFilter: {
  notExpression: {
    filter: {
      fieldName: 'sessionCampaignName',
      stringFilter: { matchType: 'EXACT', value: '(not set)', caseSensitive: false },
    },
  },
},
        orderBys: [metricOrder('sessions')],
        limit: 50,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'traffic-campaigns' });
      return {
        available: true,
        rows: (report.data.rows || []).map((row) => sourceRow(row, { campaign: true })),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
  ]);

  return {
    available: channels.available || sourceMedium.available || campaigns.available,
    channels: channels.rows || [],
    sourceMedium: sourceMedium.rows || [],
    campaigns: campaigns.rows || [],
    errors: {
      channels: channels.error || null,
      sourceMedium: sourceMedium.error || null,
      campaigns: campaigns.error || null,
    },
    stale: Boolean(channels.stale || sourceMedium.stale || campaigns.stale),
    lastSuccessAt: maxDate(channels.lastSuccessAt, sourceMedium.lastSuccessAt, campaigns.lastSuccessAt),
    note: 'GA4 channel groups follow its own attribution model. Untagged or blocked traffic can appear as Direct or Unassigned, so this is not a definitive record of the campaign that caused a sale.',
  };
}

async function getPages(config, period, { force = false } = {}) {
  return safeSection('pages', async () => {
    const request = buildGa4ReportRequest({
      dimensions: ['pagePath'],
      metrics: ['screenPageViews', 'totalUsers', 'sessions', 'averageSessionDuration', 'engagementRate', 'transactions'],
      startDate: period.startDate,
      endDate: period.endDate,
      orderBys: [metricOrder('screenPageViews')],
      limit: 50,
    });
    const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'pages' });
    return {
      available: true,
      rows: (report.data.rows || []).map((row) => ({
        path: String(row.pagePath || '(not set)'),
        views: numeric(row.screenPageViews),
        users: numeric(row.totalUsers),
        sessions: numeric(row.sessions),
        averageSessionDuration: numeric(row.averageSessionDuration),
        engagementRate: numeric(row.engagementRate),
        purchases: numeric(row.transactions),
        conversionRate: rate(row.transactions, row.sessions),
      })),
      stale: report.stale,
      lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      note: 'Top pages by GA4 screen/page views. Query strings can be omitted by the site’s tracking configuration.',
    };
  });
}

function productRow(row) {
  const views = numeric(row.itemsViewed);
  return {
    itemId: String(row.itemId || ''),
    productName: String(row.itemName || '(not set)'),
    views,
    addToCart: numeric(row.itemsAddedToCart),
    checkout: numeric(row.itemsCheckedOut),
    purchased: numeric(row.itemsPurchased),
    revenue: round(row.itemRevenue),
    viewToCartRate: rate(row.itemsAddedToCart, views),
    viewToPurchaseRate: rate(row.itemsPurchased, views),
  };
}

async function getProducts(config, period, { force = false } = {}) {
  const productMetrics = ['itemsViewed', 'itemsAddedToCart', 'itemsCheckedOut', 'itemsPurchased', 'itemRevenue'];

  const [products, categories] = await Promise.all([
    safeSection('products', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['itemName', 'itemId'],
        metrics: productMetrics,
        startDate: period.startDate,
        endDate: period.endDate,
        orderBys: [metricOrder('itemsViewed')],
        limit: 50,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'products' });
      return {
        available: true,
        rows: (report.data.rows || []).map(productRow),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
    safeSection('product categories', async () => {
      const request = buildGa4ReportRequest({
        dimensions: ['itemCategory'],
        metrics: productMetrics,
        startDate: period.startDate,
        endDate: period.endDate,
        orderBys: [metricOrder('itemsViewed')],
        limit: 50,
      });
      const report = await cachedReport(config, request, { ttlMs: config.cacheTtlMs, force, label: 'product-categories' });
      return {
        available: true,
        rows: (report.data.rows || []).map((row) => ({
          category: String(row.itemCategory || '(not set)'),
          ...productRow(row),
        })),
        stale: report.stale,
        lastSuccessAt: new Date(report.lastSuccessAt).toISOString(),
      };
    }),
  ]);

  return {
    available: products.available || categories.available,
    rows: products.rows || [],
    categories: categories.rows || [],
    errors: { products: products.error || null, categories: categories.error || null },
    stale: Boolean(products.stale || categories.stale),
    lastSuccessAt: maxDate(products.lastSuccessAt, categories.lastSuccessAt),
    note: 'GA4 item_id is whatever the storefront sends with its ecommerce events. It is not guaranteed to match an ERP item code or barcode; match product records explicitly before joining on it.',
  };
}

function funnelStages(totalUsers, eventRows) {
  const byEvent = new Map((eventRows || []).map((row) => [String(row.eventName || '').toLowerCase(), row]));
  const countFor = (name) => (byEvent.has(name) ? numeric(byEvent.get(name).totalUsers) : 0);
  const stage = (key, label, count, unit = 'users') => ({ key, label, count, unit });

  const stages = [
    stage('visitor', 'Website visitors', Number.isFinite(Number(totalUsers)) ? Number(totalUsers) : null),
    stage('product', 'Viewed a product', countFor('view_item')),
    stage('cart', 'Added to cart', countFor('add_to_cart')),
    stage('checkout', 'Began checkout', countFor('begin_checkout')),
    stage('purchase', 'Completed a purchase', countFor('purchase')),
  ];

  return stages.map((current, index) => {
    const previous = index ? stages[index - 1] : null;
    const comparable = Boolean(previous) && previous.unit === current.unit
      && current.count !== null && previous.count !== null;
    return {
      ...current,
      previous: previous ? previous.count : null,
      comparable,
      conversion: comparable ? rate(current.count, previous.count) : null,
      dropOff: comparable ? Math.max(0, numeric(previous.count) - numeric(current.count)) : null,
    };
  });
}

async function getFunnel(config, period, { force = false } = {}) {
  return safeSection('funnel', async () => {
    const totals = await getTotals(config, period, { force });
    const request = buildGa4ReportRequest({
      dimensions: ['eventName'],
      metrics: ['totalUsers', 'eventCount'],
      startDate: period.startDate,
      endDate: period.endDate,
      dimensionFilter: inListFilter('eventName', FUNNEL_EVENT_NAMES),
      orderBys: [metricOrder('eventCount')],
      limit: 20,
    });
    const report = await cachedReport(config, request, {
      ttlMs: config.cacheTtlMs, force, label: 'funnel',
    });

    const events = report.data.rows || [];
    const stages = funnelStages(totals.available ? totals.data.totalUsers : null, events);
    const hasData = events.some((row) => numeric(row.eventCount) > 0);
    return {
      available: totals.available || report.data.rows !== undefined,
      mode: 'ga4_users',
      stages,
      hasData,
      events: events.map((row) => ({
        eventName: String(row.eventName || ''),
        users: numeric(row.totalUsers),
        events: numeric(row.eventCount),
      })),
      stale: Boolean(report.stale || totals.stale),
      lastSuccessAt: maxDate(new Date(report.lastSuccessAt).toISOString(), totals.lastSuccessAt),
      note: 'GA4 users who triggered each event, not a strictly sequential cohort. Guest checkout can skip login, and one user may trigger the same event more than once.',
    };
  });
}

async function getRealtime(config, { force = false } = {}) {
  const key = `${config.propertyId}:realtime`;
  const now = Date.now();
  const existing = realtimeCache.get(key);
  if (!force && existing && existing.expiresAt > now) {
    return { ...existing.value, stale: false, lastUpdatedAt: new Date(existing.storedAt).toISOString() };
  }
  if (realtimeInFlight.has(key)) return realtimeInFlight.get(key);

  const promise = (async () => {
    try {
      const totalJson = await authorisedFetch(
        `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
        config,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            metrics: [{ name: 'activeUsers' }, { name: 'eventCount' }],
            limit: '10',
          }),
        }
      );
      const total = normaliseGa4Response(totalJson);

      let topEvents = [];
      try {
        const eventJson = await authorisedFetch(
          `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
          config,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dimensions: [{ name: 'eventName' }],
              metrics: [{ name: 'eventCount' }],
              orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
              limit: '10',
            }),
          }
        );
        topEvents = normaliseGa4Response(eventJson).rows.map((row) => ({
          eventName: String(row.eventName || '(not set)'),
          events: numeric(row.eventCount),
        }));
      } catch {
        topEvents = [];
      }

      /* Parallel fetch of extended realtime dimensions */
      const [sparklineResult, topPagesResult, topCountriesResult, topSourcesResult] = await Promise.allSettled([
        authorisedFetch(
          `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
          config,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dimensions: [{ name: 'minutesAgo' }],
              metrics: [{ name: 'activeUsers' }],
              orderBys: [{ dimension: { dimensionName: 'minutesAgo' } }],
              limit: '30',
            }),
          }
        ),
        authorisedFetch(
          `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
          config,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dimensions: [{ name: 'pagePath' }],
              metrics: [{ name: 'activeUsers' }],
              orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
              limit: '10',
            }),
          }
        ),
        authorisedFetch(
          `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
          config,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dimensions: [{ name: 'country' }],
              metrics: [{ name: 'activeUsers' }],
              orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
              limit: '10',
            }),
          }
        ),
        authorisedFetch(
          `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
          config,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              dimensions: [{ name: 'sessionDefaultChannelGroup' }],
              metrics: [{ name: 'activeUsers' }],
              orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
              limit: '10',
            }),
          }
        ),
      ]);

      const minuteSparkline = sparklineResult.status === 'fulfilled'
        ? normaliseGa4Response(sparklineResult.value).rows
            .map((r) => ({ minute: 29 - numeric(r.minutesAgo), activeUsers: numeric(r.activeUsers) }))
            .sort((a, b) => a.minute - b.minute)
        : [];

      const topPages = topPagesResult.status === 'fulfilled'
        ? normaliseGa4Response(topPagesResult.value).rows
            .map((r) => ({ pagePath: String(r.pagePath || '(not set)'), activeUsers: numeric(r.activeUsers) }))
        : [];

      const topCountries = topCountriesResult.status === 'fulfilled'
        ? normaliseGa4Response(topCountriesResult.value).rows
            .map((r) => ({ country: String(r.country || '(not set)'), activeUsers: numeric(r.activeUsers) }))
        : [];

      const topSources = topSourcesResult.status === 'fulfilled'
        ? normaliseGa4Response(topSourcesResult.value).rows
            .map((r) => ({ channel: String(r.sessionDefaultChannelGroup || '(not set)'), activeUsers: numeric(r.activeUsers) }))
        : [];

      const row = total.rows?.[0] || total.totals?.[0] || {};
      const successAt = Date.now();
      const value = {
        available: true,
        activeUsers: numeric(row.activeUsers),
        events: numeric(row.eventCount),
        topEvents,
        minuteSparkline,
        topPages,
        topCountries,
        topSources,
        windowMinutes: 30,
        stale: false,
        lastUpdatedAt: new Date(successAt).toISOString(),
        lastSuccessAt: new Date(successAt).toISOString(),
        note: 'GA4 realtime active users in its current reporting window (up to 30 minutes). This is an analytics estimate, not an exact count of people on the site at this second.',
      };
      realtimeCache.set(key, {
        value,
        storedAt: successAt,
        expiresAt: successAt + config.realtimeCacheTtlMs,
        lastSuccessAt: successAt,
      });
      return value;
    } catch (error) {
      if (existing && now - existing.storedAt <= config.staleMaxMs) {
        return {
          ...existing.value,
          stale: true,
          lastUpdatedAt: new Date(existing.storedAt).toISOString(),
          lastSuccessAt: new Date(existing.lastSuccessAt).toISOString(),
          staleError: publicGa4Error(error),
        };
      }
      return sectionFailure(error);
    }
  })();

  realtimeInFlight.set(key, promise);
  try {
    return await promise;
  } finally {
    if (realtimeInFlight.get(key) === promise) realtimeInFlight.delete(key);
  }
}

/* ==========================================================================
   Realtime reports — the Website Analytics screen.

   The realtime endpoint has its own, much smaller schema than runReport, so it
   gets its own allow-lists. Reusing the standard dimensions/metrics here would
   send fields Google rejects (pagePath and unifiedPageScreen, for example, are
   not realtime dimensions).
   ========================================================================== */

export const REALTIME_DIMENSIONS = new Set([
  'minutesAgo', 'country', 'city', 'deviceCategory', 'eventName',
  'unifiedScreenName', 'platform',
]);

export const REALTIME_METRICS = new Set([
  'activeUsers', 'eventCount', 'screenPageViews', 'keyEvents',
]);

export const REALTIME_WINDOW_MINUTES = 30;

const REALTIME_MIN_TTL_MS = 30_000;
const REALTIME_MAX_TTL_MS = 60_000;

/* Validates a realtime request against the realtime schema only. minuteRanges
   are capped at two, as the API allows; every value is an integer minute.
   `dateRange` is returned by Google when minuteRanges are used, so it is never
   requested and not part of the dimension allow-list. */
export function buildGa4RealtimeRequest({
  dimensions = [],
  metrics = [],
  minuteRanges = [],
  dimensionFilter = null,
  metricFilter = null,
  orderBys = [],
  limit = 100,
} = {}) {
  if (!metrics.length) throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  if (metrics.some((name) => !REALTIME_METRICS.has(name))) {
    throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  }
  if (dimensions.some((name) => !REALTIME_DIMENSIONS.has(name))) {
    throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  }
  if (minuteRanges.length > 2) throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });

  const safeRanges = minuteRanges.map((range, index) => {
    const start = Number(range?.startMinutesAgo);
    const end = Number(range?.endMinutesAgo);
    if (!Number.isInteger(start) || !Number.isInteger(end)
      || start < 0 || end < 0 || start > 59 || end > 59 || start < end) {
      throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
    }
    const name = String(range?.name || `date_range_${index}`).trim();
    if (/^(date_range_|RESERVED_)/i.test(name)) {
      throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
    }
    return { name, startMinutesAgo: start, endMinutesAgo: end };
  });

  const safeLimit = Math.min(250, Math.max(1, Number(limit) || 100));

  return {
    ...(dimensions.length ? { dimensions: dimensions.map((name) => ({ name })) } : {}),
    metrics: metrics.map((name) => ({ name })),
    ...(safeRanges.length ? { minuteRanges: safeRanges } : {}),
    ...(dimensionFilter ? { dimensionFilter } : {}),
    ...(metricFilter ? { metricFilter } : {}),
    ...(orderBys.length ? { orderBys } : {}),
    limit: String(safeLimit),
    returnPropertyQuota: true,
  };
}

/* One realtime request, cached for 30-60 seconds and de-duplicated while it is
   in flight. Realtime figures are never served from a stale cache: a failed
   read surfaces as an error, because "active users five minutes ago" has no
   honest stale value. */
async function cachedRealtime(config, request, { force = false, label = 'realtime report' } = {}) {
  const digest = crypto.createHash('sha1').update(JSON.stringify(request)).digest('hex');
  const key = `${config.propertyId}:rt:${digest}`;
  const ttlMs = Math.min(REALTIME_MAX_TTL_MS, Math.max(REALTIME_MIN_TTL_MS, config.realtimeCacheTtlMs));
  const now = Date.now();
  const existing = realtimeCache.get(key);

  if (!force && existing && existing.expiresAt > now) {
    return { data: existing.data, storedAt: existing.storedAt };
  }
  if (realtimeInFlight.has(key)) return realtimeInFlight.get(key);

  const promise = (async () => {
    const json = await authorisedFetch(
      `${DATA_API}/properties/${encodeURIComponent(config.propertyId)}:runRealtimeReport`,
      config,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(request),
      }
    );
    const data = normaliseGa4Response(json);
    const storedAt = Date.now();
    realtimeCache.set(key, { data, storedAt, expiresAt: storedAt + ttlMs });
    return { data, storedAt };
  })();

  realtimeInFlight.set(key, promise);
  try {
    return await promise;
  } catch (error) {
    const safe = publicGa4Error(error);
    console.error(`[ga4] ${label} failed:`, safe.code);
    throw error;
  } finally {
    if (realtimeInFlight.get(key) === promise) realtimeInFlight.delete(key);
  }
}

const REALTIME_SECTION_KEYS = [
  'users', 'perMinute', 'pages', 'events', 'keyEvents',
  'countries', 'cities', 'devices',
];

function emptyRealtime() {
  return {
    activeUsers30: null,
    activeUsers5: null,
    views30: null,
    perMinute: [],
    pages: [],
    events: [],
    keyEvents: [],
    countries: [],
    cities: [],
    devices: [],
    pagePaths: [],
  };
}

/**
 * Read the GA4 realtime reports that back the Website Analytics screen. Every
 * request is independent: one rejected section is reported in `errors` and the
 * rest of the screen still renders. No value is invented for a failed section.
 */
export async function loadGa4Realtime({ force = false } = {}) {
  const config = getGa4Config();
  const realtime = emptyRealtime();
  const errors = {};

  if (!config.configured) {
    errors.connection = publicGa4Error(ga4Error('GA4_NOT_CONFIGURED'));
    return {
      status: 'GA4_NOT_CONFIGURED',
      fetchedAt: new Date().toISOString(),
      realtime,
      errors,
    };
  }

  /* The response reports the OLDEST section read, because a cached section is
     still data from when it was read. "Updated" then never claims to be
     fresher than the figures behind it. */
  const readTimes = [];

  const read = async (name, request) => {
    try {
      const report = await cachedRealtime(config, request, {
        force,
        label: `realtime ${name}`,
      });
      readTimes.push(report.storedAt);
      return report.data.rows;
    } catch (error) {
      errors[name] = publicGa4Error(error);
      return null;
    }
  };

  const [totalRows, minuteRows, pageRows, eventRows, keyEventRows, countryRows, cityRows, deviceRows] = await Promise.all([
    /* A. Active users over the whole window and the last five minutes. */
    read('users', buildGa4RealtimeRequest({
      metrics: ['activeUsers', 'screenPageViews'],
      minuteRanges: [
        { name: 'last30', startMinutesAgo: 29, endMinutesAgo: 0 },
        { name: 'last5', startMinutesAgo: 4, endMinutesAgo: 0 },
      ],
    })),
    /* B. Active users per minute, ascending so the chart reads left to right. */
    read('perMinute', buildGa4RealtimeRequest({
      dimensions: ['minutesAgo'],
      metrics: ['activeUsers'],
      orderBys: [{ dimension: { dimensionName: 'minutesAgo' } }],
      limit: 30,
    })),
    /* C/I. Views and users by page title / screen name. This is the only page
       dimension the realtime API accepts; it feeds both tabs. */
    read('pages', buildGa4RealtimeRequest({
      dimensions: ['unifiedScreenName'],
      metrics: ['screenPageViews', 'activeUsers'],
      orderBys: [{ metric: { metricName: 'screenPageViews' }, desc: true }],
      limit: 25,
    })),
    /* D. Events by name. */
    read('events', buildGa4RealtimeRequest({
      dimensions: ['eventName'],
      metrics: ['eventCount'],
      orderBys: [{ metric: { metricName: 'eventCount' }, desc: true }],
      limit: 10,
    })),
    /* E. Key events only. A metricFilter keeps zero rows out of the response. */
    read('keyEvents', buildGa4RealtimeRequest({
      dimensions: ['eventName'],
      metrics: ['keyEvents'],
      metricFilter: {
        filter: {
          fieldName: 'keyEvents',
          numericFilter: { operation: 'GREATER_THAN', value: { int64Value: '0' } },
        },
      },
      orderBys: [{ metric: { metricName: 'keyEvents' }, desc: true }],
      limit: 10,
    })),
    /* F. Geography. */
    read('countries', buildGa4RealtimeRequest({
      dimensions: ['country'],
      metrics: ['activeUsers'],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    })),
    read('cities', buildGa4RealtimeRequest({
      dimensions: ['city'],
      metrics: ['activeUsers'],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    })),
    /* H. Device category. */
    read('devices', buildGa4RealtimeRequest({
      dimensions: ['deviceCategory'],
      metrics: ['activeUsers'],
      orderBys: [{ metric: { metricName: 'activeUsers' }, desc: true }],
      limit: 10,
    })),
  ]);

  /* A request that succeeds with no rows is a real zero, not an error. A failed
     request is null and leaves the figure null so the UI can say so. */
  if (totalRows) {
    const range = (name) => totalRows.find((row) => row.dateRange === name) || null;
    const last30 = range('last30');
    const last5 = range('last5');
    realtime.activeUsers30 = numeric(last30?.activeUsers);
    realtime.activeUsers5 = numeric(last5?.activeUsers);
    realtime.views30 = numeric(last30?.screenPageViews);
  }

  if (minuteRows) {
    const byMinute = new Map(minuteRows.map((row) => [numeric(row.minutesAgo), numeric(row.activeUsers)]));
    realtime.perMinute = Array.from({ length: REALTIME_WINDOW_MINUTES }, (_, index) => {
      const minutesAgo = REALTIME_WINDOW_MINUTES - 1 - index;
      return { minutesAgo, activeUsers: byMinute.get(minutesAgo) || 0 };
    });
  }

  if (pageRows) {
    const pages = pageRows.map((row) => ({
      screenName: String(row.unifiedScreenName || '(not set)'),
      views: numeric(row.screenPageViews),
      activeUsers: numeric(row.activeUsers),
    }));
    realtime.pages = pages.slice(0, 10);
    realtime.pagePaths = pages.slice(0, 25);
  }

  if (eventRows) {
    realtime.events = eventRows.map((row) => ({
      eventName: String(row.eventName || '(not set)'),
      eventCount: numeric(row.eventCount),
    }));
  }

  if (keyEventRows) {
    realtime.keyEvents = keyEventRows
      .map((row) => ({
        eventName: String(row.eventName || '(not set)'),
        keyEvents: numeric(row.keyEvents),
      }))
      .filter((row) => row.keyEvents > 0);
  }

  const mapUsers = (rows, key) => rows.map((row) => ({
    [key]: String(row[key] || '(not set)'),
    activeUsers: numeric(row.activeUsers),
  }));

  if (countryRows) realtime.countries = mapUsers(countryRows, 'country');
  if (cityRows) realtime.cities = mapUsers(cityRows, 'city');
  if (deviceRows) realtime.devices = mapUsers(deviceRows, 'deviceCategory');

  const failed = REALTIME_SECTION_KEYS.filter((name) => errors[name]);
  const status = failed.length === REALTIME_SECTION_KEYS.length
    ? (errors[failed[0]]?.code || 'GA4_REPORT_FAILED')
    : 'connected';

  const fetchedAt = new Date(readTimes.length ? Math.min(...readTimes) : Date.now()).toISOString();

  return { status, fetchedAt, realtime, errors };
}

async function getPropertyMetadata(config, { force = false } = {}) {
  const key = `${config.propertyId}:metadata`;
  const now = Date.now();
  const existing = propertyCache.get(key);
  if (!force && existing && existing.expiresAt > now) return existing.value;

  try {
    const json = await authorisedFetch(
      `${ADMIN_API}/properties/${encodeURIComponent(config.propertyId)}?fields=displayName,timeZone,currencyCode`,
      config,
      { method: 'GET' }
    );
    const value = {
      available: true,
      displayName: String(json?.displayName || ''),
      timeZone: String(json?.timeZone || ''),
      currencyCode: String(json?.currencyCode || ''),
    };
    propertyCache.set(key, { value, expiresAt: now + 60 * 60 * 1000 });
    return value;
  } catch (error) {
    return {
      available: false,
      error: publicGa4Error(error),
      displayName: '',
      timeZone: '',
      currencyCode: '',
    };
  }
}

const propertyCache = new Map();

/* ------------------------------------------------------------- public API -- */

const ALL_SECTIONS = [
  'totals', 'newVsReturning', 'logins', 'trend', 'geography',
  'trafficSources', 'pages', 'products', 'funnel', 'realtime',
];

/**
 * Read the requested GA4 sections. Each section degrades independently:
 * a failed geography report does not blank the visitor cards.
 */
export async function loadGa4Analytics({
  startDate,
  endDate,
  comparisonStartDate = null,
  comparisonEndDate = null,
  force = false,
  sections = ALL_SECTIONS,
} = {}) {
  const config = getGa4Config();
  const now = new Date().toISOString();
  const period = { startDate, endDate, comparisonStartDate, comparisonEndDate };
  const requested = new Set(sections);

  const base = {
    configured: config.configured,
    status: config.configured ? 'configured' : 'not_configured',
    message: config.configured
      ? 'GA4 Data API configured; reading reports.'
      : 'GA4 is not configured. Set GA4_PROPERTY_ID and a service-account credential on the server.',
    propertyId: config.propertyId || null,
    measurementId: config.measurementId || null,
    websiteUrl: config.siteUrl,
    timezone: config.timezone,
    currency: config.currency,
    missing: config.missing,
    notes: config.notes,
    fetchedAt: now,
    lastSuccessAt: null,
    stale: false,
    partial: false,
    available: false,
    errors: {},
    period: {
      startDate,
      endDate,
      comparisonStartDate,
      comparisonEndDate,
    },
  };

  if (!config.configured) {
    return {
      ...base,
      tracking: {
        measurementId: config.measurementId || null,
        status: config.measurementId ? 'configured_not_verified' : 'not_configured',
        message: config.measurementId
          ? 'A GA4 measurement ID is configured; data collection is verified when reports contain visitors.'
          : 'No GA4 measurement ID is configured, so the storefront tag cannot be installed from this application.',
      },
      sections: Object.fromEntries([...requested].map((name) => [name, {
        available: false,
        error: publicGa4Error(ga4Error('GA4_NOT_CONFIGURED')),
      }])),
    };
  }

  if (!isDateString(startDate) || !isDateString(endDate)) {
    throw ga4Error('GA4_INVALID_REQUEST', { status: 422 });
  }

  const tasks = new Map([
    ['totals', () => getTotals(config, period, { force })],
    ['newVsReturning', () => getNewVsReturning(config, period, { force })],
    ['logins', () => getLogins(config, period, { force })],
    ['trend', () => getTrend(config, period, { force })],
    ['geography', () => getGeography(config, period, { force })],
    ['trafficSources', () => getTrafficSources(config, period, { force })],
    ['pages', () => getPages(config, period, { force })],
    ['products', () => getProducts(config, period, { force })],
    ['funnel', () => getFunnel(config, period, { force })],
    ['realtime', () => getRealtime(config, { force: false })],
  ]);

  const work = [...requested].map(async (name) => {
    const loader = tasks.get(name);
    if (!loader) return [name, sectionFailure(ga4Error('GA4_INVALID_REQUEST'))];
    return [name, await loader()];
  });

  const results = Object.fromEntries(await Promise.all(work));

  const errors = {};
  let available = false;
  let stale = false;
  let lastSuccessAt = null;
  Object.entries(results).forEach(([name, result]) => {
    if (result?.available) {
      available = true;
      if (result.stale) stale = true;
      lastSuccessAt = maxDate(lastSuccessAt, result.lastSuccessAt);
    } else if (result?.error) {
      errors[name] = result.error;
    }
  });

  const firstError = Object.values(errors)[0] || null;
  let status = 'connected';
  let message = 'GA4 reports are live.';
  if (!available) {
    status = firstError?.code || 'GA4_REPORT_FAILED';
    message = firstError?.message || 'GA4 reports are unavailable.';
  } else if (stale) {
    status = 'stale';
    message = 'GA4 is showing the last successful report because a fresh request failed.';
  } else if (Object.keys(errors).length) {
    status = 'connected';
    message = 'GA4 is connected; some optional sections could not be read.';
  }

  const totals = results.totals?.available ? results.totals.data : null;
  const hasVisitorData = totals ? totals.totalUsers > 0 : null;
  const tracking = {
    measurementId: config.measurementId || null,
    status: !config.measurementId
      ? 'not_configured'
      : hasVisitorData === null
        ? 'unknown'
        : hasVisitorData
          ? 'receiving_data'
          : 'no_data_in_period',
    message: !config.measurementId
      ? 'No GA4 measurement ID is configured. The Dashboard can read the property but cannot confirm the website tag.'
      : hasVisitorData === null
        ? 'The visitor report is unavailable, so tag delivery could not be checked.'
        : hasVisitorData
          ? 'GA4 has visitor data for this period.'
          : 'GA4 returned no visitors for this period. Confirm the storefront tag and the reporting timezone.',
  };

  return {
    ...base,
    status,
    message,
    available,
    partial: Object.keys(errors).length > 0,
    stale,
    lastSuccessAt,
    errors,
    tracking,
    sections: results,
    /* Convenience aliases keep the dashboard payload readable. */
    totals: results.totals || null,
    newVsReturning: results.newVsReturning || null,
    logins: results.logins || null,
    trend: results.trend || null,
    geography: results.geography || null,
    trafficSources: results.trafficSources || null,
    pages: results.pages || null,
    products: results.products || null,
    funnel: results.funnel || null,
    realtime: results.realtime || null,
  };
}

/**
 * Health check for the settings screen / operators. It verifies credentials and
 * property access with a tiny report, and reads property metadata when the
 * service account is allowed to call the Admin API.
 */
export async function loadGa4Health({ force = false } = {}) {
  const config = getGa4Config();
  const checkedAt = new Date().toISOString();
  if (!config.configured) {
    return {
      configured: false,
      status: 'not_configured',
      message: baseConfigurationMessage(config),
      propertyId: config.propertyId || null,
      measurementId: config.measurementId || null,
      websiteUrl: config.siteUrl,
      timezone: config.timezone,
      currency: config.currency,
      missing: config.missing,
      notes: config.notes,
      checkedAt,
    };
  }

  const today = todayInIndia(new Date());
  const [totals, property] = await Promise.all([
    getTotals(config, { startDate: today, endDate: today }, { force }),
    getPropertyMetadata(config, { force }),
  ]);

  const connection = totals.available
    ? (totals.stale ? 'stale' : (totals.data.totalUsers > 0 ? 'connected' : 'no_data'))
    : (totals.error?.code || 'GA4_REPORT_FAILED');

  const timezoneMatches = property.available
    ? property.timeZone === config.timezone
    : null;

  return {
    configured: true,
    status: connection,
    message: totals.available
      ? (totals.stale
        ? 'GA4 credentials work, but the latest request failed and cached data is being shown.'
        : totals.data.totalUsers > 0
          ? 'GA4 Data API connection is working and visitor data is arriving.'
          : 'GA4 credentials work. No active users were recorded for today yet.')
      : (totals.error?.message || 'GA4 could not be read.'),
    propertyId: config.propertyId,
    measurementId: config.measurementId || null,
    websiteUrl: config.siteUrl,
    timezone: config.timezone,
    currency: config.currency,
    today: totals.available ? totals.data : null,
    property,
    timezoneMatches,
    tag: {
      measurementId: config.measurementId || null,
      status: !config.measurementId
        ? 'not_configured'
        : !totals.available
          ? 'unknown'
          : totals.data.totalUsers > 0
            ? 'receiving_data'
            : 'no_data_today',
      message: !config.measurementId
        ? 'Set GA4_MEASUREMENT_ID to let the storefront script install the tag.'
        : totals.available && totals.data.totalUsers > 0
          ? 'GA4 has active users today, so the tag is delivering data.'
          : 'No visitors recorded today. Confirm the tag in GA4 Realtime and check the property timezone.',
    },
    errors: totals.available ? {} : { totals: totals.error },
    checkedAt,
  };
}

/* ------------------------------------------------- active users by date -- */

/* The one dated report on the Website Analytics screen. Everything here uses
   properties/:id:runReport, not the realtime API, because a user-chosen date
   range cannot be answered by a realtime report. The realtime sections above
   are untouched. */

const ACTIVE_TOTALS_METRICS = ['activeUsers', 'totalUsers', 'newUsers', 'sessions', 'screenPageViews'];
const ACTIVE_MAX_RANGE_DAYS = 366;
const ACTIVE_GRANULARITY_DIMENSIONS = {
  day: 'date',
  week: 'isoYearIsoWeek',
  month: 'yearMonth',
};
const ACTIVE_COMPARISONS = new Set(['none', 'previous_period', 'previous_year']);
/* GA4 predates every property we could read; asking from here returns the first
   day that actually has data instead of inventing a start date. */
const FIRST_DATA_START = '2020-01-01';

function invalidRequest(message, field) {
  const error = new Ga4Error('GA4_INVALID_REQUEST', message, { status: 422 });
  error.field = field;
  return error;
}

function activeTotalsFrom(row) {
  return {
    activeUsers: numeric(row?.activeUsers),
    totalUsers: numeric(row?.totalUsers),
    newUsers: numeric(row?.newUsers),
    sessions: numeric(row?.sessions),
    pageViews: numeric(row?.screenPageViews),
  };
}

function activeChange(current, previous) {
  const a = Number(current);
  const b = Number(previous);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return { absolute: null, percent: null };
  return {
    absolute: round(a - b, 0),
    /* A zero baseline has no percentage worth printing; the UI says "New". */
    percent: b === 0 ? null : round(((a - b) / b) * 100, 1),
  };
}

function activeBucketLabel(dimension, value) {
  if (dimension === 'isoYearIsoWeek') {
    const match = /^(\d{4})(\d{1,2})$/.exec(String(value || ''));
    return match ? `Week ${Number(match[2])}, ${match[1]}` : String(value || '(not set)');
  }
  if (dimension === 'yearMonth') {
    const raw = String(value || '');
    return /^\d{6}$/.test(raw) ? monthLabel(`${raw.slice(0, 4)}-${raw.slice(4)}`) : (raw || '(not set)');
  }
  return formatDate(value);
}

/* A day series is completed from eachDay so a day GA4 omitted is a real zero
   rather than a gap the chart would silently close. Week and month buckets are
   returned exactly as GA4 reported them. */
function activeSeriesFrom(report, dimension, startDate, endDate) {
  if (dimension === 'date') {
    const byDate = new Map();
    report.rows.forEach((row) => {
      const raw = String(row.date || '');
      if (!/^\d{8}$/.test(raw)) return;
      byDate.set(`${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6)}`, row);
    });
    return eachDay(startDate, endDate).map((date) => {
      const row = byDate.get(date);
      return {
        key: date.replace(/-/g, ''),
        date,
        label: formatDate(date),
        activeUsers: numeric(row?.activeUsers),
        newUsers: numeric(row?.newUsers),
        sessions: numeric(row?.sessions),
      };
    });
  }

  return report.rows.map((row) => ({
    key: String(row[dimension] || ''),
    date: '',
    label: activeBucketLabel(dimension, row[dimension]),
    activeUsers: numeric(row.activeUsers),
    newUsers: numeric(row.newUsers),
    sessions: numeric(row.sessions),
  }));
}

/**
 * Active users for a user-chosen date range, from GA4 runReport reports.
 *
 * The headline total is read as its own dimension-free request: unique users
 * counted per day add up to more than unique users across the same range, so
 * summing the daily series would overstate the total.
 *
 * Validation happens before Google is called. Invalid input throws an
 * GA4_INVALID_REQUEST (HTTP 422) with a message the UI can show verbatim.
 */
export async function loadGa4ActiveUsers({
  startDate,
  endDate,
  granularity = 'day',
  compare = 'none',
  preset = 'custom',
  force = false,
} = {}) {
  const config = getGa4Config();
  const today = todayInIndia();

  if (!isDateString(startDate)) {
    throw invalidRequest('startDate must be a valid date (YYYY-MM-DD).', 'startDate');
  }
  if (!isDateString(endDate)) {
    throw invalidRequest('endDate must be a valid date (YYYY-MM-DD).', 'endDate');
  }
  if (!Object.prototype.hasOwnProperty.call(ACTIVE_GRANULARITY_DIMENSIONS, granularity)) {
    throw invalidRequest('granularity must be day, week or month.', 'granularity');
  }
  if (!ACTIVE_COMPARISONS.has(compare)) {
    throw invalidRequest('compare must be none, previous_period or previous_year.', 'compare');
  }

  /* A future end date is clamped to today in the property timezone instead of
     erroring: the selected range is still meaningful, it simply ends now. */
  const end = endDate > today ? today : endDate;
  if (startDate > end) {
    throw invalidRequest('startDate must be on or before endDate.', 'startDate');
  }
  const days = diffDays(startDate, end) + 1;
  if (days > ACTIVE_MAX_RANGE_DAYS) {
    throw invalidRequest(
      `Select ${ACTIVE_MAX_RANGE_DAYS} days or fewer (this range is ${days} days).`,
      'startDate'
    );
  }

  const comparison = compare === 'none' ? null : comparisonRange(startDate, end, compare);
  const dimension = ACTIVE_GRANULARITY_DIMENSIONS[granularity];

  const period = {
    startDate,
    endDate: end,
    compareStartDate: comparison?.start || null,
    compareEndDate: comparison?.end || null,
    compareLabel: comparison?.label || null,
    label: formatDateRange(startDate, end),
    granularity,
    compare,
    preset,
    timezone: config.timezone,
    days,
    today,
    firstDataDate: null,
  };

  if (!config.configured) {
    return {
      status: 'GA4_NOT_CONFIGURED',
      fetchedAt: new Date().toISOString(),
      period,
      totals: null,
      comparison: null,
      series: [],
      countries: [],
      cities: [],
      devices: [],
      errors: { connection: publicGa4Error(ga4Error('GA4_NOT_CONFIGURED')) },
      stale: false,
    };
  }

  const ttlMs = config.cacheTtlMs;
  const readTimes = [];
  const errors = {};
  let stale = false;

  const read = async (name, request) => {
    const result = await safeSection(`active users ${name}`, async () => {
      const report = await cachedReport(config, request, {
        ttlMs,
        force,
        label: `active users ${name}`,
      });
      readTimes.push(report.storedAt);
      if (report.stale) stale = true;
      return report.data;
    });
    if (result.error) {
      errors[name] = result.error;
      return null;
    }
    return result;
  };

  const totalsRequest = (from, to) => buildGa4ReportRequest({
    metrics: ACTIVE_TOTALS_METRICS,
    startDate: from,
    endDate: to,
    limit: 1,
  });

  const seriesRequest = (from, to, span) => buildGa4ReportRequest({
    dimensions: [dimension],
    metrics: ['activeUsers', 'newUsers', 'sessions'],
    startDate: from,
    endDate: to,
    orderBys: [dimensionOrder(dimension, false)],
    limit: Math.min(10_000, span + 10),
  });

  const breakdownRequest = (dimensionName) => buildGa4ReportRequest({
    dimensions: [dimensionName],
    metrics: ['activeUsers'],
    startDate,
    endDate: end,
    orderBys: [metricOrder('activeUsers', true)],
    limit: 10,
  });

  const [totalsReport, seriesReport, countryReport, cityReport, deviceReport, firstDataReport, compareTotalsReport, compareSeriesReport] = await Promise.all([
    read('totals', totalsRequest(startDate, end)),
    read('series', seriesRequest(startDate, end, days)),
    read('countries', breakdownRequest('country')),
    read('cities', breakdownRequest('city')),
    read('devices', breakdownRequest('deviceCategory')),
    read('firstData', buildGa4ReportRequest({
      dimensions: ['date'],
      metrics: ['activeUsers'],
      startDate: FIRST_DATA_START,
      endDate: end,
      orderBys: [dimensionOrder('date', false)],
      limit: 1,
    })),
    comparison ? read('comparison', totalsRequest(comparison.start, comparison.end)) : null,
    comparison ? read('comparisonSeries', seriesRequest(comparison.start, comparison.end, days)) : null,
  ]);

  /* A successful report with no rows is a real zero; a failed report leaves the
     figure null so the UI can say it is unavailable instead of showing 0. */
  const totals = totalsReport ? activeTotalsFrom(totalsReport.rows[0]) : null;

  const series = seriesReport
    ? activeSeriesFrom(seriesReport, dimension, startDate, end)
    : [];

  const firstDataRaw = String(firstDataReport?.rows?.[0]?.date || '');
  if (/^\d{8}$/.test(firstDataRaw)) {
    period.firstDataDate = `${firstDataRaw.slice(0, 4)}-${firstDataRaw.slice(4, 6)}-${firstDataRaw.slice(6)}`;
  }

  /* The dashed comparison line is only drawn when both periods produced the
     same number of buckets, so a point is never paired with a different day. */
  if (compareSeriesReport && series.length) {
    const compareSeries = activeSeriesFrom(compareSeriesReport, dimension, comparison.start, comparison.end);
    if (compareSeries.length === series.length) {
      series.forEach((point, index) => {
        point.compareActiveUsers = compareSeries[index].activeUsers;
      });
    }
  }

  let comparisonPayload = null;
  if (comparison) {
    const previous = compareTotalsReport ? activeTotalsFrom(compareTotalsReport.rows[0]) : null;
    comparisonPayload = {
      startDate: comparison.start,
      endDate: comparison.end,
      label: comparison.label,
      totals: previous,
      change: previous && totals
        ? {
          activeUsers: activeChange(totals.activeUsers, previous.activeUsers),
          totalUsers: activeChange(totals.totalUsers, previous.totalUsers),
          newUsers: activeChange(totals.newUsers, previous.newUsers),
          sessions: activeChange(totals.sessions, previous.sessions),
          pageViews: activeChange(totals.pageViews, previous.pageViews),
        }
        : null,
      error: errors.comparison || null,
    };
  }

  const mapUsers = (report, key) => (report ? report.rows.map((row) => ({
    [key]: String(row[key] || '(not set)'),
    activeUsers: numeric(row.activeUsers),
  })) : []);

  const failed = Object.keys(errors);
  const status = totals ? 'connected' : (errors.totals?.code || 'GA4_REPORT_FAILED');
  const fetchedAt = new Date(readTimes.length ? Math.min(...readTimes) : Date.now()).toISOString();

  return {
    status,
    fetchedAt,
    period,
    totals,
    comparison: comparisonPayload,
    series,
    countries: mapUsers(countryReport, 'country'),
    cities: mapUsers(cityReport, 'city'),
    devices: mapUsers(deviceReport, 'deviceCategory'),
    errors,
    partial: failed.length > 0,
    stale,
  };
}

function baseConfigurationMessage(config) {
  if (config.missing.length) {
    return `GA4 is not configured. Missing: ${config.missing.join(', ')}.`;
  }
  return config.notes[0] || 'GA4 is not configured.';
}

export { ALL_SECTIONS };
