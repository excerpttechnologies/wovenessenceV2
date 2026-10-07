import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PosInvoice from '@/models/PosInvoice';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

/* /api/sell-pos/recent?code=<barcode|item code>&business=&location=

   The past sales that contain a given piece, newest first. The till uses it in
   exchange mode: the operator scans what the customer is handing back and
   picks which sale it came from, instead of having to know the invoice number.

   Matched on barcodeNo OR itemCode because both are on the line and the
   operator may have either in hand - a label that still scans, or a code read
   off the garment. Matching is exact but case-insensitive; a partial match
   would pull in unrelated items whose code merely starts the same. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

const LIMIT = 20;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const code = (sp.get('code') || '').trim();
  if (!code) return json({ rows: [] });

  await dbConnect();

  const exact = { $regex: '^' + escapeRegex(code) + '$', $options: 'i' };
  const filter = { $or: [{ 'items.barcodeNo': exact }, { 'items.itemCode': exact }] };

  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;

  const invoices = await PosInvoice.find(filter)
    .sort({ date: -1, createdAt: -1 })
    .limit(LIMIT)
    .lean();

  /* Only the matching line is of interest - an invoice may carry twenty others
     and the operator is choosing between SALES of this piece, not browsing
     bills. */
  const rows = invoices.map((inv) => {
    const line = (inv.items || []).find((l) => (
      String(l.barcodeNo || '').toLowerCase() === code.toLowerCase()
      || String(l.itemCode || '').toLowerCase() === code.toLowerCase()
    )) || {};

    return {
      _id: String(inv._id),
      invoiceNo: inv.invoiceNo || '',
      date: inv.date,
      customerName: inv.customerSnapshot?.businessName
        || [inv.customerSnapshot?.firstName, inv.customerSnapshot?.lastName].filter(Boolean).join(' ')
        || 'Walk-in Customer',
      totalAmount: Number(inv.totalAmount || 0),
      barcodeNo: line.barcodeNo || '',
      itemCode: line.itemCode || line.code || '',
      itemName: line.itemName || line.name || '',
      qty: Number(line.qty || 0),
      rsp: Number(line.rsp || line.rate || 0),
      netAmount: Number(line.netAmount || 0),
      salesPerson: line.salesPerson ? String(line.salesPerson) : '',
    };
  });

  return json({ rows });
}
