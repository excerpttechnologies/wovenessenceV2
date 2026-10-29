import mongoose from 'mongoose';
import { loadDashboardOptions } from '@/lib/dashboard/access';
import {
  addDays,
  diffDays,
  eachDay,
  formatDateRange,
} from '@/lib/dashboard/date';
import { websiteStatusOf } from '@/lib/dashboard/storefront';
import {
  AnalyticsError,
  COMPARISON_OPTIONS,
  DATE_PRESETS,
  MAX_RANGE_DAYS,
  resolveAnalyticsPeriod,
} from './period';
import { ga4ConfigSummary, loadGa4Analytics } from './ga4';

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

const ORDER_CAP = 5000;
const CART_ABANDON_HOURS = 24;

const TZ = 'Asia/Kolkata';
const CURRENCY = 'INR';

/* Re-exported for callers that already import these from the service. */
export { AnalyticsError, COMPARISON_OPTIONS, DATE_PRESETS, MAX_RANGE_DAYS };

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

/* ------------------------------------------------------------------ dates */

const utcDay = (dateString) => new Date(`${dateString}T00:00:00.000Z`);

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

function orderBreakdown(rows) {
  const breakdown = {
    placed: rows.length,
    eligible: 0,
    paid: 0,
    fulfilled: 0,
    cancelled: 0,
    pendingPayment: 0,
    refunded: 0,
    other: 0,
  };

  rows.forEach((order) => {
    const status = String(order?.status || '').toLowerCase();
    const paymentStatus = String(order?.payment?.status || order?.paymentStatus || '').toLowerCase();
    const eligible = websiteStatusOf(order) === 'eligible';

    if (eligible) breakdown.eligible += 1;
    if (status === 'cancelled') breakdown.cancelled += 1;
    else if (status === 'pending_payment') breakdown.pendingPayment += 1;
    else if (!eligible) breakdown.other += 1;

    const paid = ['paid', 'captured', 'success', 'succeeded', 'completed', 'settled'].includes(paymentStatus)
      || Boolean(order?.payment?.paidAt || order?.paidAt);
    if (paid) breakdown.paid += 1;

    const fulfilled = ['shipped', 'out_for_delivery', 'delivered'].includes(status)
      || Boolean(order?.fulfilledAt || order?.deliveredAt);
    if (fulfilled) breakdown.fulfilled += 1;

    const refunded = status === 'refunded' || paymentStatus === 'refunded'
      || Boolean(order?.refundedAt)
      || (Array.isArray(order?.refunds) && order.refunds.length > 0);
    if (refunded) breakdown.refunded += 1;
  });

  return breakdown;
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
    breakdown: orderBreakdown(rows),
    documents: rows.length,
  };
}

function buildEvents(events, range, now) {
  const docs = events.docs || [];
  const visitors = new Set();
  const sessions = new Set();
  const signedInVisitors = new Set();
  const stageVisitors = new Map();
  const perSource = new Map();
  const perDevice = new Map();
  const perDay = new Map();
  let loginEvents = 0;
  let signUpEvents = 0;

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
    if (doc.event === 'login_success' || doc.event === 'sign_up_success') {
      if (visitor) signedInVisitors.add(visitor);
    }
    if (doc.event === 'login_success') loginEvents += 1;
    if (doc.event === 'sign_up_success') signUpEvents += 1;

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
    loggedInVisitors: signedInVisitors.size,
    loginEvents,
    signUpEvents,
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

function buildInsights({ visits, orders, accounts, carts, events, coverage, ga4 }) {
  const insights = [];

  if (ga4 && !ga4.configured) {
    insights.push({
      tone: 'info',
      title: 'GA4 is not connected',
      body: 'Unique visitors, active users, sessions, traffic sources, visitor geography and the GA4 funnel require GA4_PROPERTY_ID and a server-side service-account credential. No visitor numbers are estimated while it is missing.',
      basis: 'GA4 configuration is absent from the server environment.',
    });
  } else if (ga4?.status === 'stale') {
    insights.push({
      tone: 'warn',
      title: 'GA4 is showing the last successful report',
      body: `A fresh GA4 request failed, so the dashboard is displaying the last successful figures${ga4.lastSuccessAt ? ` from ${new Date(ga4.lastSuccessAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}` : ''}. They are marked stale rather than replaced with zeros.`,
      basis: 'GA4 report cache after an API failure.',
    });
  } else if (ga4?.partial) {
    insights.push({
      tone: 'warn',
      title: 'Some GA4 sections are unavailable',
      body: 'The main GA4 connection is working, but at least one optional report failed. Its panel is marked unavailable; no zero is shown in place of the failed report.',
      basis: 'Per-section GA4 error state.',
    });
  }

  if (!events.installed) {
    insights.push({
      tone: 'info',
      title: 'First-party tracker is not installed',
      body: 'The first-party tracker on ecom.wovenessence.in feeds login, guest, device and fallback traffic panels. GA4 remains the primary source for unique visitors and sessions when it is configured.',
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

  const { range, preset, comparisonKind, comparison } = resolveAnalyticsPeriod(sp, now);
  const forceGa4Refresh = sp.get('refresh') === '1';

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

  const ga4Summary = ga4ConfigSummary();
  const ga4Unavailable = (status, message) => ({
    ...ga4Summary,
    status,
    message,
    available: false,
    fetchedAt: now.toISOString(),
    lastSuccessAt: null,
    stale: false,
    partial: false,
    errors: {},
    sections: {},
    tracking: {
      measurementId: ga4Summary.measurementId,
      status: ga4Summary.measurementId ? 'configured_not_verified' : 'not_configured',
      message: ga4Summary.measurementId
        ? 'A measurement ID is configured, but this view cannot confirm the website tag.'
        : 'No GA4 measurement ID is configured.',
    },
  });

  const ga4Promise = shopWide
    ? loadGa4Analytics({
      startDate: range.start,
      endDate: range.end,
      comparisonStartDate: comparison?.start || null,
      comparisonEndDate: comparison?.end || null,
      force: forceGa4Refresh,
    }).catch((error) => {
      console.error('[website-analytics/ga4]', error?.code || 'ERROR');
      return ga4Unavailable('GA4_REPORT_FAILED', 'GA4 reports could not be read. Backend figures are unaffected.');
    })
    : Promise.resolve(ga4Unavailable(
      'GA4_UNAVAILABLE',
      'GA4 is property-wide and cannot be narrowed to a branch. Select the all-branch view to see GA4 figures.'
    ));

  const [visitRows, comparisonVisitRows, orderRows, comparisonOrderRows, accounts, comparisonAccounts, carts, events, comparisonEvents, visitsFreshAt, ga4] = await Promise.all([
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
    ga4Promise,
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

  /* GA4 is the primary source for unique visitors, active users, sessions and
     page views. The storefront collections remain authoritative for orders,
     revenue, accounts and the first-party tracker. Keep the two sources
     explicit in every card note. */
  const ga4Totals = ga4.totals?.available ? ga4.totals.data : null;
  const ga4Comparison = ga4.totals?.available && ga4.totals.comparison?.available
    ? ga4.totals.comparison.data
    : null;
  const ga4Returning = ga4.newVsReturning?.available ? ga4.newVsReturning.returningUsers : null;
  const ga4ComparisonReturning = ga4.newVsReturning?.comparison?.available
    ? ga4.newVsReturning.comparison.returningUsers
    : null;
  const ga4Logins = ga4.logins?.available ? ga4.logins : null;
  const ga4ComparisonLogins = ga4.logins?.comparison?.available ? ga4.logins.comparison : null;

  let loginCard = null;
  if (ga4Logins && ga4Logins.events > 0) {
    loginCard = {
      value: ga4Logins.users,
      previousValue: ga4ComparisonLogins?.events > 0 ? ga4ComparisonLogins.users : null,
      note: `GA4 users who triggered the login event (${ga4Logins.events.toLocaleString('en-IN')} login events). Event count and unique users are different measures.`,
      source: 'GA4 login event',
    };
  } else if (eventMetrics.installed && eventMetrics.loginEvents > 0) {
    loginCard = {
      value: eventMetrics.loggedInVisitors,
      previousValue: comparison && comparisonEventMetrics.loginEvents > 0
        ? comparisonEventMetrics.loggedInVisitors
        : null,
      note: `Distinct first-party tracker visitors with a successful login (${eventMetrics.loginEvents.toLocaleString('en-IN')} events). The ERP does not receive personal data from GA4.`,
      source: 'First-party tracker',
    };
  } else if (shopWide && accounts.available) {
    loginCard = {
      value: accounts.loggedIn,
      previousValue: comparisonAccounts.available ? comparisonAccounts.loggedIn : null,
      note: 'Storefront accounts whose most recent login falls in the period. The customers collection stores only the latest login per account, so this is a floor, not a login-event count.',
      source: 'Backend accounts',
    };
  }

  let guestCard = null;
  if (eventMetrics.installed && (eventMetrics.loginEvents > 0 || eventMetrics.signUpEvents > 0)) {
    guestCard = {
      value: Math.max(0, eventMetrics.visitors - eventMetrics.loggedInVisitors),
      previousValue: comparison && (comparisonEventMetrics.loginEvents > 0 || comparisonEventMetrics.signUpEvents > 0)
        ? Math.max(0, comparisonEventMetrics.visitors - comparisonEventMetrics.loggedInVisitors)
        : null,
      note: 'First-party trackers visitors minus distinct visitors with a login or sign-up event. A visitor who logs in after browsing is not counted as a guest. Browser identifiers, not verified people.',
      source: 'First-party tracker (derived)',
    };
  } else if (ga4Logins && ga4Logins.events > 0 && ga4Totals) {
    guestCard = {
      value: Math.max(0, ga4Totals.totalUsers - ga4Logins.users),
      previousValue: ga4ComparisonLogins?.events > 0 && ga4Comparison
        ? Math.max(0, ga4Comparison.totalUsers - ga4ComparisonLogins.users)
        : null,
      note: 'GA4 total users minus users who triggered the login event. Derived, not a GA4 guest dimension; a visitor who logs in after anonymous browsing can appear in both groups.',
      source: 'GA4 (derived)',
    };
  }

  const ga4Conversion = ga4Totals && ga4Totals.sessions > 0 ? ga4Totals.purchaseConversionRate : null;
  const ga4ComparisonConversion = ga4Comparison && ga4Comparison.sessions > 0
    ? ga4Comparison.purchaseConversionRate
    : null;
  const backendConversion = rate(orders.totals.orders, visits.sessions);
  const backendComparisonConversion = rate(comparisonOrders.totals.orders, comparisonVisits.sessions);

  const ga4RequiredLabel = ga4.configured ? 'GA4 unavailable' : 'GA4 setup required';
  const ga4RequiredReason = ga4.configured
    ? (ga4.message || 'GA4 could not return this figure for the selected period.')
    : 'Set GA4_PROPERTY_ID and a service-account credential on the server. See GA4_INTEGRATION.md.';

  const cards = [
    {
      key: 'visitors',
      label: 'Unique website visitors',
      value: ga4Totals?.totalUsers ?? null,
      previousValue: ga4Comparison?.totalUsers ?? null,
      format: 'count',
      change: ga4Totals && ga4Comparison ? change(ga4Totals.totalUsers, ga4Comparison.totalUsers) : null,
      changeType: 'percent',
      note: 'GA4 totalUsers: distinct users identified during the period using GA4’s available identifiers. Not every real person is guaranteed to be counted exactly once across devices, browsers or consent choices.',
      source: 'GA4 totalUsers',
      unavailable: !ga4Totals,
      unavailableReason: ga4RequiredReason,
      unavailableLabel: ga4RequiredLabel,
      highlight: true,
    },
    {
      key: 'activeUsers',
      label: 'Active users',
      value: ga4Totals?.activeUsers ?? null,
      previousValue: ga4Comparison?.activeUsers ?? null,
      format: 'count',
      change: ga4Totals && ga4Comparison ? change(ga4Totals.activeUsers, ga4Comparison.activeUsers) : null,
      changeType: 'percent',
      note: 'GA4 activeUsers: users who met GA4’s active-user definition during the period. This is a different metric from totalUsers, not another name for people.',
      source: 'GA4 activeUsers',
      unavailable: !ga4Totals,
      unavailableReason: ga4RequiredReason,
      unavailableLabel: ga4RequiredLabel,
    },
    {
      key: 'sessions',
      label: 'Website sessions',
      value: ga4Totals ? ga4Totals.sessions : visits.sessions,
      previousValue: ga4Comparison ? ga4Comparison.sessions : comparisonVisits.sessions,
      format: 'count',
      change: ga4Totals && ga4Comparison
        ? change(ga4Totals.sessions, ga4Comparison.sessions)
        : change(visits.sessions, comparisonVisits.sessions),
      changeType: 'percent',
      note: ga4Totals
        ? 'GA4 sessions. A session is a group of interactions from one user within a time window; it is not the same as a unique visitor.'
        : 'Storefront visits collection (fallback because GA4 is unavailable). A session ends after 30 minutes without activity.',
      source: ga4Totals ? 'GA4' : 'Storefront visits collection',
      unavailable: !ga4Totals && visits.documents === 0,
      unavailableReason: 'No GA4 data and no storefront visit counters for this period.',
      unavailableLabel: 'No traffic data',
    },
    {
      key: 'newUsers',
      label: 'New users',
      value: ga4Totals?.newUsers ?? null,
      previousValue: ga4Comparison?.newUsers ?? null,
      format: 'count',
      change: ga4Totals && ga4Comparison ? change(ga4Totals.newUsers, ga4Comparison.newUsers) : null,
      changeType: 'percent',
      note: 'GA4 newUsers: users who were first identified in the selected period. A returning user is reported separately from GA4’s newVsReturning dimension, not by subtracting this number.',
      source: 'GA4 newUsers',
      unavailable: !ga4Totals,
      unavailableReason: ga4RequiredReason,
      unavailableLabel: ga4RequiredLabel,
    },
    {
      key: 'returning',
      label: 'Returning visitors',
      value: ga4Returning,
      previousValue: ga4ComparisonReturning,
      format: 'count',
      change: ga4Returning !== null && ga4ComparisonReturning !== null
        ? change(ga4Returning, ga4ComparisonReturning)
        : null,
      changeType: 'percent',
      note: 'GA4 totalUsers for the newVsReturning dimension value “returning”. This is not computed by subtracting new users from total users.',
      source: 'GA4 newVsReturning',
      unavailable: ga4Returning === null,
      unavailableReason: ga4.configured
        ? 'GA4 did not return a returning-user row for this period. It may be absent, or the property may not have enough identity history.'
        : ga4RequiredReason,
      unavailableLabel: ga4.configured ? 'Not returned' : 'GA4 setup required',
    },
    {
      key: 'pageViews',
      label: 'Page views',
      value: ga4Totals ? ga4Totals.screenPageViews : visits.pageViews,
      previousValue: ga4Comparison ? ga4Comparison.screenPageViews : comparisonVisits.pageViews,
      format: 'count',
      change: ga4Totals && ga4Comparison
        ? change(ga4Totals.screenPageViews, ga4Comparison.screenPageViews)
        : change(visits.pageViews, comparisonVisits.pageViews),
      changeType: 'percent',
      note: ga4Totals
        ? 'GA4 screenPageViews: recorded page-view events. This is not a count of people; one visitor can generate many page views.'
        : 'Storefront visits collection page-view counters (fallback because GA4 is unavailable).',
      source: ga4Totals ? 'GA4' : 'Storefront visits collection',
      unavailable: !ga4Totals && visits.documents === 0,
      unavailableReason: 'No GA4 data and no storefront page-view counters for this period.',
      unavailableLabel: 'No page-view data',
    },
    {
      key: 'logins',
      label: 'Logged-in customers',
      value: loginCard?.value ?? null,
      previousValue: loginCard?.previousValue ?? null,
      format: 'count',
      change: loginCard ? change(loginCard.value, loginCard.previousValue) : null,
      changeType: 'percent',
      note: loginCard?.note || 'No login event or account login record is available for this period. Login events and unique logged-in users are different measures.',
      source: loginCard?.source || 'Not available',
      unavailable: !loginCard,
      unavailableReason: !shopWide
        ? 'Shop-wide account data is not shown on a single-branch view.'
        : 'GA4 has no login event and the backend has no login record for this period.',
      unavailableLabel: 'Not tracked',
    },
    {
      key: 'guests',
      label: 'Guest / not logged in',
      value: guestCard?.value ?? null,
      previousValue: guestCard?.previousValue ?? null,
      format: 'count',
      change: guestCard ? change(guestCard.value, guestCard.previousValue) : null,
      changeType: 'percent',
      note: guestCard?.note || 'GA4 has no guest/authenticated user dimension. Without a login event there is no reliable way to separate anonymous visitors from logged-in users, so this is shown as unavailable rather than assumed.',
      source: guestCard?.source || 'Not available',
      unavailable: !guestCard,
      unavailableReason: 'A login/sign-up event is required to separate guests from logged-in visitors.',
      unavailableLabel: 'Not measurable',
    },
    {
      key: 'orders',
      label: 'Website orders',
      value: orders.totals.orders,
      previousValue: comparisonOrders.totals.orders,
      format: 'count',
      change: change(orders.totals.orders, comparisonOrders.totals.orders),
      changeType: 'percent',
      note: `Backend orders. ${orders.breakdown.placed.toLocaleString('en-IN')} placed; ${orders.breakdown.eligible.toLocaleString('en-IN')} eligible; ${orders.breakdown.paid.toLocaleString('en-IN')} paid; ${orders.breakdown.fulfilled.toLocaleString('en-IN')} fulfilled; ${orders.breakdown.cancelled.toLocaleString('en-IN')} cancelled; ${orders.breakdown.pendingPayment.toLocaleString('en-IN')} pending payment; ${orders.breakdown.refunded.toLocaleString('en-IN')} refunded.`,
      source: 'Storefront orders',
    },
    {
      key: 'conversion',
      label: 'Purchase conversion rate',
      value: ga4Conversion ?? backendConversion,
      previousValue: ga4Totals ? ga4ComparisonConversion : backendComparisonConversion,
      format: 'percent',
      change: ga4Totals
        ? (ga4Conversion !== null && ga4ComparisonConversion !== null ? ga4Conversion - ga4ComparisonConversion : null)
        : (backendConversion !== null && backendComparisonConversion !== null ? backendConversion - backendComparisonConversion : null),
      changeType: 'points',
      note: ga4Totals
        ? 'GA4 purchase transactions ÷ GA4 sessions. This is a GA4 purchase conversion, not backend orders ÷ GA4 users. The backend order-to-session ratio is a different measure.'
        : 'Backend eligible orders ÷ storefront sessions (fallback because GA4 is unavailable). This is an order-to-session ratio, not a GA4 conversion.',
      source: ga4Totals ? 'GA4 transactions ÷ GA4 sessions' : 'Backend orders ÷ storefront sessions',
      unavailable: (ga4Totals ? ga4Conversion : backendConversion) === null,
      unavailableReason: 'A conversion rate needs a non-zero denominator and both numerator and denominator from the same source.',
      unavailableLabel: 'Not available',
    },
    {
      key: 'revenue',
      label: 'Website revenue',
      value: orders.totals.revenue,
      previousValue: comparisonOrders.totals.revenue,
      format: 'currency',
      change: change(orders.totals.revenue, comparisonOrders.totals.revenue),
      changeType: 'percent',
      note: ga4Totals
        ? `Backend grand total of eligible orders, before refunds. GA4-attributed purchase revenue for this period is ${new Intl.NumberFormat('en-IN', { style: 'currency', currency: CURRENCY, maximumFractionDigits: 0 }).format(ga4Totals.purchaseRevenue || 0)}. Sources are different and should not be added together.`
        : 'Backend grand total of eligible orders, before refunds. Average order value is shown in the sales panel.',
      source: 'Storefront orders',
    },
    {
      key: 'engagement',
      label: 'Average engagement',
      value: ga4Totals?.averageSessionDuration ?? null,
      previousValue: ga4Comparison?.averageSessionDuration ?? null,
      format: 'duration',
      change: ga4Totals && ga4Comparison ? change(ga4Totals.averageSessionDuration, ga4Comparison.averageSessionDuration) : null,
      changeType: 'percent',
      note: 'GA4 averageSessionDuration: total engagement time divided by sessions, reported in seconds. It measures engaged time per session, not time on a page or a person’s attention.',
      source: 'GA4 averageSessionDuration',
      unavailable: !ga4Totals || ga4Totals.sessions <= 0,
      unavailableReason: ga4.configured
        ? 'No GA4 sessions in this period, so average session duration has no denominator.'
        : ga4RequiredReason,
      unavailableLabel: ga4.configured ? 'No sessions' : 'GA4 setup required',
    },
  ];

  const days = eachDay(range.start, range.end);
  const ga4TrendByDate = new Map(
    (ga4.trend?.available ? ga4.trend.days : []).map((day) => [day.date, day])
  );
  const trend = days.map((day) => {
    const ga4Day = ga4TrendByDate.get(day) || null;
    return {
      date: day,
      pageViews: ga4Day ? ga4Day.screenPageViews : (visits.perDay.get(day)?.pageViews || 0),
      sessions: ga4Day ? ga4Day.sessions : (visits.perDay.get(day)?.sessions || 0),
      orders: orders.perDay.get(day)?.orders || 0,
      revenue: round(orders.perDay.get(day)?.revenue || 0),
      visitors: ga4Day ? ga4Day.totalUsers : (eventMetrics.perDay.get(day)?.size ?? null),
      activeUsers: ga4Day ? ga4Day.activeUsers : null,
      newUsers: ga4Day ? ga4Day.newUsers : null,
    };
  });

  const coverage = {
    visits: visits.documents > 0,
    orders: orderRows.length > 0,
    accounts: shopWide && accounts.available,
    carts: shopWide && carts.available,
    events: eventMetrics.installed,
    geography: orders.totals.orders > 0,
    ga4: Boolean(ga4Totals),
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
      websiteUrl: ga4.websiteUrl || 'https://ecom.wovenessence.in/',
      tracking: {
        installed: eventMetrics.installed,
        lastEventAt: eventMetrics.lastEventAt ? new Date(eventMetrics.lastEventAt).toISOString() : null,
        eventsInRange: eventMetrics.eventCount,
        requiredEvents: [
          'page_view', 'session_start', 'product_list_view', 'product_view', 'search',
          'login_success', 'sign_up_success', 'add_to_cart', 'view_cart',
          'begin_checkout', 'add_payment_info', 'purchase',
        ],
        ga4: {
          configured: ga4.configured,
          status: ga4.status,
          message: ga4.message,
          propertyId: ga4.propertyId,
          measurementId: ga4.measurementId,
          lastSuccessAt: ga4.lastSuccessAt,
          stale: ga4.stale,
          partial: ga4.partial,
          tag: ga4.tracking,
        },
      },
      sourceCounts: {
        visitDays: visits.documents,
        visitsLastRecordedAt: visitsFreshAt ? new Date(visitsFreshAt).toISOString() : null,
        ordersRead: orderRows.length,
        ordersImported: orders.documents,
        accounts: shopWide && accounts.available ? accounts.total : null,
        carts: shopWide && carts.available ? carts.created : null,
        events: eventMetrics.eventCount,
        ga4Visitors: ga4Totals?.totalUsers ?? null,
      },
      coverage,
      branchScoped: Boolean(rawBranch),
    },

    kpis: { cards },

    trend: {
      granularity: range.days <= 2 ? 'hour' : 'day',
      days: trend,
      totals: {
        pageViews: ga4Totals ? ga4Totals.screenPageViews : visits.pageViews,
        sessions: ga4Totals ? ga4Totals.sessions : visits.sessions,
        orders: orders.totals.orders,
        revenue: orders.totals.revenue,
        visitors: ga4Totals ? ga4Totals.totalUsers : null,
        activeUsers: ga4Totals ? ga4Totals.activeUsers : null,
        newUsers: ga4Totals ? ga4Totals.newUsers : null,
      },
      sources: {
        pageViews: ga4Totals ? 'GA4' : 'Storefront visits collection',
        sessions: ga4Totals ? 'GA4' : 'Storefront visits collection',
        visitors: ga4Totals ? 'GA4' : null,
        orders: 'Storefront orders',
        revenue: 'Storefront orders',
      },
      note: ga4Totals
        ? 'Traffic metrics are GA4 daily figures; orders and revenue are backend order totals. Daily unique-user figures are not additive across days.'
        : 'Traffic metrics are the storefront visits collection. Visitor-level figures require GA4.',
    },

    pageTypes: visits.pageTypes,

    funnel: ga4.funnel?.available
      ? ga4.funnel
      : (eventMetrics.installed
        ? visitorFunnel(eventMetrics.stageVisitors, orders.totals.orders)
        : pageViewFunnel(visits, orders.totals)),
    funnelFallback: eventMetrics.installed
      ? visitorFunnel(eventMetrics.stageVisitors, orders.totals.orders)
      : pageViewFunnel(visits, orders.totals),

    visitors: {
      available: eventMetrics.installed,
      total: eventMetrics.installed ? eventMetrics.visitors : null,
      sessions: eventMetrics.installed ? eventMetrics.sessions : null,
      loggedInVisitors: eventMetrics.installed ? eventMetrics.loggedInVisitors : null,
      loginEvents: eventMetrics.installed ? eventMetrics.loginEvents : null,
      signUpEvents: eventMetrics.installed ? eventMetrics.signUpEvents : null,
      newVsReturning: ga4.newVsReturning || null,
      note: eventMetrics.installed
        ? 'First-party tracker figures. New versus returning visitors are read from GA4 when available.'
        : 'First-party tracker unavailable. GA4 is the primary source for visitor counts when configured.',
      sources: eventMetrics.sources,
      devices: eventMetrics.devices,
      comparisonVisitors: eventMetrics.installed && comparison ? comparisonEventMetrics.visitors : null,
      ga4: {
        available: Boolean(ga4Totals),
        total: ga4Totals?.totalUsers ?? null,
        activeUsers: ga4Totals?.activeUsers ?? null,
        newUsers: ga4Totals?.newUsers ?? null,
        sessions: ga4Totals?.sessions ?? null,
        pageViews: ga4Totals?.screenPageViews ?? null,
      },
    },

    ordersBreakdown: orders.breakdown,

    orderSummary: {
      orders: orders.totals.orders,
      revenue: orders.totals.revenue,
      aov: orders.totals.aov,
      comparisonOrders: comparisonOrders.totals.orders,
      comparisonRevenue: comparisonOrders.totals.revenue,
      comparisonAov: comparisonOrders.totals.aov,
      customers: orders.customers.length,
    },

    ga4,

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

    insights: buildInsights({ visits, orders, accounts, carts, events: eventMetrics, coverage, ga4 }),

    notes: [
      {
        key: 'ga4',
        title: 'Google Analytics 4 (primary visitor source)',
        body: 'Unique visitors, active users, sessions, page views, new versus returning users, traffic sources, visitor geography and the GA4 funnel come from the GA4 Data API using totalUsers and the matching GA4 metrics. GA4 user counts rely on available identifiers and reporting rules, so they are not guaranteed to count every real person exactly once across devices and browsers. Backend orders and revenue remain authoritative for transactions.',
        available: Boolean(ga4Totals),
      },
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
        title: 'First-party tracker (fallback / login detail)',
        body: 'Read from the websiteevents collection written by the first-party tracker. Until the tracker is loaded on ecom.wovenessence.in this collection is empty and every panel that depends on it says so instead of showing a number. The tracker never sends names, emails, phone numbers or passwords to GA4.',
        available: coverage.events,
      },
    ],
  };
}
