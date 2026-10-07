import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import CompanyLocation from '@/models/CompanyLocation';
import Contact from '@/models/Contact';
import DeliveryChallan from '@/models/DeliveryChallan';
import SalesInvoice from '@/models/SalesInvoice';
import SalesReturn from '@/models/SalesReturn';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, docValue, docQty,
  linesOf, lineNet,
} from '@/lib/reports';

/* /api/reports/sales-person - read-only.

   Who sold what. Rows are grouped by LOCATION - one table per location, which
   is why this route returns a named section per group rather than one table.

   WHERE THE SALESPERSON COMES FROM: only DeliveryChallan carries
   salesPersonId. SalesInvoice, PosInvoice and the two return models do not,
   so anything raised through those falls into a row called ALL. The deployed
   report has that same ALL row, for the same reason.

   Two tabs share the filters:
     general    one row per salesperson, per location
     billwise   one row per document

   ---------------------------------------------------------------------------
   Sell Qty and Total Taxable read 0.00 until the Sell screens capture line
   quantities and rates - see the note at the top of
   app/api/reports/sales-report/route.js. Document-level values (Sell Value,
   Net Value) do appear wherever a header total was stored.
   --------------------------------------------------------------------------- */

const taxableOf = (d) => r2(
  num(d.taxableValue) || linesOf(d).reduce((a, l) => a + lineNet(l), 0)
);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const tab = sp.get('tab') === 'billwise' ? 'billwise' : 'general';

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const base = scopeFilter(scope);

  const [challans, invoices, pos, returns, posReturns] = await Promise.all([
    DeliveryChallan.find({ ...base, ...dateRange(sp, 'dcDate') }).limit(5000).lean(),
    SalesInvoice.find({ ...base, ...dateRange(sp, 'createdAt') }).limit(5000).lean(),
    PosInvoice.find({ ...base, ...dateRange(sp, 'date') }).limit(5000).lean(),
    SalesReturn.find({ ...base, ...dateRange(sp, 'returnDate') }).limit(5000).lean(),
    PosReturn.find({ ...base, ...dateRange(sp, 'date') }).limit(5000).lean(),
  ]);

  const sales = [...challans, ...invoices, ...pos];
  const allReturns = [...returns, ...posReturns];

  /* the Sales Persons filter is a multi-select, so it arrives comma-joined */
  const wanted = String(sp.get('salesPersonId') || '')
    .split(',').map((s) => s.trim()).filter((s) => isValidObjectId(s));

  /* resolve the names of every salesperson that actually appears */
  const personIds = [...new Set(
    sales.map((d) => d.salesPersonId).filter(Boolean).map(String)
  )];
  const people = personIds.length
    ? await Contact.find({ _id: { $in: personIds } })
      .select('businessName firstName lastName').lean()
    : [];
  const personName = new Map(people.map((p) => [
    String(p._id),
    p.businessName || [p.firstName, p.lastName].filter(Boolean).join(' ') || '(unnamed)',
  ]));

  const locIds = [...new Set(
    [...sales, ...allReturns].map((d) => d.locationId).filter(Boolean).map(String)
  )];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  /* a document with no salesperson belongs to ALL, which is how the deployed
     report shows everything raised outside the challan flow */
  const personOf = (d) => (d.salesPersonId ? String(d.salesPersonId) : '');
  const keep = (d) => !wanted.length || wanted.includes(personOf(d));

  /* ------------------------------------------------------- bill wise --- */
  if (tab === 'billwise') {
    const rows = [...sales.filter(keep).map((d) => ({
      _id: String(d._id),
      location: locName.get(String(d.locationId)) || '',
      docNo: d.deliveryChallanNo || d.salesInvoiceNo || d.invoiceNo || '',
      date: d.dcDate || d.date || d.createdAt || null,
      salesPerson: personName.get(personOf(d)) || 'ALL',
      sellQty: docQty(d),
      taxable: taxableOf(d),
      sellValue: docValue(d),
      returnQty: 0,
      returnValue: 0,
      netValue: docValue(d),
    })), ...allReturns.map((d) => ({
      _id: String(d._id),
      location: locName.get(String(d.locationId)) || '',
      docNo: d.salesReturnNo || d.invoiceNo || '',
      date: d.returnDate || d.date || d.createdAt || null,
      salesPerson: 'ALL',
      sellQty: 0,
      taxable: 0,
      sellValue: 0,
      returnQty: docQty(d),
      returnValue: docValue(d),
      netValue: r2(-docValue(d)),
    }))].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

    return json({
      tiles: {},
      sections: [{ title: '', rows, count: rows.length, totals: {} }],
      grandTotal: {
        taxable: sum('taxable'), sellQty: sum('sellQty'), sellValue: sum('sellValue'),
        returnQty: sum('returnQty'), returnValue: sum('returnValue'), netValue: sum('netValue'),
      },
      total: rows.length,
      pages: 1,
      page: 1,
    });
  }

  /* --------------------------------------------------------- general --- */
  /* location -> salesperson -> figures */
  const byLocation = new Map();
  const touch = (locKey, personKey) => {
    if (!byLocation.has(locKey)) byLocation.set(locKey, new Map());
    const people2 = byLocation.get(locKey);
    if (!people2.has(personKey)) {
      people2.set(personKey, {
        key: personKey, sellQty: 0, taxable: 0, sellValue: 0,
        returnQty: 0, returnValue: 0,
      });
    }
    return people2.get(personKey);
  };

  sales.filter(keep).forEach((d) => {
    const row = touch(String(d.locationId || ''), personOf(d));
    row.sellQty += docQty(d);
    row.taxable += taxableOf(d);
    row.sellValue += docValue(d);
  });

  /* returns carry no salesperson anywhere, so they land on ALL */
  allReturns.forEach((d) => {
    const row = touch(String(d.locationId || ''), '');
    row.returnQty += docQty(d);
    row.returnValue += docValue(d);
  });

  const sections = [...byLocation.entries()].map(([locKey, people2]) => {
    const rows = [...people2.values()]
      .map((r) => ({
        _id: locKey + ':' + r.key,
        salesPerson: personName.get(r.key) || 'ALL',
        sellQty: r2(r.sellQty),
        taxable: r2(r.taxable),
        sellValue: r2(r.sellValue),
        returnQty: r2(r.returnQty),
        returnValue: r2(r.returnValue),
        netValue: r2(r.sellValue - r.returnValue),
      }))
      /* ALL first, then by name, as the deployed report lists them */
      .sort((a, b) => (a.salesPerson === 'ALL' ? -1 : b.salesPerson === 'ALL' ? 1
        : a.salesPerson.localeCompare(b.salesPerson)));

    return {
      title: (locName.get(locKey) || '(unassigned location)').toUpperCase(),
      rows,
      count: rows.length,
      totals: {},
    };
  }).sort((a, b) => a.title.localeCompare(b.title));

  const every = sections.flatMap((s) => s.rows);
  const sum = (k) => r2(every.reduce((a, r) => a + r[k], 0));

  return json({
    tiles: {},
    sections,
    grandTotal: {
      taxable: sum('taxable'), sellQty: sum('sellQty'), sellValue: sum('sellValue'),
      returnQty: sum('returnQty'), returnValue: sum('returnValue'), netValue: sum('netValue'),
    },
    total: every.length,
    pages: 1,
    page: 1,
  });
}
