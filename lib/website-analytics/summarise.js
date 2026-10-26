/* Pure website analytics.

   Missing tracking and zero traffic are different answers:

     tracking.installed = false  -> metrics are null ("not tracked")
     installed, no events         -> metrics are 0 ("tracked, no traffic")
     installed, events            -> real counts

   The UI relies on that distinction, so do not replace a null with 0 to make
   a card look tidier. */

import { changePercent, round2 } from '@/lib/dashboard/calculations';
import { enumerateDays, istDateKeyLabel, istDayKey } from '@/lib/dashboard/range';
import { channelForEvent } from '@/lib/dashboard/storefront';

const pct = (part, whole) => (whole ? round2((part / whole) * 100) : null);

function dateOf(value) {
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function bump(map, key) {
  map.set(key, (map.get(key) || 0) + 1);
}

export function summariseWebsiteEvents({
  events = [],
  previous = null,
  tracking = { installed: false },
  range = null,
} = {}) {
  const installed = Boolean(tracking?.installed);
  const blankKpi = () => ({ value: null, previous: null, change: null, available: false });

  if (!installed) {
    return {
      tracking: {
        installed: false,
        firstEventAt: tracking?.firstEventAt || null,
        lastEventAt: tracking?.lastEventAt || null,
        hasDataInRange: false,
        truncated: Boolean(tracking?.truncated),
      },
      kpis: {
        visitors: blankKpi(),
        sessions: blankKpi(),
        pageviews: blankKpi(),
        purchases: blankKpi(),
        revenue: blankKpi(),
        conversionRate: blankKpi(),
        bounceRate: blankKpi(),
        avgSession: blankKpi(),
      },
      daily: { labels: [], pageviews: [], sessions: [] },
      funnel: {
        steps: [
          { key: 'sessions', label: 'Sessions', value: null, rate: null },
          { key: 'productViews', label: 'Product views', value: null, rate: null },
          { key: 'addToCart', label: 'Add to cart', value: null, rate: null },
          { key: 'checkout', label: 'Checkout', value: null, rate: null },
          { key: 'purchases', label: 'Purchases', value: null, rate: null },
        ],
        conversionRate: null,
      },
      topPages: [],
      sources: [],
      referrers: [],
      devices: [],
      countries: [],
      products: [],
      searches: [],
      recentPurchases: [],
      hasDataInRange: false,
      range: range ? { fromKey: range.fromKey, toKey: range.toKey, label: range.label, days: range.days } : null,
    };
  }

  const sessions = new Map();
  const visitors = new Set();
  const pages = new Map();
  const sources = new Map();
  const referrers = new Map();
  const devices = new Map();
  const countries = new Map();
  const products = new Map();
  const searches = new Map();
  const funnelSessions = {
    productViews: new Set(),
    addToCart: new Set(),
    checkout: new Set(),
    purchases: new Set(),
  };
  const purchases = [];
  const dayKeys = range ? enumerateDays(range) : [];
  const days = new Map(dayKeys.map((key) => [key, { pageviews: 0, sessions: new Set() }]));

  let pageviews = 0;
  let productViews = 0;
  let addToCart = 0;
  let checkoutStarts = 0;
  let revenue = 0;

  const sessionOf = (id) => {
    if (!sessions.has(id)) sessions.set(id, { first: null, last: null, pageviews: 0 });
    return sessions.get(id);
  };

  events.forEach((event) => {
    const at = dateOf(event.occurredAt);
    if (!at) return;
    const sid = String(event.sessionId || '').trim() || `anon:${at.getTime()}:${event.path || ''}`;
    const session = sessionOf(sid);
    if (!session.first || at < session.first) session.first = at;
    if (!session.last || at > session.last) session.last = at;
    if (event.visitorId) visitors.add(String(event.visitorId)); else visitors.add(sid);

    const type = String(event.type || '').toLowerCase();
    if (type === 'pageview') {
      pageviews += 1;
      session.pageviews += 1;
      const path = event.path || '/';
      if (!pages.has(path)) pages.set(path, { path, views: 0, visitors: new Set(), sessions: new Set() });
      const page = pages.get(path);
      page.views += 1;
      page.visitors.add(String(event.visitorId || sid));
      page.sessions.add(sid);
    }
    if (type === 'product_view') {
      productViews += 1;
      funnelSessions.productViews.add(sid);
    }
    if (type === 'add_to_cart') {
      addToCart += 1;
      funnelSessions.addToCart.add(sid);
    }
    if (type === 'checkout_start') {
      checkoutStarts += 1;
      funnelSessions.checkout.add(sid);
    }
    if (type === 'purchase') {
      const value = Number(event.value) || 0;
      revenue += value;
      funnelSessions.purchases.add(sid);
      purchases.push({
        orderId: event.orderId || '',
        value: round2(value),
        currency: event.currency || 'INR',
        productId: event.productId || '',
        productName: event.productName || '',
        path: event.path || '',
        channel: channelForEvent(event),
        occurredAt: at.toISOString(),
      });
    }

    const channel = channelForEvent(event);
    if (!sources.has(channel)) {
      sources.set(channel, { label: channel, sessions: new Set(), pageviews: 0, purchases: 0, revenue: 0 });
    }
    const source = sources.get(channel);
    source.sessions.add(sid);
    if (type === 'pageview') source.pageviews += 1;
    if (type === 'purchase') {
      source.purchases += 1;
      source.revenue = round2(source.revenue + (Number(event.value) || 0));
    }

    if (event.referrerHost) {
      if (!referrers.has(event.referrerHost)) {
        referrers.set(event.referrerHost, { host: event.referrerHost, sessions: new Set(), pageviews: 0 });
      }
      const referrer = referrers.get(event.referrerHost);
      referrer.sessions.add(sid);
      if (type === 'pageview') referrer.pageviews += 1;
    }

    const device = event.deviceType || '';
    if (type === 'pageview' && device) {
      if (!devices.has(device)) devices.set(device, new Set());
      devices.get(device).add(sid);
    }

    const country = event.country || '';
    if (type === 'pageview' && country) {
      if (!countries.has(country)) countries.set(country, new Set());
      countries.get(country).add(sid);
    }

    if (event.productId || event.productName) {
      const key = event.productId || event.productName;
      if (!products.has(key)) {
        products.set(key, {
          productId: event.productId || '',
          name: event.productName || event.productId || 'Product',
          views: 0,
          addToCart: 0,
          purchases: 0,
          revenue: 0,
        });
      }
      const product = products.get(key);
      if (type === 'product_view') product.views += 1;
      if (type === 'add_to_cart') product.addToCart += 1;
      if (type === 'purchase') {
        product.purchases += 1;
        product.revenue = round2(product.revenue + (Number(event.value) || 0));
      }
    }

    if (type === 'search') {
      const term = String(event.searchQuery || '').trim().toLowerCase();
      if (term) bump(searches, term);
    }

    const key = istDayKey(at);
    if (days.has(key)) {
      if (type === 'pageview') days.get(key).pageviews += 1;
      days.get(key).sessions.add(sid);
    }
  });

  const sessionCount = sessions.size;
  const withDurations = [...sessions.values()].filter((s) => s.first && s.last);
  const avgSession = withDurations.length
    ? round2(withDurations.reduce((sum, s) => sum + Math.max(0, (s.last - s.first) / 1000), 0) / withDurations.length)
    : null;
  const pageviewSessions = [...sessions.values()].filter((s) => s.pageviews > 0).length;
  const bounces = [...sessions.values()].filter((s) => s.pageviews === 1).length;
  const bounceRate = pageviewSessions ? round2((bounces / pageviewSessions) * 100) : null;
  const conversionRate = sessionCount ? round2((funnelSessions.purchases.size / sessionCount) * 100) : null;
  const revenueRounded = round2(revenue);

  const prev = previous || {};
  const prevSessions = Number(prev.sessions) || 0;
  const prevConversion = prevSessions ? round2(((Number(prev.purchases) || 0) / prevSessions) * 100) : null;

  const kpi = (value, before, { rate = false } = {}) => ({
    value,
    previous: before === undefined ? null : before,
    change: rate
      ? (value === null || before === null || before === undefined ? null : round2(value - before))
      : changePercent(value, before),
    available: value !== null,
  });

  const pageviewLabels = range ? enumerateDays(range).map(istDateKeyLabel) : [];
  const daily = range
    ? {
      labels: pageviewLabels,
      pageviews: enumerateDays(range).map((key) => days.get(key)?.pageviews || 0),
      sessions: enumerateDays(range).map((key) => days.get(key)?.sessions.size || 0),
    }
    : { labels: [], pageviews: [], sessions: [] };

  const funnelSteps = [
    { key: 'sessions', label: 'Sessions', value: sessionCount, rate: sessionCount ? 100 : null },
    { key: 'productViews', label: 'Product views', value: funnelSessions.productViews.size, rate: pct(funnelSessions.productViews.size, sessionCount) },
    { key: 'addToCart', label: 'Add to cart', value: funnelSessions.addToCart.size, rate: pct(funnelSessions.addToCart.size, sessionCount) },
    { key: 'checkout', label: 'Checkout', value: funnelSessions.checkout.size, rate: pct(funnelSessions.checkout.size, sessionCount) },
    { key: 'purchases', label: 'Purchases', value: funnelSessions.purchases.size, rate: pct(funnelSessions.purchases.size, sessionCount) },
  ];

  const pageTotal = [...pages.values()].reduce((sum, page) => sum + page.views, 0);
  const topPages = [...pages.values()]
    .sort((a, b) => b.views - a.views)
    .slice(0, 10)
    .map((page) => ({
      path: page.path,
      views: page.views,
      visitors: page.visitors.size,
      sessions: page.sessions.size,
      share: pct(page.views, pageTotal) || 0,
    }));

  const sourceRows = [...sources.values()]
    .sort((a, b) => b.sessions.size - a.sessions.size || b.pageviews - a.pageviews)
    .map((source) => ({
      label: source.label,
      sessions: source.sessions.size,
      pageviews: source.pageviews,
      purchases: source.purchases,
      revenue: round2(source.revenue),
      share: pct(source.sessions.size, sessionCount) || 0,
    }));

  const referrerRows = [...referrers.values()]
    .sort((a, b) => b.sessions.size - a.sessions.size)
    .slice(0, 10)
    .map((row) => ({ host: row.host, sessions: row.sessions.size, pageviews: row.pageviews }));

  const deviceRows = [...devices.entries()]
    .map(([label, set]) => ({ label, sessions: set.size, share: pct(set.size, sessionCount) || 0 }))
    .sort((a, b) => b.sessions - a.sessions);

  const countryRows = [...countries.entries()]
    .map(([label, set]) => ({ label, sessions: set.size, share: pct(set.size, sessionCount) || 0 }))
    .sort((a, b) => b.sessions - a.sessions)
    .slice(0, 10);

  const productRows = [...products.values()]
    .sort((a, b) => b.views - a.views || b.purchases - a.purchases)
    .slice(0, 10)
    .map((product) => ({
      ...product,
      conversionRate: product.views ? round2((product.purchases / product.views) * 100) : null,
    }));

  return {
    tracking: {
      installed: true,
      firstEventAt: tracking?.firstEventAt || null,
      lastEventAt: tracking?.lastEventAt || null,
      hasDataInRange: events.length > 0,
      truncated: Boolean(tracking?.truncated),
    },
    kpis: {
      visitors: kpi(visitors.size, prev.visitors),
      sessions: kpi(sessionCount, prev.sessions),
      pageviews: kpi(pageviews, prev.pageviews),
      purchases: kpi(purchases.length, prev.purchases),
      revenue: kpi(revenueRounded, prev.revenue),
      conversionRate: kpi(conversionRate, prevConversion, { rate: true }),
      bounceRate: kpi(bounceRate, prev.bounceRate === undefined ? null : prev.bounceRate, { rate: true }),
      avgSession: kpi(avgSession, prev.avgSession === undefined ? null : prev.avgSession),
    },
    daily,
    funnel: { steps: funnelSteps, conversionRate },
    topPages,
    sources: sourceRows,
    referrers: referrerRows,
    devices: deviceRows,
    countries: countryRows,
    products: productRows,
    searches: [...searches.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([term, count]) => ({ term, count })),
    recentPurchases: purchases
      .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime())
      .slice(0, 10),
    hasDataInRange: events.length > 0,
    range: range ? { fromKey: range.fromKey, toKey: range.toKey, label: range.label, days: range.days } : null,
    pageviewSessions,
    addToCartEvents: addToCart,
    checkoutStarts,
    productViews,
  };
}
