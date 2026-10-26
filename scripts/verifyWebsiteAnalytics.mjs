/* Wiring and safety checks for Dashboard + Website Analytics.

   This is the companion to testDashboard.mjs. It does not re-test the
   arithmetic; it checks that the pieces are actually connected and that the
   rules that are easy to remove in a later edit are still present:

     - the admin dashboard renders DashboardClient, not the old dead screen
     - the Website Analytics nav entry exists under E-commerce
     - the public tracker is consent-gated, DNT-aware and sends a path, not a
       full URL
     - the event model keeps its dedupe and 400-day TTL indexes and has no
       raw IP or User-Agent field
     - the collect endpoint validates before opening a database connection
     - missing tracking is null, while an installed site with no traffic is 0

   Run with:  npm run test:website-analytics */

import fs from 'node:fs';
import path from 'node:path';
import WebsiteEvent, { WEBSITE_EVENT_TYPES } from '@/models/WebsiteEvent';
import { summariseWebsiteEvents } from '@/lib/website-analytics/summarise';
import { csvCell } from '@/lib/dashboard/export';
import { classifyChannel, attributionFrom } from '@/lib/dashboard/storefront';

const ROOT = process.cwd();
let pass = 0;
let fail = 0;

const ok = (name, cond, detail = '') => {
  if (cond) {
    pass += 1;
    console.log('  PASS  ' + name);
  } else {
    fail += 1;
    console.log('  FAIL  ' + name + (detail !== '' ? '  -> ' + JSON.stringify(detail) : ''));
  }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const file = (rel) => path.join(ROOT, rel);
const exists = (rel) => fs.existsSync(file(rel));
const text = (rel) => fs.readFileSync(file(rel), 'utf8');
const lower = (value) => String(value).toLowerCase();
const has = (name, rel, needle, { ci = false } = {}) => {
  const body = text(rel);
  const found = ci
    ? lower(body).includes(lower(needle))
    : body.includes(needle);
  ok(name, found, found ? '' : 'missing: ' + needle);
};
const hasNot = (name, rel, needle, { ci = false } = {}) => {
  const body = text(rel);
  const found = ci
    ? lower(body).includes(lower(needle))
    : body.includes(needle);
  ok(name, !found, found ? 'unexpected: ' + needle : '');
};
const allOf = (rel, needles, prefix = '') => {
  const body = text(rel);
  needles.forEach((needle) => {
    ok(`${prefix}${needle}`, body.includes(needle), 'missing from ' + rel);
  });
};

/* ==========================================================================
   1. Required files
   ========================================================================== */
console.log('\n--- 1. Required files ---');

const REQUIRED = [
  'app/admin/page.js',
  'components/dashboard/DashboardClient.jsx',
  'components/dashboard/RangePicker.jsx',
  'components/analytics/StatTile.jsx',
  'components/analytics/BarList.jsx',
  'app/api/dashboard/analytics/route.js',
  'app/api/dashboard/options/route.js',
  'app/api/dashboard/export/route.js',
  'app/api/dashboard/route.js',
  'app/admin/ecommerce/website-analytics/page.jsx',
  'components/website-analytics/WebsiteAnalyticsClient.jsx',
  'components/website-analytics/Funnel.jsx',
  'components/website-analytics/WebsitePanels.jsx',
  'app/api/website-analytics/overview/route.js',
  'app/api/website-analytics/export/route.js',
  'app/api/website-analytics/collect/route.js',
  'models/WebsiteEvent.js',
  'lib/website-analytics/privacy.js',
  'lib/website-analytics/validation.js',
  'lib/website-analytics/rateLimit.js',
  'lib/website-analytics/collect.js',
  'lib/website-analytics/summarise.js',
  'lib/website-analytics/service.js',
  'lib/website-analytics/export.js',
  'lib/dashboard/range.js',
  'lib/dashboard/calculations.js',
  'lib/dashboard/format.js',
  'lib/dashboard/storefront.js',
  'lib/dashboard/access.js',
  'lib/dashboard/analytics.js',
  'lib/dashboard/export.js',
  'public/we-analytics.js',
  'WEBSITE_ANALYTICS.md',
  'scripts/testDashboard.mjs',
  'scripts/verifyWebsiteAnalytics.mjs',
];
REQUIRED.forEach((rel) => ok('file exists: ' + rel, exists(rel)));

/* ==========================================================================
   2. Dashboard wiring
   ========================================================================== */
console.log('\n--- 2. Dashboard wiring ---');

has('admin page imports DashboardClient', 'app/admin/page.js', "from '@/components/dashboard/DashboardClient'");
has('admin page renders DashboardClient', 'app/admin/page.js', '<DashboardClient />');
hasNot('admin page no longer renders the old dead function', 'app/admin/page.js', 'function Dashboard()');
has('dashboard client fetches the new analytics route', 'components/dashboard/DashboardClient.jsx', '/api/dashboard/analytics');
has('dashboard client fetches the period options', 'components/dashboard/DashboardClient.jsx', '/api/dashboard/options');
has('dashboard client offers the CSV export', 'components/dashboard/DashboardClient.jsx', '/api/dashboard/export');
has('dashboard client uses the existing hand-drawn chart', 'components/dashboard/DashboardClient.jsx', "from '@/components/LineChart'");
has('dashboard client uses the shared range picker', 'components/dashboard/DashboardClient.jsx', "from './RangePicker'");
has('dashboard client renders the website card', 'components/dashboard/DashboardClient.jsx', 'Website tracking');
has('dashboard client explains website revenue is separate', 'components/dashboard/DashboardClient.jsx', 'not added to ERP net sales');
has('dashboard client links to website analytics', 'components/dashboard/DashboardClient.jsx', '/admin/ecommerce/website-analytics');
has('range picker reads the server presets', 'components/dashboard/RangePicker.jsx', 'RANGE_PRESETS');
has('stat tile has a violet tone', 'components/analytics/StatTile.jsx', 'violet:');
has('stat tile exposes the not-tracked state', 'components/analytics/StatTile.jsx', 'unavailable');

has('legacy dashboard endpoint is still present', 'app/api/dashboard/route.js', 'export async function GET');
has('legacy dashboard keeps its last30 series', 'app/api/dashboard/route.js', 'last30');
has('legacy dashboard keeps its byMonth series', 'app/api/dashboard/route.js', 'byMonth');
hasNot('legacy dashboard does not import the new client', 'app/api/dashboard/route.js', 'DashboardClient');
has('analytics route authenticates', 'app/api/dashboard/analytics/route.js', 'requireSession');
has('analytics route scopes the query', 'app/api/dashboard/analytics/route.js', 'dashboardScope');
has('analytics route resolves the IST range', 'app/api/dashboard/analytics/route.js', 'resolveRange');
has('analytics route uses the server aggregate', 'app/api/dashboard/analytics/route.js', 'getDashboardAnalytics');
has('options route exposes presets', 'app/api/dashboard/options/route.js', 'RANGE_PRESETS');
has('options route authenticates', 'app/api/dashboard/options/route.js', 'requireSession');
has('dashboard export authenticates', 'app/api/dashboard/export/route.js', 'requireSession');
has('dashboard export builds the same snapshot', 'app/api/dashboard/export/route.js', 'getDashboardAnalytics');
has('dashboard export uses the formula-safe writer', 'app/api/dashboard/export/route.js', 'buildDashboardCsv');
has('dashboard export sends a CSV', 'app/api/dashboard/export/route.js', 'text/csv');
has('dashboard export names the file', 'app/api/dashboard/export/route.js', 'Content-Disposition');

/* No new chart dependency: the existing SVG chart is reused. */
const pkg = JSON.parse(fs.readFileSync(file('package.json'), 'utf8'));
const deps = { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) };
ok('no chart library was added', !['recharts', 'chart.js', 'react-chartjs-2', 'apexcharts', 'echarts', 'd3'].some((name) => deps[name]));

/* ==========================================================================
   3. Website Analytics wiring
   ========================================================================== */
console.log('\n--- 3. Website Analytics wiring ---');

has('website page renders the client', 'app/admin/ecommerce/website-analytics/page.jsx', '<WebsiteAnalyticsClient />');
has('website client fetches its overview', 'components/website-analytics/WebsiteAnalyticsClient.jsx', '/api/website-analytics/overview');
has('website client fetches the shared options', 'components/website-analytics/WebsiteAnalyticsClient.jsx', '/api/dashboard/options');
has('website client offers CSV export', 'components/website-analytics/WebsiteAnalyticsClient.jsx', '/api/website-analytics/export');
has('website client shows the install panel', 'components/website-analytics/WebsiteAnalyticsClient.jsx', 'InstallPanel');
has('website client distinguishes not tracked', 'components/website-analytics/WebsiteAnalyticsClient.jsx', 'Not tracked');
has('website client explains a real zero', 'components/website-analytics/WebsiteAnalyticsClient.jsx', 'real zero');
has('funnel renders null steps as unmeasured', 'components/website-analytics/Funnel.jsx', "value === null || value === undefined ? '-'");
has('funnel distinguishes missing tracking', 'components/website-analytics/WebsiteAnalyticsClient.jsx', 'Install the tag to measure the funnel');
const waClient = text('components/website-analytics/WebsiteAnalyticsClient.jsx');
ok(
  'source, device and country bars use the sessions count as their value',
  (waClient.match(/valueKey="sessions"/g) || []).length >= 3,
  'a BarList without valueKey renders every row as zero'
);
has('sources show their page-view and revenue detail', 'components/website-analytics/WebsiteAnalyticsClient.jsx', 'subKey="sub"');
has('panels include top pages', 'components/website-analytics/WebsitePanels.jsx', 'export function TopPagesPanel');
has('panels include products', 'components/website-analytics/WebsitePanels.jsx', 'export function ProductsPanel');
has('panels include recent purchases', 'components/website-analytics/WebsitePanels.jsx', 'export function RecentPurchasesPanel');
has('panels include the install snippet', 'components/website-analytics/WebsitePanels.jsx', 'data-business=');

const navText = text('config/nav.js');
const ecomAt = navText.indexOf("label: 'E-commerce'");
const waAt = navText.indexOf("label: 'Website Analytics'");
ok('nav has a Website Analytics entry', waAt > -1);
ok('nav entry is inside the E-commerce block', ecomAt > -1 && waAt > ecomAt && waAt - ecomAt < 4000, { ecomAt, waAt });
ok('nav entry points at the page', navText.includes("href: '/admin/ecommerce/website-analytics'"));
ok('nav entry appears once', navText.split("label: 'Website Analytics'").length - 1 === 1);

has('overview route authenticates', 'app/api/website-analytics/overview/route.js', 'requireSession');
has('overview route resolves the range', 'app/api/website-analytics/overview/route.js', 'resolveRange');
has('overview route uses the service', 'app/api/website-analytics/overview/route.js', 'getWebsiteAnalytics');
has('overview route is dynamic', 'app/api/website-analytics/overview/route.js', "export const dynamic = 'force-dynamic'");
has('export route authenticates', 'app/api/website-analytics/export/route.js', 'requireSession');
has('export route uses the same service', 'app/api/website-analytics/export/route.js', 'getWebsiteAnalytics');
has('export route uses the website CSV writer', 'app/api/website-analytics/export/route.js', 'buildWebsiteAnalyticsCsv');
has('export route sends a CSV', 'app/api/website-analytics/export/route.js', 'text/csv');
has('export route names the file', 'app/api/website-analytics/export/route.js', 'Content-Disposition');

/* ==========================================================================
   4. Public collection boundary
   ========================================================================== */
console.log('\n--- 4. Public collection boundary ---');

has('collect route exports POST', 'app/api/website-analytics/collect/route.js', 'export async function POST');
has('collect route answers preflight', 'app/api/website-analytics/collect/route.js', 'export async function OPTIONS');
has('collect route caps the body', 'app/api/website-analytics/collect/route.js', 'MAX_BODY_BYTES = 16 * 1024');
has('collect route checks the origin', 'app/api/website-analytics/collect/route.js', 'WEBSITE_ANALYTICS_ALLOWED_ORIGINS');
has('collect route sets CORS', 'app/api/website-analytics/collect/route.js', 'Access-Control-Allow-Origin');
has('collect route allows the content type header', 'app/api/website-analytics/collect/route.js', 'Access-Control-Allow-Headers');
has('collect route calls the recorder', 'app/api/website-analytics/collect/route.js', 'recordWebsiteEvent');
has('collect route answers 202 for a write', 'app/api/website-analytics/collect/route.js', '202)');
has('collect route answers 413 for a large body', 'app/api/website-analytics/collect/route.js', 'PAYLOAD_TOO_LARGE');
has('collect route answers 415 for a wrong type', 'app/api/website-analytics/collect/route.js', 'BAD_CONTENT_TYPE');
has('collect route answers 429 with a retry', 'app/api/website-analytics/collect/route.js', 'Retry-After');
has(
  'collect route does not reveal an existing order',
  'app/api/website-analytics/collect/route.js',
  'never returns anything about existing data'
);

const collectText = text('lib/website-analytics/collect.js');
const rateAt = collectText.indexOf('collectRateLimiter.check');
const validateAt = collectText.indexOf('normaliseWebsiteEvent(body');
const connectAt = collectText.indexOf('await dbConnect()');
ok('collector rate-limits first', rateAt > -1 && rateAt < validateAt, { rateAt, validateAt });
ok('collector validates before opening the database', validateAt > -1 && validateAt < connectAt, { validateAt, connectAt });
ok('collector writes only after validation', collectText.includes('WebsiteEvent.create(normalised.event)'));
ok('collector treats a duplicate as a no-op', collectText.includes("err?.code === 11000") && collectText.includes("outcome: 'duplicate'"));

has('validation rebuilds the event from safe fields', 'lib/website-analytics/validation.js', 'const event = {');
hasNot('validation does not spread the request body', 'lib/website-analytics/validation.js', '...body');
has('validation defaults consent to required', 'lib/website-analytics/validation.js', 'consent_required');
has('validation rejects declined consent', 'lib/website-analytics/validation.js', 'consent_denied');
has('validation enforces DNT', 'lib/website-analytics/validation.js', "header(headers, 'dnt')");
has('validation enforces Global Privacy Control', 'lib/website-analytics/validation.js', "'sec-gpc'");
has('validation drops bot traffic', 'lib/website-analytics/validation.js', "skip('bot'");
has('validation requires an order id for a purchase', 'lib/website-analytics/validation.js', "fail('order_required')");
has('validation hashes the IP', 'lib/website-analytics/validation.js', 'hashIp(ip)');
has('validation treats order ids as identifiers, not free text', 'lib/website-analytics/validation.js', 'cleanId(body.orderId');
has('validation uses the purchase dedupe key only for purchases', 'lib/website-analytics/validation.js', "type === 'purchase' && orderId");
has('validation keeps only parsed device fields', 'lib/website-analytics/validation.js', 'deviceType: parsedUa.deviceType');
hasNot('validation stores no raw IP field', 'lib/website-analytics/validation.js', 'ip:');
hasNot('validation stores no raw User-Agent field', 'lib/website-analytics/validation.js', 'userAgent:');

has('privacy hashes with SHA-256', 'lib/website-analytics/privacy.js', "createHash('sha256')");
has('privacy reads a deployment salt', 'lib/website-analytics/privacy.js', 'WEBSITE_ANALYTICS_HASH_SALT');
has('privacy strips query strings from paths', 'lib/website-analytics/privacy.js', "split('?')[0]");
has('privacy parses the User-Agent', 'lib/website-analytics/privacy.js', 'export function parseUserAgent');
has('privacy allow-lists metadata keys', 'lib/website-analytics/privacy.js', 'PII_KEY');
has('privacy redacts email addresses', 'lib/website-analytics/privacy.js', 'EMAIL_RE');
has('privacy flags internal hosts', 'lib/website-analytics/privacy.js', 'WEBSITE_ANALYTICS_INTERNAL_HOSTS');

/* ==========================================================================
   5. Tracker safety
   ========================================================================== */
console.log('\n--- 5. Tracker safety ---');

const tracker = text('public/we-analytics.js');
const hasTracker = (name, needle) => ok(name, tracker.includes(needle), 'missing from public/we-analytics.js');
const hasNotTracker = (name, needle) => ok(name, !tracker.includes(needle), 'unexpected in public/we-analytics.js');

hasTracker('tracker names the collect endpoint', '/api/website-analytics/collect');
hasTracker('tracker uses sendBeacon where possible', 'navigator.sendBeacon');
hasTracker('tracker falls back to fetch with keepalive', 'keepalive: true');
hasTracker('tracker omits credentials', "credentials: 'omit'");
hasTracker('tracker sends a simple text body', "text/plain;charset=UTF-8");
hasTracker('tracker caps its own payload', 'MAX_BODY = 12000');
hasTracker('tracker consent key is explicit', "CONSENT_KEY = 'we_analytics_consent'");
hasTracker('tracker defaults consent to required', "|| 'required'");
hasTracker('tracker checks DNT', "navigator.doNotTrack === '1'");
hasTracker('tracker checks Global Privacy Control', 'navigator.globalPrivacyControl === true');
hasTracker('tracker exposes a consent function', 'function consent(value)');
hasTracker('tracker exposes its state', 'get state()');
hasTracker('tracker clears ids on denial', 'clearIds()');
hasTracker('tracker sends only the pathname', "path: location.pathname || '/'");
hasTracker('tracker sends only the referrer host', 'referrerHost: touch.referrerHost || undefined');
hasTracker('tracker reads UTM values individually', "get('utm_source')");
hasTracker('tracker persists campaign attribution for the session', "ATTR_KEY = 'we_analytics_attribution'");
hasTracker('tracker reads stored attribution', 'readAttribution()');
hasTracker('tracker clears attribution with the ids', 'sessionStorage.removeItem(ATTR_KEY)');
hasTracker('tracker suppresses same-site referrers', 'function externalReferrer');
hasTracker('tracker measures the payload in bytes', 'byteLength(body) <= MAX_BODY');
hasTracker('tracker refuses a purchase without an order', "type === 'purchase' && !payload.orderId");
hasTracker('tracker generates a random event id', "randomId('e_')");
hasTracker('tracker hooks SPA navigation', 'history.pushState');
hasTracker('tracker handles a declined state', "next === 'denied'");

hasNotTracker('tracker does not use cookies', 'document.cookie');
hasNotTracker('tracker does not read forms', 'document.forms');
hasNotTracker('tracker does not query the page for inputs', 'querySelector');
hasNotTracker('tracker does not send a full URL as the path', 'path: location.href');
hasNotTracker('tracker does not send the full referrer URL', 'referrer: document.referrer');
hasNotTracker('tracker does not use credentials include', "credentials: 'include'");
hasNotTracker('tracker has no hard-coded storefront origin', 'https://shop.example.com');

let trackerParses = true;
try {
  /* Parsing only. Browser globals are not touched until the script runs. */
  new Function(tracker);
} catch (err) {
  trackerParses = false;
  console.log('        parse error: ' + err.message);
}
ok('tracker parses as JavaScript', trackerParses);
ok('tracker is not empty', tracker.length > 2000);

/* ==========================================================================
   6. Model, dedupe and retention
   ========================================================================== */
console.log('\n--- 6. Model, dedupe and retention ---');

const schema = WebsiteEvent.schema;
const indexes = schema.indexes();
const findIndex = (fields) => indexes.find(([definition]) => same(definition, fields));
const eventIdIndex = findIndex({ eventId: 1 });
const dedupeIndex = findIndex({ dedupeKey: 1 });
const ttlIndex = indexes.find(
  ([definition, options]) => same(definition, { occurredAt: 1 })
    && options?.expireAfterSeconds !== undefined
);

ok('event id index exists', Boolean(eventIdIndex));
ok('event id index is unique', Boolean(eventIdIndex?.[1]?.unique));
ok('event id index is sparse', Boolean(eventIdIndex?.[1]?.sparse));
ok('dedupe key index exists', Boolean(dedupeIndex));
ok('dedupe key index is unique', Boolean(dedupeIndex?.[1]?.unique));
ok('dedupe key index is sparse', Boolean(dedupeIndex?.[1]?.sparse));
ok('occurredAt has a TTL index', Boolean(ttlIndex));
ok(
  'the TTL is 400 days',
  ttlIndex?.[1]?.expireAfterSeconds === 400 * 24 * 60 * 60,
  ttlIndex?.[1]
);
ok('the collection is websiteevent', WebsiteEvent.collection.collectionName === 'websiteevent');
ok('event types include pageview', WEBSITE_EVENT_TYPES.includes('pageview'));
ok('event types include purchase', WEBSITE_EVENT_TYPES.includes('purchase'));
ok('event types include search', WEBSITE_EVENT_TYPES.includes('search'));

const paths = Object.keys(schema.paths);
ok('the schema has an IP hash', paths.includes('ipHash'));
ok('the schema has no raw IP path', !paths.includes('ip') && !paths.includes('ipAddress'));
ok('the schema has no raw User-Agent path', !paths.includes('userAgent') && !paths.includes('user_agent'));
ok('the schema keeps parsed device fields', ['deviceType', 'browser', 'os'].every((key) => paths.includes(key)));
ok('the schema keeps the session and visitor ids', paths.includes('sessionId') && paths.includes('visitorId'));
ok('the schema keeps the attribution channel', paths.includes('channel'));
ok('the schema keeps the order id and value', paths.includes('orderId') && paths.includes('value'));

const modelText = text('models/WebsiteEvent.js');
has('model documents the dedupe rule', 'models/WebsiteEvent.js', 'dedupeKey');
has('model documents the 400-day retention', 'models/WebsiteEvent.js', '400 days');
has('model documents what is not stored', 'models/WebsiteEvent.js', 'raw IP address');

/* ==========================================================================
   7. Missing tracking versus a real zero
   ========================================================================== */
console.log('\n--- 7. Missing tracking versus a real zero ---');

const notInstalled = summariseWebsiteEvents({ tracking: { installed: false } });
const installedEmpty = summariseWebsiteEvents({ events: [], tracking: { installed: true } });

ok('no tracking yields null visitors', notInstalled.kpis.visitors.value === null);
ok('no tracking yields null sessions', notInstalled.kpis.sessions.value === null);
ok('no tracking yields null revenue', notInstalled.kpis.revenue.value === null);
ok('no tracking sets installed false', notInstalled.tracking.installed === false);
ok('no tracking sets hasDataInRange false', notInstalled.tracking.hasDataInRange === false);
ok('installed with no events yields zero visitors', installedEmpty.kpis.visitors.value === 0);
ok('installed with no events yields zero pageviews', installedEmpty.kpis.pageviews.value === 0);
ok('installed with no events is not null', installedEmpty.kpis.visitors.value !== null);
ok('installed with no events sets installed true', installedEmpty.tracking.installed === true);
ok('installed with no events sets hasDataInRange false', installedEmpty.tracking.hasDataInRange === false);
ok('installed with no events has no conversion denominator', installedEmpty.kpis.conversionRate.value === null);

const onePageview = summariseWebsiteEvents({
  events: [{
    type: 'pageview',
    path: '/',
    sessionId: 's1',
    visitorId: 'v1',
    occurredAt: new Date(),
  }],
  tracking: { installed: true },
});
ok('a real pageview counts', onePageview.kpis.pageviews.value === 1);
ok('a real visitor counts', onePageview.kpis.visitors.value === 1);

has('service explains missing tracking', 'lib/website-analytics/service.js', 'not tracked rather than zero');
has('service explains a real zero', 'lib/website-analytics/service.js', 'real zero for the period');
has('service caps a large period', 'lib/website-analytics/service.js', 'EVENT_LIMIT = 20000');
has('service keeps the newest events when capped', 'lib/website-analytics/service.js', 'sort({ occurredAt: -1 })');
has('service reports truncation', 'lib/website-analytics/service.js', 'tracking.truncated');
has('service keeps the comparison window', 'lib/website-analytics/service.js', 'previousWindow');
has('dashboard aggregates website events separately', 'lib/dashboard/analytics.js', 'async function websiteSummary');
has('dashboard website card respects location restrictions', 'lib/dashboard/analytics.js', 'websiteEventFilter(scope)');
has('dashboard website metrics are null when not installed', 'lib/dashboard/analytics.js', 'installed ? (row?.events || 0) : null');
has('dashboard keeps website revenue out of net sales', 'lib/dashboard/analytics.js', 'not added to net sales');

/* A direct visit must not be reported as a referral. */
ok('direct traffic classifies as Direct', classifyChannel({ source: 'Direct', medium: 'none' }) === 'Direct');
ok('a missing source classifies as Direct', classifyChannel({}) === 'Direct');
const internalVisit = attributionFrom({ referrer: 'https://shop.example/cart', siteHost: 'shop.example' });
ok('same-site navigation keeps no referrer host', internalVisit.referrerHost === '');
ok('same-site navigation is not called a source', internalVisit.source === 'Direct');
ok('a CSV formula is neutralised', csvCell('=1+1') === "'=1+1");

/* ==========================================================================
   8. Package scripts and documentation
   ========================================================================== */
console.log('\n--- 8. Package scripts and documentation ---');

const scripts = pkg.scripts || {};
ok('package.json has test:dashboard', typeof scripts['test:dashboard'] === 'string' && scripts['test:dashboard'].includes('scripts/testDashboard.mjs'));
ok('test:dashboard uses the alias register', typeof scripts['test:dashboard'] === 'string' && scripts['test:dashboard'].includes('aliasRegister.mjs'));
ok('package.json has test:website-analytics', typeof scripts['test:website-analytics'] === 'string' && scripts['test:website-analytics'].includes('scripts/verifyWebsiteAnalytics.mjs'));
ok('test:website-analytics uses the alias register', typeof scripts['test:website-analytics'] === 'string' && scripts['test:website-analytics'].includes('aliasRegister.mjs'));

const doc = text('WEBSITE_ANALYTICS.md');
const docHas = (name, needle, ci = false) => {
  const found = ci ? lower(doc).includes(lower(needle)) : doc.includes(needle);
  ok(name, found, 'missing: ' + needle);
};
ok('doc has content', doc.length > 4000);
docHas('doc includes the install snippet', 'data-business');
docHas('doc includes the endpoint', '/api/website-analytics/collect');
docHas('doc names the consent key', 'we_analytics_consent');
docHas('doc explains DNT', 'Do Not Track');
docHas('doc explains Global Privacy Control', 'globalPrivacyControl');
docHas('doc explains 400-day retention', '400 days');
docHas('doc lists the origin allow-list', 'WEBSITE_ANALYTICS_ALLOWED_ORIGINS');
docHas('doc lists the hash salt', 'WEBSITE_ANALYTICS_HASH_SALT');
docHas('doc lists the implied-consent switch', 'WEBSITE_ANALYTICS_IMPLIED_CONSENT');
docHas('doc explains deduplication', 'dedupe', true);
docHas('doc names the purchase dedupe key', 'purchase:<orderId>');
docHas('doc explains missing tracking versus zero', 'Missing tracking is not zero', true);
docHas('doc explains separate website revenue', 'not added to net sales', true);
docHas('doc names the dashboard test', 'npm run test:dashboard');
docHas('doc names the analytics test', 'npm run test:website-analytics');
docHas('doc names the overview route', '/api/website-analytics/overview');
docHas('doc names the export route', '/api/website-analytics/export');

/* ==========================================================================
   Result
   ========================================================================== */
console.log('\n----------------------------------------');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('----------------------------------------');
if (fail > 0) process.exitCode = 1;
