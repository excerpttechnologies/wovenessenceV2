import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import CompanyLocation from '@/models/CompanyLocation';
import Contact from '@/models/Contact';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
  linesOf, lineItemCode, lineItemName, lineQty, lineNet,
} from '@/lib/reports';

/* /api/reports/pos-report - read-only.

   Finalized POS sales, bill by bill or item by item. Both tabs share one set
   of filters, so the same query serves each and only the shaping differs.

   The tax columns are split two ways on purpose, matching the deployed
   report: IGST / CGST / SGST is the whole tax on the bill, and the
   "(5%)" / "(2.5%)" columns beside them are the part of that tax which came
   from lines carrying exactly that rate. On a single-slab shop the two are
   the same figure; on a mixed-slab one they are not.

   ---------------------------------------------------------------------------
   THIS RETURNS NOTHING TODAY. PosTill issues only GET requests - nothing in
   the codebase writes a PosInvoice - so there are no bills to report. Every
   figure is computed properly against the shape a bill should have, so the
   report fills in the moment the till starts posting.
   --------------------------------------------------------------------------- */

/* the part of a line's tax that came from one exact rate */
const rateSlice = (lines, key, rate) => r2(lines.reduce((a, l) => {
  const pct = num(l[key + 'Pct'] ?? l[key.toUpperCase() + ' %']);
  return pct === rate ? a + num(l[key + 'Amount'] ?? l[key.toUpperCase() + ' Amount']) : a;
}, 0));

const taxOf = (lines, key) => r2(lines.reduce(
  (a, l) => a + num(l[key + 'Amount'] ?? l[key.toUpperCase() + ' Amount']), 0
));

const discountOf = (d, lines) => r2(
  num(d.discount) || lines.reduce((a, l) => a + num(l.discount ?? l.Discount), 0)
);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = sp.get('tab') === 'itemwise' ? 'itemwise' : 'billwise';

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const bills = await PosInvoice.find({
    ...scopeFilter(scope),
    ...dateRange(sp, 'date'),
  }).sort({ date: -1 }).limit(5000).lean();

  /* PosInvoice carries no salesperson field, so the filter can only narrow to
     nothing once a bill would actually record one. Left wired so it works the
     moment the till stores it. */
  const wantPerson = sp.get('salesPersonId');

  const locIds = [...new Set(bills.map((b) => b.locationId).filter(Boolean).map(String))];
  const custIds = [...new Set(bills.map((b) => b.customerId).filter(Boolean).map(String))];

  const [locs, customers] = await Promise.all([
    locIds.length
      ? CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean() : [],
    custIds.length
      ? Contact.find({ _id: { $in: custIds } })
        .select('businessName firstName lastName gstNo billingMobile').lean() : [],
  ]);
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));
  const custById = new Map(customers.map((c) => [String(c._id), c]));

  const nameOf = (c) => (c
    ? (c.businessName || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
    : '');

  const kept = bills.filter((b) => {
    if (!wantPerson || !isValidObjectId(wantPerson)) return true;
    return String(b.salesPersonId || '') === String(wantPerson);
  });

  /* ---------------------------------------------------------- tiles ---- */
  let gross = 0; let discount = 0; let net = 0; let taxable = 0;
  kept.forEach((b) => {
    const lines = linesOf(b);
    const t = r2(num(b.taxableValue) || lines.reduce((a, l) => a + lineNet(l), 0));
    const d = discountOf(b, lines);
    const n = r2(b.totalAmount);
    taxable += t;
    discount += d;
    net += n;
    gross += r2(n + d);
  });

  const tiles = {
    totalBills: kept.length,
    gross: r2(gross),
    discount: r2(discount),
    net: r2(net),
    taxable: r2(taxable),
  };

  /* ------------------------------------------------------- item wise --- */
  if (tab === 'itemwise') {
    const rows = kept.flatMap((b) => linesOf(b).map((l, i) => {
      const lineDiscount = num(l.discount ?? l.Discount);
      const lineNetValue = lineNet(l);
      return {
        _id: String(b._id) + ':' + i,
        location: locName.get(String(b.locationId)) || '',
        invoiceNo: b.invoiceNo || '',
        date: b.date || b.createdAt || null,
        itemCode: lineItemCode(l),
        itemName: lineItemName(l),
        hsn: String(l.hsn ?? l.HSN ?? ''),
        qty: lineQty(l),
        rate: num(l.unitRate ?? l['Unit Rate'] ?? l.rsp),
        discount: r2(lineDiscount),
        net: r2(lineNetValue),
        taxable: r2(lineNetValue),
      };
    }));

    const p = paged(rows, page, perPage);
    const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

    return json({
      tiles,
      sections: [{
        rows: p.rows,
        count: p.total,
        totals: {
          qty: sum('qty'), discount: sum('discount'),
          net: sum('net'), taxable: sum('taxable'),
        },
      }],
      total: p.total,
      pages: p.pages,
      page,
      perPage,
    });
  }

  /* ------------------------------------------------------- bill wise --- */
  const rows = kept.map((b) => {
    const lines = linesOf(b);
    const c = custById.get(String(b.customerId));
    const t = r2(num(b.taxableValue) || lines.reduce((a, l) => a + lineNet(l), 0));
    const d = discountOf(b, lines);
    const n = r2(b.totalAmount);

    return {
      _id: String(b._id),
      location: locName.get(String(b.locationId)) || '',
      invoiceNo: b.invoiceNo || '',
      date: b.date || b.createdAt || null,
      /* no salesperson is stored on a POS bill today */
      salesPerson: b.salesPersonName || '',
      customerName: nameOf(c) || b.customerName || '',
      mobile: b.customerContact || c?.billingMobile || '',
      gstNo: c?.gstNo || '',
      gross: r2(n + d),
      discount: d,
      net: n,
      taxable: t,
      igst: taxOf(lines, 'igst'),
      cgst: taxOf(lines, 'cgst'),
      sgst: taxOf(lines, 'sgst'),
      igst5: rateSlice(lines, 'igst', 5),
      cgst25: rateSlice(lines, 'cgst', 2.5),
      sgst25: rateSlice(lines, 'sgst', 2.5),
    };
  });

  const p = paged(rows, page, perPage);
  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));

  return json({
    tiles,
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        gross: sum('gross'), discount: sum('discount'), net: sum('net'),
        taxable: sum('taxable'), igst: sum('igst'), cgst: sum('cgst'), sgst: sum('sgst'),
        igst5: sum('igst5'), cgst25: sum('cgst25'), sgst25: sum('sgst25'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
