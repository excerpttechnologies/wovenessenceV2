import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/grc/form';
import { nextDocNumber } from '@/lib/docnumber';
import { itemPriceErrors } from '@/lib/purchasePrice';

/* header fields AND the totals rows - the totals card holds real stored
   numbers (taxable value, round off, net value, the editable discounts).
   Leaving them out meant validate() silently dropped them on every save. */
const FIELDS = (FORM.cards || []).flatMap((c) => {
  if (c.type === 'fields') return c.fields || [];
  /* The Voucher Section's columns are stored inside voucherRows, so they are
     NOT header fields - except the ones marked `header: true` (Round Off),
     which the Edit screen reads off the header for Net Purchases Value. */
  if (c.type === 'voucher') return (c.fields || []).filter((f) => f.header);
  if (c.type === 'totals') {
    return (c.rows || []).flatMap((r) => [
      ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
      ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
    ]);
  }
  return [];
});

/* /api/purchase-grc/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Grc.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  /* same as the create route: an empty Round Off is 0, not null */
  if (doc.roundOff == null) doc.roundOff = 0;

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;
  if (Array.isArray(body.data?.voucherRows)) doc.voucherRows = body.data.voucherRows;

  /* same rule as the create route - a priced line must carry a real price */
  const priceProblems = itemPriceErrors(doc.items);
  if (priceProblems.length) {
    return json({
      errors: { items: priceProblems[0].problem },
      error: priceProblems[0].problem,
      details: priceProblems.slice(0, 5).map((p) => `${p.ref}: ${p.problem}`),
    }, 422);
  }

  /* never overwrite the document number on edit */
  delete doc.grcNumber;

  const updated = await Grc.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function POST(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();
  const { id } = await params;
  const grc = await Grc.findById(id);
  if (!grc) return json({ error: 'GRC not found' }, 404);
  if (grc.purchaseInvoiceId) return json({ ok: true, id: String(grc.purchaseInvoiceId), existing: true });

  const rows = await BarcodeLabel.find({ grcId: id }).sort({ createdAt: 1 }).lean();
  const items = rows.map((row, index) => ({
    itemCode: row.itemCode || '', itemName: row.supplierDescription || '',
    billSlNo: row.billSlNo || index + 1, hsn: row.hsn || '', qty: Number(row.qty) || 0,
    purchaseRate: Number(row.purRate) || 0, discount: Number(row.disc) || 0,
    finalRate: Number(row.finalNet) || 0,
    beforeTax: (Number(row.finalNet) || 0) * (Number(row.qty) || 0),
    igstAmount: ((Number(row.finalNet) || 0) * (Number(row.qty) || 0) * (Number(row.gst) || 0)) / 100,
  }));
  const taxableValue = items.reduce((sum, item) => sum + item.beforeTax, 0);
  const igstTotal = items.reduce((sum, item) => sum + item.igstAmount, 0);
  const invoice = await PurchaseInvoice.create({
    businessId: grc.businessId, locationId: grc.locationId, finYear: grc.finYear,
    supplierId: grc.supplierId, vendorGstNo: grc.vendorGstNo, grcNumber: grc.grcNumber,
    vendorDocNo: grc.vendorDocNo, grcDate: grc.grcDate, agentId: grc.agentId,
    vendorInvoiceCopy: grc.vendorInvoiceCopy, vendorWaybill: grc.vendorWaybill,
    purchaseInvoiceNo: await nextDocNumber(PurchaseInvoice, 'purchaseInvoiceNo', 'Purchase Invoice', {
      businessId: grc.businessId, locationId: grc.locationId, finYear: grc.finYear,
    }),
    purchaseDate: new Date(), taxableValue, igstTotal,
    totalQuantity: items.reduce((sum, item) => sum + item.qty, 0),
    netPurchaseAmt: taxableValue + igstTotal, totalPayable: taxableValue + igstTotal, items,
  });
  grc.purchaseInvoiceId = invoice._id;
  await grc.save();
  return json({ ok: true, id: String(invoice._id), purchaseInvoiceNo: invoice.purchaseInvoiceNo });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await Grc.findByIdAndDelete(id);
  return json({ ok: true });
}
