/* Unit tests for the Dashboard and Website Analytics modules.

   Everything here runs against the real modules with no database and no
   server. The point is to pin the rules that are easy to get subtly wrong:

     - IST day boundaries, so a 00:30 sale is not counted on yesterday
     - gross / returns / net sales, and the fallbacks when a header total is
       present but zero
     - missing tracking versus a genuine zero in website figures
     - consent, Do Not Track and bot rejection at the public event boundary
     - privacy scrubbing (IP, User-Agent, path query strings, contact details)
     - CSV formula neutralisation

   Run with:  npm run test:dashboard */

import {
  DASHBOARD_TIMEZONE, RANGE_PRESETS, rangeLabel,
  startOfIstDay, endOfIstDay, istDayKey, istMonthKey, startOfIstMonth,
  addIstDays, startOfIstFinancialYear, endOfIstFinancialYear,
  financialYearLabel, parseDateKey, startOfDateKey, endOfDateKey,
  istDateKeyLabel, resolveRange, enumerateDays, describeRange,
} from '@/lib/dashboard/range';

import {
  num, round2, linesOf, lineName, lineCode, lineQty, lineAmount,
  posInvoiceAmount, salesInvoiceAmount, posReturnAmount, salesReturnAmount,
  posInvoiceDate, salesInvoiceDate, posReturnDate, salesReturnDate, purchaseDate,
  buildDailySeries, buildPurchaseSeries, summariseSales, paymentMix, topProducts,
  summariseStock, changePercent, changeLabel, shareOf,
} from '@/lib/dashboard/calculations';

import {
  formatNumber, formatCurrency, formatCompactCurrency, formatPercent,
  formatSignedPercent, formatDuration, formatDate, formatDateTime,
  relativeTime, initials,
} from '@/lib/dashboard/format';

import {
  hostOf, displaySource, classifyChannel, attributionFrom, utmFromSearchParams,
  channelForEvent,
} from '@/lib/dashboard/storefront';

import { csvCell, rowsToCsv, buildDashboardCsv } from '@/lib/dashboard/export';
import { buildWebsiteAnalyticsCsv } from '@/lib/website-analytics/export';
import { summariseWebsiteEvents } from '@/lib/website-analytics/summarise';
import { normaliseWebsiteEvent } from '@/lib/website-analytics/validation';
import {
  scrubText, sanitisePath, sanitiseHost, validHttpUrl, sanitiseMetadata,
  clientIp, hashIp, isBotUserAgent, parseUserAgent, internalHosts, isInternalHost,
} from '@/lib/website-analytics/privacy';
import { createRateLimiter } from '@/lib/website-analytics/rateLimit';

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
const eq = (name, actual, expected) => ok(name, same(actual, expected), { actual, expected });
const near = (name, actual, expected, tolerance = 0.005) => {
  const value = Number(actual);
  ok(name, Number.isFinite(value) && Math.abs(value - expected) <= tolerance, { actual, expected });
};
const throwsRange = (name, fn, messagePart = '') => {
  try {
    fn();
    ok(name, false, 'did not throw');
  } catch (err) {
    ok(
      name,
      err instanceof RangeError && (!messagePart || String(err.message).includes(messagePart)),
      { name: err?.name, message: err?.message }
    );
  }
};

const NOW = new Date('2026-10-26T06:30:00Z'); /* 12:00 IST, 26 Oct 2026 */
const CUSTOM = resolveRange({ preset: 'custom', from: '2026-10-01', to: '2026-10-03', now: NOW });

/* ==========================================================================
   1. IST range boundaries
   ========================================================================== */
console.log('\n--- 1. IST range boundaries ---');

eq('timezone is Asia/Kolkata', DASHBOARD_TIMEZONE, 'Asia/Kolkata');
eq('eight presets are offered', RANGE_PRESETS.length, 8);
eq('range label falls back to Last 30 days', rangeLabel('bogus'), 'Last 30 days');
eq('range label resolves last month', rangeLabel('lastmonth'), 'Last month');

eq(
  'a UTC evening belongs to the next IST day',
  istDayKey(new Date('2026-01-01T19:00:00Z')),
  '2026-01-02'
);
eq(
  'start of IST day is 18:30 UTC the day before',
  startOfIstDay(new Date('2026-01-02T00:30:00+05:30')).toISOString(),
  '2026-01-01T18:30:00.000Z'
);
eq(
  'end of IST day is the final millisecond',
  endOfIstDay(new Date('2026-01-02T00:30:00+05:30')).toISOString(),
  '2026-01-02T18:29:59.999Z'
);
eq('month key uses the IST month', istMonthKey(new Date('2026-10-01T04:30:00Z')), '2026-10');
eq(
  'start of IST month',
  startOfIstMonth(new Date('2026-10-26T06:30:00Z')).toISOString(),
  '2026-09-30T18:30:00.000Z'
);
eq(
  'adding IST days keeps midnight',
  addIstDays(new Date('2026-10-26T06:30:00Z'), -6).toISOString(),
  '2026-10-19T18:30:00.000Z'
);
eq(
  'financial year starts on 1 April IST',
  startOfIstFinancialYear(new Date('2026-02-15T06:30:00Z')).toISOString(),
  '2025-03-31T18:30:00.000Z'
);
eq(
  'financial year ends on 31 March IST',
  endOfIstFinancialYear(new Date('2026-02-15T06:30:00Z')).toISOString(),
  '2026-03-31T18:29:59.999Z'
);
eq('financial year label', financialYearLabel(new Date('2026-02-15T06:30:00Z')), '2025-26');
eq('financial year label after April', financialYearLabel(new Date('2026-10-26T06:30:00Z')), '2026-27');

eq('valid date key parses', parseDateKey('2026-10-01'), { year: 2026, month: 10, day: 1 });
eq('impossible date key is rejected', parseDateKey('2026-02-30'), null);
eq('malformed date key is rejected', parseDateKey('01-10-2026'), null);
eq('leap day parses', parseDateKey('2024-02-29'), { year: 2024, month: 2, day: 29 });
eq('start of date key is IST midnight', startOfDateKey('2026-10-01').toISOString(), '2026-09-30T18:30:00.000Z');
eq('end of date key is inclusive', endOfDateKey('2026-10-01').toISOString(), '2026-10-01T18:29:59.999Z');
eq('date key label', istDateKeyLabel('2026-10-01'), '01 Oct');
eq('bad date key label is returned as-is', istDateKeyLabel('nope'), 'nope');

console.log('\n--- resolveRange ---');

const week = resolveRange({ preset: '7d', now: NOW });
eq('7d from key', week.fromKey, '2026-10-20');
eq('7d to key', week.toKey, '2026-10-26');
eq('7d days', week.days, 7);
eq('7d starts at IST midnight', week.from.toISOString(), '2026-10-19T18:30:00.000Z');
eq('7d ends at IST end of day', week.to.toISOString(), '2026-10-26T18:29:59.999Z');
eq('7d previous from', week.previousFromKey, '2026-10-13');
eq('7d previous to', week.previousToKey, '2026-10-19');
eq('7d previous label', week.previousLabel, 'previous 7 days');

const today = resolveRange({ preset: 'today', now: NOW });
eq('today is one day', today.days, 1);
eq('today from key', today.fromKey, '2026-10-26');
eq('today previous is yesterday', today.previousFromKey, '2026-10-25');
eq('today previous label', today.previousLabel, 'previous day');

const thisMonth = resolveRange({ preset: 'month', now: NOW });
eq('this month starts on the 1st', thisMonth.fromKey, '2026-10-01');
eq('this month ends today', thisMonth.toKey, '2026-10-26');
eq('this month days', thisMonth.days, 26);

const lastMonth = resolveRange({ preset: 'lastmonth', now: NOW });
eq('last month starts', lastMonth.fromKey, '2026-09-01');
eq('last month ends', lastMonth.toKey, '2026-09-30');
eq('last month days', lastMonth.days, 30);

const fy = resolveRange({ preset: 'fy', finYear: '2026-2027', now: NOW });
eq('FY starts 1 April', fy.fromKey, '2026-04-01');
eq('FY ends 31 March', fy.toKey, '2027-03-31');
eq('FY days', fy.days, 365);
eq('FY label', fy.label, 'FY 2026-27');
eq('FY previous starts', fy.previousFromKey, '2025-04-01');
eq('FY previous ends', fy.previousToKey, '2026-03-31');

eq('custom from key', CUSTOM.fromKey, '2026-10-01');
eq('custom to key', CUSTOM.toKey, '2026-10-03');
eq('custom days', CUSTOM.days, 3);
eq('custom label', CUSTOM.label, '01 Oct - 03 Oct');
eq('custom previous from', CUSTOM.previousFromKey, '2026-09-28');
eq('custom previous to', CUSTOM.previousToKey, '2026-09-30');

eq(
  'enumerateDays walks every day once',
  enumerateDays(CUSTOM),
  ['2026-10-01', '2026-10-02', '2026-10-03']
);
eq('describeRange returns the picker shape', describeRange(CUSTOM), {
  preset: 'custom',
  label: '01 Oct - 03 Oct',
  from: '2026-10-01',
  to: '2026-10-03',
  days: 3,
  previousLabel: 'previous 3 days',
});

throwsRange('an unknown preset is rejected', () => resolveRange({ preset: 'nope' }), 'Unknown range');
throwsRange(
  'a 400 day range is rejected',
  () => resolveRange({ preset: '400d' }),
  'between 1 and 366'
);
throwsRange(
  'a custom range without bounds is rejected',
  () => resolveRange({ preset: 'custom' }),
  'valid From and To'
);
throwsRange(
  'a backwards custom range is rejected',
  () => resolveRange({ preset: 'custom', from: '2026-10-05', to: '2026-10-01' }),
  'From date'
);
throwsRange(
  'an impossible custom date is rejected',
  () => resolveRange({ preset: 'custom', from: '2026-02-30', to: '2026-03-01' }),
  'valid From and To'
);
throwsRange(
  'an invalid reference date is rejected',
  () => resolveRange({ now: 'not-a-date' }),
  'Invalid reference'
);

/* ==========================================================================
   2. Sales, purchases, stock and payments
   ========================================================================== */
console.log('\n--- 2. Calculations ---');

const POS_1 = {
  totalAmount: 1000,
  paid: 1000,
  billingType: 'Cash',
  customerId: 'c1',
  payments: [{ method: 'UPI/Card', amount: 600 }, { method: 'Cash', amount: 400 }],
  items: [
    { itemName: 'Saree', itemCode: 'S1', qty: 2, netAmount: 600 },
    { itemName: 'Shawl', itemCode: 'SH1', qty: 1, netAmount: 400 },
  ],
};
const POS_2 = {
  totalAmount: 500,
  paid: 500,
  billingType: 'Card',
  customerId: 'c2',
  items: [{ itemName: 'Saree', itemCode: 'S1', qty: 1, netAmount: 500 }],
};
const SALES_1 = {
  netValue: 3000,
  customerId: 'c1',
  items: [{ itemName: 'Lehenga', itemCode: 'L1', qty: 1, netAmount: 3000 }],
};
const POS_RETURN = { totalAmount: 200, refundAmount: 200 };
const SALES_RETURN = { netValue: -500 };

eq('line name prefers itemName', lineName({ itemName: 'Saree', name: 'x' }), 'Saree');
eq('line code prefers itemCode', lineCode({ itemCode: 'S1', code: 'x' }), 'S1');
eq('line quantity accepts Qty', lineQty({ Qty: '3' }), 3);
eq('line amount reads netAmount', lineAmount({ netAmount: '750' }), 750);
eq('line amount falls back to rate x qty less discount', lineAmount({ qty: 2, rate: 100, discountPct: 10 }), 180);
eq('line amount reads display-label keys', lineAmount({ Qty: '2', RSP: '100', 'Disc %': '25' }), 150);
eq('line amount of nothing is zero', lineAmount({ itemName: 'x' }), 0);
eq('linesOf returns items', linesOf({ items: [1, 2] }).length, 2);
eq('linesOf tolerates a document without items', linesOf({}), []);

eq('POS header total wins', posInvoiceAmount(POS_1), 1000);
eq('POS zero header falls back to the lines', posInvoiceAmount({ totalAmount: 0, items: [{ qty: 2, rate: 100 }] }), 200);
eq('POS lines are summed when there is no header', posInvoiceAmount({ items: [{ qty: 2, rate: 100 }, { qty: 1, rate: 50 }] }), 250);
eq('sales invoice netValue wins', salesInvoiceAmount({ netValue: 500, totalAmount: 900 }), 500);
eq('sales invoice zero netValue falls through to totalAmount', salesInvoiceAmount({ netValue: 0, totalAmount: 500 }), 500);
eq('sales invoice falls back to its lines', salesInvoiceAmount({ items: [{ netAmount: 300 }] }), 300);
eq('POS return refundAmount is used when totalAmount is zero', posReturnAmount({ totalAmount: 0, refundAmount: 200 }), 200);
eq('POS return header total is used', posReturnAmount({ totalAmount: 450, refundAmount: 0 }), 450);
eq('POS return header is treated as a magnitude', posReturnAmount({ totalAmount: -450 }), 450);
eq('sales return magnitude', salesReturnAmount(SALES_RETURN), 500);
eq('sales return zero netValue falls through to totalAmount', salesReturnAmount({ netValue: 0, totalAmount: 500 }), 500);

eq('POS date reads date', posInvoiceDate({ date: '2026-10-01T04:30:00Z' }).toISOString(), '2026-10-01T04:30:00.000Z');
eq('POS date falls back to createdAt', posInvoiceDate({ createdAt: '2026-10-02T04:30:00Z' }).toISOString(), '2026-10-02T04:30:00.000Z');
eq('sales invoice date reads createdAt', salesInvoiceDate({ createdAt: '2026-10-03T04:30:00Z' }).toISOString(), '2026-10-03T04:30:00.000Z');
eq('POS return date reads date', posReturnDate({ date: '2026-10-04T04:30:00Z' }).toISOString(), '2026-10-04T04:30:00.000Z');
eq('sales return date reads returnDate', salesReturnDate({ returnDate: '2026-10-05T04:30:00Z' }).toISOString(), '2026-10-05T04:30:00.000Z');
eq('purchase date prefers purchaseDate', purchaseDate({ purchaseDate: '2026-10-06T04:30:00Z', grcDate: '2026-10-01T00:00:00Z' }).toISOString(), '2026-10-06T04:30:00.000Z');
eq('purchase date falls back to grcDate', purchaseDate({ grcDate: '2026-10-01T04:30:00Z' }).toISOString(), '2026-10-01T04:30:00.000Z');

const sales = summariseSales({
  posInvoices: [POS_1, POS_2],
  salesInvoices: [SALES_1],
  posReturns: [POS_RETURN],
  salesReturns: [SALES_RETURN],
});
eq('POS sales total', sales.posSales, 1500);
eq('invoice sales total', sales.invoiceSales, 3000);
eq('gross sales', sales.grossSales, 4500);
eq('returns total', sales.returns, 700);
eq('net sales is gross less returns', sales.netSales, 3800);
eq('orders counts invoices', sales.orders, 3);
eq('customers counts unique ids', sales.customers, 2);
eq('units summed from the lines', sales.units, 5);
near('average order value', sales.averageOrderValue, 1266.67);
eq('POS channel net', sales.channels[0].net, 1300);
eq('invoice channel net', sales.channels[1].net, 2500);
near('POS channel share', sales.channels[0].share, 34.21);
near('invoice channel share', sales.channels[1].share, 65.79);

const mix = paymentMix([POS_1, POS_2]);
eq('payment mix is ordered Cash, UPI, Card', mix.map((row) => row.label), ['Cash', 'UPI', 'Card']);
eq('payment values', mix.map((row) => row.value), [400, 600, 500]);
eq('payment shares', mix.map((row) => row.share), [26.67, 40, 33.33]);
eq('payment mix tolerates an empty till', paymentMix([]), []);
eq(
  'an unpaid bill is not counted as collected',
  paymentMix([{ totalAmount: 500, paid: 0, billingType: 'Cash', items: [] }]),
  []
);
eq(
  'a missing paid field falls back to the invoice total',
  paymentMix([{ totalAmount: 500, billingType: 'Cash', items: [] }]),
  [{ label: 'Cash', value: 500, share: 100 }]
);

const products = topProducts([POS_1, POS_2], [SALES_1], 8);
eq('top products are sorted by revenue', products.map((row) => row.name), ['Lehenga', 'Saree', 'Shawl']);
eq('top product quantity', products[1].qty, 3);
eq('top product revenue', products[1].revenue, 1100);
eq('top products respects the limit', topProducts([POS_1, POS_2], [SALES_1], 2).length, 2);

const dailyRange = CUSTOM;
const daily = buildDailySeries({
  from: dailyRange.from,
  to: dailyRange.to,
  posInvoices: [
    { date: new Date('2026-10-01T04:30:00Z'), totalAmount: 1000 },
    { date: new Date('2026-10-02T05:00:00Z'), totalAmount: 500 },
  ],
  posReturns: [{ date: new Date('2026-10-01T06:00:00Z'), totalAmount: 200 }],
});
eq('daily labels', daily.labels, ['01 Oct', '02 Oct', '03 Oct']);
eq('daily keys', daily.keys, ['2026-10-01', '2026-10-02', '2026-10-03']);
eq('daily sales are zero filled', daily.sales, [1000, 500, 0]);
eq('daily returns are zero filled', daily.returns, [200, 0, 0]);

const purchases = buildPurchaseSeries({
  from: dailyRange.from,
  to: dailyRange.to,
  purchaseInvoices: [
    {
      purchaseDate: new Date('2026-10-02T04:00:00Z'),
      netPurchaseAmt: 0,
      totalPayable: 7000,
    },
  ],
  grcs: [{ grcDate: new Date('2026-10-01T04:00:00Z'), netAmount: 2500 }],
});
eq('invoices win over GRCs', purchases.source, 'Purchase invoices');
eq('purchase points', purchases.points, [0, 7000, 0]);
const grcPurchases = buildPurchaseSeries({
  from: dailyRange.from,
  to: dailyRange.to,
  grcs: [{ grcDate: new Date('2026-10-01T04:00:00Z'), netAmount: 2500 }],
});
eq('GRCs are the fallback source', grcPurchases.source, 'Goods receipt challans');
eq('GRC purchase points', grcPurchases.points, [2500, 0, 0]);

const stock = summariseStock([
  { name: 'A', qty: 3, value: 300 },
  { name: 'B', qty: 0, value: 0 },
  { name: 'C', qty: 10, value: 1000 },
  { name: 'D', qty: 5, value: 50 },
]);
eq('stock row count', stock.items, 4);
eq('stock units', stock.units, 18);
eq('stock value', stock.value, 1350);
eq('low stock sorted by quantity', stock.lowStock.map((row) => row.name), ['A', 'D']);
eq('low stock count', stock.lowStockCount, 2);
eq('out of stock count', stock.outOfStockCount, 1);
eq('out of stock list', stock.outOfStock.map((row) => row.name), ['B']);
eq('empty stock does not invent a value', summariseStock([]).value, 0);

eq('change from zero is null, not infinity', changePercent(100, 0), null);
eq('no change is null', changePercent(0, 0), null);
eq('positive change', changePercent(150, 100), 50);
eq('negative change', changePercent(50, 100), -50);
eq('new when previous is zero', changeLabel(100, 0), 'New');
eq('no change label', changeLabel(0, 0), 'No change');
eq('share of total', shareOf(25, 100), 25);
eq('share of nothing is zero', shareOf(1, 0), 0);
eq('num tolerates junk', num('abc'), 0);
eq('round2 rounds a half paisa up', round2(1.005), 1.01);
eq('round2 rounds a negative half away from zero', round2(-1.005), -1.01);

/* ==========================================================================
   3. Formatting
   ========================================================================== */
console.log('\n--- 3. Formatting ---');

eq('Indian digit grouping', formatNumber(1234567), '12,34,567');
eq('grouping with decimals', formatNumber(1234.567, 2), '1,234.57');
eq('negative grouping', formatNumber(-1234), '-1,234');
eq('invalid number renders a dash', formatNumber('abc'), '-');
eq('currency with decimals', formatCurrency(1234.5, { decimals: 2 }), '\u20b91,234.50');
eq('negative currency', formatCurrency(-50), '-\u20b950');
eq('invalid currency renders a dash', formatCurrency(null), '-');
eq('compact thousands', formatCompactCurrency(1500), '\u20b91.5K');
eq('compact lakhs', formatCompactCurrency(150000), '\u20b91.5L');
eq('compact crores', formatCompactCurrency(25000000), '\u20b92.5Cr');
eq('compact below a thousand', formatCompactCurrency(999), '\u20b9999');
eq('negative compact', formatCompactCurrency(-1500), '-\u20b91.5K');
eq('percent', formatPercent(12.345, { decimals: 2 }), '12.35%');
eq('invalid percent renders a dash', formatPercent(null), '-');
eq('signed percent adds a plus', formatSignedPercent(5.5), '+5.5%');
eq('signed percent keeps a minus', formatSignedPercent(-2), '-2.0%');
eq('duration in seconds', formatDuration(45), '45s');
eq('duration in minutes', formatDuration(90), '1m 30s');
eq('whole minutes', formatDuration(120), '2m');
eq('duration in hours', formatDuration(3661), '1h 1m');
eq('invalid duration renders a dash', formatDuration(null), '-');
eq('date', formatDate('2026-10-26T06:30:00Z'), '26 Oct 2026');
eq('date time', formatDateTime('2026-10-26T06:30:00Z'), '26 Oct 2026, 06:30');
eq('invalid date time renders a dash', formatDateTime('nope'), '-');

const relNow = new Date('2026-10-26T12:00:00Z');
eq('just now', relativeTime(new Date('2026-10-26T11:59:40Z'), relNow), 'just now');
eq('minutes ago', relativeTime(new Date('2026-10-26T11:55:00Z'), relNow), '5m ago');
eq('hours ago', relativeTime(new Date('2026-10-26T10:00:00Z'), relNow), '2h ago');
eq('days ago', relativeTime(new Date('2026-10-23T12:00:00Z'), relNow), '3d ago');
eq('older than a week shows the date', relativeTime(new Date('2026-10-10T12:00:00Z'), relNow), '10 Oct 2026');
eq('missing relative time is empty', relativeTime(null), '');
eq('initials of two names', initials('Amit Shah'), 'AS');
eq('initials of one name', initials('Amit'), 'A');
eq('initials fallback', initials(''), 'WE');

/* ==========================================================================
   4. Storefront attribution
   ========================================================================== */
console.log('\n--- 4. Storefront attribution ---');

eq('host reduces a full URL and drops www', hostOf('https://www.Google.com/search?q=saree'), 'google.com');
eq('host accepts a bare host', hostOf('shop.example.com/path'), 'shop.example.com');
eq('host rejects nonsense', hostOf('not a host'), '');
eq('unknown host displays as itself', displaySource('', 'someblog.example'), 'someblog.example');
eq('known source display name', displaySource('google'), 'Google');
eq('organic google is Search', classifyChannel({ source: 'google', medium: 'organic' }), 'Search');
eq('google referrer is Search', classifyChannel({ referrer: 'https://www.google.com/' }), 'Search');
eq('instagram referrer is Social', classifyChannel({ referrer: 'https://instagram.com/p/x' }), 'Social');
eq('newsletter is Email', classifyChannel({ source: 'newsletter', medium: 'email' }), 'Email');
eq('cpc is Paid', classifyChannel({ source: 'google', medium: 'cpc' }), 'Paid');
eq('referral medium is Referral', classifyChannel({ medium: 'referral', referrer: 'https://blog.example/' }), 'Referral');
eq('no source and no referrer is Direct', classifyChannel({}), 'Direct');
eq('an explicit direct source is Direct', classifyChannel({ source: 'Direct', medium: 'none' }), 'Direct');
eq('same-site referrer is Direct', classifyChannel({ referrer: 'https://shop.example/cart', siteHost: 'shop.example' }), 'Direct');
eq('unknown external referrer is Referral', classifyChannel({ referrer: 'https://someblog.example/post' }), 'Referral');
eq('untagged custom source is Referral', classifyChannel({ source: 'someblog' }), 'Referral');

const googleAttr = attributionFrom({ referrer: 'https://www.google.com/search?q=saree' });
eq('attribution host', googleAttr.referrerHost, 'google.com');
eq('attribution source', googleAttr.source, 'Google');
eq('attribution medium', googleAttr.medium, 'referral');
eq('attribution channel', googleAttr.channel, 'Search');
const directAttr = attributionFrom({});
eq('untagged source is Direct', directAttr.source, 'Direct');
eq('untagged medium is none', directAttr.medium, 'none');
eq('untagged channel is Direct', directAttr.channel, 'Direct');
const internalAttr = attributionFrom({ referrer: 'https://shop.example/cart', siteHost: 'shop.example' });
eq('internal navigation is Direct', internalAttr.channel, 'Direct');
eq('internal navigation is not stored as a source', internalAttr.source, 'Direct');
eq('internal navigation keeps no referrer host', internalAttr.referrerHost, '');
eq('internal navigation has no campaign', internalAttr.campaign, '');
eq('stored channel wins', channelForEvent({ channel: 'Email', source: 'google' }), 'Email');
eq('missing channel is derived', channelForEvent({ source: 'google', medium: 'organic' }), 'Search');

const utm = utmFromSearchParams('?utm_source=Instagram&utm_medium=social&utm_campaign=Diwali');
eq('utm source', utm.source, 'Instagram');
eq('utm medium', utm.medium, 'social');
eq('utm campaign', utm.campaign, 'Diwali');
eq('empty utm is empty', utmFromSearchParams('').source, '');

/* ==========================================================================
   5. CSV export
   ========================================================================== */
console.log('\n--- 5. CSV export ---');

eq('a formula is neutralised', csvCell('=1+1'), "'=1+1");
eq('a leading plus is neutralised', csvCell('+SUM(A1)'), "'+SUM(A1)");
eq('a leading minus is neutralised', csvCell('-Customer'), "'-Customer");
eq('a negative number is not a formula', csvCell('-16.67'), '-16.67');
eq('a negative number is not quoted', csvCell('-16.67').includes("'"), false);
eq('leading whitespace does not hide a formula', csvCell('  =1+1'), "'  =1+1");
eq('commas are quoted', csvCell('a,b'), '"a,b"');
eq('quotes are doubled', csvCell('a"b'), '"a""b"');
eq('newlines are quoted', csvCell('a\nb'), '"a\nb"');
eq('null is empty', csvCell(null), '');
eq('numbers become text', csvCell(42), '42');
eq('rows use CRLF', rowsToCsv([['a', 'b'], ['c', 'd']]), 'a,b\r\nc,d');

const dashboardSnapshot = {
  generatedAt: '2026-10-26T12:00:00Z',
  range: {
    label: 'Last 3 days',
    fromKey: '2026-10-24',
    toKey: '2026-10-26',
    previousLabel: 'previous 3 days',
  },
  kpis: {
    netSales: { value: 1000, previous: 800, change: 25 },
    grossSales: { value: 1200, previous: 900, change: 33.33 },
    returns: { value: 200, previous: 100, change: 100 },
    orders: { value: 3, previous: 2, change: 50 },
    averageOrderValue: { value: 333.33, previous: 300, change: 11.11 },
    customers: { value: 2, previous: 1, change: 100 },
    units: { value: 5, previous: 4, change: 25 },
    inventoryValue: { value: 10000, units: 8 },
  },
  salesTrend: {
    labels: ['24 Oct'],
    series: [{ name: 'Sales', points: [1000] }, { name: 'Returns', points: [200] }],
  },
  purchaseTrend: {
    labels: ['24 Oct'],
    series: [{ name: 'Purchases', points: [500] }],
    total: 500,
  },
  channels: [{ label: 'Retail POS', sales: 1200, returns: 200, net: 1000, orders: 3, share: 100 }],
  payments: [{ label: 'UPI', value: 1000, share: 100 }],
  topProducts: [{ name: '=cmd', code: 'S1', qty: 2, revenue: 1000 }],
  inventory: {
    lowStock: [{ name: 'A', code: 'A1', qty: 3, value: 300 }],
    outOfStock: [],
  },
  recent: [{
    date: '2026-10-24T10:00:00Z',
    type: 'POS sale',
    no: 'INV-1',
    party: '-Customer',
    amount: 1000,
    status: 'Paid',
  }],
  website: { installed: false, events: null, purchases: null, revenue: null },
};

const dashboardCsv = buildDashboardCsv(dashboardSnapshot);
ok('dashboard CSV names the report', dashboardCsv.includes('Woven Essence - Dashboard'));
ok('dashboard CSV carries the period', dashboardCsv.includes('Last 3 days'));
ok('dashboard CSV carries net sales', dashboardCsv.includes('Net sales,1000.00,800.00,25.00'));
ok('dashboard CSV carries channel rows', dashboardCsv.includes('Retail POS,1200.00,200.00,1000.00,3,100.00'));
ok('dashboard CSV carries the purchase series', dashboardCsv.includes('24 Oct,500.00'));
ok('dashboard CSV neutralises a product name', dashboardCsv.includes("'=cmd,S1,2.00,1000.00"));
ok('dashboard CSV neutralises a party name', dashboardCsv.includes(",'-Customer,"));
ok('dashboard CSV keeps missing website revenue empty', dashboardCsv.includes('Tracked revenue,'));
ok('dashboard CSV never prints undefined', !dashboardCsv.includes('undefined'));
ok('dashboard CSV never prints null', !dashboardCsv.toLowerCase().includes('null'));

const websiteSnapshot = {
  generatedAt: '2026-10-26T12:00:00Z',
  range: { label: 'Last 3 days', fromKey: '2026-10-24', toKey: '2026-10-26' },
  tracking: {
    installed: true,
    firstEventAt: '2026-09-01T00:00:00Z',
    lastEventAt: '2026-10-26T10:00:00Z',
    hasDataInRange: true,
    truncated: false,
  },
  kpis: {
    visitors: { value: 2, previous: 1, change: 100 },
    sessions: { value: 3, previous: 2, change: 50 },
    pageviews: { value: 3, previous: 2, change: 50 },
    purchases: { value: 1, previous: 1, change: 0 },
    revenue: { value: 499, previous: 100, change: 399 },
    conversionRate: { value: 33.33, previous: 50, change: -16.67 },
    bounceRate: { value: 100, previous: 50, change: 50 },
    avgSession: { value: 100, previous: 110, change: -9.09 },
  },
  daily: { labels: ['24 Oct'], pageviews: [1], sessions: [1] },
  funnel: {
    steps: [{ label: 'Sessions', value: 3, rate: 100 }, { label: 'Purchases', value: 1, rate: 33.33 }],
    conversionRate: 33.33,
  },
  sources: [{ label: 'Search', sessions: 1, pageviews: 1, purchases: 1, revenue: 499, share: 33.33 }],
  topPages: [{ path: '/', views: 1, visitors: 1, sessions: 1, share: 100 }],
  products: [{ name: 'Saree', productId: 'p1', views: 1, addToCart: 1, purchases: 1, revenue: 499, conversionRate: 100 }],
  referrers: [{ host: 'google.com', sessions: 1, pageviews: 1 }],
  devices: [{ label: 'mobile', sessions: 1, share: 33.33 }],
  countries: [{ label: 'IN', sessions: 1, share: 33.33 }],
  searches: [{ term: '=SUM(A1)', count: 1 }],
  recentPurchases: [{
    occurredAt: '2026-10-24T10:00:00Z',
    orderId: 'ORD-1',
    productName: 'Saree',
    channel: 'Search',
    value: 499,
    currency: 'INR',
  }],
};

const websiteCsv = buildWebsiteAnalyticsCsv(websiteSnapshot);
ok('website CSV names the report', websiteCsv.includes('Woven Essence - Website Analytics'));
ok('website CSV reports tracking installed', websiteCsv.includes('Installed,Yes'));
ok('website CSV carries visitors', websiteCsv.includes('Visitors,2,1,100.00'));
ok('website CSV carries revenue', websiteCsv.includes('Revenue,499.00,100.00,399.00'));
ok('website CSV carries conversion change', websiteCsv.includes('Conversion rate %,33.33,50.00,-16.67'));
ok('website CSV neutralises a search term', websiteCsv.includes("'=SUM(A1),1"));
ok('website CSV never prints undefined', !websiteCsv.includes('undefined'));
ok('website CSV never prints null', !websiteCsv.toLowerCase().includes('null'));
const notInstalledCsv = buildWebsiteAnalyticsCsv({
  tracking: { installed: false },
  kpis: { visitors: { value: null, previous: null, change: null } },
});
ok('an untracked metric is an empty CSV cell', notInstalledCsv.includes('Visitors,,,'));

/* ==========================================================================
   6. Website summary: missing tracking vs a real zero
   ========================================================================== */
console.log('\n--- 6. Website summary ---');

const notInstalled = summariseWebsiteEvents({ tracking: { installed: false }, range: CUSTOM });
eq('not installed: installed flag', notInstalled.tracking.installed, false);
eq('not installed: visitors are null', notInstalled.kpis.visitors.value, null);
eq('not installed: sessions are null', notInstalled.kpis.sessions.value, null);
eq('not installed: revenue is null', notInstalled.kpis.revenue.value, null);
eq('not installed: conversion is null', notInstalled.kpis.conversionRate.value, null);
eq('not installed: no data flag', notInstalled.tracking.hasDataInRange, false);
eq('not installed: funnel sessions are null', notInstalled.funnel.steps[0].value, null);
eq('not installed: no daily series', notInstalled.daily.labels, []);

const installedEmpty = summariseWebsiteEvents({
  events: [],
  tracking: { installed: true },
  range: CUSTOM,
});
eq('installed with no events: installed flag', installedEmpty.tracking.installed, true);
eq('installed with no events: visitors are zero', installedEmpty.kpis.visitors.value, 0);
eq('installed with no events: pageviews are zero', installedEmpty.kpis.pageviews.value, 0);
eq('installed with no events: revenue is zero', installedEmpty.kpis.revenue.value, 0);
eq('installed with no events: no data flag', installedEmpty.tracking.hasDataInRange, false);
eq('installed with no events: conversion has no denominator', installedEmpty.kpis.conversionRate.value, null);
eq('installed with no events: bounce rate has no denominator', installedEmpty.kpis.bounceRate.value, null);
eq('installed with no events: daily labels still exist', installedEmpty.daily.labels, ['01 Oct', '02 Oct', '03 Oct']);
eq('installed with no events: daily zeros', installedEmpty.daily.pageviews, [0, 0, 0]);

const events = [
  {
    type: 'pageview', path: '/', title: 'Home', deviceType: 'mobile', country: 'IN',
    referrerHost: 'google.com', source: 'google', medium: 'organic', channel: 'Search',
    sessionId: 's1', visitorId: 'v1', occurredAt: '2026-10-01T04:30:00Z',
  },
  {
    type: 'product_view', productId: 'p1', productName: 'Saree',
    sessionId: 's1', visitorId: 'v1', occurredAt: '2026-10-01T04:31:00Z',
    source: 'google', medium: 'organic', channel: 'Search',
  },
  {
    type: 'add_to_cart', productId: 'p1', productName: 'Saree', value: 499,
    sessionId: 's1', visitorId: 'v1', occurredAt: '2026-10-01T04:32:00Z',
    source: 'google', medium: 'organic', channel: 'Search',
  },
  {
    type: 'checkout_start', value: 499,
    sessionId: 's1', visitorId: 'v1', occurredAt: '2026-10-01T04:33:00Z',
    source: 'google', medium: 'organic', channel: 'Search',
  },
  {
    type: 'purchase', orderId: 'ORD-1', productId: 'p1', productName: 'Saree',
    value: 499, currency: 'INR', sessionId: 's1', visitorId: 'v1',
    occurredAt: '2026-10-01T04:34:00Z',
    source: 'google', medium: 'organic', channel: 'Search',
  },
  {
    type: 'pageview', path: '/collections', deviceType: 'desktop', country: 'IN',
    sessionId: 's2', visitorId: 'v2', occurredAt: '2026-10-02T05:30:00Z',
  },
  {
    type: 'search', searchQuery: ' Silk Saree ',
    sessionId: 's2', visitorId: 'v2', occurredAt: '2026-10-02T05:31:00Z',
  },
  {
    type: 'pageview', path: '/', deviceType: 'tablet', country: 'US',
    referrerHost: 'instagram.com', channel: 'Social',
    sessionId: 's3', visitorId: 'v1', occurredAt: '2026-10-03T06:30:00Z',
  },
];

const summary = summariseWebsiteEvents({
  events,
  previous: {
    visitors: 1,
    sessions: 2,
    pageviews: 2,
    purchases: 1,
    revenue: 100,
    bounceRate: 50,
    avgSession: 110,
  },
  tracking: {
    installed: true,
    firstEventAt: '2026-09-01T00:00:00Z',
    lastEventAt: '2026-10-03T06:30:00Z',
  },
  range: CUSTOM,
});

eq('summary: visitors', summary.kpis.visitors.value, 2);
eq('summary: sessions', summary.kpis.sessions.value, 3);
eq('summary: pageviews', summary.kpis.pageviews.value, 3);
eq('summary: purchases', summary.kpis.purchases.value, 1);
eq('summary: revenue', summary.kpis.revenue.value, 499);
eq('summary: conversion rate', summary.kpis.conversionRate.value, 33.33);
eq('summary: bounce rate', summary.kpis.bounceRate.value, 100);
eq('summary: average session', summary.kpis.avgSession.value, 100);
eq('summary: has data', summary.tracking.hasDataInRange, true);
eq('summary: first event kept', summary.tracking.firstEventAt, '2026-09-01T00:00:00Z');
eq('summary: last event kept', summary.tracking.lastEventAt, '2026-10-03T06:30:00Z');

eq('summary: visitor change', summary.kpis.visitors.change, 100);
eq('summary: session change', summary.kpis.sessions.change, 50);
eq('summary: pageview change', summary.kpis.pageviews.change, 50);
eq('summary: purchase change', summary.kpis.purchases.change, 0);
eq('summary: revenue change', summary.kpis.revenue.change, 399);
eq('summary: conversion change is percentage points', summary.kpis.conversionRate.change, -16.67);
eq('summary: bounce change is percentage points', summary.kpis.bounceRate.change, 50);
eq('summary: average session change', summary.kpis.avgSession.change, -9.09);

eq('summary: funnel sessions', summary.funnel.steps[0].value, 3);
eq('summary: funnel product views', summary.funnel.steps[1].value, 1);
eq('summary: funnel add to cart', summary.funnel.steps[2].value, 1);
eq('summary: funnel checkout', summary.funnel.steps[3].value, 1);
eq('summary: funnel purchases', summary.funnel.steps[4].value, 1);
eq('summary: funnel conversion rate', summary.funnel.conversionRate, 33.33);
eq('summary: funnel rate', summary.funnel.steps[1].rate, 33.33);

eq('summary: top page', summary.topPages[0].path, '/');
eq('summary: top page views', summary.topPages[0].views, 2);
eq('summary: top page visitors dedupe the returning visitor', summary.topPages[0].visitors, 1);
eq('summary: top page sessions', summary.topPages[0].sessions, 2);
eq('summary: top page share', summary.topPages[0].share, 66.67);

eq('summary: source order', summary.sources.map((row) => row.label), ['Search', 'Direct', 'Social']);
eq('summary: search source purchases', summary.sources[0].purchases, 1);
eq('summary: search source revenue', summary.sources[0].revenue, 499);
eq('summary: referrer host', summary.referrers[0].host, 'google.com');
eq('summary: device order', summary.devices.map((row) => row.label), ['mobile', 'desktop', 'tablet']);
eq('summary: country order', summary.countries.map((row) => row.label), ['IN', 'US']);
eq('summary: country share', summary.countries[0].share, 66.67);
eq('summary: product views', summary.products[0].views, 1);
eq('summary: product add to cart', summary.products[0].addToCart, 1);
eq('summary: product purchases', summary.products[0].purchases, 1);
eq('summary: product revenue', summary.products[0].revenue, 499);
eq('summary: product view-to-buy', summary.products[0].conversionRate, 100);
eq('summary: searches are lower-cased and trimmed', summary.searches, [{ term: 'silk saree', count: 1 }]);
eq('summary: recent purchase order', summary.recentPurchases[0].orderId, 'ORD-1');
eq('summary: recent purchase channel', summary.recentPurchases[0].channel, 'Search');
eq('summary: recent purchase value', summary.recentPurchases[0].value, 499);
eq('summary: daily pageviews', summary.daily.pageviews, [1, 1, 1]);
eq('summary: daily sessions', summary.daily.sessions, [1, 1, 1]);

/* ==========================================================================
   7. Public event boundary: consent, DNT, bots, sanitisation
   ========================================================================== */
console.log('\n--- 7. Event validation ---');

const ENV_KEYS = [
  'WEBSITE_ANALYTICS_IMPLIED_CONSENT',
  'WEBSITE_ANALYTICS_INTERNAL_HOSTS',
  'WEBSITE_ANALYTICS_SITE_HOST',
];
const savedEnv = {};
ENV_KEYS.forEach((key) => { savedEnv[key] = process.env[key]; });
const restoreEnv = () => {
  ENV_KEYS.forEach((key) => {
    if (savedEnv[key] === undefined) delete process.env[key];
    else process.env[key] = savedEnv[key];
  });
};
delete process.env.WEBSITE_ANALYTICS_IMPLIED_CONSENT;
delete process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS;
delete process.env.WEBSITE_ANALYTICS_SITE_HOST;

const BROWSER_UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36';
const VALID_NOW = new Date('2026-10-26T12:00:00Z');
const HEADERS = {
  'user-agent': BROWSER_UA,
  'x-forwarded-for': '203.0.113.9, 10.0.0.1',
  origin: 'https://shop.example.com',
};
const validBody = (over = {}) => ({
  type: 'pageview',
  sessionId: 's_1',
  visitorId: 'v_1',
  eventId: 'e_1',
  path: '/products/saree?email=a@b.com',
  title: 'Saree',
  consent: true,
  occurredAt: '2026-10-26T11:55:00Z',
  ...over,
});
const validate = (over = {}, headers = HEADERS) => normaliseWebsiteEvent(validBody(over), { headers, now: VALID_NOW });

const valid = validate();
eq('valid event is accepted', valid.ok, true);
eq('valid event: eventId kept', valid.event?.eventId, 'e_1');
eq('valid event: dedupe by event id', valid.event?.dedupeKey, 'event:e_1');
eq('valid event: session kept', valid.event?.sessionId, 's_1');
eq('valid event: visitor kept', valid.event?.visitorId, 'v_1');
eq('valid event: query string dropped', valid.event?.path, '/products/saree');
eq('valid event: bot flag', valid.event?.isBot, false);
eq('valid event: consent flag', valid.event?.consent, true);
eq('valid event: dnt flag', valid.event?.dnt, false);
eq('valid event: device parsed', valid.event?.deviceType, 'desktop');
eq('valid event: browser parsed', valid.event?.browser, 'Chrome');
eq('valid event: os parsed', valid.event?.os, 'Windows');
eq('valid event: no raw ip field', Object.prototype.hasOwnProperty.call(valid.event || {}, 'ip'), false);
eq('valid event: no raw user-agent field', Object.prototype.hasOwnProperty.call(valid.event || {}, 'userAgent'), false);
eq('valid event: ip is stored as a hash', String(valid.event?.ipHash || '').length, 40);
ok('valid event: hash is not the address', valid.event?.ipHash !== '203.0.113.9');
eq('valid event: direct attribution', valid.event?.source, 'Direct');
eq('valid event: direct channel', valid.event?.channel, 'Direct');
eq('valid event: country may be empty', valid.event?.country, '');
eq('valid event: metadata is empty', valid.event?.metadata, {});
eq('valid event: occurredAt kept', valid.event?.occurredAt.toISOString(), '2026-10-26T11:55:00.000Z');
eq('valid event: receivedAt is the clock', valid.event?.receivedAt.toISOString(), '2026-10-26T12:00:00.000Z');

const businessId = '64b7f0c2a1b2c3d4e5f60718';
const scopedEvent = validate({ businessId, locationId: businessId });
eq('valid business id kept', scopedEvent.event?.businessId, businessId);
eq('valid location id kept', scopedEvent.event?.locationId, businessId);
const badScope = validate({ businessId: 'not-an-id', locationId: 'nope' });
eq('bad business id becomes null', badScope.event?.businessId, null);
eq('bad location id becomes null', badScope.event?.locationId, null);

eq('missing consent is not consent', validate({ consent: undefined }).skipped, 'consent_required');
eq('declined consent is skipped', validate({ consent: false }).skipped, 'consent_denied');
eq('consent may arrive as granted', validate({ consent: 'granted' }).ok, true);
eq('DNT in the body blocks collection', validate({ dnt: true }).skipped, 'dnt');
eq('DNT header blocks collection', validate({}, { ...HEADERS, dnt: '1' }).skipped, 'dnt');
eq('Global Privacy Control blocks collection', validate({}, { ...HEADERS, 'sec-gpc': '1' }).skipped, 'dnt');
eq('a bot user-agent is skipped', validate({}, { ...HEADERS, 'user-agent': 'Googlebot/2.1' }).skipped, 'bot');
eq('an absent user-agent is treated as a bot', validate({}, { ...HEADERS, 'user-agent': '' }).skipped, 'bot');
eq('an unknown type is rejected', validate({ type: 'click' }).error, 'unknown_event_type');
eq('a missing session is rejected', validate({ sessionId: '' }).error, 'session_required');
eq('a purchase without an order is rejected', validate({ type: 'purchase', orderId: '' }).error, 'order_required');
eq('a non-object body is rejected', normaliseWebsiteEvent(null).error, 'invalid_payload');
eq('an array body is rejected', normaliseWebsiteEvent([]).error, 'invalid_payload');
eq('a string body is rejected', normaliseWebsiteEvent('hello').error, 'invalid_payload');

const purchaseEvent = validate({
  type: 'purchase',
  orderId: 'ORD-1',
  value: 499.126,
  currency: 'inr',
  productId: 'p1',
  productName: 'Saree',
});
eq('purchase uses the order for dedupe', purchaseEvent.event?.dedupeKey, 'purchase:ORD-1');
eq('purchase value is rounded to paise', purchaseEvent.event?.value, 499.13);
eq('currency is upper-cased', purchaseEvent.event?.currency, 'INR');
eq('purchase keeps the product', purchaseEvent.event?.productId, 'p1');

const numericOrder = validate({ type: 'purchase', orderId: '123456789012345678' });
eq('a long numeric order id survives', numericOrder.event?.orderId, '123456789012345678');
eq('a numeric order id keeps its own dedupe key', numericOrder.event?.dedupeKey, 'purchase:123456789012345678');
eq(
  'a non-purchase order id does not use the purchase dedupe key',
  validate({ orderId: 'ORD-9' }).event?.dedupeKey,
  'event:e_1'
);

const searchEvent = validate({ type: 'search', query: '  Silk Saree  ', searchQuery: 'ignored' });
eq('search query is scrubbed and trimmed', searchEvent.event?.searchQuery, 'Silk Saree');
eq('non-search events do not keep a query', validate({ searchQuery: 'ignored' }).event?.searchQuery, '');
eq('event id is cleaned', validate({ eventId: 'e_1<script>' }).event?.eventId, 'e_1script');

const clampedOld = validate({ occurredAt: '2026-10-01T00:00:00Z' });
eq('an old occurredAt is clamped to seven days', clampedOld.event?.occurredAt.toISOString(), '2026-10-19T12:00:00.000Z');
const clampedFuture = validate({ occurredAt: '2026-10-30T00:00:00Z' });
eq('a future occurredAt is clamped to five minutes', clampedFuture.event?.occurredAt.toISOString(), '2026-10-26T12:05:00.000Z');
eq(
  'an invalid occurredAt falls back to now',
  validate({ occurredAt: 'not-a-date' }).event?.occurredAt.toISOString(),
  '2026-10-26T12:00:00.000Z'
);

eq('a negative value clamps to zero', validate({ type: 'purchase', orderId: 'O1', value: -5 }).event?.value, 0);
eq('an enormous value clamps', validate({ type: 'purchase', orderId: 'O2', value: 2e12 }).event?.value, 1e12);
eq('a negative quantity clamps to zero', validate({ quantity: -2 }).event?.quantity, 0);

const scrubbed = validate({
  path: 'https://shop.example.com/a/b?token=secret#reviews',
  title: 'Call +91 98765 43210 or a@b.com',
  country: 'in',
  metadata: {
    coupon: 'DIWALI',
    email: 'x@y.com',
    phone: '12345',
    nested: { a: 1 },
    qty: 2,
    tags: ['a', 1, null],
    'bad key!': 'x',
  },
});
eq('full URL is reduced to a path', scrubbed.event?.path, '/a/b');
eq('title contact details are redacted', scrubbed.event?.title, 'Call [phone] or [email]');
eq('country is upper-cased', scrubbed.event?.country, 'IN');
eq('metadata keeps only safe primitives', scrubbed.event?.metadata, {
  coupon: 'DIWALI',
  qty: 2,
  tags: ['a', 1],
});

process.env.WEBSITE_ANALYTICS_IMPLIED_CONSENT = 'true';
eq('implied consent can be enabled explicitly', validate({ consent: undefined }).ok, true);
delete process.env.WEBSITE_ANALYTICS_IMPLIED_CONSENT;

process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS = 'shop.example.com';
const internal = validate({}, { ...HEADERS, origin: 'https://www.shop.example.com' });
eq('an internal origin is flagged', internal.event?.isInternal, true);
delete process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS;

/* ==========================================================================
   8. Privacy helpers
   ========================================================================== */
console.log('\n--- 8. Privacy helpers ---');

eq('email is redacted', scrubText('Mail a@b.com now'), 'Mail [email] now');
eq('a phone number is redacted', scrubText('Call +91 98765 43210'), 'Call [phone]');
eq('a card number is redacted', scrubText('Card 4111 1111 1111 1111'), 'Card [number]');
eq('a long token is redacted', scrubText('x'.repeat(40)), '[token]');
eq('control characters collapse to spaces', scrubText('  hello \n world  '), 'hello world');
eq('text is capped', scrubText('abcdef', 3), 'abc');
eq('null text is empty', scrubText(null), '');

eq('a query string is dropped', sanitisePath('/products?x=1#y'), '/products');
eq('a full URL becomes its path', sanitisePath('https://shop.example.com/a/b?token=1'), '/a/b');
eq('a relative path gains a slash', sanitisePath('products'), '/products');
eq('duplicate slashes collapse', sanitisePath('//a//b'), '/a/b');
eq('an empty path is the root', sanitisePath(''), '/');
eq('an email in a path is redacted', sanitisePath('/user/a@b.com'), '/user/[email]');

eq('host strips the scheme and www', sanitiseHost('https://www.Example.com/path?q=1'), 'example.com');
eq('host keeps subdomains', sanitiseHost('https://sub.example.com:8443/x'), 'sub.example.com');
eq('nonsense host is empty', sanitiseHost('not a host'), '');
eq('http URL check accepts https', validHttpUrl('https://example.com'), true);
eq('http URL check rejects ftp', validHttpUrl('ftp://example.com'), false);
eq('http URL check rejects a bare host', validHttpUrl('example.com'), false);

const meta = sanitiseMetadata({
  firstName: 'Amit',
  address: 'x',
  cardNumber: '4111',
  coupon: 'DIWALI',
  note: 'mail a@b.com',
  nested: { a: 1 },
  flag: true,
  nothing: null,
  tags: ['a', 1, null, { x: 1 }],
});
eq('metadata safe keys only', meta, {
  coupon: 'DIWALI',
  note: 'mail [email]',
  flag: true,
  nothing: null,
  tags: ['a', 1],
});
eq('metadata rejects an array', sanitiseMetadata([]), {});
const manyKeys = {};
for (let i = 0; i < 25; i += 1) manyKeys['k' + i] = i;
eq('metadata is capped at twenty keys', Object.keys(sanitiseMetadata(manyKeys)).length, 20);

eq('client ip takes the first forwarded address', clientIp({ 'x-forwarded-for': '203.0.113.9, 10.0.0.1' }), '203.0.113.9');
eq('client ip falls back to Cloudflare', clientIp({ 'cf-connecting-ip': '198.51.100.7' }), '198.51.100.7');
eq('client ip reads a Headers object', clientIp(new Headers({ 'x-forwarded-for': '2001:db8::1' })), '2001:db8::1');
eq('client ip is empty when absent', clientIp({}), '');

const hashA = hashIp('203.0.113.9', 'salt-a');
const hashB = hashIp('203.0.113.9', 'salt-a');
const hashC = hashIp('203.0.113.9', 'salt-b');
eq('ip hash is stable', hashA, hashB);
eq('ip hash depends on the salt', hashA === hashC, false);
eq('ip hash is forty characters', hashA.length, 40);
ok('ip hash is not the address', hashA !== '203.0.113.9');
eq('an empty ip has no hash', hashIp(''), '');

eq('an empty user-agent is a bot', isBotUserAgent(''), true);
eq('Googlebot is a bot', isBotUserAgent('Googlebot/2.1'), true);
eq('a browser is not a bot', isBotUserAgent(BROWSER_UA), false);
eq(
  'Chrome on Windows parses',
  parseUserAgent(BROWSER_UA),
  { browser: 'Chrome', os: 'Windows', deviceType: 'desktop', isBot: false }
);
const iphone = parseUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.0 Mobile/15E148 Safari/604.1');
eq('iPhone is mobile iOS Safari', [iphone.browser, iphone.os, iphone.deviceType, iphone.isBot], ['Safari', 'iOS', 'mobile', false]);
const ipad = parseUserAgent('Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Safari/604.1');
eq('iPad is a tablet', ipad.deviceType, 'tablet');
eq('Googlebot parses as a bot', parseUserAgent('Googlebot/2.1').isBot, true);

process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS = 'example.com, shop.test';
eq('internal hosts list', internalHosts(), ['example.com', 'shop.test']);
eq('an internal host matches', isInternalHost('www.example.com'), true);
eq('an exact internal host matches', isInternalHost('example.com'), true);
eq('a lookalike host does not match', isInternalHost('notexample.com'), false);
eq('an empty host is not internal', isInternalHost(''), false);
delete process.env.WEBSITE_ANALYTICS_INTERNAL_HOSTS;

/* ==========================================================================
   9. Rate limiter
   ========================================================================== */
console.log('\n--- 9. Rate limiter ---');

const limiter = createRateLimiter({ windowMs: 1000, max: 2 });
const t0 = 1000000;
const first = limiter.check('a', t0);
const second = limiter.check('a', t0 + 1);
const third = limiter.check('a', t0 + 2);
eq('first request allowed', first.allowed, true);
eq('first remaining', first.remaining, 1);
eq('second request allowed', second.allowed, true);
eq('second remaining', second.remaining, 0);
eq('third request blocked', third.allowed, false);
eq('blocked request reports a retry', third.retryAfterSeconds, 1);
eq('another key is unaffected', limiter.check('b', t0 + 3).allowed, true);
eq('a new window allows again', limiter.check('a', t0 + 1001).allowed, true);
eq('two keys tracked', limiter.size, 2);
limiter.reset();
eq('reset clears the buckets', limiter.size, 0);

const bounded = createRateLimiter({ windowMs: 1000, max: 5, maxKeys: 2 });
bounded.check('a', t0);
bounded.check('b', t0);
bounded.check('c', t0);
eq('the limiter keeps its key bound', bounded.size, 2);
eq('the newest key survives pruning', bounded.check('c', t0 + 1).allowed, true);

restoreEnv();

/* ==========================================================================
   Result
   ========================================================================== */
console.log('\n----------------------------------------');
console.log(`  ${pass} passed, ${fail} failed`);
console.log('----------------------------------------');
if (fail > 0) process.exitCode = 1;
