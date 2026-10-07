import { isValidObjectId } from 'mongoose';
import Ledger from '@/models/Ledger';
import LedgerGroup from '@/models/LedgerGroup';
import SalesInvoice from '@/models/SalesInvoice';
import SalesReturn from '@/models/SalesReturn';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import { BarcodeLabel } from '@/lib/barcodeLabel';

/* ==========================================================================
   Shared primitives for the report routes.

   Every report has its own route under app/api/reports/<slug>/, the way every
   other screen in this project owns its own REST route. What lives here is
   only what more than one of them needs - scope parsing, the date range, the
   line-item readers and the ledger classification - so the routes stay
   readable without a registry deciding which one runs.

   Plain module, no session handling: each route calls requireSession() first,
   the same as the other 141 routes.
   ========================================================================== */

export const json = (d, s = 200) => Response.json(d, { status: s });

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v) => Math.round(num(v) * 100) / 100;

/* --------------------------------------------------------------- scope --- */

/* Ids arrive from the request rather than the session - the project-wide
   convention, matched here rather than diverging on one module. */
export function scopeOf(sp) {
  const b = sp.get('business');
  const l = sp.get('location');
  return {
    businessId: b && isValidObjectId(b) ? b : null,
    locationId: l && isValidObjectId(l) ? l : null,
    finYear: sp.get('finYear') || '',
  };
}

export function scopeFilter({ businessId, locationId, finYear }) {
  const f = {};
  if (businessId) f.businessId = businessId;
  if (locationId) f.locationId = locationId;
  if (finYear) f.finYear = finYear;
  return f;
}

/* `toDate` is inclusive of the whole day, which is what a person picking a
   date on a filter card means by it. */
export function dateRange(sp, field) {
  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  if (!from && !to) return {};
  const r = {};
  if (from) r.$gte = new Date(from);
  if (to) r.$lte = new Date(to + 'T23:59:59.999');
  return { [field]: r };
}

export function pageOf(sp) {
  return {
    page: Math.max(1, Number(sp.get('page') || 1)),
    perPage: Math.min(500, Number(sp.get('perPage') || 15)),
  };
}

export const paged = (rows, page, perPage) => ({
  rows: rows.slice((page - 1) * perPage, page * perPage),
  total: rows.length,
  pages: Math.max(1, Math.ceil(rows.length / perPage)),
});

/* ---------------------------------------------------------- line items --- */

/* Line items are stored as Mixed, and the generic Sell screens key them by
   column heading ('Item Code') while the bespoke ones use proper names
   (itemCode). Reading both means a report does not depend on which screen
   wrote the document. */
const pick = (line, ...keys) => {
  for (const k of keys) {
    if (line?.[k] !== undefined && line[k] !== null && line[k] !== '') return line[k];
  }
  return undefined;
};

export const linesOf = (d) => (Array.isArray(d?.items) ? d.items : []);
export const lineItemCode = (l) => String(pick(l, 'itemCode', 'Item Code') ?? '').trim();
export const lineItemName = (l) => String(pick(l, 'itemName', 'Item Name') ?? '').trim();
export const lineQty = (l) => num(pick(l, 'qty', 'QTY', 'Qty'));
export const lineNet = (l) => num(pick(l, 'netAmount', 'Net Amount', 'beforeTax', 'Before Tax'));
export const lineTax = (l) =>
  num(pick(l, 'igstAmount', 'IGST Amount'))
  + num(pick(l, 'cgstAmount', 'CGST Amount'))
  + num(pick(l, 'sgstAmount', 'SGST Amount'));

/* ==========================================================================
   Bank / Cash / UPI classification.

   A voucher line names a ledger, not a payment rail, so the bucket is read
   from the ledger's own name first and then from its group chain - "HDFC
   Bank" under "Bank Accounts" is a bank, "PhonePe" under the same group is
   UPI. UPI is tested first because it is the most specific.

   Uses the same cycle-safe parent walk as /api/voucher/ledgers.
   ========================================================================== */
export function bucketFor(text) {
  const s = String(text || '').toLowerCase();
  if (/\bupi\b|phonepe|paytm|gpay|google pay|bhim|razorpay/.test(s)) return 'upi';
  if (/\bcash\b|petty/.test(s)) return 'cash';
  return 'bank';
}

export async function ledgerBuckets(ledgerIds, businessId) {
  const ids = [...new Set(
    ledgerIds.filter((id) => id && isValidObjectId(String(id))).map(String)
  )];
  if (!ids.length) return new Map();

  const [ledgers, groups] = await Promise.all([
    Ledger.find({ _id: { $in: ids } }).select('name ledgerGroupId').lean(),
    LedgerGroup.find(businessId ? { businessId } : {})
      .select('_id groupName parentGroupId').lean(),
  ]);

  const groupById = new Map(groups.map((g) => [String(g._id), g]));

  /* every ancestor group name for a ledger, nearest first */
  const chain = (groupId) => {
    const names = [];
    const seen = new Set();
    let cur = groupId ? groupById.get(String(groupId)) : null;
    while (cur && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      names.push(cur.groupName || '');
      cur = cur.parentGroupId ? groupById.get(String(cur.parentGroupId)) : null;
    }
    return names;
  };

  return new Map(ledgers.map((l) => [
    String(l._id),
    bucketFor([l.name, ...chain(l.ledgerGroupId)].join(' ')),
  ]));
}

/* ==========================================================================
   The sales side, shared by Sales Analysis and Sales Report.

   Sales value comes from invoices, return value from returns, and net is the
   difference. POS is included because a till sale is a sale - it simply has
   nothing to contribute until the till starts posting.

   Each source is dated by its own field: SalesInvoice carries no date of its
   own, so createdAt stands in, exactly as /api/ledger-transaction does.
   ========================================================================== */
export async function salesDocuments(sp, scope) {
  const base = scopeFilter(scope);

  const [invoices, returns, pos, posReturns] = await Promise.all([
    SalesInvoice.find({ ...base, ...dateRange(sp, 'createdAt') }).limit(5000).lean(),
    SalesReturn.find({ ...base, ...dateRange(sp, 'returnDate') }).limit(5000).lean(),
    PosInvoice.find({ ...base, ...dateRange(sp, 'date') }).limit(5000).lean(),
    PosReturn.find({ ...base, ...dateRange(sp, 'date') }).limit(5000).lean(),
  ]);

  return { sales: [...invoices, ...pos], returns: [...returns, ...posReturns] };
}

/* A document's value and quantity, preferring the stored header total and
   falling back to summing its lines - Credit Note and Sales Return carry no
   header total, the same fallback /api/ledger-transaction makes. */
export const docValue = (d) => r2(
  num(d.netValue) || num(d.totalAmount)
  || linesOf(d).reduce((a, l) => a + lineNet(l), 0)
);
export const docQty = (d) => r2(
  num(d.totalQty) || linesOf(d).reduce((a, l) => a + lineQty(l), 0)
);

/* ==========================================================================
   Cost per item code.

   BarcodeLabel is the only place this project records what an item was
   actually bought at, so it is the only possible source of cost and profit.
   Averaged, so one item received at two rates does not depend on which
   barcode row is found first.
   ========================================================================== */
export async function costByItemCode(codes, businessId) {
  const list = [...new Set(codes.filter(Boolean))];
  if (!list.length) return new Map();

  const filter = { itemCode: { $in: list } };
  if (businessId) filter.businessId = String(businessId);

  const rows = await BarcodeLabel.find(filter).select('itemCode purRate finalNet').lean();

  const acc = new Map();
  rows.forEach((r) => {
    const code = String(r.itemCode || '');
    const rate = num(r.finalNet) || num(r.purRate);
    if (!code || !rate) return;
    const cur = acc.get(code) || { sum: 0, n: 0 };
    cur.sum += rate;
    cur.n += 1;
    acc.set(code, cur);
  });

  return new Map([...acc].map(([code, { sum, n }]) => [code, r2(sum / n)]));
}
