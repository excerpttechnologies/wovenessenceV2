import dbConnect from '@/lib/db';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import { requireSession } from '@/lib/session';

/* /api/ic-sales-invoice/<id> - read one, delete.

   There is no PUT. Every line on an invoice came from a delivery challan the
   invoice has already claimed, so editing it would put the two documents out
   of step. Deleting RELEASES the challans back into the picker - otherwise a
   deleted invoice would strand them permanently, the same reasoning behind
   the Dispatch delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await IcSalesInvoice.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await IcSalesInvoice.findById(id).select('receivedId').lean();
  if (!existing) return json({ ok: true });

  /* Once the receiving branch has accepted it into stock there is a GRC on
     the other side referencing it. Reverse the receipt there first. */
  if (existing.receivedId) {
    return json(
      { error: 'This invoice has already been received by the destination branch and cannot be deleted.' },
      409
    );
  }

  /* release first, then remove: if the delete failed after the release the
     challans would simply look available again, which is recoverable - the
     other order strands them */
  await IcDeliveryChallan.updateMany(
    { icSalesInvoiceId: existing._id },
    { $set: { icSalesInvoiceId: null } }
  );
  await IcSalesInvoice.findByIdAndDelete(id);

  return json({ ok: true });
}
