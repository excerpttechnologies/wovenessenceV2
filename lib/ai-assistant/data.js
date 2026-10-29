/* Read-only business data for the AI Business Assistant.

   Every figure the assistant can talk about is produced here, from the same
   collections the ERP screens write. The language model never sees a database
   handle: it receives the structured result of one of these functions.

   DEFINITIONS, kept identical to the sales dashboard wherever the two overlap
   (lib/dashboard/service.js and lib/dashboard/calculations.js):

     gross sales  POS invoice total + sales invoice net value
     returns      POS returns + sales returns
     net revenue  gross sales - returns (+ eligible storefront orders)
     orders       POS invoices + sales invoices + eligible storefront orders
                  (a return document is not an order)
     AOV          net revenue / orders, null when there are no orders

   WHERE THIS DIFFERS, DELIBERATELY: the dashboard has a DASHBOARD_LIVE_FROM
   cut-off (24-10-2026) because it was commissioned against a historical
   backfill. The assistant answers questions about any stored month, so it
   reads the full history and reports the dates it used. The two screens can
   therefore show different periods; both say which period they used.

   Nothing here writes. Not one update, insert or delete.
   ========================================================================== */

import mongoose from 'mongoose';
import PosInvoice from '@/models/PosInvoice';
import SalesInvoice from '@/models/SalesInvoice';
import PosReturn from '@/models/PosReturn';
import SalesReturn from '@/models/SalesReturn';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Grc from '@/models/Grc';
import DebitNote from '@/models/DebitNote';
import CreditNote from '@/models/CreditNote';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Voucher from '@/models/Voucher';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { Customer, Supplier } from '@/lib/contacts';
import {
  WEBSITE_ELIGIBLE_STATUSES,
  websiteStatusOf,
} from '@/lib/dashboard/storefront';
import {
  buildDailySeries,
  changePercent,
  linesOf,
  lineQty,
  lineName,
  lineCode,
  lineAmount,
  paymentMix,
  posInvoiceAmount,
  posInvoiceDate,
  posReturnAmount,
  posReturnDate,
  purchaseDate,
  round2,
  salesInvoiceAmount,
  salesInvoiceDate,
  salesReturnAmount,
  salesReturnDate,
  summariseSales,
  topProducts,
} from '@/lib/dashboard/calculations';
import { addDays, buildRange, formatDate } from '@/lib/dashboard/date';
import { channelValueOf, SALES_CHANNEL_INSTAGRAM } from '@/lib/salesChannel';
import { formatINR, formatNumber, formatPercent } from '@/lib/dashboard/format';
import { branchLabelOf } from './scope';

export const DOC_CAP = 20000;
export const INVENTORY_LOOKBACK_DAYS = 28;
export const LOW_STOCK_UNITS = 5;
export const COVER_DAYS = 21;

export class DataError extends Error {
  constructor(status, message, code = 'DATA_ERROR') {
    super(message);
    this.name = 'DataError';
    this.status = status;
    this.code = code;
  }
}

/* --------------------------------------------------------------- helpers -- */

const oid = (value) => (value && mongoose.isValidObjectId(value)
  ? new mongoose.Types.ObjectId(String(value))
  : null);

const oidList = (values) => [...new Set((values || []).map(String).filter(Boolean))]
  .map(oid)
  .filter(Boolean);

function scopeClause(scope, filters) {
  const clause = { businessId: { $in: oidList(filters.businessIds) } };
  if (scope.locationIds) clause.locationId = { $in: oidList(scope.locationIds) };
  return clause;
}

/* A sales document's business date, falling back to when it was saved - the
   same fallback the dashboard uses, because legacy POS bills have no date. */
function dateClause(field, range) {
  return {
    $or: [
      { [field]: { $gte: range.startDate, $lt: range.endExclusive } },
      {
        $and: [
          { $or: [{ [field]: null }, { [field]: { $exists: false } }] },
          { createdAt: { $gte: range.startDate, $lt: range.endExclusive } },
        ],
      },
    ],
  };
}

async function findCapped(Model, filter, projection, sort, label) {
  const count = await Model.countDocuments(filter);
  if (count > DOC_CAP) {
    throw new DataError(413,
      `That period contains ${formatNumber(count)} ${label}. Select a shorter period (up to ${DOC_CAP.toLocaleString('en-IN')} records) and ask again.`,
      'RANGE_TOO_LARGE');
  }
  return Model.find(filter).select(projection).sort(sort).lean();
}

function sumField(rows, field) {
  return round2((rows || []).reduce((sum, row) => sum + (Number(row?.[field]) || 0), 0));
}

function share(value, total) {
  const whole = Number(total) || 0;
  if (!whole) return 0;
  return round2((Number(value) / whole) * 100);
}

function label(name, fallback) {
  return String(name || '').trim() || fallback;
}

/* --------------------------------------------------------------- sales ---- */

const SALES_PROJECTION = {
  businessId: 1, locationId: 1, finYear: 1, date: 1, invoiceNo: 1,
  totalAmount: 1, paid: 1, sellDue: 1, salesChannel: 1, items: 1,
  customerId: 1, customerContact: 1, customerSnapshot: 1, createdAt: 1,
  salesInvoiceNo: 1, netValue: 1, customerMobile: 1,
};

async function loadSalesDocs(scope, filters, range) {
  if (!filters.includesErp) {
    return { pos: [], invoices: [], posReturns: [], salesReturns: [] };
  }

  const base = scopeClause(scope, filters);
  const channelClause = filters.channel === 'instagram'
    ? { salesChannel: SALES_CHANNEL_INSTAGRAM }
    : filters.channel === 'offline'
      ? { salesChannel: { $ne: SALES_CHANNEL_INSTAGRAM } }
      : {};

  const [pos, invoices, posReturns, salesReturns] = await Promise.all([
    findCapped(PosInvoice, {
      ...base, ...channelClause, ...dateClause('date', range),
    }, SALES_PROJECTION, { date: 1 }, 'POS invoices'),
    findCapped(SalesInvoice, {
      ...base,
      ...((filters.channel === 'instagram' || filters.channel === 'offline') ? channelClause : {}),
      createdAt: { $gte: range.startDate, $lt: range.endExclusive },
    }, SALES_PROJECTION, { createdAt: 1 }, 'sales invoices'),
    findCapped(PosReturn, {
      ...base, ...channelClause, ...dateClause('date', range),
    }, SALES_PROJECTION, { date: 1 }, 'POS returns'),
    findCapped(SalesReturn, {
      ...base,
      ...((filters.channel === 'instagram' || filters.channel === 'offline') ? channelClause : {}),
      ...dateClause('returnDate', range),
    }, SALES_PROJECTION, { returnDate: 1 }, 'sales returns'),
  ]);

  return { pos, invoices, posReturns, salesReturns };
}

/* One sale or return as a flat row, so branch and channel maths does not
   have to know which collection it came from. */
function salesRows(docs) {
  const rows = [];
  docs.pos.forEach((d) => rows.push({
    kind: 'sale', channel: channelValueOf(d) || 'offline', businessId: String(d.businessId || ''),
    locationId: String(d.locationId || ''), amount: posInvoiceAmount(d), date: posInvoiceDate(d),
    docNo: d.invoiceNo || '', customerId: d.customerId ? String(d.customerId) : '',
  }));
  docs.invoices.forEach((d) => rows.push({
    kind: 'sale', channel: channelValueOf(d) || 'offline', businessId: String(d.businessId || ''),
    locationId: String(d.locationId || ''), amount: salesInvoiceAmount(d), date: salesInvoiceDate(d),
    docNo: d.salesInvoiceNo || '', customerId: d.customerId ? String(d.customerId) : '',
  }));
  docs.posReturns.forEach((d) => rows.push({
    kind: 'return', channel: channelValueOf(d) || 'offline', businessId: String(d.businessId || ''),
    locationId: String(d.locationId || ''), amount: posReturnAmount(d), date: posReturnDate(d),
    docNo: d.invoiceNo || '', customerId: d.customerId ? String(d.customerId) : '',
  }));
  docs.salesReturns.forEach((d) => rows.push({
    kind: 'return', channel: channelValueOf(d) || 'offline', businessId: String(d.businessId || ''),
    locationId: String(d.locationId || ''), amount: salesReturnAmount(d), date: salesReturnDate(d),
    docNo: d.salesReturnNo || '', customerId: d.customerId ? String(d.customerId) : '',
  }));
  return rows;
}

/* Storefront orders in the period, with the ERP-dedupe rule the dashboard
   already applies: an online order whose invoice number exists in ERP has
   already been counted as an ERP sale, so it must not be counted again. */
export async function loadWebsite(scope, filters, range) {
  if (!filters.includesWebsite) {
    return {
      available: false,
      reason: 'This answer is scoped to ERP sales only.',
      orders: [], eligible: [], cancelled: [], pendingPayment: [],
      revenue: 0, duplicateCount: 0, duplicateRevenue: 0,
    };
  }

  const branchOids = oidList(filters.branchId
    ? [filters.branchId]
    : scope.branches.map((b) => b.branchId));
  if (!branchOids.length) {
    return {
      available: false,
      reason: 'No storefront branch is linked to this account, so website orders cannot be attributed.',
      orders: [], eligible: [], cancelled: [], pendingPayment: [],
      revenue: 0, duplicateCount: 0, duplicateRevenue: 0,
    };
  }

  const filter = {
    createdAt: { $gte: range.startDate, $lt: range.endExclusive },
    branch: { $in: branchOids },
  };
  const count = await scope.db.collection('orders').countDocuments(filter);
  if (count > DOC_CAP) {
    throw new DataError(413,
      `That period contains ${formatNumber(count)} storefront orders. Select a shorter period and ask again.`,
      'RANGE_TOO_LARGE');
  }

  const orders = await scope.db.collection('orders')
    .find(filter)
    .project({
      orderNumber: 1, status: 1, invoiceNumber: 1, invoicedAt: 1, createdAt: 1,
      branch: 1, branchName: 1, branchCity: 1, customer: 1, customerName: 1,
      customerPhone: 1, customerEmail: 1, 'amounts.grandTotal': 1,
      'amounts.subtotal': 1, 'payment.method': 1, 'payment.status': 1, lines: 1,
    })
    .sort({ createdAt: 1 })
    .toArray();

  const eligible = [];
  const cancelled = [];
  const pendingPayment = [];
  const other = [];
  orders.forEach((order) => {
    const kind = websiteStatusOf(order);
    if (kind === 'eligible') eligible.push(order);
    else if (kind === 'excluded') {
      if (String(order.status || '').toLowerCase() === 'cancelled') cancelled.push(order);
      else pendingPayment.push(order);
    } else other.push(order);
  });

  /* Duplicate check: query ERP by the orders' own invoice numbers, not by
     this period's window. An ERP invoice raised in an earlier month still
     means the order was already recognised as revenue. */
  const numbers = [...new Set(eligible.map((o) => String(o.invoiceNumber || '').trim().toUpperCase()).filter(Boolean))];
  let duplicateSet = new Set();
  if (numbers.length) {
    const base = scopeClause(scope, filters);
    const [pos, sales] = await Promise.all([
      PosInvoice.find({ ...base, invoiceNo: { $in: numbers } }).select('invoiceNo').lean(),
      SalesInvoice.find({ ...base, salesInvoiceNo: { $in: numbers } }).select('salesInvoiceNo').lean(),
    ]);
    duplicateSet = new Set([
      ...pos.map((d) => String(d.invoiceNo || '').toUpperCase()).filter(Boolean),
      ...sales.map((d) => String(d.salesInvoiceNo || '').toUpperCase()).filter(Boolean),
    ]);
  }

  const valueOf = (order) => {
    const gross = Number(order?.amounts?.grandTotal);
    if (Number.isFinite(gross)) return gross;
    const subtotal = Number(order?.amounts?.subtotal);
    return Number.isFinite(subtotal) ? subtotal : 0;
  };

  const unique = eligible.filter((o) => !duplicateSet.has(String(o.invoiceNumber || '').trim().toUpperCase()));
  const duplicates = eligible.filter((o) => duplicateSet.has(String(o.invoiceNumber || '').trim().toUpperCase()));

  return {
    available: true,
    reason: '',
    orders,
    eligible: unique,
    duplicates,
    cancelled,
    pendingPayment,
    other,
    revenue: round2(unique.reduce((sum, order) => sum + valueOf(order), 0)),
    duplicateCount: duplicates.length,
    duplicateRevenue: round2(duplicates.reduce((sum, order) => sum + valueOf(order), 0)),
    cancelledValue: round2(cancelled.reduce((sum, order) => sum + valueOf(order), 0)),
  };
}

function websiteRows(website) {
  return (website.eligible || []).map((order) => {
    const gross = Number(order?.amounts?.grandTotal);
    const subtotal = Number(order?.amounts?.subtotal);
    return {
      kind: 'sale',
      channel: 'website',
      businessId: '',
      locationId: '',
      branchId: String(order.branch || ''),
      amount: Number.isFinite(gross) ? gross : (Number.isFinite(subtotal) ? subtotal : 0),
      date: order.createdAt ? new Date(order.createdAt) : null,
      docNo: order.orderNumber || '',
      customerId: order.customer ? String(order.customer) : '',
    };
  });
}

function topWebsiteProducts(website, limit) {
  const acc = new Map();
  (website.eligible || []).forEach((order) => {
    (Array.isArray(order.lines) ? order.lines : []).forEach((line) => {
      const qty = Number(line.quantity);
      const price = Number(line.unitPrice);
      const direct = Number(line.lineSubtotal);
      const value = Number.isFinite(direct) ? direct : (Number.isFinite(qty) && Number.isFinite(price) ? qty * price : 0);
      const name = String(line.productName || line.name || line.itemCode || line.barcode || 'Unnamed item').trim();
      const code = String(line.itemCode || line.barcode || '').trim();
      const key = code || name;
      if (!key) return;
      if (!acc.has(key)) acc.set(key, { key, name, code, qty: 0, revenue: 0, lines: 0 });
      const row = acc.get(key);
      row.qty = round2(row.qty + (Number.isFinite(qty) ? qty : 0));
      row.revenue = round2(row.revenue + value);
      row.lines += 1;
    });
  });
  return [...acc.values()]
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty)
    .slice(0, limit);
}

/* Branch rows: ERP sales grouped by the business they were recorded under,
   storefront orders grouped by their branch's ERP business. A sale with no
   business mapping stays in the unassigned row - it is never forced into a
   boutique. */
function branchPerformance(scope, currentRows, previousRows, website, previousWebsite) {
  const acc = new Map();
  const nameOf = (businessId) => branchLabelOf(scope, businessId);

  const ensure = (businessId) => {
    const key = businessId || '__unassigned__';
    if (!acc.has(key)) {
      acc.set(key, {
        branchId: '', businessId: key === '__unassigned__' ? '' : key,
        branchName: key === '__unassigned__' ? 'Unassigned / no branch mapping' : nameOf(key),
        sales: 0, returns: 0, net: 0, orders: 0,
        previousNet: 0, previousOrders: 0,
      });
    }
    return acc.get(key);
  };

  currentRows.forEach((row) => {
    const target = ensure(row.businessId);
    /* A return document is not an order, so it moves returns and net but not
       the order count - the same rule as the summary KPI. */
    if (row.kind === 'sale') {
      target.orders += 1;
      target.sales = round2(target.sales + row.amount);
    } else {
      target.returns = round2(target.returns + row.amount);
    }
    target.net = round2(target.sales - target.returns);
  });

  previousRows.forEach((row) => {
    const target = ensure(row.businessId);
    if (row.kind === 'sale') target.previousOrders += 1;
    target.previousNet = round2(target.previousNet + (row.kind === 'sale' ? row.amount : -row.amount));
  });

  const businessOfBranch = new Map(scope.branches.map((b) => [b.branchId, b.businessId]));
  const addWebsite = (orders, key) => {
    (orders || []).forEach((order) => {
      const businessId = businessOfBranch.get(String(order.branch)) || '';
      const target = ensure(businessId);
      const gross = Number(order?.amounts?.grandTotal);
      const subtotal = Number(order?.amounts?.subtotal);
      const amount = Number.isFinite(gross) ? gross : (Number.isFinite(subtotal) ? subtotal : 0);
      if (key === 'current') {
        target.sales = round2(target.sales + amount);
        target.net = round2(target.net + amount);
        target.orders += 1;
      } else {
        target.previousNet = round2(target.previousNet + amount);
        target.previousOrders += 1;
      }
    });
  };
  addWebsite(website.eligible, 'current');
  addWebsite(previousWebsite.eligible, 'previous');

  const totalNet = round2([...acc.values()].reduce((sum, row) => sum + row.net, 0));
  return [...acc.values()]
    .map((row) => ({
      ...row,
      share: share(row.net, totalNet),
      change: changePercent(row.net, row.previousNet),
      browserHref: row.businessId
        ? `/admin/reports/sales-analysis?business=${row.businessId}`
        : '/admin/reports/sales-analysis',
    }))
    .sort((a, b) => b.net - a.net || a.branchName.localeCompare(b.branchName));
}

function channelPerformance(current, website, previous, previousWebsite) {
  const split = (channel) => {
    const rows = current.filter((r) => r.channel === channel);
    const sales = sumField(rows.filter((r) => r.kind === 'sale'), 'amount');
    const returns = sumField(rows.filter((r) => r.kind === 'return'), 'amount');
    return { sales, returns, net: round2(sales - returns), orders: rows.filter((r) => r.kind === 'sale').length };
  };

  const offline = split('offline');
  const instagram = split('instagram');
  const websiteNet = website.available ? round2(website.revenue) : 0;
  const websiteOrders = website.available ? website.eligible.length : 0;

  const previousSplit = (channel) => {
    const rows = previous.filter((r) => r.channel === channel);
    const sales = sumField(rows.filter((r) => r.kind === 'sale'), 'amount');
    const returns = sumField(rows.filter((r) => r.kind === 'return'), 'amount');
    return { net: round2(sales - returns), orders: rows.filter((r) => r.kind === 'sale').length };
  };

  const previousWebsiteNet = previousWebsite.available ? round2(previousWebsite.revenue) : 0;

  const rows = [
    {
      key: 'offline', label: 'Offline store',
      net: offline.net, orders: offline.orders, returns: offline.returns,
      available: true, note: 'POS and sales invoices billed without an Instagram tag.',
      previousNet: previousSplit('offline').net,
    },
    {
      key: 'instagram', label: 'Instagram',
      net: instagram.net, orders: instagram.orders, returns: instagram.returns,
      available: true,
      note: 'Only bills saved with Sales Channel = Instagram. Nothing is inferred.',
      previousNet: previousSplit('instagram').net,
    },
    {
      key: 'website', label: 'E-commerce website',
      net: websiteNet, orders: websiteOrders, returns: 0,
      available: website.available,
      note: website.available
        ? `${website.duplicateCount} storefront order(s) already invoiced in ERP were excluded from revenue.`
        : website.reason,
      previousNet: previousWebsiteNet,
    },
  ];

  const total = round2(rows.reduce((sum, row) => sum + row.net, 0));
  return {
    rows: rows.map((row) => ({
      ...row,
      share: share(row.net, total),
      change: changePercent(row.net, row.previousNet),
    })),
    total,
  };
}

/* Is the comparison window before the first stored sale? A "0% growth" on an
   empty prior period would be an invented figure, so the answer says why. */
async function firstSaleDate(scope, filters) {
  const base = scopeClause(scope, filters);
  const [pos, sales] = await Promise.all([
    PosInvoice.findOne(base).sort({ createdAt: 1 }).select('createdAt date').lean(),
    SalesInvoice.findOne(base).sort({ createdAt: 1 }).select('createdAt').lean(),
  ]);
  const dates = [pos?.date, pos?.createdAt, sales?.createdAt]
    .filter(Boolean).map((d) => new Date(d)).filter((d) => !Number.isNaN(d.getTime()));
  if (!dates.length) return null;
  return new Date(Math.min(...dates.map((d) => d.getTime())));
}

export async function salesAnalytics(scope, filters, period) {
  const range = buildRange(period.start, period.end);
  const previousRange = period.comparison
    ? buildRange(period.comparison.start, period.comparison.end)
    : null;

  const [currentDocs, previousDocs, website, previousWebsite, firstAt] = await Promise.all([
    loadSalesDocs(scope, filters, range),
    previousRange ? loadSalesDocs(scope, filters, previousRange) : Promise.resolve({ pos: [], invoices: [], posReturns: [], salesReturns: [] }),
    loadWebsite(scope, filters, range),
    previousRange ? loadWebsite(scope, filters, previousRange) : Promise.resolve({ available: false, eligible: [], revenue: 0, reason: '' }),
    firstSaleDate(scope, filters),
  ]);

  /* summariseSales names its inputs explicitly; passing the loader's object
     directly would silently leave every field at zero. */
  const summaryOf = (docs) => summariseSales({
    posInvoices: docs.pos,
    salesInvoices: docs.invoices,
    posReturns: docs.posReturns,
    salesReturns: docs.salesReturns,
  });
  const currentSummary = summaryOf(currentDocs);
  const previousSummary = summaryOf(previousDocs);
  const rows = salesRows(currentDocs);
  const previousRows = salesRows(previousDocs);
  const websiteRevenue = website.available ? website.revenue : 0;
  const previousWebsiteRevenue = previousWebsite.available ? previousWebsite.revenue : 0;
  const net = round2(currentSummary.netSales + websiteRevenue);
  const previousNet = round2(previousSummary.netSales + previousWebsiteRevenue);
  const orders = currentSummary.orders + (website.available ? website.eligible.length : 0);
  const previousOrders = previousSummary.orders + (previousWebsite.available ? previousWebsite.eligible.length : 0);
  const websiteOnly = filters.channel === 'website';

  const channels = channelPerformance(rows, website, previousRows, previousWebsite);
  const branches = branchPerformance(scope, rows, previousRows, website, previousWebsite);

  const daily = buildDailySeries({
    from: range.startDate,
    to: range.endExclusive,
    posInvoices: currentDocs.pos,
    salesInvoices: currentDocs.invoices,
    posReturns: currentDocs.posReturns,
    salesReturns: currentDocs.salesReturns,
  });

  const products = [
    ...topProducts(currentDocs.pos, currentDocs.invoices, 12),
    ...topWebsiteProducts(website, 12),
  ];
  const merged = new Map();
  products.forEach((row) => {
    const key = (row.code || row.name || '').toUpperCase();
    if (!key) return;
    if (!merged.has(key)) merged.set(key, { ...row });
    else {
      const target = merged.get(key);
      target.qty = round2(target.qty + row.qty);
      target.revenue = round2(target.revenue + row.revenue);
    }
  });
  const topProductRows = [...merged.values()].sort((a, b) => b.revenue - a.revenue).slice(0, 10);

  const limitations = [];
  if (!website.available && filters.channel === 'all') limitations.push(website.reason);
  if (website.duplicateCount) {
    limitations.push(`${website.duplicateCount} storefront order(s) with an ERP invoice number (${formatINR(website.duplicateRevenue)}) are excluded from website revenue so the same sale is not counted twice.`);
  }
  if (websiteOnly) {
    limitations.push('This answer covers storefront orders only; ERP bills are excluded by the channel filter.');
  }
  if (previousRange && firstAt && new Date(`${previousRange.start}T00:00:00+05:30`) < firstAt) {
    limitations.push(`Recorded sales begin on ${formatDate(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(firstAt))}, so the comparison window (${period.comparison.label}) includes days before the ERP had any sales. Treat the change with care.`);
  }
  if (!currentSummary.orders && !websiteOrdersCount(website)) {
    limitations.push('No sale documents are recorded for this period in the selected scope, so a zero is a real zero rather than a missing source.');
  }

  return {
    period,
    range,
    current: {
      grossSales: round2(currentSummary.grossSales),
      returns: round2(currentSummary.returns),
      netSales: round2(currentSummary.netSales),
      websiteRevenue,
      net,
      orders,
      erpOrders: currentSummary.orders,
      websiteOrders: website.available ? website.eligible.length : 0,
      units: currentSummary.units,
      customers: currentSummary.customers,
      aov: orders ? round2(net / orders) : null,
      returnDocuments: currentDocs.posReturns.length + currentDocs.salesReturns.length,
      instagramNet: round2(channels.rows.find((r) => r.key === 'instagram')?.net || 0),
      offlineNet: round2(channels.rows.find((r) => r.key === 'offline')?.net || 0),
    },
    previous: {
      grossSales: round2(previousSummary.grossSales),
      returns: round2(previousSummary.returns),
      netSales: round2(previousSummary.netSales),
      websiteRevenue: previousWebsiteRevenue,
      net: previousNet,
      orders: previousOrders,
      erpOrders: previousSummary.orders,
      aov: previousOrders ? round2(previousNet / previousOrders) : null,
      units: previousSummary.units,
    },
    changes: {
      net: changePercent(net, previousNet),
      gross: changePercent(currentSummary.grossSales + websiteRevenue, previousSummary.grossSales + previousWebsiteRevenue),
      orders: changePercent(orders, previousOrders),
      aov: changePercent(
        orders ? net / orders : 0,
        previousOrders ? previousNet / previousOrders : 0
      ),
      returns: changePercent(currentSummary.returns, previousSummary.returns),
    },
    daily,
    branches,
    channels,
    paymentMix: paymentMix(currentDocs.pos),
    topProducts: topProductRows,
    website,
    limitations,
    counts: {
      posInvoices: currentDocs.pos.length,
      salesInvoices: currentDocs.invoices.length,
      posReturns: currentDocs.posReturns.length,
      salesReturns: currentDocs.salesReturns.length,
      websiteOrders: website.available ? website.eligible.length : 0,
      websiteCancelled: website.available ? website.cancelled.length : 0,
      websitePendingPayment: website.available ? website.pendingPayment.length : 0,
    },
  };
}

function websiteOrdersCount(website) {
  return website.available ? website.eligible.length : 0;
}

/* ------------------------------------------------------------- inventory -- */

async function groupResolver(scope) {
  const groups = await scope.db.collection('productgroup')
    .find({})
    .project({ name: 1, parentId: 1 })
    .toArray();
  const byId = new Map(groups.map((g) => [String(g._id), g]));
  const cache = new Map();
  const rootName = (id) => {
    const key = String(id || '');
    if (!key) return '';
    if (cache.has(key)) return cache.get(key);
    const seen = new Set();
    let current = byId.get(key);
    let name = '';
    while (current && !seen.has(String(current._id))) {
      seen.add(String(current._id));
      name = String(current.name || '').trim() || name;
      current = current.parentId ? byId.get(String(current.parentId)) : null;
    }
    cache.set(key, name);
    return name;
  };
  return { rootName };
}

function matchesHint(value, hint) {
  if (!hint) return true;
  const text = String(value || '').toLowerCase();
  const needle = String(hint).toLowerCase().trim().replace(/s$/, '');
  return needle ? text.includes(needle) : true;
}

/* Units currently IN_STOCK, grouped by item code, plus sold velocity over the
   last 28 days. The velocity is ERP POS sales only; a website sale that has
   not been pulled into an ERP bill is not in it, and the answer says so. */
export async function inventoryReport(scope, filters, {
  categoryHint = '',
  lowStockThreshold = LOW_STOCK_UNITS,
  limit = 12,
  codes = null,
} = {}) {
  const businessOids = oidList(filters.businessIds);
  const locationOids = scope.locationIds ? oidList(scope.locationIds) : null;

  const labelMatch = { currentBusinessId: { $in: businessOids } };
  if (locationOids) labelMatch.currentLocationId = { $in: locationOids };

  const resolver = await groupResolver(scope);
  const rateExpr = {
    $convert: {
      input: { $ifNull: ['$finalNet', '$purRate'] },
      to: 'double', onError: 0, onNull: 0,
    },
  };
  const qtyExpr = { $convert: { input: { $ifNull: ['$qtyNum', 0] }, to: 'double', onError: 0, onNull: 0 } };
  const codeExpr = {
    $let: {
      vars: {
        itemCode: { $ifNull: ['$itemCode', ''] },
        barcodeNo: { $ifNull: ['$barcodeNo', ''] },
      },
      in: { $cond: [{ $ne: ['$$itemCode', ''] }, '$$itemCode', '$$barcodeNo'] },
    },
  };
  const inStock = { $eq: ['$status', BARCODE_STATUS.IN_STOCK] };

  const rows = await BarcodeLabel.aggregate([
    { $match: labelMatch },
    {
      $group: {
        _id: codeExpr,
        name: { $first: '$itemName' },
        groupId: { $first: '$groupId' },
        uom: { $first: '$uomType' },
        stock: { $sum: { $cond: [inStock, qtyExpr, 0] } },
        units: { $sum: { $cond: [inStock, 1, 0] } },
        value: { $sum: { $cond: [inStock, { $multiply: [qtyExpr, rateExpr] }, 0] } },
        everStocked: { $sum: 1 },
      },
    },
    { $match: { _id: { $nin: ['', null] } } },
    ...(Array.isArray(codes) && codes.length
      ? [{ $match: { _id: { $in: codes } } }]
      : []),
    { $sort: { stock: -1 } },
    { $limit: 5000 },
  ]).allowDiskUse(true);

  /* Sales velocity. The same date fallback and scope as every other report. */
  const today = periodToday(filters);
  const velocityStart = new Date(`${addDays(today, -(INVENTORY_LOOKBACK_DAYS - 1))}T00:00:00+05:30`);
  const velocityEnd = new Date(`${addDays(today, 1)}T00:00:00+05:30`);
  const velocityRows = filters.includesErp
    ? await PosInvoice.aggregate([
      { $match: { ...scopeClause(scope, filters), ...dateClause('date', { startDate: velocityStart, endExclusive: velocityEnd }) } },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      {
        $project: {
          code: {
            $let: {
              vars: {
                itemCode: { $ifNull: ['$items.itemCode', ''] },
                barcodeNo: { $ifNull: ['$items.barcodeNo', ''] },
              },
              in: { $cond: [{ $ne: ['$$itemCode', ''] }, '$$itemCode', '$$barcodeNo'] },
            },
          },
          qty: { $convert: { input: '$items.qty', to: 'double', onError: 0, onNull: 0 } },
          isReturn: { $eq: ['$items.isReturn', true] },
        },
      },
      { $match: { code: { $nin: ['', null] } } },
      {
        $group: {
          _id: '$code',
          qty: { $sum: { $cond: ['$isReturn', { $multiply: ['$qty', -1] }, '$qty'] } },
        },
      },
    ]).allowDiskUse(true)
    : [];

  const sold = new Map(velocityRows.map((row) => [String(row._id), Number(row.qty) || 0]));

  const catalogue = rows.map((row) => {
    const category = resolver.rootName(row.groupId);
    const soldQty = sold.get(String(row._id)) || 0;
    const daily = soldQty / INVENTORY_LOOKBACK_DAYS;
    return {
      code: String(row._id),
      name: label(row.name, String(row._id)),
      uom: row.uom || '',
      category: category || 'Uncategorised',
      stock: round2(row.stock),
      units: Number(row.units) || 0,
      value: round2(row.value),
      sold28: round2(soldQty),
      dailyVelocity: round2(daily * 100) / 100,
      daysCover: daily > 0 ? Math.round((row.stock / daily) * 10) / 10 : null,
    };
  });

  const filtered = categoryHint
    ? catalogue.filter((row) => matchesHint(row.category, categoryHint) || matchesHint(row.name, categoryHint))
    : catalogue;

  const totalUnits = round2(filtered.reduce((total, row) => total + row.stock, 0));
  const totalValue = round2(filtered.reduce((total, row) => total + row.value, 0));
  const lowStock = filtered
    .filter((row) => row.stock > 0 && row.stock <= lowStockThreshold)
    .sort((a, b) => a.stock - b.stock)
    .slice(0, limit);
  const outOfStock = filtered
    .filter((row) => row.stock <= 0)
    .sort((a, b) => b.sold28 - a.sold28 || a.name.localeCompare(b.name))
    .slice(0, limit);
  const coverAlerts = filtered
    .filter((row) => row.stock > 0 && row.daysCover !== null && row.daysCover < COVER_DAYS)
    .sort((a, b) => a.daysCover - b.daysCover)
    .slice(0, limit);

  const reorder = filtered
    .filter((row) => row.stock <= lowStockThreshold || (row.daysCover !== null && row.daysCover < COVER_DAYS))
    .map((row) => {
      const target = Math.ceil((row.dailyVelocity || 0) * COVER_DAYS);
      const suggested = Math.max(1, Math.ceil(target - row.stock));
      return { ...row, suggestedQty: suggested };
    })
    .sort((a, b) => (a.daysCover ?? 0) - (b.daysCover ?? 0) || b.sold28 - a.sold28)
    .slice(0, limit);

  const limitations = [];
  if (!rows.length) limitations.push('No barcode stock rows exist in this scope, so inventory figures cannot be produced.');
  if (categoryHint && !filtered.length) limitations.push(`No product group or item name matched "${categoryHint}", so the category filter returned nothing.`);
  if (categoryHint) limitations.push(`The category filter matched product groups or item names containing "${categoryHint}".`);
  limitations.push('There is no stored reorder threshold. Low stock means 5 units or fewer in stock; cover alerts use 28-day POS sales velocity and a 21-day review line, which is an assumption, not a configured rule.');
  limitations.push('Units sold on the website do not reduce ERP stock until the order is converted to an ERP bill, so velocity is an ERP-sales measure.');

  return {
    available: rows.length > 0,
    generatedFor: today,
    itemCount: catalogue.length,
    filteredCount: filtered.length,
    rows: filtered.slice(0, 500),
    totalUnits,
    totalValue,
    lowStockThreshold,
    coverDays: COVER_DAYS,
    lookbackDays: INVENTORY_LOOKBACK_DAYS,
    lowStock,
    outOfStock,
    coverAlerts,
    reorder,
    topByValue: [...filtered].sort((a, b) => b.value - a.value).slice(0, limit),
    categories: [...new Map(filtered.map((row) => [row.category, 0])).keys()].slice(0, 20),
    limitations,
  };
}

function periodToday(filters) {
  /* The inventory tool is "now", not a historical window. */
  return filters.today || new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
}

/* -------------------------------------------------------------- purchases -- */

export async function purchaseReport(scope, filters, period) {
  const range = buildRange(period.start, period.end);
  const base = scopeClause(scope, filters);

  const [invoices, grcs, pendingAll] = await Promise.all([
    findCapped(PurchaseInvoice, { ...base, ...dateClause('purchaseDate', range) },
      {
        businessId: 1, locationId: 1, supplierId: 1, purchaseInvoiceNo: 1,
        purchaseDate: 1, netPurchaseAmt: 1, totalPayable: 1, createdAt: 1,
      }, { purchaseDate: 1 }, 'purchase invoices'),
    findCapped(Grc, { ...base, ...dateClause('grcDate', range) },
      {
        businessId: 1, locationId: 1, supplierId: 1, grcNumber: 1, grcDate: 1,
        netAmount: 1, totalAmount: 1, taxableValue: 1, purchaseInvoiceId: 1, createdAt: 1,
      }, { grcDate: 1 }, 'goods receipt challans'),
    Grc.countDocuments({ ...base, purchaseInvoiceId: null }),
  ]);

  /* Purchase invoices are the value once they exist; GRCs are the fallback
     only when the period has no invoice at all. Adding both would count a
     converted GRC twice. */
  const source = invoices.length ? 'Purchase invoices' : 'Goods receipt challans';
  const valueOf = (doc) => {
    if (invoices.length) return Number(doc.totalPayable) || Number(doc.netPurchaseAmt) || 0;
    return Number(doc.netAmount) || Number(doc.totalAmount) || Number(doc.taxableValue) || 0;
  };
  const rows = invoices.length ? invoices : grcs;
  const total = round2(rows.reduce((total, row) => total + valueOf(row), 0));

  const bySupplier = new Map();
  rows.forEach((doc) => {
    const key = String(doc.supplierId || '');
    if (!bySupplier.has(key)) bySupplier.set(key, { supplierId: key, value: 0, documents: 0 });
    const row = bySupplier.get(key);
    row.value = round2(row.value + valueOf(doc));
    row.documents += 1;
  });

  const supplierIds = [...bySupplier.keys()].filter((id) => mongoose.isValidObjectId(id));
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds.map(oid) } })
      .select('businessName firstName lastName').lean()
    : [];
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));
  const nameOf = (id) => {
    const supplier = supplierById.get(String(id));
    if (!supplier) return 'Unnamed supplier';
    return label(supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '), 'Unnamed supplier');
  };

  const supplierRows = [...bySupplier.values()]
    .map((row) => ({ ...row, supplier: nameOf(row.supplierId), share: share(row.value, total) }))
    .sort((a, b) => b.value - a.value)
    .slice(0, 8);

  const pendingInPeriod = grcs.filter((grc) => !grc.purchaseInvoiceId);
  const pendingValue = round2(pendingInPeriod.reduce((total, grc) => total + (Number(grc.netAmount) || Number(grc.totalAmount) || Number(grc.taxableValue) || 0), 0));

  const limitations = [];
  limitations.push('The ERP has no purchase-order document. "Pending purchases" here means GRCs received but not yet converted into a purchase invoice.');
  if (!invoices.length && grcs.length) {
    limitations.push('No purchase invoice exists for this period, so the value is taken from the GRCs received.');
  }

  return {
    period,
    source,
    total,
    invoiceCount: invoices.length,
    grcCount: grcs.length,
    documents: rows.length,
    pendingInPeriod: pendingInPeriod.length,
    pendingValue,
    pendingAll,
    suppliers: supplierRows,
    rows: rows
      .map((doc) => ({
        docNo: doc.purchaseInvoiceNo || doc.grcNumber || '',
        date: (doc.purchaseDate || doc.grcDate || doc.createdAt || null),
        supplier: nameOf(doc.supplierId),
        value: round2(valueOf(doc)),
        converted: Boolean(doc.purchaseInvoiceId),
        type: invoices.length ? 'Purchase invoice' : 'Goods receipt challan',
      }))
      .sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))
      .slice(0, 20),
    limitations,
  };
}

/* ------------------------------------------------------------ outstanding -- */

async function sumLines(Model, match, field = 'netAmount') {
  const result = await Model.aggregate([
    { $match: match },
    { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
    { $group: { _id: null, total: { $sum: { $ifNull: ['$items.' + field, 0] } } } },
  ]);
  return result.length ? round2(result[0].total) : 0;
}

export async function outstandingReport(scope, filters) {
  const base = scopeClause(scope, filters);
  const paymentBase = { ...base, type: 'Payment' };
  const receiptBase = { ...base, type: 'Receipt' };

  const [
    purchaseInvoiced, debitNoted, paymentsMade,
    salesInvoiced, posDue, icInvoiced, creditNoted, salesReturned, posReturned, receiptsTaken,
  ] = await Promise.all([
    PurchaseInvoice.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$totalPayable', 0] } } } }]),
    DebitNote.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$value', 0] } } } }]),
    Voucher.aggregate([{ $match: paymentBase }, { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', 0] } } } }]),
    SalesInvoice.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$netValue', 0] } } } }]),
    PosInvoice.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$sellDue', 0] } } } }]),
    IcSalesInvoice.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$netValue', 0] } } } }]),
    sumLines(CreditNote, base),
    sumLines(SalesReturn, base),
    PosReturn.aggregate([{ $match: base }, { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', 0] } } } }]),
    Voucher.aggregate([{ $match: receiptBase }, { $group: { _id: null, total: { $sum: { $ifNull: ['$totalAmount', 0] } } } }]),
  ]);

  const value = (rows) => round2(rows?.[0]?.total || 0);

  const payables = Math.max(0, round2(
    value(purchaseInvoiced) - value(debitNoted) - value(paymentsMade)
  ));
  const receivables = Math.max(0, round2(
    value(salesInvoiced) + value(posDue) + value(icInvoiced)
    - value(creditNoted) - value(salesReturned) - value(posReturned) - value(receiptsTaken)
  ));

  /* Top parties behind the balances. The aggregate groups by id; names are
     read only for the handful of rows that are shown. */
  const [topSupplierRows, topCustomerRows] = await Promise.all([
    PurchaseInvoice.aggregate([
      { $match: base },
      { $group: { _id: '$supplierId', total: { $sum: { $ifNull: ['$totalPayable', 0] } }, documents: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]),
    PosInvoice.aggregate([
      { $match: { ...base, sellDue: { $gt: 0 } } },
      { $group: { _id: '$customerId', total: { $sum: '$sellDue' }, bills: { $sum: 1 } } },
      { $sort: { total: -1 } },
      { $limit: 8 },
    ]),
  ]);

  const supplierIds = topSupplierRows.map((r) => r._id).filter((id) => mongoose.isValidObjectId(id));
  const customerIds = topCustomerRows.map((r) => r._id).filter((id) => mongoose.isValidObjectId(id));
  const [suppliers, customers] = await Promise.all([
    supplierIds.length ? Supplier.find({ _id: { $in: supplierIds.map(oid) } }).select('businessName firstName lastName').lean() : [],
    customerIds.length ? Customer.find({ _id: { $in: customerIds.map(oid) } }).select('businessName firstName lastName prefix').lean() : [],
  ]);
  const nameFrom = (row, fallback) => {
    if (!row) return fallback;
    return label(row.businessName || [row.firstName, row.lastName].filter(Boolean).join(' '), fallback);
  };
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));
  const customerById = new Map(customers.map((c) => [String(c._id), c]));

  return {
    payables,
    receivables,
    netPosition: round2(receivables - payables),
    components: {
      purchaseInvoices: value(purchaseInvoiced),
      debitNotes: value(debitNoted),
      paymentVouchers: value(paymentsMade),
      salesInvoices: value(salesInvoiced),
      posOutstanding: value(posDue),
      interCompanyInvoices: value(icInvoiced),
      creditNotes: value(creditNoted),
      salesReturns: value(salesReturned),
      posReturns: value(posReturned),
      receiptVouchers: value(receiptsTaken),
    },
    suppliers: topSupplierRows.map((row) => ({
      name: nameFrom(supplierById.get(String(row._id)), row._id ? 'Unnamed supplier' : 'Unassigned supplier'),
      value: round2(row.total), documents: row.documents,
    })),
    customers: topCustomerRows.map((row) => ({
      name: row._id ? nameFrom(customerById.get(String(row._id)), 'Customer') : 'Walk-in customer',
      value: round2(row.total), bills: row.bills,
    })),
    limitations: [
      'Payables are purchase invoices less debit notes less payment vouchers. Receivables are sales invoices, POS unpaid balances and inter-company invoices, less credit notes, returns and receipt vouchers.',
      'These are balances as of now, not for a selected period; no date filter is applied.',
      'Vouchers are netted at document level; invoice-level allocation is not recorded in this ERP.',
    ],
  };
}

/* -------------------------------------------------------------- customers -- */

export async function customerReport(scope, filters, period) {
  const range = buildRange(period.start, period.end);
  const previousRange = period.comparison
    ? buildRange(period.comparison.start, period.comparison.end)
    : null;

  const base = scopeClause(scope, filters);

  const [pos, invoices, website, previousPos, previousInvoices] = await Promise.all([
    findCapped(PosInvoice, { ...base, ...dateClause('date', range) },
      { customerId: 1, customerContact: 1, customerSnapshot: 1, totalAmount: 1, date: 1, createdAt: 1 },
      { date: 1 }, 'POS invoices'),
    findCapped(SalesInvoice, { ...base, createdAt: { $gte: range.startDate, $lt: range.endExclusive } },
      { customerId: 1, customerMobile: 1, netValue: 1, createdAt: 1 },
      { createdAt: 1 }, 'sales invoices'),
    loadWebsite(scope, filters, range),
    previousRange
      ? findCapped(PosInvoice, { ...base, ...dateClause('date', previousRange) },
        { customerId: 1, totalAmount: 1, date: 1, createdAt: 1 }, { date: 1 }, 'POS invoices')
      : Promise.resolve([]),
    previousRange
      ? findCapped(SalesInvoice, { ...base, createdAt: { $gte: previousRange.startDate, $lt: previousRange.endExclusive } },
        { customerId: 1, netValue: 1, createdAt: 1 }, { createdAt: 1 }, 'sales invoices')
      : Promise.resolve([]),
  ]);

  const keyOf = (doc) => (doc.customerId ? `id:${String(doc.customerId)}` : '');
  const buyers = new Map();
  const add = (key, amount) => {
    if (!key) return;
    if (!buyers.has(key)) buyers.set(key, { orders: 0, value: 0 });
    const row = buyers.get(key);
    row.orders += 1;
    row.value = round2(row.value + (Number(amount) || 0));
  };
  pos.forEach((d) => add(keyOf(d), posInvoiceAmount(d)));
  invoices.forEach((d) => add(keyOf(d), salesInvoiceAmount(d)));
  (website.eligible || []).forEach((order) => {
    if (!order.customer) return;
    const gross = Number(order.amounts?.grandTotal);
    const subtotal = Number(order.amounts?.subtotal);
    add(`web:${String(order.customer)}`, Number.isFinite(gross) ? gross : subtotal);
  });

  const previousBuyers = new Set();
  previousPos.forEach((d) => { const k = keyOf(d); if (k) previousBuyers.add(k); });
  previousInvoices.forEach((d) => { const k = keyOf(d); if (k) previousBuyers.add(k); });

  /* First observed POS bill per customer across the whole history. This is
     an aggregate rather than a document read: the series can hold every bill
     ever raised, and pulling them all into Node to find a minimum would be
     both slow and a needless exposure of customer records. */
  const firstRows = await PosInvoice.aggregate([
    { $match: base },
    { $match: { customerId: { $ne: null } } },
    {
      $group: {
        _id: '$customerId',
        first: { $min: { $ifNull: ['$date', '$createdAt'] } },
      },
    },
  ]);
  const firstSeen = new Map(firstRows
    .filter((row) => row._id && row.first)
    .map((row) => [`id:${String(row._id)}`, new Date(row.first)]));

  const newBuyers = [...buyers.keys()].filter((key) => {
    const first = firstSeen.get(key);
    return first && first >= range.startDate && first < range.endExclusive;
  });
  const returningBuyers = [...buyers.keys()].filter((key) => buyers.get(key).orders > 1
    && firstSeen.has(key) && firstSeen.get(key) < range.startDate);

  const totalValue = round2([...buyers.values()].reduce((sum, row) => sum + row.value, 0));
  const top = [...buyers.entries()]
    .sort((a, b) => b[1].value - a[1].value)
    .slice(0, 8);

  const ids = top.map(([key]) => key)
    .filter((key) => key.startsWith('id:'))
    .map((key) => key.slice(3))
    .filter((id) => mongoose.isValidObjectId(id));
  const customers = ids.length
    ? await Customer.find({ _id: { $in: ids.map(oid) } })
      .select('businessName firstName lastName prefix customerMobile').lean()
    : [];
  const byId = new Map(customers.map((c) => [String(c._id), c]));

  return {
    period,
    buyers: buyers.size,
    previousBuyers: previousBuyers.size,
    newBuyers: newBuyers.length,
    returningBuyers: returningBuyers.length,
    repeatRate: buyers.size ? round2((returningBuyers.length / buyers.size) * 100) : null,
    totalValue,
    averageSpend: buyers.size ? round2(totalValue / buyers.size) : null,
    topCustomers: top.map(([key, row]) => {
      const record = key.startsWith('id:') ? byId.get(key.slice(3)) : null;
      const name = record
        ? label([record.prefix, record.businessName || [record.firstName, record.lastName].filter(Boolean).join(' ')].filter(Boolean).join(' '), 'Customer')
        : (key.startsWith('web:') ? 'Website customer' : 'Walk-in customer');
      return { key, name, orders: row.orders, value: row.value, share: share(row.value, totalValue) };
    }),
    limitations: [
      'Buyers are identified by customer id or storefront account id. A walk-in bill with no customer attached cannot be counted as a distinct customer.',
      '"New" means the customer\'s first observed ERP POS bill falls inside the selected period; sales invoices without a customer id are not used for the first-seen date.',
    ],
  };
}

/* -------------------------------------------------------------- e-commerce -- */

export async function ecommerceReport(scope, filters, period) {
  const range = buildRange(period.start, period.end);
  const website = await loadWebsite(scope, filters, range);

  if (!website.available) {
    return {
      available: false,
      reason: website.reason,
      period,
      limitations: [website.reason],
    };
  }

  const statusOf = (order) => String(order.status || 'unknown').toLowerCase();
  const byStatus = new Map();
  website.orders.forEach((order) => {
    const status = statusOf(order);
    byStatus.set(status, (byStatus.get(status) || 0) + 1);
  });

  const valueOf = (order) => {
    const gross = Number(order?.amounts?.grandTotal);
    if (Number.isFinite(gross)) return gross;
    const subtotal = Number(order?.amounts?.subtotal);
    return Number.isFinite(subtotal) ? subtotal : 0;
  };

  const customers = new Set(website.eligible.map((order) => String(order.customer || order.customerPhone || ''))
    .filter(Boolean));

  const recent = [...website.eligible]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 10)
    .map((order) => ({
      orderNumber: order.orderNumber || '',
      date: order.createdAt,
      status: order.status,
      customer: label(order.customerName, 'Guest'),
      city: label(order?.shippingAddress?.city || order?.billingAddress?.city || order.branchCity, 'Not recorded'),
      value: round2(valueOf(order)),
    }));

  let registrations = null;
  if (scope.unrestricted && !filters.branchId) {
    registrations = await scope.db.collection('customers').countDocuments({
      createdAt: { $gte: range.startDate, $lt: range.endExclusive },
    });
  }

  return {
    available: true,
    period,
    orders: website.eligible.length,
    revenue: round2(website.revenue),
    aov: website.eligible.length ? round2(website.revenue / website.eligible.length) : null,
    customers: customers.size,
    cancelled: website.cancelled.length,
    cancelledValue: website.cancelledValue,
    pendingPayment: website.pendingPayment.length,
    duplicatesExcluded: website.duplicateCount,
    duplicateRevenue: website.duplicateRevenue,
    byStatus: [...byStatus.entries()]
      .map(([status, count]) => ({ status, count }))
      .sort((a, b) => b.count - a.count),
    topProducts: topWebsiteProducts(website, 8),
    recent,
    registrations,
    limitations: [
      'Only confirmed, processing, packed, shipped, out for delivery and delivered orders count as sales. Cancelled and pending-payment orders are reported separately.',
      'Storefront orders whose invoice number already exists in ERP are excluded from revenue to avoid counting the same sale twice.',
      'Registration counts come from the storefront customers collection and are only shown when the account may see every branch.' ,
      'The storefront does not record online returns, so online return value cannot be reported.',
    ],
  };
}

/* ------------------------------------------------------- website analytics -- */

/* Delegates to the existing website analytics service, which already reads
   visits, orders, customers, carts and the first-party tracker with the same
   session scoping. No second implementation of those rules lives here. */
export async function websiteReport(scope, filters, period) {
  const { buildWebsiteAnalytics } = await import('@/lib/website-analytics/service');

  const sp = new URLSearchParams({
    startDate: period.start,
    endDate: period.end,
    comparison: period.comparison ? 'previous_period' : 'none',
  });
  /* The analytics service takes a storefront branch id. A company filter is
     translated to that company's storefront branch; an account with no
     branch link simply gets no branch filter, which the service treats as
     "all branches this session may see". */
  const branchId = filters.branchId
    || scope.branchByBusiness.get(filters.companyId)?.branchId
    || '';
  if (branchId) sp.set('branch', branchId);

  try {
    const data = await buildWebsiteAnalytics(scope.session, sp);
    return { available: true, data, period, limitations: [] };
  } catch (err) {
    if (err?.status === 403) throw err;
    return {
      available: false,
      period,
      reason: err?.message || 'Website analytics could not be read.',
      limitations: [err?.message || 'Website analytics could not be read.'],
    };
  }
}

/* ------------------------------------------------------- product performance -- */

export async function productPerformance(scope, filters, period, {
  highStockOnly = false,
  limit = 10,
} = {}) {
  const sales = await salesAnalytics(scope, filters, period);
  const codes = sales.topProducts.map((row) => String(row.code || '')).filter(Boolean);

  const [stockSlice, fullInventory] = await Promise.all([
    codes.length ? inventoryReport(scope, filters, { limit, codes }) : Promise.resolve(null),
    highStockOnly ? inventoryReport(scope, filters, { limit: 50 }) : Promise.resolve(null),
  ]);

  const inventory = stockSlice || fullInventory || await inventoryReport(scope, filters, { limit });
  const stockByCode = new Map((inventory.rows || [])
    .map((row) => [String(row.code).toUpperCase(), row]));

  const rows = sales.topProducts.map((row) => {
    const stock = stockByCode.get(String(row.code || '').toUpperCase()) || null;
    return {
      code: row.code,
      name: row.name,
      revenue: round2(row.revenue),
      qty: round2(row.qty),
      stock: stock ? stock.stock : null,
      daysCover: stock ? stock.daysCover : null,
      category: stock ? stock.category : 'Uncategorised',
      velocity: stock ? stock.sold28 : null,
    };
  });

  let highStockLowSales = null;
  if (highStockOnly && fullInventory) {
    const sold = new Map(sales.topProducts.map((row) => [String(row.code || '').toUpperCase(), row.qty]));
    highStockLowSales = fullInventory.topByValue
      .filter((row) => row.stock > LOW_STOCK_UNITS * 4)
      .map((row) => ({
        ...row,
        soldInPeriod: sold.get(String(row.code).toUpperCase()) || 0,
      }))
      .filter((row) => row.soldInPeriod === 0)
      .sort((a, b) => b.value - a.value)
      .slice(0, limit);
  }

  return {
    period,
    rows,
    highStockLowSales,
    inventory: { ...inventory, rows: undefined },
    limitations: [
      'Product revenue is line value from sale documents, before returns; the KPI net revenue is after returns.',
      highStockLowSales
        ? 'High stock with low sales uses the highest-value in-stock products (at least 21 units) and shows those with no units sold in the selected period.'
        : null,
    ].filter(Boolean),
  };
}

/* --------------------------------------------------------------- helpers -- */

export function money(value) {
  return formatINR(value);
}

export function pct(value) {
  return value === null || value === undefined ? 'N/A' : formatPercent(value, { signed: true });
}

export { buildDailySeries, linesOf, lineQty, lineName, lineCode, lineAmount, purchaseDate };
