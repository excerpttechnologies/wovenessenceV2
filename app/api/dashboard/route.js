import mongoose, { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Grc from '@/models/Grc';
import SalesInvoice from '@/models/SalesInvoice';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import DebitNote from '@/models/DebitNote';
import CreditNote from '@/models/CreditNote';
import SalesReturn from '@/models/SalesReturn';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Voucher from '@/models/Voucher';
import Ledger from '@/models/Ledger';
import LedgerGroup from '@/models/LedgerGroup';
import Business from '@/models/Business';

/* ==========================================================================
   Dashboard aggregates.

   DYNAMIC (computed from stored data):
     Total Purchase  - count of Goods Receipt Challans. GRC's add screen is
                       header-only in the original, so no amount is captured
                       yet; this is a document count, not a value.
     Total Sales     - sum of sales invoice netValue + POS invoice totalAmount
     Expenses        - expense ledgers: opening balance plus what vouchers
                       have posted to them (debit - credit) in scope
     Both charts     - sales invoices grouped by day (last 30) and by month
                       (financial year), split into two series by business
     Purchase Due    - what suppliers are owed: purchase invoices less the
                       debit notes raised against them
     Invoice Due     - what customers and other branches owe: sales invoices
                       + POS outstanding + inter company invoices, less credit
                       notes, sales returns and POS returns

   ABOUT THE TWO "DUE" TILES
     Now that the Voucher module posts settlements, these are real balances:
     what was invoiced, less what has been returned AND less what has actually
     been paid or received.

       Purchase Due = purchase invoices - debit notes - payment vouchers
       Invoice Due  = sales + POS outstanding + inter company
                      - credit notes - returns - receipt vouchers

     Contra vouchers are excluded on purpose: moving money between your own
     bank and cash accounts settles nothing with a supplier or a customer.

     Both are floored at zero. Over-paying a supplier is a debit balance in
     their favour, not a negative payable, and a Due tile is not the place to
     surface it - the party's ledger is.

   Scope is applied per collection: ledgers aren't FY-scoped, so applying a
   finYear filter to them matches nothing and silently reads zero.
   ========================================================================== */

const json = (d, s = 200) => Response.json(d, { status: s });

const r2 = (n) => Number((Number(n) || 0).toFixed(2));

function fyRange(finYear) {
  /* Indian FY: 1 April -> 31 March */
  const [a] = String(finYear || '').split('-');
  const start = Number(a) || new Date().getFullYear();
  return { from: new Date(start, 3, 1), to: new Date(start + 1, 2, 31, 23, 59, 59) };
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const businessRaw = sp.get('business');
  const locationRaw = sp.get('location');
  /* MUST be real ObjectIds, not strings: find()/countDocuments() cast against
     the schema, but aggregate() does NOT - a string businessId in a $match
     silently matches nothing, which is what zeroed out Total Sales. */
  const oid = (v) => (v && isValidObjectId(v) ? new mongoose.Types.ObjectId(v) : null);
  const business = oid(businessRaw);
  const location = oid(locationRaw);
  const finYear = sp.get('finYear') || '';

  await dbConnect();

  /* transaction docs carry business + location + finYear */
  const txScope = {
    ...(business ? { businessId: business } : {}),
    ...(location ? { locationId: location } : {}),
    ...(finYear ? { finYear } : {}),
  };
  /* ledgers carry business only */
  const ledgerScope = business ? { businessId: business } : {};

  const sum = async (Model, match, field) => {
    const r = await Model.aggregate([
      { $match: match },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$' + field, 0] } } } },
    ]);
    return r.length ? r[0].total : 0;
  };

  /* Credit Note and Sales Return carry no total on the header - only line
     items - so their value has to come off the lines. $sum ignores anything
     non-numeric, so a line saved without the field contributes nothing
     rather than breaking the pipeline. */
  const sumLines = async (Model, match, field = 'netAmount') => {
    const r = await Model.aggregate([
      { $match: match },
      { $unwind: { path: '$items', preserveNullAndEmptyArrays: false } },
      { $group: { _id: null, total: { $sum: { $ifNull: ['$items.' + field, 0] } } } },
    ]);
    return r.length ? r[0].total : 0;
  };

  /* ---------------------------------------------------------------- tiles */
  const totalPurchaseCount = await Grc.countDocuments(txScope);
  const salesInvoiceTotal = await sum(SalesInvoice, txScope, 'netValue');
  const posTotal = await sum(PosInvoice, txScope, 'totalAmount');

  /* ------------------------------------------------------------- due tiles */
  const [
    purchaseInvoiced, debitNoted,
    posOutstanding, posReturned, icInvoiced, creditNoted, salesReturned,
    paymentsMade, receiptsTaken,
  ] = await Promise.all([
    sum(PurchaseInvoice, txScope, 'totalPayable'),
    sum(DebitNote, txScope, 'value'),
    /* POS records what is still owed on the sale itself, so this one field
       is the outstanding amount - not the whole ticket */
    sum(PosInvoice, txScope, 'sellDue'),
    sum(PosReturn, txScope, 'totalAmount'),
    /* an inter company invoice is genuinely receivable from the destination
       branch, so it belongs here the same way it does on Ledger Transaction */
    sum(IcSalesInvoice, txScope, 'netValue'),
    sumLines(CreditNote, txScope),
    sumLines(SalesReturn, txScope),
    /* settlement - what has actually been paid and received */
    sum(Voucher, { ...txScope, type: 'Payment' }, 'totalAmount'),
    sum(Voucher, { ...txScope, type: 'Receipt' }, 'totalAmount'),
  ]);

  const purchaseDue = Math.max(0, r2(purchaseInvoiced - debitNoted - paymentsMade));
  const invoiceDue = Math.max(
    0,
    r2(salesInvoiceTotal + posOutstanding + icInvoiced
      - creditNoted - salesReturned - posReturned - receiptsTaken)
  );

  /* Expenses: every ledger under an expense group, valued at its opening
     balance plus what vouchers have posted to it in scope (debit - credit).
     A Payment voucher that debits Rent or Electricity lands here.

     "An expense group" is any group with EXPENS in its name whose top-level
     ancestor is NOT an asset or liability head - so Preliminary Expenses
     (an asset) and Sundry Creditors for Expenses (a liability) stay out,
     while EXPENSES and TRADING EXPENSES come in with their sub-groups. */
  let expenses = 0;
  const groups = await LedgerGroup.find(ledgerScope).select('_id groupName parentGroupId').lean();
  const byId = new Map(groups.map((g) => [String(g._id), g]));
  const byParent = new Map();
  groups.forEach((g) => {
    const key = String(g.parentGroupId || 'root');
    if (!byParent.has(key)) byParent.set(key, []);
    byParent.get(key).push(g);
  });
  const topOf = (g) => {
    const seen = new Set();
    let cur = g;
    while (cur.parentGroupId && byId.has(String(cur.parentGroupId)) && !seen.has(String(cur._id))) {
      seen.add(String(cur._id));
      cur = byId.get(String(cur.parentGroupId));
    }
    return String(cur.groupName || '');
  };
  const roots = groups.filter(
    (g) => /expens/i.test(String(g.groupName || '')) && !/asset|liabilit/i.test(topOf(g))
  );
  const ids = [];
  const seenIds = new Set();
  const walk = (g) => {
    if (seenIds.has(String(g._id))) return;   /* a cycle in the tree must not hang this */
    seenIds.add(String(g._id));
    ids.push(g._id);
    (byParent.get(String(g._id)) || []).forEach(walk);
  };
  roots.forEach(walk);
  if (ids.length) {
    const expenseLedgers = await Ledger.find({ ...ledgerScope, ledgerGroupId: { $in: ids } })
      .select('_id openingBalance').lean();
    if (expenseLedgers.length) {
      const opening = expenseLedgers.reduce((a, l) => a + (Number(l.openingBalance) || 0), 0);
      const posted = await Voucher.aggregate([
        { $match: txScope },
        { $unwind: '$lines' },
        { $match: { 'lines.ledgerId': { $in: expenseLedgers.map((l) => l._id) } } },
        {
          $group: {
            _id: null,
            debit: { $sum: { $ifNull: ['$lines.debit', 0] } },
            credit: { $sum: { $ifNull: ['$lines.credit', 0] } },
          },
        },
      ]);
      const movement = posted.length ? posted[0].debit - posted[0].credit : 0;
      expenses = Math.max(0, opening + movement);
    }
  }

  /* --------------------------------------------------------------- charts */
  /* Same sources as the Total Sales tile - sales invoices AND POS invoices -
     so the charts and the tile agree. Most sales here are POS, which the
     charts used to leave out, so they drew a flat zero line.

     A POS invoice is dated by its own bill date (falling back to when it was
     saved); a sales invoice carries no date field, so createdAt is its date.
     Days and months are cut in Indian time, not UTC, or a sale rung up
     before 5:30 am lands on the previous day.

     Series follow the scope: the selected company gets one line; with no
     company selected, each company that has sales gets its own. */
  const TZ = 'Asia/Kolkata';
  const chartScope = {
    ...(business ? { businessId: business } : {}),
    ...(location ? { locationId: location } : {}),
  };

  const dayKey = (d) => d.toLocaleDateString('en-CA', { timeZone: TZ }); /* YYYY-MM-DD */
  const dayLabels = [];
  for (let i = 29; i >= 0; i -= 1) {
    dayLabels.push(dayKey(new Date(Date.now() - i * 86400000)));
  }
  const from30 = new Date(Date.now() - 31 * 86400000); /* a day of slack; the keys do the exact cut */

  const { from, to } = fyRange(finYear);

  const bucket = (Model, dateExpr, amountField, groupBy, range) => Model.aggregate([
    { $match: chartScope },
    { $addFields: { _d: dateExpr } },
    { $match: { _d: { $gte: range.from, ...(range.to ? { $lte: range.to } : {}) } } },
    {
      $group: {
        _id: { businessId: '$businessId', key: groupBy('$_d') },
        total: { $sum: { $ifNull: ['$' + amountField, 0] } },
      },
    },
  ]);

  const byDay = (d) => ({ $dateToString: { format: '%Y-%m-%d', date: d, timezone: TZ } });
  const byMon = (d) => ({ $month: { date: d, timezone: TZ } });
  const posDate = { $ifNull: ['$date', '$createdAt'] };

  const [siDay, posDay, siMon, posMon] = await Promise.all([
    bucket(SalesInvoice, '$createdAt', 'netValue', byDay, { from: from30 }),
    bucket(PosInvoice, posDate, 'totalAmount', byDay, { from: from30 }),
    bucket(SalesInvoice, '$createdAt', 'netValue', byMon, { from, to }),
    bucket(PosInvoice, posDate, 'totalAmount', byMon, { from, to }),
  ]);
  const last30Raw = [...siDay, ...posDay];
  const byMonthRaw = [...siMon, ...posMon];

  /* which companies get a line */
  const withSales = new Set([...last30Raw, ...byMonthRaw].map((r) => String(r._id.businessId)));
  const businesses = business
    ? await Business.find({ _id: business }).lean()
    : (await Business.find({}).lean()).filter((b) => withSales.has(String(b._id)));
  const seriesNames = businesses.map((b) => b.name || 'Business');

  const toSeries = (raw, labels) =>
    businesses.map((b) =>
      labels.map((l) => {
        const total = raw
          .filter((r) => String(r._id.businessId) === String(b._id) && String(r._id.key) === String(l))
          .reduce((a, r) => a + (Number(r.total) || 0), 0);
        return Number(total.toFixed(2));
      })
    );

  const monthLabels = [4, 5, 6, 7, 8, 9, 10, 11, 12, 1, 2, 3];
  const MONTH_NAMES = ['', 'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

  return json({
    tiles: {
      totalPurchase: { value: totalPurchaseCount, dynamic: true, note: 'GRC count' },
      totalSales: { value: Number((salesInvoiceTotal + posTotal).toFixed(2)), dynamic: true },
      purchaseDue: { value: purchaseDue, dynamic: true, note: 'less notes & payments' },
      invoiceDue: { value: invoiceDue, dynamic: true, note: 'less returns & receipts' },
      expenses: { value: Number(expenses.toFixed(2)), dynamic: true },
    },
    last30: {
      labels: dayLabels.map((d) => d.slice(8)),
      series: toSeries(last30Raw, dayLabels).map((points, i) => ({
        name: seriesNames[i] || 'Business ' + (i + 1), points,
      })),
    },
    byMonth: {
      labels: monthLabels.map((m) => MONTH_NAMES[m]),
      series: toSeries(byMonthRaw, monthLabels).map((points, i) => ({
        name: seriesNames[i] || 'Business ' + (i + 1), points,
      })),
    },
  });
}
