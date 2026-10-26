import mongoose from 'mongoose';

/* ==========================================================================
   Read-only check of the website analytics pipeline.

     npm run test:website-analytics

   It answers one question: is the storefront actually feeding the dashboard,
   and with which events? Nothing is written and nothing is created.
   ========================================================================== */

const REQUIRED = [
  'page_view', 'session_start', 'product_list_view', 'product_view', 'search',
  'login_success', 'sign_up_success', 'add_to_cart', 'view_cart',
  'begin_checkout', 'add_payment_info', 'purchase',
];

const WINDOW_DAYS = 30;
const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000);

await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
const db = mongoose.connection.db;

const names = new Set((await db.listCollections().toArray()).map((c) => c.name));
const events = db.collection('websiteevents');

const [total, recent, latest] = await Promise.all([
  names.has('websiteevents') ? events.countDocuments({}) : 0,
  names.has('websiteevents') ? events.countDocuments({ ts: { $gte: since } }) : 0,
  names.has('websiteevents')
    ? events.find({}).project({ ts: 1 }).sort({ ts: -1 }).limit(1).toArray()
    : [],
]);

console.log('\nWebsite analytics — pipeline check');
console.log('Database:', db.databaseName);
console.log('websiteevents:', names.has('websiteevents') ? 'present' : 'MISSING (created on first event)');
console.log('total events:', total.toLocaleString('en-IN'));
console.log(`last ${WINDOW_DAYS} days:`, recent.toLocaleString('en-IN'));
console.log('last event:', latest[0]?.ts ? new Date(latest[0].ts).toISOString() : 'never');

if (!recent) {
  console.log('\nRESULT: no tracker events in the last 30 days.');
  console.log('The dashboard will report page views, orders, accounts and carts, and mark');
  console.log('unique visitors / sources / devices / visitor geography as not tracked.');
  console.log('\nTo install: see WEBSITE_ANALYTICS.md → "Storefront installation".');
  await mongoose.disconnect();
  process.exit(0);
}

const byEvent = await events.aggregate([
  { $match: { ts: { $gte: since } } },
  { $group: { _id: '$event', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();

const [visitors, sessions, verified, unverified] = await Promise.all([
  events.distinct('visitorId', { ts: { $gte: since } }),
  events.distinct('sessionId', { ts: { $gte: since } }),
  events.countDocuments({ ts: { $gte: since }, event: 'purchase', verified: true }),
  events.countDocuments({ ts: { $gte: since }, event: 'purchase', verified: false }),
]);

console.log('\nEvent counts (last 30 days)');
byEvent.forEach((row) => console.log(String(row._id).padEnd(20), row.n));

console.log('\nUnique visitors:', visitors.length);
console.log('Sessions:', sessions.length);
console.log('Purchases verified against orders:', verified);
console.log('Purchases NOT matched to an order:', unverified, unverified ? '(counted nowhere as conversion)' : '');

const seen = new Set(byEvent.map((row) => row._id));
const missing = REQUIRED.filter((name) => !seen.has(name));
console.log('\nRequired events not received yet:');
console.log(missing.length ? missing.join(', ') : 'none — every event the dashboard reads is arriving.');

/* Freshness of the other half of the dashboard: the storefront's own page
   counter, which is what powers page views and sessions today. */
if (names.has('visits')) {
  const [fresh] = await db.collection('visits').find({})
    .project({ day: 1 }).sort({ day: -1 }).limit(1).toArray();
  console.log('\nvisits counter last day:', fresh?.day ? new Date(fresh.day).toISOString().slice(0, 10) : 'no rows');
} else {
  console.log('\nvisits counter: MISSING (page views and sessions will read 0)');
}

console.log('\nOpen /admin/ecommerce/website-analytics and confirm the visitor cards are no longer marked "Not tracked".');
await mongoose.disconnect();
