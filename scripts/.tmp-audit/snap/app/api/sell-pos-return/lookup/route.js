import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { escapeRegex } from '@/lib/validate';
import { imageUrl } from '@/lib/inventory';

/* GET /api/sell-pos-return/lookup?invoice=<no|id>&barcode=<no>&business=&location=

   Finds the sale a customer is returning against and reports, line by line,
   what is still returnable.

   Two ways in, because both happen at a counter:
     - the customer has the receipt      -> invoice number
     - the customer has only the garment -> barcode, which resolves to the
                                            invoice it was sold on

   Every line comes back with `returnable` already decided and, when it is
   not, the reason - so the till never offers a button that will be refused
   on submit. */

export const GET = handler(async (req) => {
  await requirePermission(PERMISSIONS.POS_RETURN);
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const business = sp.get('business');
  const invoiceRef = (sp.get('invoice') || '').trim();
  const barcode = (sp.get('barcode') || '').trim();

  if (!invoiceRef && !barcode) {
    return json({ error: 'Enter an invoice number or scan an item.', code: 'BAD_INPUT' }, 400);
  }

  const scope = business && isValidObjectId(business) ? { businessId: business } : {};

  let invoice = null;
  if (invoiceRef) {
    invoice = isValidObjectId(invoiceRef)
      ? await PosInvoice.findOne({ _id: invoiceRef, ...scope }).lean()
      : await PosInvoice.findOne({
        invoiceNo: { $regex: '^' + escapeRegex(invoiceRef) + '$', $options: 'i' },
        ...scope,
      }).lean();
  } else {
    /* the barcode carries its own sale - billingNo is stamped on it when it
       is sold, but the invoice is matched on the line so a unit that has
       since been returned and re-sold still resolves to the right one */
    invoice = await PosInvoice.findOne({ 'items.barcodeNo': barcode, ...scope })
      .sort({ createdAt: -1 })
      .lean();
  }

  if (!invoice) {
    return json({
      error: invoiceRef
        ? 'No sale found for invoice ' + invoiceRef + '.'
        : 'Barcode ' + barcode + ' has not been sold, so there is nothing to return.',
      code: 'NOT_FOUND',
    }, 404);
  }

  /* what earlier credits already took back */
  const priorReturns = await PosReturn.find({ parentInvoiceId: invoice._id })
    .select('invoiceNo date items refundAmount').lean();

  const returnedOn = new Map();
  priorReturns.forEach((r) => (r.items || []).forEach((l) => {
    if (l.barcodeNo) returnedOn.set(String(l.barcodeNo), { no: r.invoiceNo, at: r.date });
  }));

  const lines = (invoice.items || []).map((l) => {
    const code = String(l.barcodeNo || '');
    const prior = code ? returnedOn.get(code) : null;
    const qty = Number(l.qty) || 1;
    const rate = Number(l.rate ?? l.rsp ?? 0) || 0;
    const discountPct = Number(l.discountPct || 0) || 0;
    const gross = rate * qty;
    const net = round2(gross - (gross * discountPct) / 100);

    return {
      barcodeNo: code,
      itemCode: l.itemCode || l.code || '',
      itemName: l.itemName || l.name || '',
      description: l.description || '',
      hsn: l.hsn || '',
      gst: Number(l.gst || 0),
      uom: l.uom || '',
      /* who sold it. An exchange line should come back attributed to the
         person who made the original sale, not to whoever is at the till
         now - otherwise the credit lands against the wrong name. */
      salesPerson: l.salesPerson ? String(l.salesPerson) : '',
      qty,
      rate,
      rsp: Number(l.rsp ?? rate) || 0,
      discountPct,
      netAmount: net,
      refundValue: round2(net * (1 + (Number(l.gst) || 0) / 100)),
      image: imageUrl(l.image || ''),

      returnable: Boolean(code) && !prior,
      /* said plainly, so the operator knows why a row is greyed out */
      blockedReason: !code
        ? 'This line was billed without a barcode, so there is no unit to take back.'
        : prior
          ? 'Already returned on ' + prior.no
          : '',
      returnedOn: prior?.no || '',
    };
  });

  return json({
    ok: true,
    invoice: {
      _id: String(invoice._id),
      invoiceNo: invoice.invoiceNo,
      date: invoice.date,
      customerId: invoice.customerId ? String(invoice.customerId) : '',
      customerContact: invoice.customerContact || '',
      customerSnapshot: invoice.customerSnapshot || null,
      totalAmount: invoice.totalAmount,
      paid: invoice.paid,
      billingType: invoice.billingType,
      locationId: invoice.locationId ? String(invoice.locationId) : '',
    },
    lines,
    priorReturns: priorReturns.map((r) => ({
      invoiceNo: r.invoiceNo, date: r.date, refundAmount: r.refundAmount, count: (r.items || []).length,
    })),
    summary: {
      soldCount: lines.length,
      returnableCount: lines.filter((l) => l.returnable).length,
      alreadyReturnedCount: lines.filter((l) => l.returnedOn).length,
      maxRefund: round2(lines.filter((l) => l.returnable).reduce((a, l) => a + l.refundValue, 0)),
    },
  });
});

const round2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
