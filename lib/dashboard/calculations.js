/* Pure dashboard arithmetic.

   The route reads documents; this file decides what they add up to. Keeping
   it pure means the figures can be tested without a database, and the same
   rules apply to the current and the comparison window.

   Sales lines are Mixed fields in Mongo and two screens wrote them under
   different names. Every reader here accepts both the proper names and the
   display-label keys, the same convention as lib/reports.js. */

import { enumerateDays, istDayKey, istDateKeyLabel } from './range.js';

export const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const round2 = (value) => {
  const n = num(value);
  if (!n) return 0;
  /* 1.005 * 100 is 100.49999999999999 in binary floating point. Nudging by
     an epsilon in the value's own direction keeps a half-paisa rounding up
     (away from zero) instead of silently down. */
  const epsilon = Math.sign(n) * Number.EPSILON;
  return Math.round((n + epsilon) * 100) / 100;
};

function pick(line, ...keys) {
  for (const key of keys) {
    if (line && line[key] !== undefined && line[key] !== null && line[key] !== '') return line[key];
  }
  return undefined;
}

export function linesOf(doc) {
  return Array.isArray(doc?.items) ? doc.items : [];
}

export function lineName(line) {
  return String(pick(line, 'itemName', 'Item Name', 'name', 'description', 'printDescription') || '').trim();
}

export function lineCode(line) {
  return String(pick(line, 'itemCode', 'Item Code', 'code') || '').trim();
}

export function lineQty(line) {
  return num(pick(line, 'qty', 'Qty', 'QTY', 'quantity'));
}

export function lineRate(line) {
  return num(pick(line, 'rate', 'rsp', 'RSP', 'price', 'Rate'));
}

export function lineDiscountPercent(line) {
  return num(pick(line, 'discountPct', 'discountPercent', 'Disc %', 'disc %'));
}

/* The net of one sales line. `netAmount` is the field the POS normaliser
   writes and the sell screens read; `lineTotal`/`amount` cover older rows.
   Only when none is present do we fall back to rate x qty less discount. */
export function lineAmount(line) {
  const direct = pick(line, 'netAmount', 'lineTotal', 'amount', 'Net Amount', 'netValue');
  if (direct !== undefined) return num(direct);
  const qty = lineQty(line);
  const rate = lineRate(line);
  const discount = lineDiscountPercent(line);
  return round2(qty * rate * (1 - discount / 100));
}

/* Several schemas default a header total to 0, so a present-but-zero field
   must not hide the next one: a return carrying totalAmount 0 and
   refundAmount 200 is a 200 refund, not a zero one. The first non-zero
   header wins; summing the lines is the last resort. */
function amountHeader(doc, ...keys) {
  for (const key of keys) {
    const value = doc?.[key];
    if (value === undefined || value === null || value === '') continue;
    const n = num(value);
    if (n !== 0) return n;
  }
  return null;
}

export function posInvoiceAmount(doc) {
  const header = amountHeader(doc, 'totalAmount');
  if (header !== null) return header;
  return round2(linesOf(doc).reduce((sum, line) => sum + lineAmount(line), 0));
}

export function salesInvoiceAmount(doc) {
  const header = amountHeader(doc, 'netValue', 'totalAmount');
  if (header !== null) return header;
  return round2(linesOf(doc).reduce((sum, line) => sum + lineAmount(line), 0));
}

export function posReturnAmount(doc) {
  const header = amountHeader(doc, 'totalAmount', 'refundAmount');
  if (header !== null) return Math.abs(header);
  return round2(linesOf(doc).reduce((sum, line) => sum + Math.abs(lineAmount(line)), 0));
}

export function salesReturnAmount(doc) {
  const header = amountHeader(doc, 'netValue', 'totalAmount');
  if (header !== null) return Math.abs(header);
  return round2(linesOf(doc).reduce((sum, line) => sum + Math.abs(lineAmount(line)), 0));
}

function dateOf(doc, ...fields) {
  for (const field of fields) {
    const value = doc?.[field];
    if (!value) continue;
    const d = value instanceof Date ? value : new Date(value);
    if (!Number.isNaN(d.getTime())) return d;
  }
  const created = doc?.createdAt ? new Date(doc.createdAt) : null;
  return created && !Number.isNaN(created.getTime()) ? created : null;
}

export function posInvoiceDate(doc) {
  return dateOf(doc, 'date', 'createdAt');
}

export function salesInvoiceDate(doc) {
  return dateOf(doc, 'createdAt');
}

export function posReturnDate(doc) {
  return dateOf(doc, 'date', 'createdAt');
}

export function salesReturnDate(doc) {
  return dateOf(doc, 'returnDate', 'createdAt');
}

export function purchaseDate(doc) {
  return dateOf(doc, 'purchaseDate', 'grcDate', 'createdAt');
}

/* Daily sales and returns. Days with no document are zero, not absent - an
   analytics line that skips a quiet Sunday says something different from one
   that dips to zero on it. */
export function buildDailySeries({
  from,
  to,
  posInvoices = [],
  salesInvoices = [],
  posReturns = [],
  salesReturns = [],
}) {
  const keys = enumerateDays({ from, to });
  const salesByDay = new Map(keys.map((key) => [key, 0]));
  const returnsByDay = new Map(keys.map((key) => [key, 0]));

  const add = (map, doc, amount, dayOf) => {
    const day = dayOf(doc);
    if (!day) return;
    const key = istDayKey(day);
    if (!map.has(key)) return;
    map.set(key, round2(map.get(key) + amount(doc)));
  };

  posInvoices.forEach((doc) => add(salesByDay, doc, posInvoiceAmount, posInvoiceDate));
  salesInvoices.forEach((doc) => add(salesByDay, doc, salesInvoiceAmount, salesInvoiceDate));
  posReturns.forEach((doc) => add(returnsByDay, doc, posReturnAmount, posReturnDate));
  salesReturns.forEach((doc) => add(returnsByDay, doc, salesReturnAmount, salesReturnDate));

  return {
    labels: keys.map(istDateKeyLabel),
    keys,
    sales: keys.map((key) => round2(salesByDay.get(key))),
    returns: keys.map((key) => round2(returnsByDay.get(key))),
  };
}

/* Daily purchases, from purchase invoices when they exist, otherwise from the
   GRCs that have not been converted yet. Mixing both would double-count a GRC
   that already has an invoice. */
export function buildPurchaseSeries({ from, to, purchaseInvoices = [], grcs = [] }) {
  const keys = enumerateDays({ from, to });
  const byDay = new Map(keys.map((key) => [key, 0]));
  const source = purchaseInvoices.length ? purchaseInvoices : grcs;

  source.forEach((doc) => {
    const day = purchaseDate(doc);
    if (!day) return;
    const key = istDayKey(day);
    if (!byDay.has(key)) return;
    const amount = purchaseInvoices.length
      ? (amountHeader(doc, 'netPurchaseAmt', 'totalPayable', 'netValue') ?? 0)
      : (amountHeader(doc, 'netAmount', 'totalAmount', 'taxableValue') ?? 0);
    byDay.set(key, round2(byDay.get(key) + amount));
  });

  return {
    labels: keys.map(istDateKeyLabel),
    keys,
    points: keys.map((key) => round2(byDay.get(key))),
    source: purchaseInvoices.length ? 'Purchase invoices' : 'Goods receipt challans',
  };
}

export function summariseSales({
  posInvoices = [],
  salesInvoices = [],
  posReturns = [],
  salesReturns = [],
}) {
  const posSales = round2(posInvoices.reduce((sum, doc) => sum + posInvoiceAmount(doc), 0));
  const invoiceSales = round2(salesInvoices.reduce((sum, doc) => sum + salesInvoiceAmount(doc), 0));
  const posReturned = round2(posReturns.reduce((sum, doc) => sum + posReturnAmount(doc), 0));
  const invoiceReturned = round2(salesReturns.reduce((sum, doc) => sum + salesReturnAmount(doc), 0));

  const grossSales = round2(posSales + invoiceSales);
  const returns = round2(posReturned + invoiceReturned);
  const netSales = round2(grossSales - returns);
  const orders = posInvoices.length + salesInvoices.length;

  const ids = new Set();
  [...posInvoices, ...salesInvoices].forEach((doc) => {
    const id = doc?.customerId ? String(doc.customerId) : '';
    if (id) ids.add(id);
  });

  const units = round2(
    [...posInvoices, ...salesInvoices]
      .flatMap((doc) => linesOf(doc))
      .reduce((sum, line) => sum + lineQty(line), 0)
  );

  return {
    posSales,
    invoiceSales,
    grossSales,
    returns,
    posReturned,
    invoiceReturned,
    netSales,
    orders,
    units,
    customers: ids.size,
    averageOrderValue: orders ? round2(netSales / orders) : 0,
    channels: [
      {
        key: 'pos',
        label: 'Retail POS',
        sales: posSales,
        returns: posReturned,
        net: round2(posSales - posReturned),
        orders: posInvoices.length,
        share: netSales ? round2((posSales - posReturned) / netSales * 100) : 0,
      },
      {
        key: 'invoice',
        label: 'Sales invoices',
        sales: invoiceSales,
        returns: invoiceReturned,
        net: round2(invoiceSales - invoiceReturned),
        orders: salesInvoices.length,
        share: netSales ? round2((invoiceSales - invoiceReturned) / netSales * 100) : 0,
      },
    ],
  };
}

function paymentBucket(method) {
  const text = String(method || '').trim().toLowerCase();
  if (!text) return 'Other';
  if (/loyal|points/.test(text)) return 'Loyalty';
  if (/upi|phonepe|paytm|gpay|google pay|razorpay|bhim/.test(text)) return 'UPI';
  if (/card|credit card|debit card/.test(text)) return 'Card';
  if (/bank|neft|imps|cheque|deposit/.test(text)) return 'Bank';
  if (/cash/.test(text)) return 'Cash';
  if (/credit|due|pay later/.test(text)) return 'Credit';
  return 'Other';
}

/* What the till actually collected, by rail. `payments` is the Multiple Pay
   breakdown; older bills predate it and kept only `paid` + `billingType`, so
   those fall back to the billing type rather than disappearing from the mix. */
export function paymentMix(posInvoices = []) {
  const totals = new Map();
  const add = (bucket, amount) => {
    if (!amount) return;
    totals.set(bucket, round2((totals.get(bucket) || 0) + amount));
  };

  posInvoices.forEach((doc) => {
    const rows = Array.isArray(doc.payments) ? doc.payments : [];
    const paidRows = rows.filter((row) => num(row?.amount) > 0);
    if (paidRows.length) {
      paidRows.forEach((row) => add(paymentBucket(row.method), num(row.amount)));
      return;
    }
    /* An unpaid bill collected nothing. Only when the field is absent
       altogether (older rows) is the invoice total a safe fallback; treating
       an explicit paid: 0 as the total would count money that never arrived. */
    const paid = pick(doc, 'paid', 'Paid');
    const fallback = paid !== undefined ? num(paid) : posInvoiceAmount(doc);
    if (fallback) add(paymentBucket(doc.billingType), fallback);
  });

  const order = ['Cash', 'UPI', 'Card', 'Bank', 'Loyalty', 'Credit', 'Other'];
  const total = round2([...totals.values()].reduce((sum, value) => sum + value, 0));
  return order
    .filter((label) => totals.has(label))
    .map((label) => ({
      label,
      value: round2(totals.get(label)),
      share: total ? round2((totals.get(label) / total) * 100) : 0,
    }));
}

/* Best sellers by revenue. A product is keyed by item id when the line has
   one, otherwise by code, otherwise by name - the same three keys the ERP
   uses to identify a unit on a bill. */
export function topProducts(posInvoices = [], salesInvoices = [], limit = 8) {
  const acc = new Map();

  const addDoc = (doc) => {
    linesOf(doc).forEach((line) => {
      const name = lineName(line);
      const code = lineCode(line);
      const itemId = line.itemId ? String(line.itemId) : '';
      const key = itemId || code || name;
      if (!key) return;
      if (!acc.has(key)) acc.set(key, { key, name: name || code || 'Unnamed item', code, qty: 0, revenue: 0, lines: 0 });
      const row = acc.get(key);
      row.qty = round2(row.qty + lineQty(line));
      row.revenue = round2(row.revenue + lineAmount(line));
      row.lines += 1;
      if (!row.name && name) row.name = name;
      if (!row.code && code) row.code = code;
    });
  };

  posInvoices.forEach(addDoc);
  salesInvoices.forEach(addDoc);

  return [...acc.values()]
    .sort((a, b) => b.revenue - a.revenue || b.qty - a.qty || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/* Inventory groups arrive pre-aggregated from Mongo (one row per item, with
   qty and cost value). Keeping the summary here means the low-stock rule is
   testable and the route does not hide it inside a pipeline. */
export function summariseStock(rows = [], { lowStockThreshold = 5, limit = 8 } = {}) {
  const clean = (rows || []).map((row) => ({
    name: row.name || row.itemName || row.code || row.itemCode || 'Unnamed item',
    code: row.code || row.itemCode || '',
    qty: round2(row.qty),
    value: round2(row.value),
  }));

  const units = round2(clean.reduce((sum, row) => sum + row.qty, 0));
  const value = round2(clean.reduce((sum, row) => sum + row.value, 0));
  const low = clean
    .filter((row) => row.qty > 0 && row.qty <= lowStockThreshold)
    .sort((a, b) => a.qty - b.qty || a.name.localeCompare(b.name));
  const out = clean
    .filter((row) => row.qty <= 0)
    .sort((a, b) => a.name.localeCompare(b.name));

  return {
    items: clean.length,
    units,
    value,
    lowStockThreshold,
    lowStock: low.slice(0, limit),
    lowStockCount: low.length,
    outOfStock: out.slice(0, limit),
    outOfStockCount: out.length,
  };
}

/* A change against a zero base is not a percentage - it is "new". Returning
   null keeps the UI from printing an infinite or invented 100% jump. */
export function changePercent(current, previous) {
  const before = num(previous);
  if (before === 0) return null;
  return round2(((num(current) - before) / Math.abs(before)) * 100);
}

export function changeLabel(current, previous) {
  const change = changePercent(current, previous);
  if (change !== null) return `${change > 0 ? '+' : ''}${change.toFixed(1)}%`;
  if (num(current) > 0) return 'New';
  return 'No change';
}

export function shareOf(value, total) {
  const whole = num(total);
  return whole ? round2((num(value) / whole) * 100) : 0;
}
