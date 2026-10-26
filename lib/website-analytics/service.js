import mongoose from 'mongoose';
import { loadDashboardOptions } from '@/lib/dashboard/access';
import {
  addDays,
  buildRange,
  comparisonRange,
  diffDays,
  eachDay,
  formatDateRange,
  todayInIndia,
} from '@/lib/dashboard/date';
import { websiteStatusOf } from '@/lib/dashboard/storefront';

/* ==========================================================================
   Website analytics — Woven Essence storefront.

   The storefront and this ERP share one MongoDB database. This module reads
   the documents the website already writes and never writes back to them:

     visits           daily per-branch page counters written by the storefront
     orders           the authoritative online order record
     customers        storefront accounts (createdAt, lastLoginAt)
     carts            saved storefront carts
     ecommerceproduct catalogue, for product identity
     websiteevents    first-party tracker feed (see models/WebsiteEvent.js)

   Every figure below is a count or a sum of real documents. A metric whose
   source does not exist yet is returned as null with a reason, never as zero
   dressed up as a measurement.

   Scope: the ERP session decides which branches may be looked at. Visits and
   orders are narrowed to those branches. Shop-wide metrics (accounts, carts,
   tracker events) are only shown to a session that may see every branch,
   because those collections carry no branch attribution to narrow by.
   ========================================================================== */

export const MAX_RANGE_DAYS = 366;
const ORDER_CAP = 5000;
const CART_ABANDON_HOURS = 24;

const TZ = 'Asia/Kolkata';
const CURRENCY = 'INR';

export const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'custom', label: 'Custom range' },
];

export const COMPARISON_OPTIONS = [
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'previous_year', label: 'Previous year' },
  { value: 'none', label: 'No comparison' },
];

const COMPARISON_KINDS = new Set(COMPARISON_OPTIONS.map((c) => c.value));

export const PAGE_TYPE_LABELS = {
  home: 'Home',
  catalog: 'Product listing',
  product: 'Product page',
  account: 'Account',
  cart: 'Cart',
  checkout: 'Checkout',
  other: 'Other',
};

export const SOURCE_LABELS = {
  direct: 'Direct',
  organic: 'Organic search',
  paid: 'Paid advertising',
  instagram: 'Instagram',
  facebook: 'Facebook',
  referral: 'Referral',
  email: 'Email campaign',
  social: 'Other social',
  unknown: 'Unknown',
};

export const DEVICE_LABELS = { desktop: 'Desktop', mobile: 'Mobile', tablet: 'Tablet', unknown: 'Unknown' };

export class AnalyticsError extends Error {
  constructor(status, message, { code = '', field = '' } = {}) {
    super(message);
    this.name = 'AnalyticsError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

/* ------------------------------------------------------------------ dates */

const utcDay = (dateString) => new Date(`${dateString}T00:00:00.000Z`);

function presetRange(preset, today) {
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { start: day, end: day };
    }
    case 'last_7':
      return { start: addDays(today, -6), end: today };
    case 'last_90':
      return { start: addDays(today, -89), end: today };
    case 'this_month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'previous_month': {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = addDays(firstOfThis, -1);
      return { start: `${lastOfPrev.slice(0, 7)}-01`, end: lastOfPrev };
    }
    case 'last_30':
    default:
      return { start: addDays(today, -29), end: today };
  }
}

function resolveRange(sp, today) {
  const rawStart = String(sp.get('startDate') || '').trim();
  const rawEnd = String(sp.get('endDate') || '').trim();
  const preset = String(sp.get('preset') || (rawStart && rawEnd ? 'custom' : 'last_30')).trim();

  if (rawStart || rawEnd) {
    if (!rawStart || !rawEnd) {
      throw new AnalyticsError(422, 'startDate and endDate must be supplied together.', {
        code: 'INVALID_FILTER', field: rawStart ? 'endDate' : 'startDate',
      });
    }
    return { range: buildRange(rawStart, rawEnd), preset: 'custom' };
  }

  const period = presetRange(preset, today);
  return { range: buildRange(period.start, period.end), preset };
}

/* ------------------------------------------------------------------ maths */

function change(current, previous) {
  if (current === null || current === undefined || !Number.isFinite(Number(current))) return null;
  if (previous === null || previous === undefined || !Number.isFinite(Number(previous)) || Number(previous) === 0) return null;
  return ((Number(current) - Number(previous)) / Math.abs(Number(previous))) * 100;
}

function round(value, digits = 2) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return null;
  const factor = 10 ** digits;
  return Math.round(Number(value) * factor) / factor;
}

function rate(numerator, denominator) {
  if (!Number.isFinite(Number(numerator)) || !Number.isFinite(Number(denominator)) || Number(denominator) <= 0) return null;
  return (Number(numerator) / Number(denominator)) * 100;
}

function titleCase(value) {
  return String(value || '')
    .trim()
    .replace(/\s+/g, ' ')
    .replace(/\b[a-z]/g, (c) => c.toUpperCase());
}

function placeOf(order) {
  const ship = order?.shippingAddress || {};
  const bill = order?.billingAddress || {};
  const city = titleCase(ship.city || bill.city || order?.branchCity || '');
  const state = titleCase(ship.state || bill.state || '');
  const country = titleCase(ship.country || bill.country || 'India');
  return { city: city || 'Not recorded', state: state || 'Not recorded', country: country || 'Not recorded' };
}

function customerKeyOf(order) {
  return String(order?.customer || order?.customerEmail || order?.customerPhone || order?.orderNumber || '');
}

function orderValue(order) {
  const value = Number(order?.amounts?.grandTotal);
  if (Number.isFinite(value)) return value;
  const subtotal = Number(order?.amounts?.subtotal);
  return Number.isFinite(subtotal) ? subtotal : 0;
}

function lineValue(line) {
  const direct = Number(line?.lineSubtotal);
  if (Number.isFinite(direct)) return direct;
  const qty = Number(line?.quantity);
  const price = Number(line?.unitPrice);
  return Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0;
}

function emptyTotals() {
  return {
    orders: 0,
    revenue: 0,
    customers: new Set(),
    cancelled: 0,
    pendingPayment: 0,
    other: 0,
  };
}

function finaliseTotals(totals) {
  const orders = totals.orders;
  return {
    orders,
    revenue: round(totals.revenue),
    aov: orders ? round(totals.revenue / orders) : null,
    customers: totals.customers.size,
    excluded: totals.cancelled + totals.pendingPayment + totals.other,
  };
}

/* ------------------------------------------------------------------ loads */

async function branchIdsFor(access) {
  return access.authorizedBranches
    .map((branch) => (mongoose.Types.ObjectId.isValid(branch.branchId)
      ? new mongoose.Types.ObjectId(branch.branchId)
      : null))
    .filter(Boolean);
}

async function loadVisits(db, { start, end, branchIds }) {
  const filter = {
    day: { $gte: utcDay(start), $lt: utcDay(addDays(end, 1)) },
  };
  /* null means the session may see every branch; an array - even an empty one
     - means the query is narrowed to exactly those branches. */
  if (Array.isArray(branchIds)) filter.branch = { $in: branchIds };

  try {
    return await db.collection('visits').find(filter).project({
      day: 1, pageType: 1, views: 1, sessions: 1, branch: 1,
    }).limit(20000).toArray();
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return [];
    throw err;
  }
}

async function loadVisitFreshness(db) {
  try {
    const [latest] = await db.collection('visits').find({})
      .project({ day: 1 }).sort({ day: -1 }).limit(1).toArray();
    return latest?.day ? new Date(latest.day) : null;
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return null;
    throw err;
  }
}

async function loadOrders(db, { range, branchIds }) {
  const filter = { createdAt: { $gte: range.startDate, $lt: range.endExclusive } };
  if (Array.isArray(branchIds)) filter.branch = { $in: branchIds };

  try {
    const count = await db.collection('orders').countDocuments(filter);
    if (count > ORDER_CAP) {
      throw new AnalyticsError(413,
        `This selection contains ${count.toLocaleString('en-IN')} website orders. Narrow the dates to ${ORDER_CAP.toLocaleString('en-IN')} or fewer.`,
        { code: 'RANGE_TOO_LARGE' });
    }
    return await db.collection('orders').find(filter).project({
      orderNumber: 1, status: 1, amount: 1, amounts: 1, createdAt: 1, customer: 1,
      customerName: 1, customerEmail: 1, customerPhone: 1, shippingAddress: 1,
      billingAddress: 1, branchCity: 1, branchName: 1, payment: 1, lines: 1,
    }).sort({ createdAt: 1 }).limit(ORDER_CAP).toArray();
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) return [];
    throw err;
  }
}

async function loadCustomerAccounts(db, { range }) {
  const collection = db.collection('customers');
  const base = { deletedAt: null, isDeleted: { $ne: true } };
  const project = { createdAt: 1, lastLoginAt: 1, emailVerified: 1, status: 1 };

  try {
    const [created, loggedIn, total, verified, lastRegistered, lastLogin] = await Promise.all([
      collection.countDocuments({ ...base, createdAt: { $gte: range.startDate, $lt: range.endExclusive } }),
      collection.countDocuments({ ...base, lastLoginAt: { $gte: range.startDate, $lt: range.endExclusive } }),
      collection.countDocuments(base),
      collection.countDocuments({ ...base, emailVerified: true }),
      collection.findOne(base, { projection: { createdAt: 1 }, sort: { createdAt: -1 } }),
      collection.findOne({ ...base, lastLoginAt: { $ne: null } }, { projection: { lastLoginAt: 1 }, sort: { lastLoginAt: -1 } }),
    ]);
    return {
      created,
      loggedIn,
      total,
      verified,
      lastRegisteredAt: lastRegistered?.createdAt || null,
      lastLoginAt: lastLogin?.lastLoginAt || null,
      available: true,
    };
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) {
      return { created: null, loggedIn: null, total: null, verified: null, available: false };
    }
    throw err;
  }
}

async function loadCarts(db, { range, now }) {
  try {
    const docs = await db.collection('carts').find({
      createdAt: { $gte: range.startDate, $lt: range.endExclusive },
    }).project({ createdAt: 1, updatedAt: 1, lines: 1, customer: 1, branch: 1 })
      .limit(ORDER_CAP).toArray();

    const withItems = docs.filter((cart) => Array.isArray(cart.lines) && cart.lines.length > 0);
    const staleBefore = new Date(now.getTime() - CART_ABANDON_HOURS * 3600 * 1000);
    const abandoned = withItems.filter((cart) => {
      const touched = cart.updatedAt || cart.createdAt;
      return touched && new Date(touched) < staleBefore;
    });

    return {
      created: docs.length,
      withItems: withItems.length,
      abandoned: abandoned.length,
      stillActive: withItems.length - abandoned.length,
      abandonmentRate: rate(abandoned.length, withItems.length),
      inactivityHours: CART_ABANDON_HOURS,
      available: true,
    };
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) {
      return { created: null, withItems: null, abandoned: null, stillActive: null, abandonmentRate: null, available: false };
    }
    throw err;
  }
}

async function loadEvents(db, { range }) {
  try {
    const docs = await db.collection('websiteevents').find({
      ts: { $gte: range.startDate, $lt: range.endExclusive },
    }).project({
      event: 1, ts: 1, visitorId: 1, sessionId: 1, path: 1, pageType: 1,
      source: 1, device: 1, product: 1, orderId: 1, value: 1, campaign: 1,
      customerId: 1, country: 1, state: 1, city: 1,
    }).limit(50000).toArray();

    const [latest] = await db.collection('websiteevents').find({})
      .project({ ts: 1 }).sort({ ts: -1 }).limit(1).toArray();

    return { docs, lastEventAt: latest?.ts || null, available: true };
  } catch (err) {
    if (err?.codeName === 'NamespaceNotFound' || err?.code === 26) {
      return { docs: [], lastEventAt: null, available: true };
    }
    throw err;
  }
}

/* --------------------------------------------------------------- builders */

function buildVisits(rows) {
  const perDay = new Map();
  const perPageType = new Map();
  let pageViews = 0;
  let sessions = 0;

  rows.forEach((row) => {
    const views = Number(row.views) || 0;
    const sessionCount = Number(row.sessions) || 0;
    pageViews += views;
    sessions += sessionCount;

    const key = row.day ? new Date(row.day).toISOString().slice(0, 10) : '';
    if (key) {
      const day = perDay.get(key) || { pageViews: 0, sessions: 0 };
      day.pageViews += views;
      day.sessions += sessionCount;
      perDay.set(key, day);
    }

    const type = String(row.pageType || 'other');
    const entry = perPageType.get(type) || { views: 0, sessions: 0 };
    entry.views += views;
    entry.sessions += sessionCount;
    perPageType.set(type, entry);
  });

  return {
    pageViews,
    sessions,
    perDay,
    pageTypes: [...perPageType.entries()]
      .map(([key, value]) => ({ key, label: PAGE_TYPE_LABELS[key] || titleCase(key), ...value }))
      .sort((a, b) => b.views - a.views),
    documents: rows.length,
  };
}

function buildOrders(rows) {
  const totals = emptyTotals();
  const perDay = new Map();
  const perCity = new Map();
  const perState = new Map();
  const perProduct = new Map();
  const perCustomer = new Map();

  rows.forEach((order) => {
    const status = websiteStatusOf(order);
    if (status === 'excluded') {
      const raw = String(order.status || '').toLowerCase();
      if (raw === 'cancelled') totals.cancelled += 1;
      else totals.pendingPayment += 1;
      return;
    }
    if (status !== 'eligible') {
      const raw = String(order.status || '').toLowerCase();
      if (raw === 'cancelled') totals.cancelled += 1;
      else if (raw === 'pending_payment') totals.pendingPayment += 1;
      else totals.other += 1;
      return;
    }

    const value = orderValue(order);
    const key = customerKeyOf(order);
    totals.orders += 1;
    totals.revenue += value;
    if (key) totals.customers.add(key);

    const dayKey = order.createdAt ? new Date(order.createdAt).toISOString().slice(0, 10) : '';
    if (dayKey) {
      const day = perDay.get(dayKey) || { orders: 0, revenue: 0 };
      day.orders += 1;
      day.revenue += value;
      perDay.set(dayKey, day);
    }

    const place = placeOf(order);
    if (place.city !== 'Not recorded') {
      const cityEntry = perCity.get(place.city) || { ...emptyTotals(), state: place.state };
      cityEntry.orders += 1;
      cityEntry.revenue += value;
      cityEntry.customers.add(key);
      if (!cityEntry.state || cityEntry.state === 'Not recorded') cityEntry.state = place.state;
      perCity.set(place.city, cityEntry);
    }
    if (place.state !== 'Not recorded') {
      const stateEntry = perState.get(place.state) || { ...emptyTotals() };
      stateEntry.orders += 1;
      stateEntry.revenue += value;
      stateEntry.customers.add(key);
      perState.set(place.state, stateEntry);
    }

    const customer = perCustomer.get(key) || { orders: 0, revenue: 0, name: order.customerName || '' };
    customer.orders += 1;
    customer.revenue += value;
    if (order.customerName) customer.name = order.customerName;
    perCustomer.set(key, customer);

    (Array.isArray(order.lines) ? order.lines : []).forEach((line) => {
      const name = String(line.productName || line.itemCode || 'Unnamed item');
      const itemCode = String(line.itemCode || '');
      const productKey = `${itemCode}|${name}`;
      const qty = Number(line.quantity) || 0;
      const entry = perProduct.get(productKey) || {
        name, itemCode, quantity: 0, revenue: 0, orders: 0, imageUrl: line.imageUrl || '',
      };
      entry.quantity += qty;
      entry.revenue += lineValue(line);
      entry.orders += 1;
      perProduct.set(productKey, entry);
    });
  });

  const cities = [...perCity.entries()]
    .map(([city, entry]) => ({
      city,
      state: entry.state === 'Not recorded' ? '' : entry.state,
      ...finaliseTotals(entry),
    }))
    .sort((a, b) => b.revenue - a.revenue);

  const states = [...perState.entries()]
    .map(([state, entry]) => ({ state, ...finaliseTotals(entry) }))
    .sort((a, b) => b.revenue - a.revenue);

  const products = [...perProduct.values()]
    .map((entry) => ({ ...entry, revenue: round(entry.revenue) }))
    .sort((a, b) => b.revenue - a.revenue);

  const customers = [...perCustomer.entries()]
    .map(([key, entry]) => ({ key, ...entry, revenue: round(entry.revenue) }));

  return {
    totals: { ...finaliseTotals(totals), aov: totals.orders ? round(totals.revenue / totals.orders) : null },
    perDay,
    cities,
    states,
    products,
    customers,
    documents: rows.length,
  };
}

function buildEvents(events, range, now) {
  const docs = events.docs || [];
  const visitors = new Set();
  const sessions = new Set();
  const stageVisitors = new Map();
  const perSource = new Map();
  const perDevice = new Map();
  const perDay = new Map();

  /* A purchase stage is only credited when ingestion matched the order to an
     authoritative order document. A browser claim that matches nothing is
     stored (for diagnosis) but never counted as a conversion. */
  const stageOf = (event) => {
    if (event === 'session_start' || event === 'page_view') return 'session';
    if (event === 'product_view') return 'product';
    if (event === 'product_list_view' || event === 'search') return 'catalogue';
    if (event === 'login_success' || event === 'sign_up_success') return 'auth';
    if (event === 'add_to_cart') return 'cart';
    if (event === 'begin_checkout' || event === 'add_shipping_info' || event === 'add_payment_info') return 'checkout';
    if (event === 'purchase') return 'purchase';
    return null;
  };

  docs.forEach((doc) => {
    const visitor = String(doc.visitorId || '');
    if (visitor) visitors.add(visitor);
    if (doc.sessionId) sessions.add(String(doc.sessionId));

    const purchaseVerified = doc.event === 'purchase' && doc.verified === true;
    const stage = doc.event === 'purchase' && !purchaseVerified ? null : stageOf(doc.event);
    if (stage && visitor) {
      if (!stageVisitors.has(stage)) stageVisitors.set(stage, new Set());
      stageVisitors.get(stage).add(visitor);
    }

    const source = SOURCE_LABELS[doc.source] ? doc.source : 'unknown';
    const sourceEntry = perSource.get(source) || { visitors: new Set(), sessions: new Set(), purchases: 0, revenue: 0 };
    if (visitor) sourceEntry.visitors.add(visitor);
    if (doc.sessionId) sourceEntry.sessions.add(String(doc.sessionId));
    if (purchaseVerified) {
      sourceEntry.purchases += 1;
      sourceEntry.revenue += Number(doc.value) || 0;
    }
    perSource.set(source, sourceEntry);

    const device = DEVICE_LABELS[doc.device] ? doc.device : 'unknown';
    const deviceEntry = perDevice.get(device) || { visitors: new Set(), sessions: new Set(), purchases: 0, revenue: 0 };
    if (visitor) deviceEntry.visitors.add(visitor);
    if (doc.sessionId) deviceEntry.sessions.add(String(doc.sessionId));
    if (purchaseVerified) {
      deviceEntry.purchases += 1;
      deviceEntry.revenue += Number(doc.value) || 0;
    }
    perDevice.set(device, deviceEntry);

    const dayKey = doc.ts ? new Date(doc.ts).toISOString().slice(0, 10) : '';
    if (dayKey && visitor) {
      const day = perDay.get(dayKey) || new Set();
      day.add(visitor);
      perDay.set(dayKey, day);
    }
  });

  const newest = docs.reduce((latest, doc) => {
    const ts = doc.ts ? new Date(doc.ts) : null;
    return ts && (!latest || ts > latest) ? ts : latest;
  }, null);

  const recentWindow = new Date(now.getTime() - 5 * 60 * 1000);
  const recent = docs.filter((doc) => doc.ts && new Date(doc.ts) >= recentWindow);
  const recentVisitors = new Set(recent.map((doc) => String(doc.visitorId || '')).filter(Boolean));

  const asRows = (map) => [...map.entries()]
    .map(([key, entry]) => ({
      key,
      visitors: entry.visitors.size,
      sessions: entry.sessions.size,
      purchases: entry.purchases,
      revenue: round(entry.revenue),
      conversion: rate(entry.purchases, entry.visitors.size),
    }))
    .sort((a, b) => b.visitors - a.visitors);

  return {
    installed: docs.length > 0 || Boolean(events.lastEventAt),
    lastEventAt: newest || events.lastEventAt || null,
    eventCount: docs.length,
    visitors: visitors.size,
    sessions: sessions.size,
    pageViews: docs.filter((doc) => doc.event === 'page_view').length,
    stageVisitors,
    sources: asRows(perSource).map((row) => ({ ...row, source: row.key, label: SOURCE_LABELS[row.key] })),
    devices: asRows(perDevice).map((row) => ({ ...row, device: row.key, label: DEVICE_LABELS[row.key] })),
    perDay,
    recent: {
      windowMinutes: 5,
      activeVisitors: recentVisitors.size,
      events: recent.length,
      productViews: recent.filter((doc) => doc.event === 'product_view').length,
      addToCart: recent.filter((doc) => doc.event === 'add_to_cart').length,
      purchases: recent.filter((doc) => doc.event === 'purchase' && doc.verified === true).length,
    },
    rangeDays: diffDays(range.start, range.end) + 1,
  };
}

/* Page-view fallback funnel: uses the storefront's own page counters. The
   units differ per stage and the response says so, so the screen cannot
   present them as one population of people. */
function pageViewFunnel(visits, orderTotals) {
  const pageType = (type) => visits.pageTypes.find((row) => row.key === type)?.views || 0;
  const stages = [
    { key: 'sessions', label: 'Sessions started', count: visits.sessions, unit: 'sessions' },
    { key: 'catalogue', label: 'Product listing views', count: pageType('catalog'), unit: 'page views' },
    { key: 'product', label: 'Product page views', count: pageType('product'), unit: 'page views' },
    { key: 'cart', label: 'Cart page views', count: pageType('cart'), unit: 'page views' },
    { key: 'checkout', label: 'Checkout page views', count: pageType('checkout'), unit: 'page views' },
    { key: 'orders', label: 'Completed orders', count: orderTotals.orders, unit: 'orders' },
  ];
  return { mode: 'page_views', stages: attachFunnelRates(stages) };
}

function visitorFunnel(stageVisitors, purchaseCount) {
  const count = (stage) => stageVisitors.get(stage)?.size || 0;
  const purchaseVisitors = count('purchase');
  const stages = [
    { key: 'session', label: 'Website visitors', count: count('session'), unit: 'unique visitors' },
    { key: 'catalogue', label: 'Viewed products or searched', count: Math.max(count('catalogue'), count('product')), unit: 'unique visitors' },
    { key: 'auth', label: 'Logged in or registered', count: count('auth'), unit: 'unique visitors' },
    { key: 'cart', label: 'Added to cart', count: count('cart'), unit: 'unique visitors' },
    { key: 'checkout', label: 'Began checkout', count: count('checkout'), unit: 'unique visitors' },
    /* Verified tracker purchases are visitors. Without them the order count is
       a different unit and must not be turned into a percentage of people. */
    { key: 'purchase', label: 'Completed an order', count: purchaseVisitors || purchaseCount, unit: purchaseVisitors ? 'unique visitors' : 'orders' },
  ];
  return { mode: 'visitors', stages: attachFunnelRates(stages) };
}

/* A percentage is only computed between stages measured in the same unit.
   Sessions and page views are not a cohort, and 50 listing views against 47
   sessions is not "106% conversion" - it is two different rulers. */
function attachFunnelRates(stages) {
  return stages.map((stage, index) => {
    const previousStage = index === 0 ? null : stages[index - 1];
    const comparable = Boolean(previousStage) && previousStage.unit === stage.unit;
    return {
      ...stage,
      previous: previousStage ? previousStage.count : null,
      comparable,
      conversion: comparable ? rate(stage.count, previousStage.count) : null,
      dropOff: comparable
        ? Math.max(0, (Number(previousStage.count) || 0) - (Number(stage.count) || 0))
        : null,
    };
  });
}

/* ---------------------------------------------------------------- insights */

function buildInsights({ visits, orders, accounts, carts, events, coverage }) {
  const insights = [];

  if (!events.installed) {
    insights.push({
      tone: 'info',
      title: 'Visitor-level tracking is not installed yet',
      body: 'Unique visitors, guest browsers, traffic sources, device split and visitor geography need the first-party tracker on wovenessence.in. Until it is loaded, those panels stay unavailable rather than showing estimated numbers.',
      basis: 'No rows in the websiteevents collection for this period.',
    });
  }

  if (orders.totals.orders === 0 && (visits.pageViews > 0 || visits.sessions > 0)) {
    insights.push({
      tone: 'warn',
      title: 'Traffic arrived but no qualifying order was placed',
      body: `${visits.pageViews.toLocaleString('en-IN')} page views and ${visits.sessions.toLocaleString('en-IN')} sessions were recorded, with no confirmed, shipped or delivered website order inside the selected dates.`,
      basis: 'visits counter vs orders collection for the same range.',
    });
  }

  const checkoutViews = visits.pageTypes.find((row) => row.key === 'checkout')?.views || 0;
  if (checkoutViews > 0 && orders.totals.orders < checkoutViews) {
    const gap = checkoutViews - orders.totals.orders;
    insights.push({
      tone: 'warn',
      title: 'Checkout pages outnumber completed orders',
      body: `${checkoutViews.toLocaleString('en-IN')} checkout page views produced ${orders.totals.orders.toLocaleString('en-IN')} order${orders.totals.orders === 1 ? '' : 's'}. ${gap.toLocaleString('en-IN')} checkout view${gap === 1 ? '' : 's'} did not end in a recorded sale — payment failures, cancellations and repeats of the same visit are included in that gap.`,
      basis: 'visits.pageType = checkout, orders with status confirmed through delivered.',
    });
  }

  if (orders.cities.length) {
    const top = orders.cities[0];
    insights.push({
      tone: 'good',
      title: `${top.city} leads order revenue`,
      body: `${top.city} placed ${top.orders} order${top.orders === 1 ? '' : 's'} worth ₹${Math.round(top.revenue).toLocaleString('en-IN')}, an average of ₹${Math.round(top.aov || 0).toLocaleString('en-IN')} per order.`,
      basis: 'Shipping address on qualifying orders — delivery geography, not the visitor’s IP location.',
    });
  }

  if (orders.customers.length >= 2) {
    const repeat = orders.customers.filter((customer) => customer.orders > 1);
    if (repeat.length) {
      const revenue = repeat.reduce((sum, customer) => sum + customer.revenue, 0);
      insights.push({
        tone: 'good',
        title: 'Repeat buyers are already contributing',
        body: `${repeat.length} of ${orders.customers.length} buying customers placed more than one order in this window, accounting for ₹${Math.round(revenue).toLocaleString('en-IN')} of revenue.`,
        basis: 'Orders grouped by customer reference inside the selected dates.',
      });
    }
  }

  if (carts.available && carts.abandoned > 0) {
    insights.push({
      tone: 'warn',
      title: 'Carts left untouched',
      body: `${carts.abandoned} cart${carts.abandoned === 1 ? ' was' : 's were'} created with items and have not changed for ${carts.inactivityHours} hours or more. ${carts.stillActive} other cart${carts.stillActive === 1 ? ' is' : 's are'} still within the activity window.`,
      basis: 'carts collection, using updatedAt and an explicit 24-hour inactivity rule.',
    });
  }

  if (!accounts.available) {
    insights.push({
      tone: 'info',
      title: 'Storefront account history is not present',
      body: 'No customers collection could be read, so registrations and logged-in accounts cannot be reported.',
      basis: 'customers collection was not found.',
    });
  }

  if (!coverage.visits) {
    insights.push({
      tone: 'warn',
      title: 'The storefront page counter has no rows in this range',
      body: 'Page views and sessions are read from the storefront’s own visits collection. It has no records for the selected dates, so traffic figures are zero rather than estimated.',
      basis: 'visits collection for the selected date range.',
    });
  }

  return insights.slice(0, 6);
}

/* ------------------------------------------------------------- main build */

export async function buildWebsiteAnalytics(session, sp) {
  const access = await loadDashboardOptions(session);
  const db = access.db;
  const now = new Date();
  const today = todayInIndia(now);

  const { range, preset } = resolveRange(sp, today);
  if (range.days > MAX_RANGE_DAYS) {
    throw new AnalyticsError(422,
      `Select ${MAX_RANGE_DAYS} days or fewer (this range is ${range.days} days).`,
      { code: 'RANGE_TOO_LONG', field: 'endDate' });
  }

  const comparisonKind = String(sp.get('comparison') || 'previous_period').trim();
  if (!COMPARISON_KINDS.has(comparisonKind)) {
    throw new AnalyticsError(422,
      'comparison must be previous_period, previous_month, previous_year or none.',
      { code: 'INVALID_FILTER', field: 'comparison' });
  }
  const comparison = comparisonRange(range.start, range.end, comparisonKind);

  const rawBranch = String(sp.get('branch') || '').trim();
  let branchIds = await branchIdsFor(access);
  let branchLabel = 'All website branches';
  if (rawBranch) {
    const branch = access.authorizedBranches.find((b) => b.branchId === rawBranch);
    if (!branch) {
      throw new AnalyticsError(403, 'You do not have access to that branch.', { code: 'WRONG_BRANCH', field: 'branch' });
    }
    branchIds = branchIds.filter((id) => String(id) === branch.branchId);
    branchLabel = [branch.branchName, branch.city].filter(Boolean).join(' · ');
  }
  /* Shop-wide collections carry no branch field, so a branch-restricted view
     must not present them as if they were narrowed. */
  const shopWide = !rawBranch && access.unrestricted;
  const scopeBranchIds = !rawBranch && access.unrestricted ? null : branchIds;

  const [visitRows, comparisonVisitRows, orderRows, comparisonOrderRows, accounts, comparisonAccounts, carts, events, comparisonEvents, visitsFreshAt] = await Promise.all([
    loadVisits(db, { start: range.start, end: range.end, branchIds: scopeBranchIds }),
    comparison ? loadVisits(db, { start: comparison.start, end: comparison.end, branchIds: scopeBranchIds }) : [],
    loadOrders(db, { range, branchIds: scopeBranchIds }),
    comparison ? loadOrders(db, { range: comparison, branchIds: scopeBranchIds }) : [],
    shopWide ? loadCustomerAccounts(db, { range }) : Promise.resolve({ available: false, scoped: true }),
    shopWide && comparison ? loadCustomerAccounts(db, { range: comparison }) : Promise.resolve({ available: false }),
    shopWide ? loadCarts(db, { range, now }) : Promise.resolve({ available: false, scoped: true }),
    shopWide ? loadEvents(db, { range }) : Promise.resolve({ docs: [], lastEventAt: null, available: true, scoped: true }),
    shopWide && comparison ? loadEvents(db, { range: comparison }) : Promise.resolve({ docs: [] }),
    loadVisitFreshness(db),
  ]);

  const visits = buildVisits(visitRows);
  const comparisonVisits = buildVisits(comparisonVisitRows);
  const orders = buildOrders(orderRows);
  const comparisonOrders = buildOrders(comparisonOrderRows);
  const eventMetrics = buildEvents(events, range, now);
  const comparisonEventMetrics = buildEvents(comparisonEvents, comparison || range, now);

  /* Repeat purchase detection needs each buyer's full history, not just this
     window — two orders in the window is repeat, and so is one in the window
     preceded by an earlier one. */
  let historical = new Map();
  const buyerKeys = orders.customers.map((customer) => customer.key).filter(Boolean);
  if (buyerKeys.length) {
    const oids = buyerKeys.filter((key) => mongoose.Types.ObjectId.isValid(key))
      .map((key) => new mongoose.Types.ObjectId(key));
    try {
      const rows = await db.collection('orders').aggregate([
        { $match: { customer: { $in: oids } } },
        { $group: { _id: '$customer', first: { $min: '$createdAt' }, count: { $sum: 1 }, revenue: { $sum: '$amounts.grandTotal' } } },
      ]).toArray();
      historical = new Map(rows.map((row) => [String(row._id), row]));
    } catch (err) {
      if (err?.codeName !== 'NamespaceNotFound' && err?.code !== 26) throw err;
    }
  }

  const repeatCustomers = orders.customers.filter((customer) => {
    const record = historical.get(customer.key);
    return (record?.count || 0) > 1 || customer.orders > 1;
  });
  const repeatRevenue = repeatCustomers.reduce((sum, customer) => sum + customer.revenue, 0);
  const newBuyers = orders.customers.filter((customer) => {
    const record = historical.get(customer.key);
    return !record || !record.first || new Date(record.first) >= range.startDate;
  });

  const cards = [
    {
      key: 'visitors',
      label: 'Unique website visitors',
      value: eventMetrics.installed ? eventMetrics.visitors : null,
      previousValue: eventMetrics.installed && comparison ? comparisonEventMetrics.visitors : null,
      format: 'count',
      change: change(eventMetrics.visitors, comparisonEventMetrics.visitors),
      changeType: 'percent',
      note: eventMetrics.installed
        ? 'Distinct first-party visitor identifiers seen on wovenessence.in. One person on two devices is two identifiers.'
        : 'Requires the storefront tracker. No visitor identifiers have been collected yet.',
      unavailable: !eventMetrics.installed,
    },
    {
      key: 'sessions',
      label: 'Website sessions',
      value: visits.sessions,
      previousValue: comparisonVisits.sessions,
      format: 'count',
      change: change(visits.sessions, comparisonVisits.sessions),
      changeType: 'percent',
      note: 'Sessions counted by the storefront’s own visits collection; a session ends after 30 minutes without activity.',
    },
    {
      key: 'logins',
      label: 'Logged-in accounts',
      value: shopWide && accounts.available ? accounts.loggedIn : null,
      previousValue: shopWide && comparisonAccounts.available ? comparisonAccounts.loggedIn : null,
      format: 'count',
      change: change(accounts.loggedIn, comparisonAccounts.loggedIn),
      changeType: 'percent',
      note: 'Storefront accounts whose most recent successful login falls inside the period. Only the latest login is stored per account, so this is a floor, not a full login-event count.',
      unavailable: !shopWide || !accounts.available,
      unavailableReason: !shopWide ? 'Shop-wide account data is not shown on a single-branch view.' : 'No storefront accounts collection.',
    },
    {
      key: 'orders',
      label: 'Website orders',
      value: orders.totals.orders,
      previousValue: comparisonOrders.totals.orders,
      format: 'count',
      change: change(orders.totals.orders, comparisonOrders.totals.orders),
      changeType: 'percent',
      note: 'Confirmed, processing, packed, shipped, out-for-delivery or delivered orders only. Cancelled and pending-payment orders are excluded.',
    },
    {
      key: 'revenue',
      label: 'Website revenue',
      value: orders.totals.revenue,
      previousValue: comparisonOrders.totals.revenue,
      format: 'currency',
      change: change(orders.totals.revenue, comparisonOrders.totals.revenue),
      changeType: 'percent',
      note: 'Grand total of the qualifying orders above, before refunds. Average order value is shown in the sales panel.',
    },
    {
      key: 'conversion',
      label: 'Session conversion',
      value: rate(orders.totals.orders, visits.sessions),
      previousValue: rate(comparisonOrders.totals.orders, comparisonVisits.sessions),
      format: 'percent',
      change: rate(orders.totals.orders, visits.sessions) !== null && rate(comparisonOrders.totals.orders, comparisonVisits.sessions) !== null
        ? rate(orders.totals.orders, visits.sessions) - rate(comparisonOrders.totals.orders, comparisonVisits.sessions)
        : null,
      changeType: 'points',
      note: eventMetrics.installed
        ? 'Orders divided by sessions. Unique-visitor conversion is on the funnel panel, which counts each visitor once.'
        : 'Orders divided by sessions, not by people. Visitor-based conversion needs the tracker.',
    },
  ];

  const days = eachDay(range.start, range.end);
  const trend = days.map((day) => ({
    date: day,
    pageViews: visits.perDay.get(day)?.pageViews || 0,
    sessions: visits.perDay.get(day)?.sessions || 0,
    orders: orders.perDay.get(day)?.orders || 0,
    revenue: round(orders.perDay.get(day)?.revenue || 0),
    visitors: eventMetrics.perDay.get(day)?.size || null,
  }));

  const coverage = {
    visits: visits.documents > 0,
    orders: orderRows.length > 0,
    accounts: shopWide && accounts.available,
    carts: shopWide && carts.available,
    events: eventMetrics.installed,
    geography: orders.totals.orders > 0,
  };

  return {
    meta: {
      generatedAt: now.toISOString(),
      startDate: range.start,
      endDate: range.end,
      days: range.days,
      preset,
      periodLabel: formatDateRange(range.start, range.end),
      comparisonKind,
      comparison: comparison
        ? { startDate: comparison.start, endDate: comparison.end, label: comparison.label }
        : null,
      timezone: TZ,
      currency: CURRENCY,
      branchLabel,
      branches: access.authorizedBranches.map((branch) => ({
        value: branch.branchId,
        label: [branch.branchName, branch.city].filter(Boolean).join(' · '),
      })),
      companyLabel: access.authorizedBusinesses.map((b) => b.name).join(', ') || 'All companies',
      websiteUrl: 'https://wovenessence.in/',
      tracking: {
        installed: eventMetrics.installed,
        lastEventAt: eventMetrics.lastEventAt ? new Date(eventMetrics.lastEventAt).toISOString() : null,
        eventsInRange: eventMetrics.eventCount,
        requiredEvents: [
          'page_view', 'session_start', 'product_list_view', 'product_view', 'search',
          'login_success', 'sign_up_success', 'add_to_cart', 'view_cart',
          'begin_checkout', 'add_payment_info', 'purchase',
        ],
      },
      sourceCounts: {
        visitDays: visits.documents,
        visitsLastRecordedAt: visitsFreshAt ? new Date(visitsFreshAt).toISOString() : null,
        ordersRead: orderRows.length,
        ordersImported: orders.documents,
        accounts: shopWide && accounts.available ? accounts.total : null,
        carts: shopWide && carts.available ? carts.created : null,
        events: eventMetrics.eventCount,
      },
      coverage,
      branchScoped: Boolean(rawBranch),
    },

    kpis: { cards },

    trend: {
      granularity: range.days <= 2 ? 'hour' : 'day',
      days: trend,
      totals: {
        pageViews: visits.pageViews,
        sessions: visits.sessions,
        orders: orders.totals.orders,
        revenue: orders.totals.revenue,
        visitors: eventMetrics.installed ? eventMetrics.visitors : null,
      },
    },

    pageTypes: visits.pageTypes,

    funnel: eventMetrics.installed
      ? visitorFunnel(eventMetrics.stageVisitors, orders.totals.orders)
      : pageViewFunnel(visits, orders.totals),

    visitors: {
      available: eventMetrics.installed,
      total: eventMetrics.installed ? eventMetrics.visitors : null,
      sessions: eventMetrics.installed ? eventMetrics.sessions : null,
      newVsReturning: null,
      note: eventMetrics.installed
        ? 'New versus returning classification needs at least two periods of tracker history.'
        : 'Unique visitors, guest browsers and new versus returning splits need the storefront tracker.',
      sources: eventMetrics.sources,
      devices: eventMetrics.devices,
      comparisonVisitors: eventMetrics.installed && comparison ? comparisonEventMetrics.visitors : null,
    },

    accounts: {
      available: shopWide && accounts.available,
      registrations: shopWide && accounts.available ? accounts.created : null,
      comparisonRegistrations: comparisonAccounts.available ? comparisonAccounts.created : null,
      loggedIn: shopWide && accounts.available ? accounts.loggedIn : null,
      total: shopWide && accounts.available ? accounts.total : null,
      verified: shopWide && accounts.available ? accounts.verified : null,
      lastRegisteredAt: accounts.lastRegisteredAt ? new Date(accounts.lastRegisteredAt).toISOString() : null,
      lastLoginAt: accounts.lastLoginAt ? new Date(accounts.lastLoginAt).toISOString() : null,
      buyers: orders.customers.length,
      newBuyers: newBuyers.length,
      repeatBuyers: repeatCustomers.length,
      repeatRate: rate(repeatCustomers.length, orders.customers.length),
      repeatRevenue: round(repeatRevenue),
      repeatRevenueShare: rate(repeatRevenue, orders.totals.revenue),
      buyersNewToThePeriod: newBuyers.length,
      note: shopWide
        ? 'Account counts come from the storefront customers collection. A login is recorded only for the account’s most recent sign-in, so login activity is a minimum.'
        : 'Shop-wide account metrics are hidden because this view is restricted to one branch.',
    },

    geography: {
      level: 'order_address',
      available: orders.totals.orders > 0,
      cities: orders.cities.slice(0, 12).map((row) => ({
        ...row,
        revenueShare: rate(row.revenue, orders.totals.revenue),
      })),
      states: orders.states.slice(0, 8),
      unmappedOrders: orderRows.filter((order) => {
        const place = placeOf(order);
        return websiteStatusOf(order) === 'eligible' && place.city === 'Not recorded';
      }).length,
      note: 'Locations are taken from each order’s shipping address, falling back to billing and then the fulfilling branch city. This is delivery geography, not the visitor’s IP location, and it is only available for customers who ordered.',
    },

    products: {
      available: orders.products.length > 0,
      byOrders: orders.products.slice(0, 12).map((row) => ({
        ...row,
        conversion: null,
      })),
      note: 'Ranked by order-line revenue. Product views and add-to-cart counts need the tracker; no view figures are estimated here.',
      viewsAvailable: eventMetrics.installed,
    },

    carts: shopWide ? { ...carts } : { ...carts, note: 'Shop-wide cart data is hidden on a single-branch view.' },

    realtime: eventMetrics.installed
      ? eventMetrics.recent
      : { windowMinutes: 5, activeVisitors: null, events: null, productViews: null, addToCart: null, purchases: null },

    insights: buildInsights({ visits, orders, accounts, carts, events: eventMetrics, coverage }),

    notes: [
      {
        key: 'visits',
        title: 'Page views and sessions',
        body: 'Read from the visits collection the storefront writes: one document per branch, day and page type, with view and session counters. It carries no visitor identifier, so it can report traffic volume but not unique people.',
        available: coverage.visits,
      },
      {
        key: 'orders',
        title: 'Website orders and revenue',
        body: 'Read from the orders collection with the same eligibility rules as the sales dashboard. Orders whose invoice number already exists in ERP are still counted here; this report is the storefront view, not the consolidated sales ledger.',
        available: coverage.orders,
      },
      {
        key: 'accounts',
        title: 'Accounts, registrations and logins',
        body: 'Read from the storefront customers collection. Registration date comes from createdAt; login activity from lastLoginAt, which keeps only the most recent sign-in per account.',
        available: coverage.accounts,
      },
      {
        key: 'carts',
        title: 'Cart abandonment',
        body: `A cart is abandoned when it holds at least one line and has not been updated for ${CART_ABANDON_HOURS} hours. Carts still inside that window are reported as in progress, not abandoned.`,
        available: coverage.carts,
      },
      {
        key: 'events',
        title: 'Visitors, sources, devices, visitor geography',
        body: 'Read from the websiteevents collection written by the first-party tracker. Until the tracker is loaded on wovenessence.in this collection is empty and every panel that depends on it says so instead of showing a number.',
        available: coverage.events,
      },
    ],
  };
}
