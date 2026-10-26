/* Server-side dashboard analytics.

   Reads the ERP's existing sales, returns, purchases and stock collections.
   Nothing is duplicated into a dashboard-only collection: a figure here is a
   query over the same documents the transaction screens write.

   Every sales total is gross invoices less returns. POS is included alongside
   sales invoices because a till sale is a sale. Purchase value comes from
   purchase invoices, falling back to GRCs only when no invoice exists for the
   business - mixing the two would count a converted GRC twice. */

import { Types } from 'mongoose';
import PosInvoice from '@/models/PosInvoice';
import SalesInvoice from '@/models/SalesInvoice';
import PosReturn from '@/models/PosReturn';
import SalesReturn from '@/models/SalesReturn';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Grc from '@/models/Grc';
import WebsiteEvent from '@/models/WebsiteEvent';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { stockFilter, transactionFilter, websiteEventFilter } from './access';
import {
  buildDailySeries,
  buildPurchaseSeries,
  changePercent,
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
  summariseStock,
  topProducts,
} from './calculations';

function scopedPipeline(Model, dateExpression, filter, range, project) {
  return Model.aggregate([
    { $match: filter },
    { $addFields: { _dashboardDate: dateExpression } },
    { $match: { _dashboardDate: { $gte: range.from, $lte: range.to } } },
    { $project: { ...project, date: '$_dashboardDate' } },
  ]);
}

async function salesDocuments(scope, range) {
  const filter = transactionFilter(scope);

  const [pos, invoices, posReturns, salesReturns] = await Promise.all([
    scopedPipeline(PosInvoice, { $ifNull: ['$date', '$createdAt'] }, filter, range, {
      invoiceNo: 1,
      totalAmount: 1,
      paid: 1,
      sellDue: 1,
      billingType: 1,
      paymentStatus: 1,
      payments: 1,
      items: 1,
      customerId: 1,
      customerContact: 1,
      customerSnapshot: 1,
      createdAt: 1,
    }),
    scopedPipeline(SalesInvoice, '$createdAt', filter, range, {
      salesInvoiceNo: 1,
      netValue: 1,
      items: 1,
      customerId: 1,
      customerMobile: 1,
      createdAt: 1,
    }),
    scopedPipeline(PosReturn, { $ifNull: ['$date', '$createdAt'] }, filter, range, {
      invoiceNo: 1,
      totalAmount: 1,
      refundAmount: 1,
      items: 1,
      customerName: 1,
      customerContact: 1,
      createdAt: 1,
    }),
    scopedPipeline(SalesReturn, { $ifNull: ['$returnDate', '$createdAt'] }, filter, range, {
      salesReturnNo: 1,
      netValue: 1,
      totalAmount: 1,
      items: 1,
      customerId: 1,
      createdAt: 1,
    }),
  ]);

  return { pos, invoices, posReturns, salesReturns };
}

async function purchaseDocuments(scope, range) {
  const filter = transactionFilter(scope);
  const [invoices, grcs] = await Promise.all([
    scopedPipeline(PurchaseInvoice, { $ifNull: ['$purchaseDate', '$createdAt'] }, filter, range, {
      purchaseInvoiceNo: 1,
      netPurchaseAmt: 1,
      totalPayable: 1,
      purchaseDate: 1,
      createdAt: 1,
    }),
    scopedPipeline(Grc, { $ifNull: ['$grcDate', '$createdAt'] }, filter, range, {
      grcNumber: 1,
      netAmount: 1,
      totalAmount: 1,
      taxableValue: 1,
      grcDate: 1,
      createdAt: 1,
    }),
  ]);
  return { invoices, grcs };
}

async function stockGroups(scope) {
  return BarcodeLabel.aggregate([
    { $match: stockFilter(scope) },
    {
      $addFields: {
        _qty: {
          $convert: {
            input: { $ifNull: ['$qtyNum', 1] },
            to: 'double',
            onError: 1,
            onNull: 1,
          },
        },
        _rate: {
          $convert: {
            input: { $ifNull: ['$finalNet', '$purRate'] },
            to: 'double',
            onError: 0,
            onNull: 0,
          },
        },
      },
    },
    {
      $group: {
        _id: {
          $ifNull: [
            '$itemId',
            { $concat: [{ $ifNull: ['$itemCode', ''] }, ':', { $ifNull: ['$itemName', ''] }] },
          ],
        },
        name: { $first: '$itemName' },
        code: { $first: '$itemCode' },
        qty: { $sum: '$_qty' },
        value: { $sum: { $multiply: ['$_qty', '$_rate'] } },
      },
    },
    { $sort: { qty: 1 } },
    { $limit: 5000 },
  ]);
}

/* Website tracking is optional. `installed` means an event has EVER been
   accepted; `events`/`purchases`/`revenue` are the current period. With no
   tracking, those are null rather than 0 so the dashboard can say "not
   connected" instead of claiming the site made no sales. */
async function websiteSummary(scope, range) {
  const base = {
    ...websiteEventFilter(scope),
    isBot: { $ne: true },
    isInternal: { $ne: true },
  };
  const inRange = { ...base, occurredAt: { $gte: range.from, $lte: range.to } };

  const [latest, first, aggregate] = await Promise.all([
    WebsiteEvent.findOne(base).sort({ occurredAt: -1 }).select('occurredAt').lean(),
    WebsiteEvent.findOne(base).sort({ occurredAt: 1 }).select('occurredAt').lean(),
    WebsiteEvent.aggregate([
      { $match: inRange },
      {
        $group: {
          _id: null,
          events: { $sum: 1 },
          purchases: { $sum: { $cond: [{ $eq: ['$type', 'purchase'] }, 1, 0] } },
          revenue: {
            $sum: {
              $cond: [
                { $eq: ['$type', 'purchase'] },
                { $ifNull: ['$value', 0] },
                0,
              ],
            },
          },
        },
      },
    ]),
  ]);

  const installed = Boolean(latest);
  const row = aggregate[0] || null;
  return {
    installed,
    firstEventAt: first?.occurredAt ? new Date(first.occurredAt).toISOString() : null,
    lastEventAt: latest?.occurredAt ? new Date(latest.occurredAt).toISOString() : null,
    events: installed ? (row?.events || 0) : null,
    purchases: installed ? (row?.purchases || 0) : null,
    revenue: installed ? round2(row?.revenue || 0) : null,
    hasRangeData: installed ? Boolean(row?.events) : false,
  };
}

function partyOfPos(doc) {
  const snap = doc.customerSnapshot || {};
  const person = [snap.firstName, snap.middleName, snap.lastName].filter(Boolean).join(' ').trim();
  return snap.businessName || person || doc.customerContact || 'Walk-in customer';
}

function recentActivity({ pos, invoices, posReturns, salesReturns }) {
  const rows = [];

  pos.forEach((doc) => {
    rows.push({
      key: `pos-${doc._id}`,
      type: 'POS sale',
      kind: 'sale',
      no: doc.invoiceNo || '-',
      party: partyOfPos(doc),
      amount: posInvoiceAmount(doc),
      status: doc.paymentStatus || (Number(doc.sellDue) > 0 ? 'Due' : 'Paid'),
      date: (posInvoiceDate(doc) || new Date()).toISOString(),
      href: `/admin/transaction/sell/pos/view/${doc._id}`,
    });
  });

  invoices.forEach((doc) => {
    rows.push({
      key: `invoice-${doc._id}`,
      type: 'Sales invoice',
      kind: 'invoice',
      no: doc.salesInvoiceNo || '-',
      party: doc.customerMobile || 'Customer',
      amount: salesInvoiceAmount(doc),
      status: 'Invoiced',
      date: (salesInvoiceDate(doc) || new Date()).toISOString(),
      href: `/admin/transaction/sell/salesinvoice/${doc._id}`,
    });
  });

  posReturns.forEach((doc) => {
    rows.push({
      key: `pos-return-${doc._id}`,
      type: 'POS return',
      kind: 'return',
      no: doc.invoiceNo || '-',
      party: doc.customerName || doc.customerContact || 'Customer',
      amount: posReturnAmount(doc),
      status: doc.paymentStatus || 'Refunded',
      date: (posReturnDate(doc) || new Date()).toISOString(),
      href: '/admin/transaction/sell/pos-return',
    });
  });

  salesReturns.forEach((doc) => {
    rows.push({
      key: `sales-return-${doc._id}`,
      type: 'Sales return',
      kind: 'return',
      no: doc.salesReturnNo || '-',
      party: 'Customer',
      amount: salesReturnAmount(doc),
      status: 'Returned',
      date: (salesReturnDate(doc) || new Date()).toISOString(),
      href: `/admin/transaction/sell/salereturn/${doc._id}`,
    });
  });

  return rows
    .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
    .slice(0, 8);
}

function metric(value, previous, { isCount = false } = {}) {
  const current = isCount ? Number(value || 0) : round2(value);
  const before = isCount ? Number(previous || 0) : round2(previous);
  return { value: current, previous: before, change: changePercent(current, before) };
}

export async function getDashboardAnalytics(scope, range) {
  const [currentSales, previousSales, currentPurchases, stock, website] = await Promise.all([
    salesDocuments(scope, range),
    salesDocuments(scope, { from: range.previousFrom, to: range.previousTo }),
    purchaseDocuments(scope, range),
    stockGroups(scope),
    websiteSummary(scope, range),
  ]);

  const current = summariseSales(currentSales);
  const previous = summariseSales(previousSales);
  const inventory = summariseStock(stock);
  const daily = buildDailySeries({
    from: range.from,
    to: range.to,
    posInvoices: currentSales.pos,
    salesInvoices: currentSales.invoices,
    posReturns: currentSales.posReturns,
    salesReturns: currentSales.salesReturns,
  });
  const purchaseSeries = buildPurchaseSeries({
    from: range.from,
    to: range.to,
    purchaseInvoices: currentPurchases.invoices,
    grcs: currentPurchases.grcs,
  });

  const purchaseValue = purchaseSeries.points.reduce((sum, value) => sum + value, 0);
  const hasSales = current.orders > 0 || current.returns > 0;
  const notes = [];
  if (!currentPurchases.invoices.length && currentPurchases.grcs.length) {
    notes.push('Purchases are valued from GRCs because no purchase invoice was found for this period.');
  }
  if (!inventory.items) {
    notes.push('No barcode stock rows are available for this scope, so inventory value is not included.');
  }
  if (website.installed) {
    notes.push('Website revenue is tracked by the storefront tag and is shown separately from ERP sales; it is not added to net sales.');
  }

  const rangeInfo = {
    preset: range.preset,
    label: range.label,
    fromKey: range.fromKey,
    toKey: range.toKey,
    days: range.days,
    previousLabel: range.previousLabel,
    previousFromKey: range.previousFromKey,
    previousToKey: range.previousToKey,
  };

  return {
    generatedAt: new Date().toISOString(),
    range: rangeInfo,
    kpis: {
      netSales: metric(current.netSales, previous.netSales),
      grossSales: metric(current.grossSales, previous.grossSales),
      returns: metric(current.returns, previous.returns),
      orders: metric(current.orders, previous.orders, { isCount: true }),
      averageOrderValue: metric(current.averageOrderValue, previous.averageOrderValue),
      customers: metric(current.customers, previous.customers, { isCount: true }),
      units: metric(current.units, previous.units),
      inventoryValue: {
        value: inventory.value,
        units: inventory.units,
        items: inventory.items,
        lowStockCount: inventory.lowStockCount,
        outOfStockCount: inventory.outOfStockCount,
      },
    },
    salesTrend: {
      labels: daily.labels,
      series: [
        { name: 'Sales', points: daily.sales },
        { name: 'Returns', points: daily.returns },
      ],
    },
    purchaseTrend: {
      labels: purchaseSeries.labels,
      series: [{ name: 'Purchases', points: purchaseSeries.points }],
      source: purchaseSeries.source,
      total: round2(purchaseValue),
    },
    channels: current.channels,
    payments: paymentMix(currentSales.pos),
    topProducts: topProducts(currentSales.pos, currentSales.invoices, 8),
    inventory,
    recent: recentActivity(currentSales),
    website,
    dataState: {
      hasSales,
      hasPurchases: purchaseSeries.points.some((value) => value > 0),
      hasStock: inventory.items > 0,
      hasWebsiteData: website.hasRangeData,
      source: purchaseSeries.source,
    },
    notes,
  };
}

/* Kept for callers that only need the ObjectId conversion in a pipeline. */
export const toObjectId = (value) => (value ? new Types.ObjectId(String(value)) : null);
