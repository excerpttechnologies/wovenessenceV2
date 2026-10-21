import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import Contact from '@/models/Contact';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
} from '@/lib/reports';

/* /api/reports/customer-outstanding - read-only.

   What each customer still owes on their till bills.

     Total Due = outstanding POS Invoices - outstanding POS Returns

   "Outstanding" on an invoice is PosInvoice.sellDue - the part of the bill
   that was not paid at the counter - not the whole bill. A fully paid cash
   sale contributes nothing, which is why a busy shop can still show a short
   list here.

   Two tabs share the filters:
     summary    one row per customer
     detailed   one row per bill

   It reports nothing today only because the POS till never posts - PosTill
   issues only GET requests, so no PosInvoice is ever written. */

const nameOf = (c) => (c
  ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
  : '');

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = sp.get('tab') === 'detailed' ? 'detailed' : 'summary';

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const base = scopeFilter(scope);
  const customerId = sp.get('customerId');
  const byCustomer = customerId && isValidObjectId(customerId) ? { customerId } : {};

  const [bills, returns] = await Promise.all([
    PosInvoice.find({ ...base, ...byCustomer, ...dateRange(sp, 'date') }).limit(5000).lean(),
    PosReturn.find({ ...base, ...byCustomer, ...dateRange(sp, 'date') }).limit(5000).lean(),
  ]);

  const custIds = [...new Set(
    [...bills, ...returns].map((d) => d.customerId).filter(Boolean).map(String)
  )];
  const customers = custIds.length
    ? await Contact.find({ _id: { $in: custIds } })
      .select('businessName firstName lastName prefix').lean()
    : [];
  const custById = new Map(customers.map((c) => [String(c._id), c]));

  const label = (id) => {
    const c = custById.get(String(id));
    if (!c) return '(walk-in)';
    return [c.prefix, nameOf(c)].filter(Boolean).join(' ') || '(walk-in)';
  };

  /* the unpaid part of a bill, not the whole bill */
  const dueOf = (d) => r2(num(d.sellDue) || 0);

  /* -------------------------------------------------------- detailed --- */
  if (tab === 'detailed') {
    const rows = [
      ...bills.map((d) => ({
        _id: String(d._id),
        customer: label(d.customerId),
        docType: 'POS Invoice',
        docNo: d.invoiceNo || '',
        date: d.date || d.createdAt || null,
        outstandingInvoice: dueOf(d),
        outstandingReturn: 0,
        totalDue: dueOf(d),
      })),
      ...returns.map((d) => ({
        _id: String(d._id),
        customer: label(d.customerId),
        docType: 'POS Return',
        docNo: d.invoiceNo || '',
        date: d.date || d.createdAt || null,
        outstandingInvoice: 0,
        outstandingReturn: r2(d.totalAmount),
        totalDue: r2(-num(d.totalAmount)),
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
    const p = paged(rows, page, perPage);

    return json({
      tiles: {},
      sections: [{
        rows: p.rows,
        count: p.total,
        totals: {
          outstandingInvoice: sum('outstandingInvoice'),
          outstandingReturn: sum('outstandingReturn'),
          totalDue: sum('totalDue'),
        },
      }],
      total: p.total,
      pages: p.pages,
      page,
      perPage,
    });
  }

  /* --------------------------------------------------------- summary --- */
  const acc = new Map();
  const touch = (id) => {
    const key = String(id || '');
    if (!acc.has(key)) acc.set(key, { key, inv: 0, ret: 0 });
    return acc.get(key);
  };

  bills.forEach((d) => { touch(d.customerId).inv += dueOf(d); });
  returns.forEach((d) => { touch(d.customerId).ret += num(d.totalAmount); });

  const rows = [...acc.values()]
    .map((r) => ({
      _id: r.key || '(walk-in)',
      customer: label(r.key),
      outstandingInvoice: r2(r.inv),
      outstandingReturn: r2(r.ret),
      totalDue: r2(r.inv - r.ret),
    }))
    /* a customer who owes nothing is not outstanding - keeping them would
       fill the page with zero rows */
    .filter((r) => r.outstandingInvoice || r.outstandingReturn)
    .sort((a, b) => b.totalDue - a.totalDue);

  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  const p = paged(rows, page, perPage);

  return json({
    tiles: {},
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        outstandingInvoice: sum('outstandingInvoice'),
        outstandingReturn: sum('outstandingReturn'),
        totalDue: sum('totalDue'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
