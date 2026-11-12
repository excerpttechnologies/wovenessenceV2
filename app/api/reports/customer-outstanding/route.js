import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import { Customer } from '@/lib/contacts';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf,
} from '@/lib/reports';

/* /api/reports/customer-outstanding - read-only.

   Each customer's till bills and what remains due on them.

     Total Due = outstanding POS Invoices - outstanding POS Returns

   "Outstanding" on an invoice is PosInvoice.sellDue - the part of the bill not
   paid at the counter - NOT the whole bill. A fully paid cash sale contributes
   nothing. The summary still includes customers with bills in the selected
   period so their activity remains visible when every bill is paid.

   The summary and detailed tabs use the same filtered bill and return set;
   customers with a zero balance are shown with a zero due.

   THE AGGREGATE CASTING BUG that made this page look broken is the same one
   supplier-outstanding had: scopeFilter() returns the business id as a
   STRING, and Mongoose does not cast an aggregation pipeline, so
   { businessId: '6a85...' } matched no ObjectId and every number came back 0.
   Every id in an aggregate match is cast here.

   Returns: PosReturn has businessId/locationId/finYear/date, so it scopes the
   same way. A return reduces the receivable, so its amount is negative.

   PAGING is done in the database with $sort/$skip/$limit over the union of
   bills and returns; the summary is one $group bounded by the customer
   count. Nothing loads a whole period into memory. */

const s = (v) => String(v ?? '').trim();

const oid = (v) => (v && isValidObjectId(String(v)) ? new Types.ObjectId(String(v)) : null);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = sp.get('tab') === 'detailed' ? 'detailed' : 'summary';

  /* the report's own Location filter says All Locations -> the top-bar
     location must not be applied on top of it */
  if (sp.get('allLocations') === '1') scope.locationId = null;

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const base = scopeFilter(scope);
  const customerId = sp.get('customerId');

  const aggBase = {};
  const biz = oid(base.businessId);
  const loc = oid(base.locationId);
  const cust = customerId && isValidObjectId(customerId) ? oid(customerId) : null;
  if (biz) aggBase.businessId = biz;
  if (loc) aggBase.locationId = loc;
  if (base.finYear) aggBase.finYear = base.finYear;
  if (cust) aggBase.customerId = cust;

  const dateMatch = dateRange(sp, 'date');
  const billMatch = { ...aggBase, ...dateMatch };
  const returnMatch = { ...aggBase, ...dateMatch };

  const documentStages = [
    {
      $project: {
        customerId: 1,
        docType: { $literal: 'POS Invoice' },
        docNo: { $ifNull: ['$invoiceNo', ''] },
        date: '$date',
        amount: { $ifNull: ['$totalAmount', 0] },
        paid: { $ifNull: ['$paid', 0] },
        due: { $ifNull: ['$sellDue', 0] },
      },
    },
    {
      $unionWith: {
        coll: 'posreturn',
        pipeline: [
          { $match: returnMatch },
          {
            $project: {
              customerId: 1,
              docType: { $literal: 'POS Return' },
              docNo: { $ifNull: ['$invoiceNo', ''] },
              date: '$date',
              /* a return takes value off what the customer owes */
              amount: { $multiply: [{ $ifNull: ['$totalAmount', 0] }, -1] },
              /* $literal: a bare 0 in a $project is an EXCLUSION, and MongoDB
                 refuses to mix it with the inclusion fields beside it */
              paid: { $literal: 0 },
              due: { $multiply: [{ $ifNull: ['$totalAmount', 0] }, -1] },
            },
          },
        ],
      },
    },
  ];

  const skip = (page - 1) * perPage;

  const [summaryRaw, detailRaw] = await Promise.all([
    PosInvoice.aggregate([
      { $match: billMatch },
      ...documentStages,
      {
        $group: {
          _id: '$customerId',
          invoice: {
            $sum: { $cond: [{ $eq: ['$docType', 'POS Invoice'] }, '$due', 0] },
          },
          returned: {
            $sum: {
              $cond: [
                { $eq: ['$docType', 'POS Return'] },
                { $multiply: ['$due', -1] },
                0,
              ],
            },
          },
          due: { $sum: '$due' },
          documents: { $sum: 1 },
        },
      },
      { $sort: { due: -1, _id: 1 } },
    ]).allowDiskUse(true),

    tab === 'detailed'
      ? PosInvoice.aggregate([
        { $match: billMatch },
        ...documentStages,
        { $sort: { date: -1, _id: -1 } },
        { $skip: skip },
        { $limit: perPage },
      ]).allowDiskUse(true)
      : Promise.resolve([]),
  ]);

  const totalDocuments = summaryRaw.reduce((a, r) => a + num(r.documents), 0);

  const summary = summaryRaw.map((r) => ({
    _id: r._id ? String(r._id) : '(walk-in)',
    customerId: r._id ? String(r._id) : '',
    outstandingInvoice: r2(r.invoice),
    outstandingReturn: r2(r.returned),
    totalDue: r2(r.due),
    documents: num(r.documents),
  }));

  const totalOf = (k) => r2(summary.reduce((a, r) => a + num(r[k]), 0));
  const totals = {
    outstandingInvoice: totalOf('outstandingInvoice'),
    outstandingReturn: totalOf('outstandingReturn'),
    totalDue: totalOf('totalDue'),
  };
  const tiles = {
    totalCustomers: summary.length,
    outstandingInvoice: totals.outstandingInvoice,
    outstandingReturn: totals.outstandingReturn,
    grandTotalDue: totals.totalDue,
  };

  const nameIn = async (ids) => {
    const list = [...new Set(ids.filter((v) => v && isValidObjectId(v)).map(String))];
    if (!list.length) return new Map();
    const docs = await Customer.find({ _id: { $in: list } })
      .select('businessName firstName lastName prefix').lean();
    return new Map(docs.map((c) => [String(c._id), c]));
  };

  const nameOf = (c) => (c
    ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
    : '');

  const label = (byId, id) => {
    const c = byId.get(String(id));
    if (!c) return '(walk-in)';
    return [c.prefix, nameOf(c)].filter(Boolean).join(' ') || '(walk-in)';
  };

  /* -------------------------------------------------------- detailed --- */
  if (tab === 'detailed') {
    const byId = await nameIn(detailRaw.map((r) => r.customerId));
    const rows = detailRaw.map((r) => {
      const amount = r2(r.amount);
      const paid = r2(r.paid);
      return {
        _id: String(r._id),
        customerId: String(r.customerId || ''),
        customer: label(byId, r.customerId),
        docType: r.docType,
        docNo: s(r.docNo),
        date: r.date || null,
        amount,
        paid,
        balance: r2(r.due),
      };
    });

    const sum = (k) => r2(rows.reduce((a, r) => a + num(r[k]), 0));

    return json({
      tiles,
      sections: [{
        key: 'detailed',
        rows,
        count: totalDocuments,
        totals: { amount: sum('amount'), paid: sum('paid'), balance: sum('balance') },
      }],
      total: totalDocuments,
      pages: Math.max(1, Math.ceil(totalDocuments / perPage)),
      page,
      perPage,
      ...(tiles.grandTotalDue === 0
        ? { note: totalDocuments === 0
          ? 'No till bills or POS returns in this period for these filters.'
          : `All ${totalDocuments} till bill(s) in this period are fully paid - there is nothing outstanding.` }
        : {}),
    });
  }

  /* --------------------------------------------------------- summary --- */
  const pageRows = summary.slice(skip, skip + perPage);
  const byId = await nameIn(pageRows.map((r) => r.customerId));

  return json({
    tiles,
    sections: [{
      key: 'summary',
      rows: pageRows.map((r) => ({ ...r, customer: label(byId, r.customerId) })),
      count: summary.length,
      totals,
    }],
    total: summary.length,
    pages: Math.max(1, Math.ceil(summary.length / perPage)),
    page,
    perPage,
    ...(summary.length === 0
      ? { note: totalDocuments === 0
        ? 'No till bills or POS returns in this period for these filters.'
        : `All ${totalDocuments} till bill(s) in this period are fully paid - there is nothing outstanding.` }
      : {}),
  });
}
