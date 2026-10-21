// import dbConnect from '@/lib/db';
// import PurchaseInvoice from '@/models/PurchaseInvoice';
// import { requireSession } from '@/lib/session';
// import { validate } from '@/lib/validate';
// import { FORM } from '@/app/admin/transaction/purchase/invoice/form';

// /* header fields AND the totals rows - the totals card holds real stored
//    numbers (taxable value, round off, net value, the editable discounts).
//    Leaving them out meant validate() silently dropped them on every save. */
// const FIELDS = (FORM.cards || []).flatMap((c) => {
//   if (c.type === 'fields') return c.fields || [];
//   if (c.type === 'totals') {
//     return (c.rows || []).flatMap((r) => [
//       ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
//       ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
//     ]);
//   }
//   return [];
// });

// /* /api/purchase-invoice/<id> - read one, update, delete. */

// const json = (d, s = 200) => Response.json(d, { status: s });

// export async function GET(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   const doc = await PurchaseInvoice.findById(id).lean();
//   if (!doc) return json({ doc: null }, 404);
//   return json({ doc: { ...doc, _id: String(doc._id) } });
// }

// export async function PUT(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   const body = await req.json();
//   await dbConnect();

//   const { errors, doc, ok } = validate(FIELDS, body.data || {});
//   if (!ok) return json({ errors }, 422);

//   if (Array.isArray(body.data?.items)) doc.items = body.data.items;

//   /* never overwrite the document number on edit */
//   delete doc.purchaseInvoiceNo;

//   const updated = await PurchaseInvoice.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
//   if (!updated) return json({ error: 'Not found' }, 404);

//   return json({ ok: true, id });
// }

// export async function DELETE(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   await PurchaseInvoice.findByIdAndDelete(id);
//   return json({ ok: true });
// }



/* FILE: app/api/purchase-invoice/[id]/route.js */
import dbConnect from '@/lib/db';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import Grc from '@/models/Grc';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/invoice/form';

/* header fields AND the totals rows - the totals card holds real stored
   numbers (taxable value, round off, net value, the editable discounts).
   Leaving them out meant validate() silently dropped them on every save. */
const FIELDS = (FORM.cards || []).flatMap((c) => {
  if (c.type === 'fields') return c.fields || [];
  if (c.type === 'totals') {
    return (c.rows || []).flatMap((r) => [
      ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
      ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
    ]);
  }
  return [];
});

/* the form computes these; they are not header form fields, so they are
   allowed through explicitly rather than by validate() */
const TOTAL_KEYS = [
  'taxableValue', 'discountPercent', 'roundOffDiscount',
  'igstTotal', 'cgstTotal', 'sgstTotal',
  'freightBeforeGst', 'roundOff', 'totalQuantity',
  'netPurchaseAmt', 'totalPayable',
];

function applyTotals(doc, body) {
  TOTAL_KEYS.forEach((k) => {
    if (body.data?.[k] !== undefined) doc[k] = Number(body.data[k]) || 0;
  });
}

/* A GRC has no line items of its own - its Taxable / Total Quantity / GST /
   Net Amount columns are the figures from the invoice raised against it.
   Written here on save so the GRC list, GRC Print and Barcode Print all read
   real numbers. Split across several GRCs, each gets a pro-rata share. */
async function pushTotalsToGrc(Grc, grcIds, doc, share = 1) {
  if (!grcIds.length) return;
  const gst = (doc.igstTotal || 0) + (doc.cgstTotal || 0) + (doc.sgstTotal || 0);

  await Grc.updateMany(
    { _id: { $in: grcIds } },
    { $set: {
      taxable: Number(((doc.taxableValue || 0) * share).toFixed(2)),
      totalQuantity: Number(((doc.totalQuantity || 0) * share).toFixed(2)),
      gst: Number((gst * share).toFixed(2)),
      netAmount: Number(((doc.netPurchaseAmt || 0) * share).toFixed(2)),
      items: doc.items || [],
    } }
  );
}

/* /api/purchase-invoice/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await PurchaseInvoice.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  /* `labels` is additive - the edit form ignores it, the View dialog needs
     it to show Vendor / Agent / Term / Group as names rather than ids */
  return json({
    doc: { ...doc, _id: String(doc._id) },
    labels: await resolveRefLabels([doc]),
  });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;
  applyTotals(doc, body);

  /* never overwrite the document number on edit */
  delete doc.purchaseInvoiceNo;

  const updated = await PurchaseInvoice.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  /* keep the linked GRCs in step with the edited figures */
  const linked = await Grc.find({ purchaseInvoiceId: id }).select('_id').lean();
  if (linked.length) {
    await pushTotalsToGrc(Grc, linked.map((g) => g._id), doc, 1 / linked.length);
  }

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await PurchaseInvoice.findByIdAndDelete(id);
  return json({ ok: true });
}