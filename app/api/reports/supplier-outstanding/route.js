import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Grc from '@/models/Grc';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import DebitNote from '@/models/DebitNote';
import { Supplier } from '@/lib/contacts';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf,
} from '@/lib/reports';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/reports/supplier-outstanding - read-only.

   What you still owe each supplier, and the documents behind it.

     Total Due = purchase documents - debit notes

   WHERE THE PAYABLE COMES FROM

   A GRC IS the purchase document in this ERP - goods receipt, priced, with the
   vendor, the bill number and a net amount. A Purchase Invoice is the
   downstream document made FROM a GRC, and Grc.purchaseInvoiceId records that
   link. So the payables here are:

     every GRC that has not been converted   (purchaseInvoiceId == null)
   + every Purchase Invoice                  (the converted ones)

   Counting both sides unconditionally is how a bill ends up owed twice; the
   purchaseInvoiceId test is what keeps it once. A debit note is goods sent
   back, so it reduces what is owed.

   PAYMENTS ARE NOT NETTED OFF, and "Paid / Adjusted" is therefore 0 on every
   row: this database has no payment document at all (the voucher collection
   is empty, and there is no receipt/payment collection), so any figure there
   would be invented. Voucher carries no supplierId in any case (its lines
   name a ledger, and models/Ledger.js has no supplierId), so a per-supplier
   payment could only be matched by supplier NAME. See
   SUPPLIER_STOCK_REPORTS_REQUIREMENTS.md §12, decision 2.

   TWO AGGREGATE BUGS FIXED HERE (both made the screen read 0.00):

     1. scopeFilter() yields the business/location ids as STRINGS, and Mongoose
        does NOT cast an aggregation pipeline. { businessId: '6a85...' } never
        equals an ObjectId, so the old $match found nothing at all. Every id
        in an aggregate match is cast below.
     2. The old route only read PurchaseInvoice and DebitNote. This database
        has 4 GRCs, 1 Purchase Invoice and 0 Debit Notes, so it had almost
        nothing to report while the real payables sat in Grc.

   PAGING: the summary is one $group (bounded by the supplier count) and the
   detailed tab is $sort/$skip/$limit inside the database over the union of
   the three collections - never a page of documents read into memory. */

const s = (v) => String(v ?? '').trim();

/* a scope id as an ObjectId, for use inside an aggregate $match */
const oid = (v) => (v && isValidObjectId(String(v)) ? new Types.ObjectId(String(v)) : null);

/* the invoice's own value: totalPayable, falling back to netPurchaseAmt */
const PI_AMOUNT = {
  $cond: [
    { $gt: [{ $ifNull: ['$totalPayable', 0] }, 0] },
    '$totalPayable',
    { $ifNull: ['$netPurchaseAmt', 0] },
  ],
};

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = sp.get('tab') === 'detailed' ? 'detailed' : 'summary';

  const denied = await screenDenial({
    session,
    screen: SCREENS.SUPPLIER_OUTSTANDING_REPORT,
    label: 'the supplier outstanding report',
    action: PERM.READ,
    businessId: scope.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (sp.get('allLocations') === '1') scope.locationId = null;

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const base = scopeFilter(scope);
  const supplierId = sp.get('supplierId');

  /* CAST: an aggregate does not go through the schema, so a string id would
     compare against an ObjectId and match nothing */
  const aggBase = {};
  const biz = oid(base.businessId);
  const loc = oid(base.locationId);
  const sup = supplierId && isValidObjectId(supplierId) ? oid(supplierId) : null;
  if (biz) aggBase.businessId = biz;
  if (loc) aggBase.locationId = loc;
  if (base.finYear) aggBase.finYear = base.finYear;
  if (sup) aggBase.supplierId = sup;

  const grcMatch = {
    ...aggBase,
    ...dateRange(sp, 'grcDate'),
    /* a GRC that became a Purchase Invoice is counted once, as that invoice */
    purchaseInvoiceId: null,
  };
  const piMatch = { ...aggBase, ...dateRange(sp, 'purchaseDate') };
  const dnMatch = { ...aggBase, ...dateRange(sp, 'debitCreadted') };

  /* one stream of payable documents: GRC + Purchase Invoice + Debit Note */
  const documentStages = [
    {
      $project: {
        supplierId: 1,
        docType: { $literal: 'Goods Receipt' },
        docNo: { $ifNull: ['$grcNumber', ''] },
        date: '$grcDate',
        amount: { $ifNull: ['$netAmount', 0] },
      },
    },
    {
      $unionWith: {
        coll: 'purchaseinvoice',
        pipeline: [
          { $match: piMatch },
          {
            $project: {
              supplierId: 1,
              docType: { $literal: 'Purchase Invoice' },
              docNo: { $ifNull: ['$purchaseInvoiceNo', ''] },
              date: '$purchaseDate',
              amount: PI_AMOUNT,
            },
          },
        ],
      },
    },
    {
      $unionWith: {
        coll: 'debitnote',
        pipeline: [
          { $match: dnMatch },
          {
            $project: {
              supplierId: 1,
              docType: { $literal: 'Debit Note' },
              docNo: { $ifNull: ['$debitNoteNo', ''] },
              date: '$debitCreadted',
              /* negative: a debit note reduces what we owe */
              amount: { $multiply: [{ $ifNull: ['$value', 0] }, -1] },
            },
          },
        ],
      },
    },
  ];

  const skip = (page - 1) * perPage;

  const [summaryRaw, detailRaw] = await Promise.all([
    Grc.aggregate([
      { $match: grcMatch },
      ...documentStages,
      {
        $group: {
          _id: '$supplierId',
          pi: {
            $sum: {
              $cond: [{ $eq: ['$docType', 'Debit Note'] }, 0, '$amount'],
            },
          },
          dn: {
            $sum: {
              $cond: [
                { $eq: ['$docType', 'Debit Note'] },
                { $multiply: ['$amount', -1] },
                0,
              ],
            },
          },
          documents: { $sum: 1 },
        },
      },
      { $addFields: { due: { $subtract: ['$pi', '$dn'] } } },
      { $sort: { due: -1, _id: 1 } },
    ]).allowDiskUse(true),

    tab === 'detailed'
      ? Grc.aggregate([
        { $match: grcMatch },
        ...documentStages,
        { $sort: { date: -1, _id: -1 } },
        { $skip: skip },
        { $limit: perPage },
      ]).allowDiskUse(true)
      : Promise.resolve([]),
  ]);

  const summary = summaryRaw.map((r) => ({
    _id: r._id ? String(r._id) : '(unassigned)',
    supplierId: r._id ? String(r._id) : '',
    outstandingPi: r2(r.pi),
    outstandingDn: r2(r.dn),
    totalDue: r2(r.due),
    documents: num(r.documents),
  }));

  const totalOf = (k) => r2(summary.reduce((a, r) => a + num(r[k]), 0));
  const totals = {
    outstandingPi: totalOf('outstandingPi'),
    outstandingDn: totalOf('outstandingDn'),
    totalDue: totalOf('totalDue'),
  };
  const tiles = {
    totalSuppliers: summary.length,
    outstandingPi: totals.outstandingPi,
    outstandingDn: totals.outstandingDn,
    grandTotalDue: totals.totalDue,
  };

  /* names for the rows on screen only, in one query */
  const nameIn = async (ids) => {
    const list = [...new Set(ids.filter((v) => v && isValidObjectId(v)).map(String))];
    if (!list.length) return new Map();
    const docs = await Supplier.find({ _id: { $in: list } })
      .select('businessName firstName lastName billingCity').lean();
    return new Map(docs.map((v) => [String(v._id), v]));
  };

  const nameOf = (c) => (c
    ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
    : '');

  const label = (byId, id) => {
    const v = byId.get(String(id));
    const city = v?.billingCity;
    return (nameOf(v) || '(unassigned)') + (city ? ', ' + String(city).toUpperCase() : '');
  };

  /* -------------------------------------------------------- detailed --- */
  if (tab === 'detailed') {
    const byId = await nameIn(detailRaw.map((r) => r.supplierId));
    const rows = detailRaw.map((r) => {
      const amount = r2(r.amount);
      /* no payment document exists in this database, so nothing has been
         settled against any of these - said in the column, not hidden */
      const paid = 0;
      return {
        _id: String(r._id),
        supplierId: String(r.supplierId || ''),
        supplier: label(byId, r.supplierId),
        docType: r.docType,
        docNo: s(r.docNo),
        date: r.date || null,
        amount,
        paid,
        balance: r2(amount - paid),
      };
    });

    const sum = (k) => r2(rows.reduce((a, r) => a + num(r[k]), 0));
    const total = summary.reduce((a, r) => a + num(r.documents), 0);

    return json({
      tiles,
      sections: [{
        key: 'detailed',
        rows,
        count: total,
        totals: { amount: sum('amount'), paid: sum('paid'), balance: sum('balance') },
      }],
      total,
      pages: Math.max(1, Math.ceil(total / perPage)),
      page,
      perPage,
      ...(total === 0
        ? { note: 'No purchase receipts, purchase invoices or debit notes in this period for these filters.' }
        : {}),
    });
  }

  /* --------------------------------------------------------- summary --- */
  const pageRows = summary.slice(skip, skip + perPage);
  const byId = await nameIn(pageRows.map((r) => r.supplierId));

  return json({
    tiles,
    sections: [{
      key: 'summary',
      rows: pageRows.map((r) => ({ ...r, supplier: label(byId, r.supplierId) })),
      count: summary.length,
      totals,
    }],
    total: summary.length,
    pages: Math.max(1, Math.ceil(summary.length / perPage)),
    page,
    perPage,
    ...(summary.length === 0
      ? { note: 'No purchase receipts, purchase invoices or debit notes in this period for these filters.' }
      : {}),
  });
}
