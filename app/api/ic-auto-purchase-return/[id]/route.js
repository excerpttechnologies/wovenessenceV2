import dbConnect from '@/lib/db';
import IcAutoPurchaseReturn from '@/models/IcAutoPurchaseReturn';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS, computeTotals } from '@/app/admin/transaction/intercompanysell/auto-purchases-return/fields';

/* /api/ic-auto-purchase-return/<id> - read one, update, delete.

   Locked once the destination branch has accepted it as a Sales Return:
   their document copied these lines, so an edit here would put the pair out
   of step. Same rule the Delivery Challan applies once invoiced. */

const json = (d, s = 200) => Response.json(d, { status: s });

function applyTotals(doc, body) {
  const items = Array.isArray(body.data?.items) ? body.data.items : [];
  const t = computeTotals(items, {
    discountPercent: body.data?.discountPercent,
    roundOffDiscountAmt: body.data?.roundOffDiscountAmt,
  });

  doc.items = items;
  doc.discountPercent = Number(body.data?.discountPercent) || 0;
  doc.roundOffDiscountAmt = Number(body.data?.roundOffDiscountAmt) || 0;
  doc.taxableValue = t.taxableValue;
  doc.igstTotal = t.igstTotal;
  doc.cgstTotal = t.cgstTotal;
  doc.sgstTotal = t.sgstTotal;
  doc.roundOff = t.roundOff;
  doc.totalQty = t.totalQty;
  doc.netValue = t.netValue;
}

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await IcAutoPurchaseReturn.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const existing = await IcAutoPurchaseReturn.findById(id).select('icSalesReturnId').lean();
  if (!existing) return json({ error: 'Not found' }, 404);
  if (existing.icSalesReturnId) {
    return json(
      { error: 'This return has already been accepted by the destination branch and cannot be edited.' },
      409
    );
  }

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  applyTotals(doc, body);

  /* never overwrite the document number on edit */
  delete doc.returnNo;

  const updated = await IcAutoPurchaseReturn.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await IcAutoPurchaseReturn.findById(id).select('icSalesReturnId').lean();
  if (!existing) return json({ ok: true });
  if (existing.icSalesReturnId) {
    return json(
      { error: 'This return has been accepted by the destination branch. Reverse it there first.' },
      409
    );
  }

  await IcAutoPurchaseReturn.findByIdAndDelete(id);
  return json({ ok: true });
}
