import mongoose from 'mongoose';
import PosInvoice from '@/models/PosInvoice';
import SalesInvoice from '@/models/SalesInvoice';
import PosReturn from '@/models/PosReturn';
import SalesReturn from '@/models/SalesReturn';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { channelValueOf, SALES_CHANNEL_INSTAGRAM } from '@/lib/salesChannel';
import {
  DashboardError, CHANNELS, loadDashboardOptions, parseFilters,
  businessQueryIds,
} from './access.js';
import {
  addDays, addMonthsToMonth, buildRange, comparisonRange, defaultPeriod,
  diffDays, endOfMonth, financialYearEnd, financialYearOf, financialYearStart,
  formatDate, formatDateRange, lastMonthKeys, monthKeyOf, monthLabel, startOfMonth,
  todayInIndia,
} from './date.js';
import {
  num, r2, formatNumber, formatINR, formatPercent, formatPointChange,
  formatUnits, deltaDirection,
} from './format.js';
import {
  UNCATEGORISED, UNASSIGNED_BRANCH, allocateAmount, averageOrderValue,
  comparableGrowth, pointChange, returnRatePercent, sharePercent, sumBy,
} from './calc.js';
import {
  WEBSITE_ELIGIBLE_STATUSES, loadOnlineProductMap, onlineLineQty, onlineLineValue,
} from './storefront.js';

/* ==========================================================================
   Sales analytics for the four boutiques.

   Every number below is read from a stored document. There is no sample
   series, no synthetic branch and no invented channel: a figure that cannot
   be sourced is returned as null/zero with a reason the screen can print.
   That is why several fields are deliberately nullable - "N/A because there
   is no prior month" is a different answer from "0% growth".

   Revenue is net recorded revenue:
     POS invoices + sales invoices - POS returns - sales returns
     + eligible storefront orders (less any order already invoiced in ERP)
   The same figure feeds the KPI cards, categories, products, regions,
   channels, insights, forecast and export. No panel recomputes it its own way.
   ========================================================================== */

const DOC_CAP = 25000;
const MAX_RANGE_DAYS = 366;
const TREND_MONTHS = 6;
const FORECAST_MIN_DAYS = 14;
const INVENTORY_LOOKBACK_DAYS = 28;
const INVENTORY_COVER_DAYS = 21;
const DEFAULT_DASHBOARD_LIVE_FROM = '2026-10-24T11:38:00+05:30';

export const CHANNEL_ROWS = [
  { key: 'website', label: 'E-commerce Website' },
  { key: 'instagram', label: 'Instagram' },
  { key: 'offline', label: 'Offline Store' },
];

const COMPARISON_KINDS = new Set(['previous_period', 'previous_month', 'previous_year', 'none']);

const r1 = (v) => Math.round(num(v) * 10) / 10;

function dashboardLiveFrom() {
  const configured = String(
    process.env.DASHBOARD_LIVE_FROM || DEFAULT_DASHBOARD_LIVE_FROM
  ).trim();
  const liveFrom = new Date(configured);
  if (!Number.isFinite(liveFrom.getTime())) {
    throw new DashboardError(
      503,
      'DASHBOARD_LIVE_FROM must be a valid date or timestamp.',
      { code: 'INVALID_DASHBOARD_LIVE_FROM' }
    );
  }
  return liveFrom;
}

function laterDate(left, right) {
  return new Date(Math.max(left.getTime(), right.getTime()));
}

function oid(value) {
  return value && mongoose.isValidObjectId(value) ? new mongoose.Types.ObjectId(value) : null;
}

function oidList(values) {
  return [...new Set((values || []).map(String).filter(Boolean))]
    .map(oid)
    .filter(Boolean);
}

function dateOf(value) {
  return value ? new Date(value) : null;
}

function istDay(value) {
  if (!value) return '';
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(value));
}

function dateClause(field, startDate, endExclusive, { allowFallback = true } = {}) {
  if (!allowFallback) return { [field]: { $gte: startDate, $lt: endExclusive } };
  return {
    $or: [
      { [field]: { $gte: startDate, $lt: endExclusive } },
      {
        $and: [
          { $or: [{ [field]: null }, { [field]: { $exists: false } }] },
          { createdAt: { $gte: startDate, $lt: endExclusive } },
        ],
      },
    ],
  };
}

function scopeClause(businessIds, locationIds) {
  const clause = { businessId: { $in: businessIds } };
  if (locationIds && locationIds.length) clause.locationId = { $in: locationIds };
  return clause;
}

async function countOrThrow(Model, filter, label) {
  const count = await Model.countDocuments(filter);
  if (count > DOC_CAP) {
    throw new DashboardError(
      413,
      `This selection contains ${formatNumber(count)} ${label}. Narrow the dates to ${DOC_CAP.toLocaleString('en-IN')} or fewer records and try again.`,
      { code: 'RANGE_TOO_LARGE' }
    );
  }
  return count;
}

async function findCapped(Model, filter, projection, sort, label) {
  await countOrThrow(Model, filter, label);
  return Model.find(filter).select(projection).sort(sort).lean();
}

/* ==========================================================================
   Request resolution
   ========================================================================== */

export async function resolveDashboardRequest(session, sp) {
  const access = await loadDashboardOptions(session);
  const filters = parseFilters(sp, access);
  const liveDataFrom = dashboardLiveFrom();

  const rawFy = String(sp.get('financialYear') || '').trim();
  const rawStart = String(sp.get('startDate') || '').trim();
  const rawEnd = String(sp.get('endDate') || '').trim();
  if ((rawStart && !rawEnd) || (!rawStart && rawEnd)) {
    throw new DashboardError(422, 'startDate and endDate must be supplied together.', {
      code: 'INVALID_FILTER', field: rawStart ? 'endDate' : 'startDate',
    });
  }

  const fallbackFy = financialYearOf(todayInIndia());
  const financialYear = rawFy || (rawEnd ? financialYearOf(rawEnd) : fallbackFy);
  let fyStart;
  let fyEnd;
  try {
    fyStart = financialYearStart(financialYear);
    fyEnd = financialYearEnd(financialYear);
  } catch (err) {
    throw new DashboardError(422, err.message, { code: 'INVALID_FILTER', field: 'financialYear' });
  }

  let range;
  try {
    if (rawStart && rawEnd) range = buildRange(rawStart, rawEnd);
    else {
      const period = defaultPeriod(financialYear);
      range = buildRange(period.start, period.end);
    }
  } catch (err) {
    throw new DashboardError(422, err.message, { code: 'INVALID_FILTER', field: err.field || 'date' });
  }
  if (range.days > MAX_RANGE_DAYS) {
    throw new DashboardError(422,
      `Select ${MAX_RANGE_DAYS} days or fewer (this range is ${range.days} days).`,
      { code: 'RANGE_TOO_LONG', field: 'endDate' });
  }
  if (range.start < fyStart || range.end > fyEnd) {
    throw new DashboardError(422,
      `The selected dates must fall inside financial year ${financialYear} (${formatDateRange(fyStart, fyEnd)}).`,
      { code: 'OUTSIDE_FINANCIAL_YEAR', field: 'financialYear' });
  }

  const comparisonKind = String(sp.get('comparison') || (filters.channel === 'all' ? 'previous_period' : 'previous_period')).trim();
  if (!COMPARISON_KINDS.has(comparisonKind)) {
    throw new DashboardError(422,
      'comparison must be previous_period, previous_month, previous_year or none.',
      { code: 'INVALID_FILTER', field: 'comparison' });
  }
  const comparison = comparisonRange(range.start, range.end, comparisonKind);

  const businessIds = oidList(businessQueryIds(access, filters));
  const locationIds = access.allowedLocationIds ? [...access.allowedLocationIds] : null;
  const branchUniverse = filters.selectedBranch
    ? [filters.selectedBranch]
    : (filters.selectedBusinessId
      ? access.authorizedBranches.filter((b) => b.businessId === filters.selectedBusinessId)
      : access.authorizedBranches);
  const branchIds = branchUniverse.map((b) => b.branchId);
  const branchById = new Map(branchUniverse.map((b) => [b.branchId, b]));
  const branchByBusiness = new Map(branchUniverse.map((b) => [b.businessId, b]));

  return {
    access, filters, financialYear, fyStart, fyEnd, range, comparison, liveDataFrom,
    comparisonKind, businessIds, locationIds, branchUniverse, branchIds,
    branchById, branchByBusiness,
  };
}

/* ==========================================================================
   Raw loaders. Each collection is counted before it is read, so a request
   either returns its complete population or a 413 - never a truncated figure
   that looks like a total.
   ========================================================================== */

async function loadPosDocs(ctx, range) {
  const filter = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    ...dateClause('date', laterDate(range.startDate, ctx.liveDataFrom), range.endExclusive),
    createdAt: { $gte: ctx.liveDataFrom },
  };
  return findCapped(PosInvoice, filter, {
    businessId: 1, locationId: 1, finYear: 1, date: 1, invoiceNo: 1,
    totalAmount: 1, customerId: 1, customerContact: 1, customerSnapshot: 1,
    salesChannel: 1, items: 1, createdAt: 1,
  }, { date: 1 }, 'POS invoices');
}

async function loadSalesDocs(ctx, range) {
  const filter = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    createdAt: {
      $gte: laterDate(range.startDate, ctx.liveDataFrom),
      $lt: range.endExclusive,
    },
  };
  return findCapped(SalesInvoice, filter, {
    businessId: 1, locationId: 1, finYear: 1, salesInvoiceNo: 1, netValue: 1,
    customerId: 1, customerMobile: 1, salesChannel: 1, items: 1, createdAt: 1,
  }, { createdAt: 1 }, 'sales invoices');
}

async function loadPosReturnDocs(ctx, range) {
  const filter = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    ...dateClause('date', laterDate(range.startDate, ctx.liveDataFrom), range.endExclusive),
    createdAt: { $gte: ctx.liveDataFrom },
  };
  return findCapped(PosReturn, filter, {
    businessId: 1, locationId: 1, finYear: 1, date: 1, invoiceNo: 1,
    parentInvoice: 1, totalAmount: 1, refundAmount: 1, customerId: 1,
    customerContact: 1, salesChannel: 1, items: 1, createdAt: 1,
  }, { date: 1 }, 'POS returns');
}

async function loadSalesReturnDocs(ctx, range) {
  const filter = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    ...dateClause('returnDate', laterDate(range.startDate, ctx.liveDataFrom), range.endExclusive),
    createdAt: { $gte: ctx.liveDataFrom },
  };
  return findCapped(SalesReturn, filter, {
    businessId: 1, locationId: 1, finYear: 1, returnDate: 1, salesReturnNo: 1,
    customerId: 1, salesChannel: 1, items: 1, createdAt: 1,
  }, { returnDate: 1 }, 'sales returns');
}

async function loadEligibleWebsiteOrders(ctx, range) {
  const db = ctx.access.db;
  const branchOids = oidList(ctx.branchIds);
  const statuses = [...new Set(WEBSITE_ELIGIBLE_STATUSES.flatMap((s) => [s, s.toUpperCase()]))];
  const filter = {
    createdAt: {
      $gte: laterDate(range.startDate, ctx.liveDataFrom),
      $lt: range.endExclusive,
    },
    status: { $in: statuses },
    branch: { $in: branchOids },
  };
  const count = await db.collection('orders').countDocuments(filter);
  if (count > DOC_CAP) {
    throw new DashboardError(413,
      `This selection contains ${formatNumber(count)} storefront orders. Narrow the dates to ${DOC_CAP.toLocaleString('en-IN')} or fewer records and try again.`,
      { code: 'RANGE_TOO_LARGE' });
  }
  return db.collection('orders').find(filter).project({
    orderNumber: 1, status: 1, invoiceNumber: 1, invoicedAt: 1, createdAt: 1,
    branch: 1, branchName: 1, branchCity: 1, customer: 1, customerName: 1,
    customerPhone: 1, customerEmail: 1, 'billingAddress.phone': 1,
    'shippingAddress.phone': 1, 'amounts.grandTotal': 1,
    'amounts.subtotal': 1, 'payment.method': 1, 'payment.status': 1, lines: 1,
  }).sort({ createdAt: 1 }).toArray();
}

function invoiceKey(value) {
  return String(value || '').trim().toUpperCase();
}

/* A storefront order is only excluded when its invoice number actually
   exists in ERP. Querying by the order's own invoice numbers (rather than by
   the selected date range) also catches an ERP invoice raised in an earlier
   month, which would otherwise be counted twice. */
async function loadErpInvoiceNumbers(ctx, orders) {
  const numbers = [...new Set((orders || []).map((o) => invoiceKey(o.invoiceNumber)).filter(Boolean))];
  if (!numbers.length) return new Set();

  const [pos, sales] = await Promise.all([
    PosInvoice.find({
      ...scopeClause(ctx.businessIds, ctx.locationIds),
      invoiceNo: { $in: numbers },
      createdAt: { $gte: ctx.liveDataFrom },
    }).select('invoiceNo').lean(),
    SalesInvoice.find({
      ...scopeClause(ctx.businessIds, ctx.locationIds),
      salesInvoiceNo: { $in: numbers },
      createdAt: { $gte: ctx.liveDataFrom },
    }).select('salesInvoiceNo').lean(),
  ]);
  return new Set([
    ...pos.map((d) => invoiceKey(d.invoiceNo)).filter(Boolean),
    ...sales.map((d) => invoiceKey(d.salesInvoiceNo)).filter(Boolean),
  ]);
}

/* ==========================================================================
   Category identity
   ========================================================================== */

function buildGroupResolver(groups) {
  const byId = new Map(groups.map((g) => [String(g._id), g]));
  const nameCache = new Map();
  const rootOf = (id) => {
    const key = String(id || '');
    if (!key) return '';
    if (nameCache.has(key)) return nameCache.get(key);
    const seen = new Set();
    let current = byId.get(key);
    let name = '';
    while (current && !seen.has(String(current._id))) {
      seen.add(String(current._id));
      name = String(current.name || '').trim() || name;
      current = current.parentId ? byId.get(String(current.parentId)) : null;
    }
    nameCache.set(key, name);
    return name;
  };
  return { byId, rootOf };
}

/* A POS line's itemId is the barcodeLabel row it was scanned from, not an
   item-master id. Resolve by id and by every barcode spelling the line may
   carry, then fall back to the item master by code / name. Nothing is guessed
   from the characters of an item code. */
async function loadProductIdentity(ctx, offline) {
  const db = ctx.access.db;
  const [groups, itemDocs] = await Promise.all([
    db.collection('productgroup').find({}).project({ name: 1, parentId: 1 }).toArray(),
    db.collection('item').find({}).project({
      name: 1, itemCode: 1, subGroupId: 1,
    }).toArray(),
  ]);
  const resolver = buildGroupResolver(groups);

  const lineIds = new Set();
  const lineCodes = new Set();
  const addLine = (line) => {
    if (!line) return;
    [line.itemId].forEach((v) => { if (v && /^[0-9a-f]{24}$/i.test(String(v))) lineIds.add(String(v)); });
    [line.barcodeNo, line.barcode, line.itemCode, line.code, line.oldBarcode]
      .forEach((v) => { if (v) lineCodes.add(String(v)); });
  };
  offline.pos.forEach((d) => (d.items || []).forEach(addLine));
  offline.posReturns.forEach((d) => (d.items || []).forEach(addLine));
  offline.sales.forEach((d) => (d.items || []).forEach((l) => {
    [l['Item Code'], l.itemCode, l.code].forEach((v) => { if (v) lineCodes.add(String(v)); });
  }));
  (offline.orders || []).forEach((order) => (order.lines || []).forEach(addLine));

  const ids = [...lineIds].map(oid).filter(Boolean);
  const codes = [...lineCodes];
  const labelQuery = [];
  if (ids.length) labelQuery.push({ _id: { $in: ids } });
  if (codes.length) {
    labelQuery.push({ barcodeNo: { $in: codes } });
    labelQuery.push({ oldBarcode: { $in: codes } });
    labelQuery.push({ itemCode: { $in: codes } });
  }
  const labels = labelQuery.length
    ? await db.collection('barcodeLabel').find({ $or: labelQuery }).project({
      barcodeNo: 1, oldBarcode: 1, itemCode: 1, itemName: 1, groupId: 1,
      uomType: 1, itemId: 1,
    }).toArray()
    : [];

  const byId = new Map();
  const byCode = new Map();
  labels.forEach((label) => {
    byId.set(String(label._id), label);
    [label.barcodeNo, label.oldBarcode, label.itemCode].forEach((code) => {
      const k = String(code || '');
      if (k && !byCode.has(k)) byCode.set(k, label);
    });
  });

  const itemById = new Map();
  const itemByCode = new Map();
  const itemByName = new Map();
  itemDocs.forEach((item) => {
    itemById.set(String(item._id), item);
    const code = String(item.itemCode || '').trim().toUpperCase();
    if (code) itemByCode.set(code, item);
    const name = String(item.name || '').trim().toUpperCase();
    if (name) itemByName.set(name, item);
  });

  const categoryFor = (groupId) => resolver.rootOf(groupId) || '';

  function resolveLine(line) {
    const lineBarcode = String(line?.barcodeNo || line?.barcode || '').trim();
    const itemCode = String(line?.itemCode || line?.code || lineBarcode || '').trim();
    const rawName = String(line?.itemName || line?.name || line?.description || '').trim();
    const label = (line?.itemId && byId.get(String(line.itemId)))
      || (lineBarcode && byCode.get(lineBarcode))
      || (itemCode && byCode.get(itemCode))
      || null;
    const itemDoc = (line?.itemId && itemById.get(String(line.itemId)))
      || (itemCode && itemByCode.get(itemCode.toUpperCase()))
      || (rawName && itemByName.get(rawName.toUpperCase()))
      || null;
    const category = categoryFor(label?.groupId) || categoryFor(itemDoc?.subGroupId);
    const barcode = String(label?.barcodeNo || lineBarcode || line?.code || '').trim();
    const code = String(barcode || label?.itemCode || itemCode || '').trim();
    const name = String(barcode || rawName || label?.itemName || itemDoc?.name || '').trim();
    const keySource = code || name || String(line?.itemId || '');
    return {
      key: keySource ? `p:${keySource.toUpperCase()}` : '',
      code: code || name,
      name: name || code,
      category: category || UNCATEGORISED,
      uom: String(line?.uomType || line?.uom || '').trim(),
      hasIdentity: Boolean(code || name || category),
    };
  }

  function resolveSalesLine(line) {
    const itemCode = String(line?.['Item Code'] || line?.itemCode || line?.code || '').trim();
    const name = String(line?.['Item Name'] || line?.itemName || line?.name || '').trim();
    const label = (itemCode && byCode.get(itemCode))
      || (line?.barcodeNo && byCode.get(String(line.barcodeNo)))
      || null;
    const barcode = String(label?.barcodeNo || line?.barcodeNo || line?.barcode || '').trim();
    const itemDoc = (itemCode && itemByCode.get(itemCode.toUpperCase()))
      || (name && itemByName.get(name.toUpperCase()))
      || null;
    const code = barcode || itemCode || name;
    return {
      key: (code || name) ? `p:${String(code || name).toUpperCase()}` : '',
      code: code || name,
      name: barcode || name || code,
      category: categoryFor(itemDoc?.subGroupId) || UNCATEGORISED,
      uom: String(line?.uom || line?.uomType || '').trim(),
      hasIdentity: Boolean(code || name),
    };
  }

  return { resolver, labels, byId, byCode, itemById, itemByCode, itemByName, resolveLine, resolveSalesLine, categoryFor };
}

/* Online lines use the storefront product record, which carries the ERP group
   id/snapshot where one exists. The ERP group tree is authoritative; a
   storefront-only category label is a fallback, and nothing is inferred from
   an item-code segment. */
function onlineIdentity(line, productMap, identity) {
  const itemCode = String(line?.itemCode || line?.sku || '').trim();
  const lineBarcode = String(line?.barcodeNo || line?.barcode || '').trim();
  const product = (lineBarcode && productMap.get(`barcode:${lineBarcode.toUpperCase()}`))
    || (itemCode && productMap.get(`code:${itemCode.toUpperCase()}`))
    || productMap.get(String(line?.item || ''));
  const erpCategory = product?.erpGroupId ? identity.categoryFor(product.erpGroupId) : '';
  const category = erpCategory || String(product?.storeGroupName || '').trim() || UNCATEGORISED;
  const catalogCode = String(product?.itemCode || itemCode).trim();
  const barcodeLabel = catalogCode ? identity.byCode.get(catalogCode) : null;
  const barcode = String(lineBarcode || product?.barcode || barcodeLabel?.barcodeNo || '').trim();
  const code = barcode || catalogCode;
  const name = barcode || String(product?.name || line?.productName || line?.name || '').trim();
  return {
    key: (code || name) ? `p:${String(code || name).toUpperCase()}` : `o:${String(line?._id || line?.item || '')}`,
    code: code || name,
    name: barcode,
    source: 'website',
    category,
    uom: String(line?.uom || '').trim(),
    hasIdentity: Boolean(code || name || category !== UNCATEGORISED),
  };
}

/* ==========================================================================
   Historical first-purchase lookup

   A "new customer" is an identified buyer whose earliest observed sale in
   the selected sources falls inside the period. Contacts were bulk-created,
   so a contact's createdAt is not evidence of a first purchase; invoices are.
   Phone numbers link the storefront to the ERP where both carry one. A
   walk-in with no customer id or usable phone cannot be counted and is
   reported separately instead of being guessed.
   ========================================================================== */

async function loadFirstSaleMaps(ctx, endExclusive) {
  const channel = ctx.filters.channel;
  /* "First sale" must mean first sale in the SCOPED channel: a buyer whose
     first Instagram order is in this month but who shopped in the store last
     year is not a new customer for the Instagram scope. */
  const channelClause = channel === 'instagram'
    ? { salesChannel: SALES_CHANNEL_INSTAGRAM }
    : channel === 'offline'
      ? { salesChannel: { $ne: SALES_CHANNEL_INSTAGRAM } }
      : {};
  const erpMatch = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    ...channelClause,
    ...dateClause('date', ctx.liveDataFrom, endExclusive),
    createdAt: { $gte: ctx.liveDataFrom },
  };
  const salesMatch = {
    ...scopeClause(ctx.businessIds, ctx.locationIds),
    ...channelClause,
    createdAt: { $gte: ctx.liveDataFrom, $lt: endExclusive },
  };
  const branchOids = oidList(ctx.branchIds);
  const websiteMatch = {
    createdAt: { $gte: ctx.liveDataFrom, $lt: endExclusive },
    status: { $in: [...new Set(WEBSITE_ELIGIBLE_STATUSES.flatMap((s) => [s, s.toUpperCase()]))] },
    branch: { $in: branchOids },
  };

  const erpKey = {
    $let: {
      vars: {
        phone: {
          $trim: {
            input: {
              $replaceAll: {
                input: { $replaceAll: { input: { $ifNull: ['$customerContact', ''] }, find: ' ', replacement: '' } },
                find: '-', replacement: '',
              },
            },
          },
        },
      },
      in: {
        $cond: [
          { $gte: [{ $strLenCP: '$$phone' }, 7] },
          { $concat: ['p:', '$$phone'] },
          {
            $cond: [
              { $ne: [{ $ifNull: ['$customerId', null] }, null] },
              { $concat: ['c:', { $toString: '$customerId' }] },
              null,
            ],
          },
        ],
      },
    },
  };

  const [posFirst, salesFirst, websiteFirst] = await Promise.all([
    PosInvoice.aggregate([
      { $match: erpMatch },
      { $project: { key: erpKey, at: { $ifNull: ['$date', '$createdAt'] } } },
      { $match: { key: { $ne: null }, at: { $ne: null } } },
      { $group: { _id: '$key', first: { $min: '$at' } } },
    ]).allowDiskUse(true),
    SalesInvoice.aggregate([
      { $match: salesMatch },
      {
        $project: {
          key: {
            $let: {
              vars: {
                phone: {
                  $trim: {
                    input: {
                      $replaceAll: {
                        input: { $ifNull: ['$customerMobile', ''] },
                        find: ' ', replacement: '',
                      },
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $gte: [{ $strLenCP: '$$phone' }, 7] },
                  { $concat: ['p:', '$$phone'] },
                  {
                    $cond: [
                      { $ne: [{ $ifNull: ['$customerId', null] }, null] },
                      { $concat: ['c:', { $toString: '$customerId' }] },
                      null,
                    ],
                  },
                ],
              },
            },
          },
          at: '$createdAt',
        },
      },
      { $match: { key: { $ne: null } } },
      { $group: { _id: '$key', first: { $min: '$at' } } },
    ]).allowDiskUse(true),
    (channel === 'all' || channel === 'website') ? ctx.access.db.collection('orders').aggregate([
      { $match: websiteMatch },
      {
        $project: {
          key: {
            $let: {
              vars: {
                phone: {
                  $trim: {
                    input: {
                      $replaceAll: {
                        input: {
                          $replaceAll: {
                            input: {
                              $let: {
                                vars: { direct: { $ifNull: ['$customerPhone', ''] } },
                                in: {
                                  $cond: [
                                    { $gt: [{ $strLenCP: '$$direct' }, 0] },
                                    '$$direct',
                                    { $ifNull: ['$billingAddress.phone', '$shippingAddress.phone'] },
                                  ],
                                },
                              },
                            },
                            find: ' ', replacement: '',
                          },
                        },
                        find: '-', replacement: '',
                      },
                    },
                  },
                },
              },
              in: {
                $cond: [
                  { $gte: [{ $strLenCP: '$$phone' }, 7] },
                  { $concat: ['p:', '$$phone'] },
                  {
                    $cond: [
                      { $ne: [{ $ifNull: ['$customer', null] }, null] },
                      { $concat: ['w:', { $toString: '$customer' }] },
                      null,
                    ],
                  },
                ],
              },
            },
          },
          at: '$createdAt',
        },
      },
      { $match: { key: { $ne: null } } },
      { $group: { _id: '$key', first: { $min: '$at' } } },
    ], { allowDiskUse: true }).toArray() : Promise.resolve([]),
  ]);

  const erp = new Map();
  [...posFirst, ...salesFirst].forEach((row) => {
    const at = row.first ? new Date(row.first) : null;
    if (!at) return;
    const previous = erp.get(row._id);
    if (!previous || at < previous) erp.set(row._id, at);
  });
  const website = new Map(websiteFirst.map((row) => [row._id, new Date(row.first)]));
  return { erp, website };
}

function mergeFirstMaps(a, b) {
  const out = new Map(a);
  b.forEach((date, key) => {
    const previous = out.get(key);
    if (!previous || date < previous) out.set(key, date);
  });
  return out;
}

function countFirstInRange(firstMap, range) {
  let count = 0;
  firstMap.forEach((at) => {
    const day = istDay(at);
    if (day >= range.start && day <= range.end) count += 1;
  });
  return count;
}

function activeFirstMap(ctx, maps) {
  const channel = ctx.filters.channel;
  /* maps.erp is already narrowed to the selected channel, so Instagram now
     reads the Instagram first-sale map rather than an empty one. */
  if (channel === 'instagram') return maps.erp;
  if (channel === 'offline') return maps.erp;
  if (channel === 'website') return maps.website;
  return mergeFirstMaps(maps.erp, maps.website);
}

/* ==========================================================================
   Trend
   ========================================================================== */

function sumConvert(expr) {
  return { $sum: { $convert: { input: expr, to: 'double', onError: 0, onNull: 0 } } };
}

function monthProject(dateExpr) {
  return {
    $dateToString: {
      format: '%Y-%m', date: dateExpr, timezone: 'Asia/Kolkata', onNull: null,
    },
  };
}

async function loadMonthlyTrend(ctx, endDate) {
  const channel = ctx.filters.channel;

  const keys = lastMonthKeys(endDate, TREND_MONTHS);
  const start = `${startOfMonth(keys[0])}T00:00:00+05:30`;
  const endExclusive = new Date(`${addDays(endDate, 1)}T00:00:00+05:30`);
  const startDate = new Date(start);
  const liveStartDate = laterDate(startDate, ctx.liveDataFrom);
  /* The trend follows the same channel scope as the KPI cards: an Instagram
     bill is in the Instagram line and never in the offline one. */
  const erpChannelClause = channel === 'instagram'
    ? { salesChannel: SALES_CHANNEL_INSTAGRAM }
    : channel === 'offline'
      ? { salesChannel: { $ne: SALES_CHANNEL_INSTAGRAM } }
      : {};
  const erpScope = { ...scopeClause(ctx.businessIds, ctx.locationIds), ...erpChannelClause };

  const byMonth = new Map(keys.map((key) => [key, { revenue: 0, orders: 0 }]));
  const apply = (rows, sign) => rows.forEach((row) => {
    if (!row._id || !byMonth.has(row._id)) return;
    const target = byMonth.get(row._id);
    target.revenue = r2(target.revenue + sign * num(row.revenue));
    if (sign > 0 && row.orders) target.orders += row.orders;
  });

  const erpTask = channel !== 'website'
    ? Promise.all([
      PosInvoice.aggregate([
        {
          $match: {
            ...erpScope,
            ...dateClause('date', liveStartDate, endExclusive),
            createdAt: { $gte: ctx.liveDataFrom },
          },
        },
        {
          $project: {
            month: monthProject({ $ifNull: ['$date', '$createdAt'] }),
            revenue: { $convert: { input: '$totalAmount', to: 'double', onError: 0, onNull: 0 } },
          },
        },
        { $group: { _id: '$month', revenue: sumConvert('$revenue'), orders: { $sum: 1 } } },
      ]).allowDiskUse(true),
      SalesInvoice.aggregate([
        { $match: { ...erpScope, createdAt: { $gte: liveStartDate, $lt: endExclusive } } },
        {
          $project: {
            month: monthProject('$createdAt'),
            revenue: { $convert: { input: '$netValue', to: 'double', onError: 0, onNull: 0 } },
          },
        },
        { $group: { _id: '$month', revenue: sumConvert('$revenue'), orders: { $sum: 1 } } },
      ]).allowDiskUse(true),
      PosReturn.aggregate([
        {
          $match: {
            ...erpScope,
            ...dateClause('date', liveStartDate, endExclusive),
            createdAt: { $gte: ctx.liveDataFrom },
          },
        },
        {
          $project: {
            month: monthProject({ $ifNull: ['$date', '$createdAt'] }),
            revenue: { $convert: { input: { $ifNull: ['$totalAmount', '$refundAmount'] }, to: 'double', onError: 0, onNull: 0 } },
          },
        },
        { $group: { _id: '$month', revenue: sumConvert('$revenue') } },
      ]).allowDiskUse(true),
      SalesReturn.aggregate([
        {
          $match: {
            ...erpScope,
            ...dateClause('returnDate', liveStartDate, endExclusive),
            createdAt: { $gte: ctx.liveDataFrom },
          },
        },
        { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
        {
          $project: {
            month: monthProject({ $ifNull: ['$returnDate', '$createdAt'] }),
            revenue: { $convert: { input: '$items.netAmount', to: 'double', onError: 0, onNull: 0 } },
          },
        },
        { $group: { _id: '$month', revenue: sumConvert('$revenue') } },
      ]).allowDiskUse(true),
    ])
    : Promise.resolve([]);

  const websiteTask = (channel === 'all' || channel === 'website')
    ? loadEligibleWebsiteOrders(ctx, { startDate, endExclusive })
    : Promise.resolve([]);

  const [groups, trendOrders] = await Promise.all([erpTask, websiteTask]);

  if (groups.length) {
    apply(groups[0], 1);
    apply(groups[1], 1);
    apply(groups[2], -1);
    apply(groups[3], -1);
  }

  if (trendOrders.length) {
    const duplicates = await loadErpInvoiceNumbers(ctx, trendOrders);
    trendOrders.forEach((order) => {
      const invoice = invoiceKey(order.invoiceNumber);
      if (invoice && duplicates.has(invoice)) return;
      const day = istDay(order.createdAt);
      const key = day ? day.slice(0, 7) : '';
      const target = byMonth.get(key);
      if (!target) return;
      const gross = Number(order.amounts?.grandTotal);
      const subtotal = Number(order.amounts?.subtotal);
      const revenue = Number.isFinite(gross) ? gross : (Number.isFinite(subtotal) ? subtotal : 0);
      target.revenue = r2(target.revenue + revenue);
      target.orders += 1;
    });
  }

  return keys.map((key) => {
    const row = byMonth.get(key);
    return {
      key,
      label: monthLabel(key),
      revenue: r2(row.revenue),
      orders: row.orders,
      partial: key === monthKeyOf(endDate) && endDate !== endOfMonth(key),
    };
  });
}

/* ==========================================================================
   Inventory cover

   There is no reorder threshold in the ERP. The alert below is therefore a
   derived observation, not a system setting: units currently IN_STOCK at the
   selected branches against the previous 28 days of offline unit velocity,
   expressed as days of cover at a 21-day review horizon. Pieces and metres
   are kept apart by uomType; they are never added together.
   ========================================================================== */

async function loadInventory(ctx) {
  const channel = ctx.filters.channel;
  if (channel === 'website' || channel === 'instagram') {
    return {
      available: false,
      reason: 'Inventory cover uses offline POS sales only. Choose All channels or Offline Store to see it.',
      alerts: [], stockByUom: [], itemCount: 0,
      lookbackDays: INVENTORY_LOOKBACK_DAYS, coverDays: INVENTORY_COVER_DAYS,
    };
  }

  const db = ctx.access.db;
  const businessOids = ctx.businessIds;
  const stockMatch = {
    status: BARCODE_STATUS.IN_STOCK,
    qtyNum: { $gt: 0 },
    currentBusinessId: { $in: businessOids },
  };
  if (ctx.locationIds && ctx.locationIds.length) {
    stockMatch.currentLocationId = { $in: oidList(ctx.locationIds) };
  }

  const endExclusive = ctx.range.endExclusive;
  const velocityStart = new Date(`${addDays(ctx.range.end, -(INVENTORY_LOOKBACK_DAYS - 1))}T00:00:00+05:30`);
  const liveVelocityStart = laterDate(velocityStart, ctx.liveDataFrom);
  const velocityDays = Math.min(
    INVENTORY_LOOKBACK_DAYS,
    Math.max(1, Math.ceil((endExclusive.getTime() - liveVelocityStart.getTime()) / 86400000))
  );
  const erpScope = scopeClause(ctx.businessIds, ctx.locationIds);
  const codeExpr = {
    $let: {
      vars: {
        code: { $ifNull: ['$items.itemCode', ''] },
        barcode: { $ifNull: ['$items.barcodeNo', ''] },
      },
      in: {
        $cond: [
          { $ne: ['$$code', ''] }, '$$code',
          { $cond: [{ $ne: ['$$barcode', ''] }, '$$barcode', ''] },
        ],
      },
    },
  };

  const [stockRows, soldRows, returnRows] = await Promise.all([
    db.collection('barcodeLabel').aggregate([
      { $match: stockMatch },
      {
        $project: {
          code: {
            $let: {
              vars: {
                itemCode: { $ifNull: ['$itemCode', ''] },
                barcodeNo: { $ifNull: ['$barcodeNo', ''] },
              },
              in: { $cond: [{ $ne: ['$$itemCode', ''] }, '$$itemCode', '$$barcodeNo'] },
            },
          },
          uom: { $ifNull: ['$uomType', ''] },
          name: { $ifNull: ['$itemName', ''] },
          qty: { $convert: { input: '$qtyNum', to: 'double', onError: 0, onNull: 0 } },
        },
      },
      { $match: { code: { $nin: ['', null] } } },
      {
        $group: {
          _id: { code: '$code', uom: '$uom' },
          stock: { $sum: '$qty' },
          name: { $first: '$name' },
        },
      },
    ], { allowDiskUse: true }).toArray(),
    PosInvoice.aggregate([
      {
        $match: {
          ...erpScope,
          ...dateClause('date', liveVelocityStart, endExclusive),
          createdAt: { $gte: ctx.liveDataFrom },
        },
      },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      { $project: { code: codeExpr, uom: { $ifNull: ['$items.uomType', ''] }, qty: { $convert: { input: '$items.qty', to: 'double', onError: 0, onNull: 0 } }, isReturn: { $eq: ['$items.isReturn', true] } } },
      { $match: { code: { $nin: ['', null] } } },
      {
        $group: {
          _id: { code: '$code', uom: '$uom' },
          qty: { $sum: { $cond: ['$isReturn', { $multiply: ['$qty', -1] }, '$qty'] } },
        },
      },
    ]).allowDiskUse(true),
    PosReturn.aggregate([
      {
        $match: {
          ...erpScope,
          ...dateClause('date', liveVelocityStart, endExclusive),
          createdAt: { $gte: ctx.liveDataFrom },
        },
      },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      { $project: { code: codeExpr, uom: { $ifNull: ['$items.uomType', ''] }, qty: { $convert: { input: '$items.qty', to: 'double', onError: 0, onNull: 0 } } } },
      { $match: { code: { $nin: ['', null] } } },
      { $group: { _id: { code: '$code', uom: '$uom' }, qty: { $sum: '$qty' } } },
    ]).allowDiskUse(true),
  ]);

  const sold = new Map();
  const addSold = (row, sign) => {
    const key = `${row._id.code}|${row._id.uom || ''}`;
    sold.set(key, num(sold.get(key)) + sign * num(row.qty));
  };
  soldRows.forEach((row) => addSold(row, 1));
  returnRows.forEach((row) => addSold(row, -1));

  const alerts = [];
  const stockByUom = new Map();
  const soldByUom = new Map();
  const bumpUom = (map, uom, value) => {
    const key = String(uom || 'Not recorded');
    map.set(key, r2(num(map.get(key)) + num(value)));
  };

  stockRows.forEach((row) => {
    const key = `${row._id.code}|${row._id.uom || ''}`;
    const stock = num(row.stock);
    const velocity = num(sold.get(key));
    bumpUom(stockByUom, row._id.uom, stock);
    bumpUom(soldByUom, row._id.uom, velocity);
    if (stock <= 0 || velocity <= 0) return;
    const daily = velocity / velocityDays;
    if (daily <= 0) return;
    const daysCover = stock / daily;
    if (daysCover >= INVENTORY_COVER_DAYS) return;
    alerts.push({
      code: row._id.code,
      name: row.name || row._id.code,
      uom: row._id.uom || '',
      stock: r2(stock),
      sold28: r2(velocity),
      dailyVelocity: r2(daily),
      daysCover: r1(daysCover),
      severity: daysCover < 7 ? 'critical' : 'watch',
      basis: `${formatUnits(r2(stock))} ${row._id.uom || 'units'} in stock; ${formatUnits(r2(velocity))} sold in the last ${INVENTORY_LOOKBACK_DAYS} days.`,
    });
  });

  const uomRows = [...stockByUom.entries()]
    .map(([uom, stock]) => ({
      uom,
      stock: r2(stock),
      sold28: r2(soldByUom.get(uom)),
    }))
    .sort((a, b) => b.stock - a.stock);

  alerts.sort((a, b) => a.daysCover - b.daysCover);
  return {
    available: true,
    reason: '',
    alerts: alerts.slice(0, 8),
    alertCount: alerts.length,
    stockByUom: uomRows,
    itemCount: stockRows.length,
    lookbackDays: INVENTORY_LOOKBACK_DAYS,
    coverDays: INVENTORY_COVER_DAYS,
    assumption: `Derived risk, not a reorder threshold: stock on hand ÷ (units sold in the last ${INVENTORY_LOOKBACK_DAYS} days ÷ ${INVENTORY_LOOKBACK_DAYS}) is below ${INVENTORY_COVER_DAYS} days.`,
  };
}


/* ==========================================================================
   Branch and channel performance
   ========================================================================== */

function emptyBranchRow(branch) {
  return {
    branchId: branch.branchId,
    branchName: branch.branchName,
    city: branch.city,
    isMainBranch: Boolean(branch.isMainBranch),
    revenue: 0,
    orders: 0,
    previousRevenue: 0,
    previousOrders: 0,
  };
}

function buildBranchPerformance(ctx, current, prior) {
  const channel = ctx.filters.channel;
  const rows = ctx.branchUniverse.map(emptyBranchRow);
  const byId = new Map(rows.map((row) => [row.branchId, row]));
  let unassigned = null;

  const ensureUnassigned = () => {
    if (!unassigned) {
      unassigned = {
        branchId: UNASSIGNED_BRANCH,
        branchName: 'Unassigned / no branch mapping',
        city: '', isMainBranch: false, revenue: 0, orders: 0,
        previousRevenue: 0, previousOrders: 0,
      };
    }
    return unassigned;
  };

  const inErpScope = {
    offline: channel === 'all' || channel === 'offline',
    instagram: channel === 'all' || channel === 'instagram',
  };
  const addErpDoc = (doc, previous) => {
    const branch = ctx.branchByBusiness.get(doc.businessId);
    const row = branch ? byId.get(branch.branchId) : ensureUnassigned();
    if (!row) return;
    if (previous) {
      row.previousRevenue = r2(row.previousRevenue + num(doc.revenue));
      if (!doc.isReturnDocument) row.previousOrders += 1;
    } else {
      row.revenue = r2(row.revenue + num(doc.revenue));
      if (!doc.isReturnDocument) row.orders += 1;
    }
  };

  const apply = (period, { previous = false } = {}) => {
    /* Instagram bills are ERP documents, so they are attributed to the same
       branch mapping as an offline bill rather than left out of the table. */
    if (inErpScope.offline) (period.offlineDocs || []).forEach((doc) => addErpDoc(doc, previous));
    if (inErpScope.instagram) (period.instagramDocs || []).forEach((doc) => addErpDoc(doc, previous));
    if (channel === 'all' || channel === 'website') {
      (period.orders || []).forEach((order) => {
        const branch = ctx.branchById.get(String(order.branch || ''));
        const row = branch ? byId.get(branch.branchId) : ensureUnassigned();
        if (!row) return;
        const value = Number(order.amounts?.grandTotal);
        const revenue = Number.isFinite(value) ? value : num(order.amounts?.subtotal);
        if (previous) {
          row.previousRevenue = r2(row.previousRevenue + revenue);
          row.previousOrders += 1;
        } else {
          row.revenue = r2(row.revenue + revenue);
          row.orders += 1;
        }
      });
    }
  };

  apply(current);
  apply(prior, { previous: true });

  const output = rows.slice();
  if (unassigned && (unassigned.revenue !== 0 || unassigned.orders !== 0
    || unassigned.previousRevenue !== 0 || unassigned.previousOrders !== 0)) {
    output.push(unassigned);
  }

  const totalRevenue = r2(sumBy(output, (r) => r.revenue));
  const totalOrders = output.reduce((sum, r) => sum + r.orders, 0);
  output.forEach((row) => {
    row.share = sharePercent(row.revenue, totalRevenue);
    row.growth = comparableGrowth(row.revenue, row.previousRevenue);
    row.aov = averageOrderValue(row.revenue, row.orders);
  });

  return {
    rows: output,
    totalRevenue,
    totalOrders,
    previousRevenue: r2(sumBy(output, (r) => r.previousRevenue)),
    previousOrders: output.reduce((sum, r) => sum + r.previousOrders, 0),
  };
}

function buildChannelPerformance(ctx, current, prior) {
  const total = r2(current.offlineRevenue + current.instagramRevenue + current.websiteRevenue);
  const previousTotal = r2(prior.offlineRevenue + prior.instagramRevenue + prior.websiteRevenue);
  const scope = ctx.filters.channel;

  const website = {
    key: 'website',
    label: 'E-commerce Website',
    revenue: current.websiteRevenue,
    orders: current.websiteOrders,
    previousRevenue: prior.websiteRevenue,
    previousOrders: prior.websiteOrders,
    share: sharePercent(current.websiteRevenue, total),
    growth: comparableGrowth(current.websiteRevenue, prior.websiteRevenue),
    inScope: scope === 'all' || scope === 'website',
    available: true,
    note: 'Eligible storefront orders (confirmed through delivered), less orders already invoiced in ERP.',
  };
  const instagram = {
    key: 'instagram',
    label: 'Instagram',
    /* Read from the Sales Channel saved on each bill at billing; a credit
       inherits its invoice's channel. Nothing is inferred from a customer
       name or a note, so a zero here means no bill was tagged. */
    revenue: current.instagramRevenue,
    orders: current.instagramOrders,
    previousRevenue: prior.instagramRevenue,
    previousOrders: prior.instagramOrders,
    share: sharePercent(current.instagramRevenue, total),
    growth: comparableGrowth(current.instagramRevenue, prior.instagramRevenue),
    inScope: scope === 'all' || scope === 'instagram',
    available: true,
    note: 'POS and sales invoices tagged Instagram at billing, net of tagged returns.',
  };
  const offline = {
    key: 'offline',
    label: 'Offline Store',
    revenue: current.offlineRevenue,
    orders: current.offlineOrders,
    previousRevenue: prior.offlineRevenue,
    previousOrders: prior.offlineOrders,
    share: sharePercent(current.offlineRevenue, total),
    growth: comparableGrowth(current.offlineRevenue, prior.offlineRevenue),
    inScope: scope === 'all' || scope === 'offline',
    available: true,
    note: 'POS invoices + sales invoices, net of POS and sales returns.',
  };

  const totalOrders = current.offlineOrders + current.instagramOrders + current.websiteOrders;
  /* Every gross figure in this block is offline-only: Instagram bills have
     their own gross and return totals so the two channels never tell the
     same rupee twice. */
  const offlineGross = r2(current.posGross + current.salesGross);
  const offlineReturns = r2((current.offlinePosReturnTotal || 0) + (current.offlineSalesReturnTotal || 0));

  return {
    rows: [website, instagram, offline],
    totalRevenue: total,
    totalOrders,
    previousRevenue: previousTotal,
    previousOrders: prior.offlineOrders + prior.instagramOrders + prior.websiteOrders,
    growth: comparableGrowth(total, previousTotal),
    selectedChannel: scope,
    reconciliation: {
      offline: {
        sales: offlineGross,
        posGross: current.posGross,
        salesGross: current.salesGross,
        returns: offlineReturns,
        posReturns: current.offlinePosReturnTotal || 0,
        salesReturns: current.offlineSalesReturnTotal || 0,
        net: current.offlineRevenue,
        orders: current.offlineOrders,
        returnDocuments: current.offlineReturnDocuments || 0,
      },
      website: {
        eligible: r2(current.websiteRevenue + current.websiteDedupeRevenue),
        duplicatesExcluded: current.websiteDedupeRevenue,
        duplicateCount: current.websiteDuplicateCount,
        net: current.websiteRevenue,
        orders: current.websiteOrders,
      },
      instagram: {
        gross: current.instagramGross,
        returns: current.instagramReturnTotal,
        net: current.instagramRevenue,
        orders: current.instagramOrders,
        returnDocuments: current.instagramReturnDocuments,
        sourceAvailable: true,
        source: 'Sales Channel recorded on the invoice at billing.',
      },
      total,
      totalOrders,
      check: r2((current.offlineRevenue + current.instagramRevenue + current.websiteRevenue) - total),
      onlineReturns: 'Not tracked in the storefront; website return rate is N/A.',
    },
  };
}

/* ==========================================================================
   KPI cards
   ========================================================================== */

function activeTotals(ctx, period) {
  const channel = ctx.filters.channel;
  if (channel === 'instagram') {
    return {
      revenue: period.instagramRevenue, orders: period.instagramOrders,
      offlineOrders: 0, instagramOrders: period.instagramOrders, websiteOrders: 0,
      returnDocuments: period.instagramReturnDocuments,
      returnBaseOrders: period.instagramOrders,
    };
  }
  if (channel === 'offline') {
    return {
      revenue: period.offlineRevenue, orders: period.offlineOrders,
      offlineOrders: period.offlineOrders, instagramOrders: 0, websiteOrders: 0,
      returnDocuments: period.offlineReturnDocuments || 0,
      returnBaseOrders: period.offlineOrders,
    };
  }
  if (channel === 'website') {
    return {
      revenue: period.websiteRevenue, orders: period.websiteOrders,
      offlineOrders: 0, instagramOrders: 0, websiteOrders: period.websiteOrders,
      returnDocuments: 0, returnBaseOrders: 0,
    };
  }
  return {
    revenue: period.totalRevenue,
    orders: period.offlineOrders + period.instagramOrders + period.websiteOrders,
    offlineOrders: period.offlineOrders,
    instagramOrders: period.instagramOrders,
    websiteOrders: period.websiteOrders,
    /* Channel scope "All" keeps the return rate comparable with the offline
       scope it is labelled for: Instagram returns are excluded. */
    returnDocuments: period.offlineReturnDocuments || 0,
    returnBaseOrders: period.offlineOrders,
  };
}

function buildKpis(ctx, current, prior, firstMaps) {
  const now = activeTotals(ctx, current);
  const before = activeTotals(ctx, prior);
  const channel = ctx.filters.channel;
  const first = activeFirstMap(ctx, firstMaps);
  const newCustomers = countFirstInRange(first, ctx.range);
  const previousNewCustomers = ctx.comparison
    ? countFirstInRange(first, ctx.comparison)
    : null;
  const aov = averageOrderValue(now.revenue, now.orders) ?? 0;
  const previousAov = averageOrderValue(before.revenue, before.orders) ?? 0;
  const rateScoped = channel === 'all' || channel === 'offline' || channel === 'instagram';
  const returnRate = rateScoped
    ? (returnRatePercent(now.returnDocuments, now.returnBaseOrders) ?? 0)
    : null;
  const previousReturnRate = rateScoped && ctx.comparison
    ? (returnRatePercent(before.returnDocuments, before.returnBaseOrders) ?? 0)
    : null;

  const cards = [
    {
      key: 'revenue', label: 'Total Sales Revenue', value: now.revenue,
      previousValue: before.revenue, format: 'currency',
      change: comparableGrowth(now.revenue, before.revenue), changeType: 'percent',
      note: 'Net recorded revenue across the selected channels.',
    },
    {
      key: 'orders', label: 'Total Orders', value: now.orders,
      previousValue: before.orders, format: 'count',
      change: comparableGrowth(now.orders, before.orders), changeType: 'percent',
      note: 'Invoices and eligible storefront orders; return documents are not orders.',
    },
    {
      key: 'aov', label: 'Average Order Value', value: aov,
      previousValue: previousAov, format: 'currency',
      change: comparableGrowth(aov, previousAov), changeType: 'percent',
      note: 'Net revenue ÷ orders. Shows 0 when there are no orders.',
    },
    {
      key: 'newCustomers', label: 'New Customers', value: newCustomers,
      previousValue: previousNewCustomers, format: 'count',
      change: comparableGrowth(newCustomers, previousNewCustomers), changeType: 'percent',
      note: 'Identified buyers whose first observed sale falls in this period.',
    },
    {
      key: 'returnRate', label: 'Return Rate', value: returnRate,
      previousValue: previousReturnRate, format: 'percent',
      change: pointChange(returnRate, previousReturnRate), changeType: 'points',
      note: channel === 'instagram'
        ? 'Instagram return documents ÷ Instagram orders. Storefront returns are not tracked.'
        : (channel === 'all' || channel === 'offline')
          ? 'Offline return documents ÷ offline sales orders. Instagram and storefront returns are excluded.'
          : 'N/A outside an offline or Instagram scope: storefront returns are not tracked.',
    },
  ];

  cards.forEach((card) => {
    card.direction = deltaDirection(card.change);
    card.change = card.change === null || card.change === undefined ? null : r2(card.change);
  });

  return {
    cards, current: now, previous: before, newCustomers, previousNewCustomers,
    aov, previousAov, returnRate, previousReturnRate,
    unidentifiedOrders: current.unidentifiedOrders,
  };
}

/* ==========================================================================
   Category and product rows
   ========================================================================== */

function categoryRows(current, totalRevenue) {
  return [...current.categories.entries()]
    .map(([category, row]) => ({
      category,
      revenue: r2(row.revenue),
      share: sharePercent(row.revenue, totalRevenue),
    }))
    .filter((row) => row.revenue !== 0)
    .sort((a, b) => b.revenue - a.revenue);
}

function productRows(current, prior, totalRevenue) {
  return [...current.products.entries()]
    .map(([key, row]) => {
      const before = prior.products.get(key);
      const previousRevenue = before ? r2(before.revenue) : 0;
      return {
        key,
        code: row.code || row.name || '',
        name: row.source === 'website' ? (row.name || '') : (row.name || row.code || ''),
        category: row.category || UNCATEGORISED,
        uom: row.uom || '',
        revenue: r2(row.revenue),
        units: r2(row.units),
        orders: row.orderIds.size,
        share: sharePercent(row.revenue, totalRevenue),
        previousRevenue,
        growth: before ? comparableGrowth(row.revenue, previousRevenue) : null,
      };
    })
    .filter((row) => row.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

function growingRows(current, prior, type) {
  const currentMap = type === 'category' ? current.categories : current.products;
  const priorMap = type === 'category' ? prior.categories : prior.products;
  return [...currentMap.entries()]
    .map(([key, row]) => {
      if (type === 'category' && key === UNCATEGORISED) return null;
      const before = priorMap.get(key);
      const previousRevenue = before ? num(before.revenue) : 0;
      if (previousRevenue <= 0 || num(row.revenue) <= 0) return null;
      const growth = comparableGrowth(row.revenue, previousRevenue);
      if (growth === null || growth <= 0) return null;
      return {
        key,
        label: type === 'category' ? key : (row.name || row.code || key),
        category: row.category || (type === 'category' ? key : UNCATEGORISED),
        revenue: r2(row.revenue),
        previousRevenue: r2(previousRevenue),
        growth: r2(growth),
      };
    })
    .filter(Boolean)
    .sort((a, b) => b.growth - a.growth)
    .slice(0, 5);
}

function buildInsights(ctx, kpis, branches, channels, categories, products, inventory, active, activePrior) {
  const insights = [];
  const comparisonLabel = ctx.comparison
    ? formatDateRange(ctx.comparison.start, ctx.comparison.end)
    : 'no comparison period';
  const revenueCard = kpis.cards.find((c) => c.key === 'revenue');

  if (revenueCard.change !== null) {
    insights.push({
      id: 'revenue-momentum',
      title: revenueCard.change >= 0 ? 'Revenue is ahead of the prior period' : 'Revenue is behind the prior period',
      tone: revenueCard.change >= 0 ? 'positive' : 'negative',
      summary: `${formatINR(kpis.current.revenue)} net revenue this period, ${formatPercent(revenueCard.change, { signed: true })} against ${comparisonLabel}.`,
      evidence: [
        `Current net revenue: ${formatINR(kpis.current.revenue)}`,
        `Comparison net revenue: ${formatINR(kpis.previous.revenue)}`,
        `Change: ${formatPercent(revenueCard.change, { signed: true })}`,
      ],
      method: 'Rule: percentage change between two equal-length periods. A zero prior value is reported as N/A, not infinity.',
    });
  } else {
    insights.push({
      id: 'revenue-momentum',
      title: 'No comparable prior revenue',
      tone: 'neutral',
      summary: `${formatINR(kpis.current.revenue)} net revenue this period. A prior-period percentage cannot be calculated because the comparison revenue is zero.`,
      evidence: [
        `Current net revenue: ${formatINR(kpis.current.revenue)}`,
        `Comparison net revenue: ${formatINR(kpis.previous.revenue)}`,
      ],
      method: 'Rule: percentage change is undefined when the denominator is zero.',
    });
  }

  const rankedBranches = branches.rows
    .filter((r) => r.branchId !== UNASSIGNED_BRANCH && r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue);
  if (rankedBranches.length) {
    const top = rankedBranches[0];
    insights.push({
      id: 'branch-concentration',
      title: `${top.branchName} leads branch revenue`,
      tone: 'neutral',
      summary: `${top.branchName}${top.city ? ` (${top.city})` : ''} contributed ${formatINR(top.revenue)} — ${formatPercent(top.share)} of branch revenue — across ${formatNumber(top.orders)} orders.`,
      evidence: [
        `Branch revenue: ${formatINR(top.revenue)}`,
        `Share of branch revenue: ${formatPercent(top.share)}`,
        `Orders: ${formatNumber(top.orders)}`,
        `Branch growth: ${formatPercent(top.growth, { signed: true })}`,
      ],
      method: 'Rule: branches ranked by net recorded revenue in the selected period; share is branch revenue ÷ summed branch revenue.',
    });
  }

  const website = channels.rows.find((r) => r.key === 'website');
  const offline = channels.rows.find((r) => r.key === 'offline');
  const instagram = channels.rows.find((r) => r.key === 'instagram');
  insights.push({
    id: 'channel-mix',
    title: 'Channel mix is measured from stored orders only',
    tone: website.share > 0 || instagram.share > 0 ? 'positive' : 'neutral',
    summary: `${formatPercent(offline.share)} of channel revenue came from offline stores, ${formatPercent(instagram.share)} from Instagram and ${formatPercent(website.share)} from the website.`,
    evidence: [
      `Offline net revenue: ${formatINR(offline.revenue)} (${formatPercent(offline.share)} share)`,
      `Instagram net revenue: ${formatINR(instagram.revenue)} (${formatPercent(instagram.share)} share)`,
      `Website net revenue: ${formatINR(website.revenue)} (${formatPercent(website.share)} share)`,
      `Instagram bills tagged at billing: ${formatNumber(instagram.orders)}`,
      `Website orders excluded as already invoiced: ${formatNumber(channels.reconciliation.website.duplicateCount)}`,
    ],
    method: 'Rule: channel shares use the combined offline + Instagram + eligible-website total. Instagram revenue is the Sales Channel saved on each bill, never an estimate.',
  });

  const topCategory = categories.find((c) => c.category !== UNCATEGORISED);
  if (topCategory) {
    insights.push({
      id: 'category-leader',
      title: `${topCategory.category} is the largest mapped category`,
      tone: 'neutral',
      summary: `${topCategory.category} recorded ${formatINR(topCategory.revenue)}, or ${formatPercent(topCategory.share)} of revenue. Uncategorised value is excluded from this ranking, not counted as a category.`,
      evidence: [
        `Category revenue: ${formatINR(topCategory.revenue)}`,
        `Share of total revenue: ${formatPercent(topCategory.share)}`,
        `Categories shown: ${formatNumber(categories.filter((c) => c.category !== UNCATEGORISED).length)}`,
      ],
      method: 'Rule: revenue allocated from each document total across its lines using the line values. Unmapped lines remain uncategorised.',
    });
  }

  const topProduct = products[0];
  if (topProduct) {
    insights.push({
      id: 'product-leader',
      title: `${topProduct.code} is the top product by revenue`,
      tone: 'neutral',
      summary: `${topProduct.name} recorded ${formatINR(topProduct.revenue)} across ${formatUnits(topProduct.units)} ${topProduct.uom || 'units'}${topProduct.growth === null ? '' : `, ${formatPercent(topProduct.growth, { signed: true })} against the prior period`}.`,
      evidence: [
        `Item code: ${topProduct.code}`,
        `Category: ${topProduct.category}`,
        `Revenue: ${formatINR(topProduct.revenue)}`,
        `Units: ${formatUnits(topProduct.units)} ${topProduct.uom || ''}`.trim(),
        `Growth: ${formatPercent(topProduct.growth, { signed: true })}`,
      ],
      method: 'Rule: products ranked by allocated net revenue. Growth is N/A when the product had no prior-period revenue.',
    });
  }

  const returnCard = kpis.cards.find((c) => c.key === 'returnRate');
  if (returnCard.value !== null) {
    insights.push({
      id: 'returns',
      title: `${ctx.filters.channel === 'instagram' ? 'Instagram' : 'Offline'} return rate is ${formatPercent(returnCard.value)}`,
      tone: returnCard.value > 5 ? 'negative' : 'neutral',
      summary: `${formatNumber(kpis.current.returnDocuments)} return documents against ${formatNumber(kpis.current.returnBaseOrders)} ${ctx.filters.channel === 'instagram' ? 'Instagram' : 'offline'} sales orders. ${returnCard.change === null ? 'No prior rate to compare.' : `${formatPointChange(returnCard.change)} versus ${comparisonLabel}.`}`,
      evidence: [
        `Return documents: ${formatNumber(kpis.current.returnDocuments)}`,
        `${ctx.filters.channel === 'instagram' ? 'Instagram' : 'Offline'} sales orders: ${formatNumber(kpis.current.returnBaseOrders)}`,
        `Return rate: ${formatPercent(returnCard.value)}`,
        `Point change: ${formatPointChange(returnCard.change)}`,
      ],
      method: 'Rule: distinct return documents ÷ sales orders in the same channel. Website returns are not tracked and are excluded from both sides.',
    });
  }

  if (inventory.available && inventory.alertCount > 0) {
    insights.push({
      id: 'inventory-risk',
      title: `${formatNumber(inventory.alertCount)} stocked items are inside the 21-day cover line`,
      tone: 'negative',
      summary: `${formatNumber(inventory.alertCount)} item/uom combinations have less than ${INVENTORY_COVER_DAYS} days of cover at the last ${INVENTORY_LOOKBACK_DAYS} days of offline sales velocity. This is a derived risk, not a configured reorder threshold.`,
      evidence: inventory.alerts.slice(0, 3).map((a) => `${a.code} · ${formatUnits(a.stock)} ${a.uom || 'units'} left · ${a.daysCover} days cover`),
      method: inventory.assumption,
    });
  }

  return {
    providerAvailable: false,
    providerNote: 'No AI provider is configured. These insights are deterministic rules over the filtered ERP and storefront records.',
    insights: insights.slice(0, 7),
    growingCategories: growingRows(active, activePrior, 'category'),
  };
}

function buildForecast(ctx, kpis) {
  const channel = ctx.filters.channel;
  const days = ctx.range.days;
  const nextKey = addMonthsToMonth(monthKeyOf(ctx.range.end), 1);
  const nextDays = diffDays(startOfMonth(nextKey), endOfMonth(nextKey)) + 1;
  if (days < FORECAST_MIN_DAYS) {
    return {
      available: false,
      reason: `A forecast needs at least ${FORECAST_MIN_DAYS} selected days; this range has ${days}.`,
      nextMonth: monthLabel(nextKey, { long: true }), nextMonthDays: nextDays, basisDays: days,
    };
  }
  if (kpis.current.revenue <= 0) {
    return {
      available: false,
      reason: 'The selected period has no positive net revenue to extrapolate.',
      nextMonth: monthLabel(nextKey, { long: true }), nextMonthDays: nextDays, basisDays: days,
    };
  }
  const dailyAverage = kpis.current.revenue / days;
  return {
    available: true,
    reason: '',
    nextMonth: monthLabel(nextKey, { long: true }),
    nextMonthKey: nextKey,
    nextMonthDays: nextDays,
    basisDays: days,
    dailyAverage: r2(dailyAverage),
    forecast: r2(dailyAverage * nextDays),
    lower: r2(dailyAverage * nextDays * 0.9),
    upper: r2(dailyAverage * nextDays * 1.1),
    model: `Trailing selected-period daily average (${formatINR(dailyAverage)}/day over ${days} days) × ${nextDays} calendar days in ${monthLabel(nextKey, { long: true })}.`,
    disclaimer: 'Rule-based run-rate model, not a guarantee. It is not seasonality-adjusted and is only shown when at least 14 selected days and positive revenue exist.',
  };
}

function buildRecommendations(ctx, categories, products, branches, channels, inventory, active, activePrior) {
  const recommendations = [];
  const topCategory = categories.find((c) => c.category !== UNCATEGORISED);
  if (topCategory && topCategory.share >= 20) {
    recommendations.push({
      type: 'marketing',
      title: `Lead the next campaign with ${topCategory.category}`,
      body: `Feature ${topCategory.category} in the next customer communication. It is the largest mapped category at ${formatINR(topCategory.revenue)} (${formatPercent(topCategory.share)} of revenue).`,
      basis: 'Category revenue and share in the selected period.',
    });
  }
  const growingProduct = products.find((p) => p.growth !== null && p.growth > 0 && p.previousRevenue > 0);
  if (growingProduct) {
    recommendations.push({
      type: 'marketing',
      title: `Give ${growingProduct.code} more shelf and campaign space`,
      body: `${growingProduct.name} grew ${formatPercent(growingProduct.growth, { signed: true })} against the prior period on ${formatINR(growingProduct.revenue)} of revenue. Repeat it in the next edit.`,
      basis: 'Product revenue growth with a positive prior-period base.',
    });
  }
  const weakestBranch = branches.rows
    .filter((r) => r.branchId !== UNASSIGNED_BRANCH && r.previousRevenue > 0)
    .sort((a, b) => (a.growth ?? 0) - (b.growth ?? 0))[0];
  if (weakestBranch && weakestBranch.growth !== null && weakestBranch.growth < 0) {
    recommendations.push({
      type: 'action',
      title: `Review ${weakestBranch.branchName}'s sales plan`,
      body: `${weakestBranch.branchName} is ${formatPercent(Math.abs(weakestBranch.growth))} below its prior-period revenue (${formatINR(weakestBranch.revenue)} versus ${formatINR(weakestBranch.previousRevenue)}). Check stock depth and conversion rather than assuming demand has gone.`,
      basis: 'Branch revenue compared with the selected comparison period.',
    });
  }
  const websiteRow = channels.rows.find((r) => r.key === 'website');
  if (websiteRow.share > 0 && websiteRow.share < 10) {
    recommendations.push({
      type: 'action',
      title: 'Close the website attribution and conversion gap',
      body: `The website contributes ${formatPercent(websiteRow.share)} of channel revenue. Confirm every online order carries an invoice/attribution reference before increasing spend.`,
      basis: 'Website share of net channel revenue and the current dedupe check.',
    });
  }
  if (inventory.available && inventory.alertCount > 0) {
    recommendations.push({
      type: 'inventory',
      title: `Review cover for ${inventory.alerts[0].code}`,
      body: `${inventory.alerts[0].code} has ${formatUnits(inventory.alerts[0].stock)} ${inventory.alerts[0].uom || 'units'} on hand and ${inventory.alerts[0].daysCover} days of cover at recent offline velocity. Replenish or rebalance before the next selling week.`,
      basis: inventory.assumption,
    });
  }
  if (!recommendations.length) {
    recommendations.push({
      type: 'action',
      title: 'No rule-based recommendation triggered',
      body: 'The selected data did not meet the thresholds for a category, product, branch or inventory recommendation. No generic action has been invented.',
      basis: 'Deterministic thresholds over the filtered figures.',
    });
  }
  return {
    providerAvailable: false,
    note: 'Recommendations are rule-based on the figures above; no AI provider is configured.',
    growingDemand: growingRows(active, activePrior, 'product'),
    recommendations: recommendations.slice(0, 5),
  };
}

function buildKeyTakeaway(ctx, kpis, branches, channels, categories, inventory) {
  const instagram = channels.rows.find((r) => r.key === 'instagram');
  const topBranch = branches.rows
    .filter((r) => r.branchId !== UNASSIGNED_BRANCH && r.revenue > 0)
    .sort((a, b) => b.revenue - a.revenue)[0];
  const topCategory = categories.find((c) => c.category !== UNCATEGORISED);
  const website = channels.rows.find((r) => r.key === 'website');
  const revenueCard = kpis.cards.find((c) => c.key === 'revenue');
  if (kpis.current.revenue === 0 && kpis.current.orders === 0) {
    return ctx.filters.channel === 'instagram'
      ? 'No bill was tagged Instagram for this selection, so the channel is ₹0. Tag a bill at billing (Payment → Sales channel) to attribute it.'
      : 'No eligible sales were recorded for this selection. The tables below distinguish zero activity from unavailable sources.';
  }
  const parts = [
    `${formatINR(kpis.current.revenue)} net revenue across ${formatNumber(kpis.current.orders)} orders`,
    revenueCard.change === null
      ? 'with no comparable prior period'
      : `${revenueCard.change >= 0 ? 'up' : 'down'} ${formatPercent(Math.abs(revenueCard.change))} against the prior period`,
  ];
  if (topBranch) parts.push(`${topBranch.branchName} led with ${formatPercent(topBranch.share)} of branch revenue`);
  if (topCategory) parts.push(`${topCategory.category} was the largest mapped category at ${formatPercent(topCategory.share)}`);
  if (ctx.filters.channel === 'all' && instagram.revenue > 0) {
    parts.push(`Instagram contributed ${formatPercent(instagram.share)} of channel revenue from ${formatNumber(instagram.orders)} tagged orders`);
  }
  parts.push(`the website contributed ${formatPercent(website.share)} of channel revenue`);
  if (inventory.available && inventory.alertCount > 0) parts.push(`${inventory.alertCount} item/uom combinations need inventory review`);
  return `${parts.join('; ')}.`;
}

/* An exact same-day matching total is not proof of a duplicate bill, but when
   three or more POS invoices share a branch, date, total and line count it is
   worth flagging before the comparison is read as a like-for-like trend. */
function repeatedPosNote(ctx, current, prior) {
  if (ctx.filters.channel === 'website' || ctx.filters.channel === 'instagram') return [];
  const groups = new Map();
  [...current.offlineDocs, ...prior.offlineDocs]
    .filter((doc) => doc.source === 'pos' && doc.revenue > 0)
    .forEach((doc) => {
      const key = [doc.businessId, doc.date, doc.revenue, doc.items].join('|');
      const group = groups.get(key) || {
        businessId: doc.businessId, date: doc.date, revenue: doc.revenue,
        lines: doc.items, count: 0,
      };
      group.count += 1;
      groups.set(key, group);
    });
  const top = [...groups.values()].sort((a, b) => b.count - a.count)[0];
  if (!top || top.count < 3) return [];
  const branch = ctx.branchByBusiness.get(top.businessId);
  return [{
    key: 'repeated-pos',
    level: 'warning',
    title: `${formatNumber(top.count)} POS invoices share one date and total`,
    detail: `${formatNumber(top.count)} POS invoices dated ${formatDate(top.date)} at ${branch?.branchName || 'one branch'} carry the same ${formatINR(top.revenue)} total and ${formatNumber(top.lines)} line${top.lines === 1 ? '' : 's'}. They are included exactly as stored, but they should be checked for duplicate billing before the comparison is read as a like-for-like trend.`,
  }];
}

function buildDataQuality(ctx, current, prior, kpis, categories, branches, inventory) {
  const uncategorised = categories.find((c) => c.category === UNCATEGORISED)?.revenue || 0;
  const items = [
    ...(current.instagramOrders === 0 ? [{
      key: 'instagram', level: 'info', title: 'No bill was tagged Instagram in this selection',
      detail: 'Instagram revenue comes only from the Sales Channel saved on a bill at billing (Payment → Sales channel). No bill in the selected period carries the tag, so the channel is ₹0 — nothing is inferred from a customer name, a note or a profile link.',
    }] : [{
      key: 'instagram', level: 'info', title: 'Instagram is attributed from the bill, not inferred',
      detail: `${formatNumber(current.instagramOrders)} order${current.instagramOrders === 1 ? '' : 's'} carry the Instagram Sales Channel, net of tagged returns. A bill is only counted when the channel was saved at billing, so an untagged Instagram order stays offline until it is corrected.`,
    }]),
    {
      key: 'website-returns', level: 'warning', title: 'Website returns are not tracked',
      detail: 'Storefront orders have no return/refund ledger in this database, so website return rate is N/A. The Return Rate KPI uses offline return documents only.',
    },
    ...(current.posMissingDate > 0 ? [{
      key: 'missing-date', level: 'warning',
      title: `${current.posMissingDate} POS invoice${current.posMissingDate === 1 ? '' : 's'} have no date`,
      detail: 'Those documents are dated by createdAt for this report. The fallback is counted here rather than silently treating the invoice as undated.',
    }] : []),
    ...repeatedPosNote(ctx, current, prior),
    ...(uncategorised !== 0 ? [{
      key: 'uncategorised', level: 'warning',
      title: 'Some revenue has no authoritative category allocation',
      detail: `${formatINR(uncategorised)} is shown as “${UNCATEGORISED}”. A line is only categorised when its item or barcode resolves to a product-group record; item-code text is never parsed as a substitute.`,
    }] : []),
    ...(current.unresolvedOnlineLines > 0 ? [{
      key: 'online-lines', level: 'warning',
      title: `${current.unresolvedOnlineLines} storefront line${current.unresolvedOnlineLines === 1 ? '' : 's'} could not be mapped`,
      detail: 'The line points at a storefront product that no longer resolves. Its value stays in the order total and its category stays uncategorised rather than being guessed.',
    }] : []),
    ...(current.websiteDuplicateCount > 0 ? [{
      key: 'website-dedupe', level: 'info',
      title: `${current.websiteDuplicateCount} website order${current.websiteDuplicateCount === 1 ? '' : 's'} excluded as already invoiced`,
      detail: `Their invoice numbers match ERP documents (${formatINR(current.websiteDedupeRevenue)}). They are removed from website revenue to avoid double counting.`,
    }] : []),
    ...(kpis.unidentifiedOrders > 0 ? [{
      key: 'walk-ins', level: 'info',
      title: `${kpis.unidentifiedOrders} order${kpis.unidentifiedOrders === 1 ? '' : 's'} have no customer identifier`,
      detail: 'New Customers counts only identified buyers (customer id or usable phone). Walk-in orders are not assigned to an invented customer.',
    }] : []),
    ...(current.zeroValueSalesInvoices > 0 ? [{
      key: 'zero-sales-invoice', level: 'info',
      title: `${current.zeroValueSalesInvoices} sales invoice${current.zeroValueSalesInvoices === 1 ? '' : 's'} carry zero net value`,
      detail: 'They are counted as orders and contribute ₹0 revenue, exactly as stored.',
    }] : []),
    ...(inventory.available ? [{
      key: 'inventory', level: 'info',
      title: 'Inventory alerts are a derived risk, not a configured threshold',
      detail: inventory.assumption,
    }] : [{
      key: 'inventory', level: 'info',
      title: 'Inventory alerts are hidden outside an offline scope',
      detail: inventory.reason,
    }]),
    ...(branches.rows.some((r) => r.branchId === UNASSIGNED_BRANCH) ? [{
      key: 'unassigned-branch', level: 'warning',
      title: 'Some sales are not mapped to a storefront branch',
      detail: 'They appear in the “Unassigned / no branch mapping” row rather than being forced into one of the four boutiques.',
    }] : []),
  ];
  return items;
}

function customerKey(customerId, phone) {
  if (customerId) return `c:${String(customerId)}`;
  const digits = String(phone || '').replace(/\D/g, '');
  if (digits.length >= 7) return `p:${digits.slice(-10)}`;
  return '';
}

function selectMaps(ctx, period) {
  const channel = ctx.filters.channel;
  if (channel === 'instagram') return { categories: period.categoriesInstagram, products: period.productsInstagram };
  if (channel === 'offline') return { categories: period.categoriesOffline, products: period.productsOffline };
  if (channel === 'website') return { categories: period.categoriesWebsite, products: period.productsWebsite };
  return { categories: period.categories, products: period.products };
}

function emptyRaw() {
  return {
    pos: [], sales: [], posReturns: [], salesReturns: [], orders: [],
    erpInvoiceNumbers: new Set(),
  };
}

function emptyPeriod(range) {
  return {
    range,
    pos: [], sales: [], posReturns: [], salesReturns: [], orders: [], duplicateOrders: [],
    categories: new Map(), products: new Map(),
    categoriesOffline: new Map(), productsOffline: new Map(),
    categoriesInstagram: new Map(), productsInstagram: new Map(),
    categoriesWebsite: new Map(), productsWebsite: new Map(),
    customerEvents: [], unidentifiedOrders: 0,
    offlineRevenue: 0, instagramRevenue: 0,
    websiteRevenue: 0, websiteDedupeRevenue: 0, totalRevenue: 0,
    offlineOrders: 0, instagramOrders: 0, websiteOrders: 0,
    instagramGross: 0, instagramReturnTotal: 0, instagramReturnDocuments: 0,
    instagramDocs: [],
    posGross: 0, salesGross: 0, posReturnTotal: 0, salesReturnTotal: 0,
    returnDocuments: 0, posReturnDocuments: 0, salesReturnDocuments: 0,
    posMissingDate: 0, salesMissingDate: 0, unresolvedOnlineLines: 0,
    zeroValueSalesInvoices: 0, websiteDuplicateCount: 0, offlineDocs: [],
  };
}

export async function buildDashboardAnalytics(session, sp) {
  const ctx = await resolveDashboardRequest(session, sp);

  const [currentRaw, priorRaw] = await Promise.all([
    loadPeriodRaw(ctx, ctx.range),
    ctx.comparison ? loadPeriodRaw(ctx, ctx.comparison) : Promise.resolve(emptyRaw()),
  ]);

  const identity = await loadProductIdentity(ctx, {
    pos: [...currentRaw.pos, ...priorRaw.pos],
    sales: [...currentRaw.sales, ...priorRaw.sales],
    posReturns: [...currentRaw.posReturns, ...priorRaw.posReturns],
    orders: [...currentRaw.orders, ...priorRaw.orders],
  });

  const [current, prior, firstMaps, trend, inventory] = await Promise.all([
    normalisePeriod(ctx, ctx.range, identity, currentRaw),
    ctx.comparison
      ? normalisePeriod(ctx, ctx.comparison, identity, priorRaw)
      : Promise.resolve(emptyPeriod(ctx.range)),
    loadFirstSaleMaps(ctx, ctx.range.endExclusive),
    loadMonthlyTrend(ctx, ctx.range.end),
    loadInventory(ctx),
  ]);

  const kpis = buildKpis(ctx, current, prior, firstMaps);
  const active = selectMaps(ctx, current);
  const activePrior = selectMaps(ctx, prior);
  const activeRevenue = kpis.current.revenue;
  const categories = categoryRows(active, activeRevenue);
  const products = productRows(active, activePrior, activeRevenue);
  const branches = buildBranchPerformance(ctx, current, prior);
  const channels = buildChannelPerformance(ctx, current, prior);
  const insights = buildInsights(ctx, kpis, branches, channels, categories, products, inventory, active, activePrior);
  const forecast = buildForecast(ctx, kpis);
  const recommendations = buildRecommendations(ctx, categories, products, branches, channels, inventory, active, activePrior);
  const keyTakeaway = buildKeyTakeaway(ctx, kpis, branches, channels, categories, inventory);
  const dataQuality = buildDataQuality(ctx, current, prior, kpis, categories, branches, inventory);

  return {
    meta: {
      generatedAt: new Date().toISOString(),
      timezone: 'Asia/Kolkata',
      currency: 'INR',
      startDate: ctx.range.start,
      endDate: ctx.range.end,
      days: ctx.range.days,
      financialYear: ctx.financialYear,
      financialYearStart: ctx.fyStart,
      financialYearEnd: ctx.fyEnd,
      comparisonKind: ctx.comparisonKind,
      comparison: ctx.comparison ? {
        startDate: ctx.comparison.start,
        endDate: ctx.comparison.end,
        days: ctx.comparison.days,
        label: ctx.comparison.label,
      } : null,
      company: ctx.filters.company,
      companyLabel: ctx.filters.companyLabel,
      branch: ctx.filters.branch,
      branchLabel: ctx.filters.branchLabel,
      channel: ctx.filters.channel,
      channelLabel: ctx.filters.channelLabel,
      branchScope: ctx.branchUniverse.map((b) => ({
        branchId: b.branchId, branchName: b.branchName, city: b.city,
        businessId: b.businessId, businessName: b.businessName, isMainBranch: b.isMainBranch,
      })),
      sourceCounts: {
        posInvoices: current.pos.length,
        salesInvoices: current.sales.length,
        posReturns: current.posReturns.length,
        salesReturns: current.salesReturns.length,
        websiteOrders: current.websiteOrders,
        websiteDuplicateOrders: current.websiteDuplicateCount,
      },
      definitions: {
        revenue: 'POS invoices + sales invoices − POS returns − sales returns + eligible storefront orders, after excluding storefront orders whose invoice number already exists in ERP. Each ERP bill is counted in exactly one channel: the Sales Channel saved on it at billing.',
        orders: 'POS invoices + sales invoices + eligible storefront orders. Return documents are not orders.',
        aov: 'Net revenue ÷ total orders. Null when there are no orders.',
        newCustomers: 'Distinct identified buyers whose earliest observed sale in the selected sources falls in the selected period. A buyer is identified by customer id or a usable phone number.',
        returnRate: 'Distinct offline return documents ÷ offline sales orders. Online returns are not tracked, so a website-only scope returns N/A.',
        category: 'Document revenue is allocated across lines in proportion to line value; the last line absorbs rounding. Unmapped lines remain “Uncategorised / unallocated”.',
        region: 'Branch attribution uses ERP businessId → storefront branch. Sales with no branch mapping are shown separately, never forced into a boutique.',
        forecast: 'Trailing selected-period daily net revenue × calendar days in the next month. Requires at least 14 selected days and positive revenue.',
        inventory: 'Derived cover: current IN_STOCK quantity ÷ trailing-28-day offline daily unit velocity. The 21-day review line is an assumption, not a stored reorder threshold.',
        instagram: 'A bill counts as Instagram only when its Sales Channel was saved as Instagram at billing; a credit inherits its invoice channel. Every other bill, including older untagged ones, is an offline store sale. Nothing is inferred from a customer name, a note or a profile link, and no value is estimated.',
      },
      caps: {
        documentsPerCollection: DOC_CAP,
        maxRangeDays: MAX_RANGE_DAYS,
        trendMonths: TREND_MONTHS,
        forecastMinimumDays: FORECAST_MIN_DAYS,
        inventoryLookbackDays: INVENTORY_LOOKBACK_DAYS,
        inventoryCoverDays: INVENTORY_COVER_DAYS,
      },
    },
    kpis,
    trend,
    categories,
    products,
    branches,
    channels,
    insights,
    forecast,
    recommendations,
    keyTakeaway,
    inventory,
    dataQuality,
    reconciliation: channels.reconciliation,
  };
}

export { DOC_CAP, MAX_RANGE_DAYS };

function posLineValue(line) {
  if (line && line.netAmount !== undefined && line.netAmount !== null && line.netAmount !== '') {
    const direct = Number(line.netAmount);
    if (Number.isFinite(direct)) return direct;
  }
  const rate = Number(line?.rate ?? line?.rsp);
  const qty = Number(line?.qty);
  const discount = Number(line?.discountPct || 0);
  if (Number.isFinite(rate) && Number.isFinite(qty)) {
    return rate * qty * (1 - Math.min(Math.max(discount, 0), 100) / 100);
  }
  return 0;
}

function posLineQty(line) {
  const qty = Number(line?.qty);
  return Number.isFinite(qty) ? qty : 0;
}

function mergeMaps(...maps) {
  const out = new Map();
  maps.forEach((map) => {
    if (!map) return;
    map.forEach((row, key) => {
      const current = out.get(key) || {
        revenue: 0, units: 0, orderIds: new Set(),
      };
      current.revenue = r2(current.revenue + num(row.revenue));
      current.units = r2(current.units + num(row.units));
      row.orderIds.forEach((id) => current.orderIds.add(id));
      Object.entries(row).forEach(([k, v]) => {
        if (k !== 'revenue' && k !== 'units' && k !== 'orderIds' && current[k] === undefined) current[k] = v;
      });
      out.set(key, current);
    });
  });
  return out;
}

function addTo(map, key, patch) {
  const current = map.get(key) || {
    revenue: 0, units: 0, orderIds: new Set(),
  };
  current.revenue = r2(current.revenue + num(patch.revenue));
  current.units = r2(current.units + num(patch.units));
  if (patch.orderId) current.orderIds.add(String(patch.orderId));
  Object.entries(patch).forEach(([k, v]) => {
    if (k !== 'revenue' && k !== 'units' && k !== 'orderId' && current[k] === undefined) current[k] = v;
  });
  map.set(key, current);
}

function addToCategory(categories, category, revenue, units, orderId) {
  const key = String(category || UNCATEGORISED).trim() || UNCATEGORISED;
  addTo(categories, key, { revenue, units, orderId, category: key });
}

function addToProduct(products, identity, revenue, units, orderId) {
  if (!identity?.key) return;
  addTo(products, identity.key, {
    revenue, units, orderId,
    code: identity.code, name: identity.name, category: identity.category, uom: identity.uom,
    source: identity.source,
  });
}

/* Allocate a document's recorded header value across its lines. If the lines
   carry no value at all there is no honest split: with a single identifiable
   line the whole document goes to it, otherwise the value is uncategorised. */
function allocateDocument(doc, target, lines, identityFn, categories, products) {
  const prepared = lines.map((line) => {
    const identity = identityFn(line);
    const rawValue = posLineValue(line);
    const value = Number.isFinite(rawValue) ? rawValue : 0;
    const isReturn = Boolean(line?.isReturn);
    return {
      line,
      identity,
      weight: isReturn ? -Math.abs(value) : Math.abs(value),
      units: (isReturn ? -1 : 1) * Math.abs(posLineQty(line)),
    };
  });

  const allocations = allocateAmount(target, prepared.map((p) => p.weight));
  if (allocations) {
    prepared.forEach((p, index) => {
      const revenue = allocations[index];
      addToCategory(categories, p.identity.category, revenue, p.units, doc._id);
      addToProduct(products, p.identity, revenue, p.units, doc._id);
    });
    return;
  }

  if (prepared.length === 1 && prepared[0].identity.hasIdentity) {
    addToCategory(categories, prepared[0].identity.category, target, prepared[0].units, doc._id);
    addToProduct(products, prepared[0].identity, target, prepared[0].units, doc._id);
    return;
  }
  addToCategory(categories, UNCATEGORISED, target, 0, doc._id);
}

function addUncategorised(categories, revenue) {
  if (!revenue) return;
  addToCategory(categories, UNCATEGORISED, revenue, 0, '');
}

async function loadPeriodRaw(ctx, range) {
  const [pos, sales, posReturns, salesReturns, orders] = await Promise.all([
    loadPosDocs(ctx, range),
    loadSalesDocs(ctx, range),
    loadPosReturnDocs(ctx, range),
    loadSalesReturnDocs(ctx, range),
    loadEligibleWebsiteOrders(ctx, range),
  ]);
  const erpInvoiceNumbers = await loadErpInvoiceNumbers(ctx, orders);
  return { pos, sales, posReturns, salesReturns, orders, erpInvoiceNumbers };
}

async function normalisePeriod(ctx, range, identity, raw) {
  const {
    pos, sales, posReturns, salesReturns, orders, erpInvoiceNumbers,
  } = raw;
  const duplicateOrders = [];
  const websiteOrders = [];
  orders.forEach((order) => {
    const invoice = String(order.invoiceNumber || '').trim().toUpperCase();
    if (invoice && erpInvoiceNumbers.has(invoice)) {
      duplicateOrders.push(order);
      return;
    }
    websiteOrders.push(order);
  });

  const categoriesOffline = new Map();
  const productsOffline = new Map();
  const categoriesWebsite = new Map();
  const productsWebsite = new Map();
  /* Instagram sales are recorded as ordinary POS / sales invoices whose
     Sales Channel is set to Instagram at billing. They carry their own
     category, product, branch and customer totals so a channel filter can
     narrow every panel, not just the channel card. */
  const categoriesInstagram = new Map();
  const productsInstagram = new Map();
  const customerEvents = [];
  let offlineRevenue = 0;
  let instagramRevenue = 0;
  let instagramGross = 0;
  let posGross = 0;
  let salesGross = 0;
  let posReturnTotal = 0;
  let salesReturnTotal = 0;
  let instagramReturnTotal = 0;
  let unidentifiedOfflineOrders = 0;
  let offlineOrders = 0;
  let instagramOrders = 0;
  let instagramReturnDocuments = 0;
  let offlineReturnDocuments = 0;
  let offlinePosReturnTotal = 0;
  let offlineSalesReturnTotal = 0;
  const offlineDocs = [];
  const instagramDocs = [];

  pos.forEach((doc) => {
    const revenue = num(doc.totalAmount);
    const day = istDay(doc.date || doc.createdAt);
    const key = customerKey(doc.customerId, doc.customerContact);
    const instagram = channelValueOf(doc) === SALES_CHANNEL_INSTAGRAM;
    const catMap = instagram ? categoriesInstagram : categoriesOffline;
    const prodMap = instagram ? productsInstagram : productsOffline;
    const docs = instagram ? instagramDocs : offlineDocs;
    if (instagram) {
      instagramGross = r2(instagramGross + revenue);
      instagramRevenue = r2(instagramRevenue + revenue);
      instagramOrders += 1;
    } else {
      posGross = r2(posGross + revenue);
      offlineRevenue = r2(offlineRevenue + revenue);
      offlineOrders += 1;
    }
    if (!key) unidentifiedOfflineOrders += 1;
    customerEvents.push({ key, date: day });
    allocateDocument(doc, revenue, Array.isArray(doc.items) ? doc.items : [], identity.resolveLine, catMap, prodMap);
    docs.push({
      source: 'pos', id: String(doc._id), docNo: doc.invoiceNo || '',
      date: day, dateSource: doc.date ? 'date' : 'createdAt',
      revenue, businessId: String(doc.businessId || ''), locationId: String(doc.locationId || ''),
      customerKey: key, items: Array.isArray(doc.items) ? doc.items.length : 0,
      salesChannel: instagram ? SALES_CHANNEL_INSTAGRAM : '',
    });
  });

  sales.forEach((doc) => {
    const revenue = num(doc.netValue);
    const day = istDay(doc.createdAt);
    const key = customerKey(doc.customerId, doc.customerMobile);
    const instagram = channelValueOf(doc) === SALES_CHANNEL_INSTAGRAM;
    const catMap = instagram ? categoriesInstagram : categoriesOffline;
    const prodMap = instagram ? productsInstagram : productsOffline;
    const docs = instagram ? instagramDocs : offlineDocs;
    if (instagram) {
      instagramGross = r2(instagramGross + revenue);
      instagramRevenue = r2(instagramRevenue + revenue);
      instagramOrders += 1;
    } else {
      salesGross = r2(salesGross + revenue);
      offlineRevenue = r2(offlineRevenue + revenue);
      offlineOrders += 1;
    }
    if (!key) unidentifiedOfflineOrders += 1;
    customerEvents.push({ key, date: day });
    const lines = Array.isArray(doc.items) ? doc.items : [];
    if (revenue) {
      const valued = lines.filter((l) => l && (
        l.netAmount !== undefined || l.rate !== undefined || l.amount !== undefined
      ));
      if (valued.length) {
        const weights = valued.map((l) => Math.abs(num(l.netAmount ?? l.amount ?? (num(l.rate) * num(l.qty)))));
        const allocations = allocateAmount(revenue, weights);
        if (allocations) {
          valued.forEach((line, index) => {
            const id = identity.resolveSalesLine(line);
            addToCategory(catMap, id.category, allocations[index], num(line.qty), doc._id);
            addToProduct(prodMap, id, allocations[index], num(line.qty), doc._id);
          });
        } else addUncategorised(catMap, revenue);
      } else if (lines.length === 1) {
        const id = identity.resolveSalesLine(lines[0]);
        addToCategory(catMap, id.category, revenue, 0, doc._id);
        addToProduct(prodMap, id, revenue, 0, doc._id);
      } else addUncategorised(catMap, revenue);
    }
    docs.push({
      source: 'sales', id: String(doc._id), docNo: doc.salesInvoiceNo || '',
      date: day, dateSource: 'createdAt', revenue,
      businessId: String(doc.businessId || ''), locationId: String(doc.locationId || ''),
      customerKey: key, items: lines.length,
      salesChannel: instagram ? SALES_CHANNEL_INSTAGRAM : '',
    });
  });

  posReturns.forEach((doc) => {
    const refund = Math.abs(num(doc.totalAmount || doc.refundAmount));
    const day = istDay(doc.date || doc.createdAt);
    const key = customerKey(doc.customerId, doc.customerContact);
    /* A credit inherits the channel of the bill it credits, so an Instagram
       return reduces Instagram revenue instead of the store's. */
    const instagram = channelValueOf(doc) === SALES_CHANNEL_INSTAGRAM;
    const catMap = instagram ? categoriesInstagram : categoriesOffline;
    const prodMap = instagram ? productsInstagram : productsOffline;
    const docs = instagram ? instagramDocs : offlineDocs;
    posReturnTotal = r2(posReturnTotal + refund);
    if (instagram) {
      instagramReturnTotal = r2(instagramReturnTotal + refund);
      instagramRevenue = r2(instagramRevenue - refund);
      instagramReturnDocuments += 1;
    } else {
      offlineRevenue = r2(offlineRevenue - refund);
      offlinePosReturnTotal = r2(offlinePosReturnTotal + refund);
      offlineReturnDocuments += 1;
    }
    if (refund) {
      const lines = Array.isArray(doc.items) ? doc.items : [];
      const prepared = lines.map((line) => {
        const id = identity.resolveLine(line);
        return { id, weight: Math.abs(posLineValue(line)), units: -Math.abs(posLineQty(line)) };
      });
      const allocations = allocateAmount(-refund, prepared.map((p) => p.weight));
      if (allocations) {
        prepared.forEach((p, index) => {
          addToCategory(catMap, p.id.category, allocations[index], p.units, doc._id);
          addToProduct(prodMap, p.id, allocations[index], p.units, doc._id);
        });
      } else addUncategorised(catMap, -refund);
    }
    docs.push({
      source: 'pos_return', id: String(doc._id), docNo: doc.invoiceNo || '',
      date: day, dateSource: doc.date ? 'date' : 'createdAt', revenue: -refund,
      businessId: String(doc.businessId || ''), locationId: String(doc.locationId || ''),
      customerKey: key, items: Array.isArray(doc.items) ? doc.items.length : 0,
      isReturnDocument: true,
      salesChannel: instagram ? SALES_CHANNEL_INSTAGRAM : '',
    });
  });

  salesReturns.forEach((doc) => {
    const day = istDay(doc.returnDate || doc.createdAt);
    const lines = Array.isArray(doc.items) ? doc.items : [];
    const valued = lines.filter((l) => l && (
      l.netAmount !== undefined || l.amount !== undefined || l.rate !== undefined
    ));
    const refund = Math.abs(r2(sumBy(valued, (l) => l.netAmount ?? l.amount ?? (num(l.rate) * num(l.qty)))));
    const instagram = channelValueOf(doc) === SALES_CHANNEL_INSTAGRAM;
    const catMap = instagram ? categoriesInstagram : categoriesOffline;
    const prodMap = instagram ? productsInstagram : productsOffline;
    const docs = instagram ? instagramDocs : offlineDocs;
    salesReturnTotal = r2(salesReturnTotal + refund);
    if (instagram) {
      instagramReturnTotal = r2(instagramReturnTotal + refund);
      instagramRevenue = r2(instagramRevenue - refund);
      instagramReturnDocuments += 1;
    } else {
      offlineRevenue = r2(offlineRevenue - refund);
      offlineSalesReturnTotal = r2(offlineSalesReturnTotal + refund);
      offlineReturnDocuments += 1;
    }
    if (refund) {
      const prepared = valued.map((line) => ({
        id: identity.resolveSalesLine(line),
        weight: Math.abs(num(line.netAmount ?? line.amount ?? (num(line.rate) * num(line.qty)))),
        units: -Math.abs(num(line.qty)),
      }));
      const allocations = allocateAmount(-refund, prepared.map((p) => p.weight));
      if (allocations) {
        prepared.forEach((p, index) => {
          addToCategory(catMap, p.id.category, allocations[index], p.units, doc._id);
          addToProduct(prodMap, p.id, allocations[index], p.units, doc._id);
        });
      } else addUncategorised(catMap, -refund);
    }
    docs.push({
      source: 'sales_return', id: String(doc._id), docNo: doc.salesReturnNo || '',
      date: day, dateSource: doc.returnDate ? 'returnDate' : 'createdAt', revenue: -refund,
      businessId: String(doc.businessId || ''), locationId: String(doc.locationId || ''),
      customerKey: customerKey(doc.customerId, ''), items: lines.length, isReturnDocument: true,
      salesChannel: instagram ? SALES_CHANNEL_INSTAGRAM : '',
    });
  });

  let websiteRevenue = 0;
  let websiteDedupeRevenue = 0;
  const onlineProducts = await loadOnlineProductMap(ctx.access.db, websiteOrders);
  const normalisedWebsiteOrders = [];
  let unresolvedOnlineLines = 0;

  websiteOrders.forEach((order) => {
    const gross = Number(order.amounts?.grandTotal);
    const subtotal = Number(order.amounts?.subtotal);
    const revenue = Number.isFinite(gross) ? gross : (Number.isFinite(subtotal) ? subtotal : 0);
    const day = istDay(order.createdAt);
    const phone = String(order.customerPhone || order.billingAddress?.phone || order.shippingAddress?.phone || '').replace(/\D/g, '');
    const key = phone.length >= 7 ? `p:${phone.slice(-10)}` : (order.customer ? `w:${String(order.customer)}` : '');
    websiteRevenue = r2(websiteRevenue + revenue);
    if (!key) unidentifiedOfflineOrders += 1;
    customerEvents.push({ key, date: day });

    const lines = Array.isArray(order.lines) ? order.lines : [];
    const ids = lines.map((line) => onlineIdentity(line, onlineProducts, identity));
    ids.forEach((id) => { if (!id.hasIdentity) unresolvedOnlineLines += 1; });
    const weights = lines.map((line) => Math.abs(onlineLineValue(line)));
    const allocations = allocateAmount(revenue, weights);
    if (allocations) {
      lines.forEach((line, index) => {
        const id = ids[index];
        const units = onlineLineQty(line);
        addToCategory(categoriesWebsite, id.category, allocations[index], units, order._id);
        addToProduct(productsWebsite, id, allocations[index], units, order._id);
      });
    } else if (ids.length === 1 && ids[0].hasIdentity) {
      addToCategory(categoriesWebsite, ids[0].category, revenue, onlineLineQty(lines[0]), order._id);
      addToProduct(productsWebsite, ids[0], revenue, onlineLineQty(lines[0]), order._id);
    } else addUncategorised(categoriesWebsite, revenue);

    normalisedWebsiteOrders.push({ ...order, _normalised: true });
  });

  duplicateOrders.forEach((order) => {
    const gross = Number(order.amounts?.grandTotal);
    const subtotal = Number(order.amounts?.subtotal);
    websiteDedupeRevenue = r2(websiteDedupeRevenue + (Number.isFinite(gross) ? gross : num(subtotal)));
  });

  return {
    range,
    pos, sales, posReturns, salesReturns,
    orders: normalisedWebsiteOrders,
    duplicateOrders,
    categories: mergeMaps(categoriesOffline, categoriesInstagram, categoriesWebsite),
    products: mergeMaps(productsOffline, productsInstagram, productsWebsite),
    categoriesOffline,
    productsOffline,
    categoriesInstagram,
    productsInstagram,
    categoriesWebsite,
    productsWebsite,
    customerEvents: customerEvents.filter((e) => e.key),
    unidentifiedOrders: unidentifiedOfflineOrders,
    offlineRevenue: r2(offlineRevenue),
    instagramRevenue: r2(instagramRevenue),
    instagramGross: r2(instagramGross),
    instagramReturnTotal: r2(instagramReturnTotal),
    instagramReturnDocuments,
    offlineReturnDocuments,
    offlinePosReturnTotal: r2(offlinePosReturnTotal),
    offlineSalesReturnTotal: r2(offlineSalesReturnTotal),
    instagramDocs,
    websiteRevenue: r2(websiteRevenue),
    websiteDedupeRevenue: r2(websiteDedupeRevenue),
    totalRevenue: r2(offlineRevenue + instagramRevenue + websiteRevenue),
    offlineOrders,
    instagramOrders,
    websiteOrders: normalisedWebsiteOrders.length,
    posGross, salesGross, posReturnTotal, salesReturnTotal,
    returnDocuments: posReturns.length + salesReturns.length,
    posReturnDocuments: posReturns.length,
    salesReturnDocuments: salesReturns.length,
    posMissingDate: pos.filter((d) => !d.date).length,
    salesMissingDate: 0,
    unresolvedOnlineLines,
    zeroValueSalesInvoices: sales.filter((d) => num(d.netValue) === 0).length,
    websiteDuplicateCount: duplicateOrders.length,
    offlineDocs,
  };
}
