import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import DebitNote from '@/models/DebitNote';
import Contact from '@/models/Contact';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
} from '@/lib/reports';

/* /api/reports/supplier-outstanding - read-only.

   What you still owe each supplier, and the documents behind it.

     Total Due = outstanding Purchase Invoices - outstanding Debit Notes

   A debit note is goods you sent back, so it reduces what you owe.

   PAYMENTS ARE NOT NETTED OFF, matching the deployed report: it shows the
   invoice total against the debit note total, not the settled position.
   Payment Vouchers exist in this project and could be subtracted here - the
   Dashboard's "Purchase Due" tile already does exactly that - but doing it
   here would make this report disagree with the one it is a clone of. If you
   want the settled figure instead, subtract the Payment Voucher total per
   supplier ledger and rename the column.

   Two tabs share the filters:
     summary    one row per supplier
     detailed   one row per document */

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
  const supplierId = sp.get('supplierId');
  const bySupplier = supplierId && isValidObjectId(supplierId)
    ? { supplierId } : {};

  const [invoices, notes] = await Promise.all([
    PurchaseInvoice.find({ ...base, ...bySupplier, ...dateRange(sp, 'purchaseDate') })
      .limit(5000).lean(),
    DebitNote.find({ ...base, ...bySupplier, ...dateRange(sp, 'debitCreadted') })
      .limit(5000).lean(),
  ]);

  const supplierIds = [...new Set(
    [...invoices, ...notes].map((d) => d.supplierId).filter(Boolean).map(String)
  )];
  const suppliers = supplierIds.length
    ? await Contact.find({ _id: { $in: supplierIds } })
      .select('businessName firstName lastName billingCity').lean()
    : [];
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

  const label = (id) => {
    const s = supplierById.get(String(id));
    const city = s?.billingCity;
    return (nameOf(s) || '(unassigned)') + (city ? ', ' + String(city).toUpperCase() : '');
  };

  const invoiceValue = (d) => r2(num(d.totalPayable) || num(d.netPurchaseAmt));

  /* -------------------------------------------------------- detailed --- */
  if (tab === 'detailed') {
    const rows = [
      ...invoices.map((d) => ({
        _id: String(d._id),
        supplier: label(d.supplierId),
        docType: 'Purchase Invoice',
        docNo: d.purchaseInvoiceNo || '',
        date: d.purchaseDate || d.createdAt || null,
        outstandingPi: invoiceValue(d),
        outstandingDn: 0,
        totalDue: invoiceValue(d),
      })),
      ...notes.map((d) => ({
        _id: String(d._id),
        supplier: label(d.supplierId),
        docType: 'Debit Note',
        docNo: d.debitNoteNo || '',
        date: d.debitCreadted || d.createdAt || null,
        outstandingPi: 0,
        outstandingDn: r2(d.value),
        totalDue: r2(-num(d.value)),
      })),
    ].sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

    const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
    const p = paged(rows, page, perPage);

    return json({
      tiles: {
        totalSuppliers: supplierIds.length,
        outstandingPi: sum('outstandingPi'),
        outstandingDn: sum('outstandingDn'),
        grandTotalDue: sum('totalDue'),
      },
      sections: [{
        rows: p.rows,
        count: p.total,
        totals: {
          outstandingPi: sum('outstandingPi'),
          outstandingDn: sum('outstandingDn'),
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
    if (!acc.has(key)) acc.set(key, { key, pi: 0, dn: 0 });
    return acc.get(key);
  };

  invoices.forEach((d) => { touch(d.supplierId).pi += invoiceValue(d); });
  notes.forEach((d) => { touch(d.supplierId).dn += num(d.value); });

  const rows = [...acc.values()].map((r) => ({
    _id: r.key || '(unassigned)',
    supplier: label(r.key),
    outstandingPi: r2(r.pi),
    outstandingDn: r2(r.dn),
    totalDue: r2(r.pi - r.dn),
  })).sort((a, b) => b.totalDue - a.totalDue);

  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  const p = paged(rows, page, perPage);

  return json({
    tiles: {
      totalSuppliers: rows.length,
      outstandingPi: sum('outstandingPi'),
      outstandingDn: sum('outstandingDn'),
      grandTotalDue: sum('totalDue'),
    },
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        outstandingPi: sum('outstandingPi'),
        outstandingDn: sum('outstandingDn'),
        totalDue: sum('totalDue'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
