import dbConnect from '@/lib/db';
import IcAutoPurchaseReceived from '@/models/IcAutoPurchaseReceived';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Grc from '@/models/Grc';
import { requireSession } from '@/lib/session';

/* /api/ic-auto-purchase-received/<id> - read one, reverse.

   There is no PUT. A receipt is a record of something that happened; its
   figures came from the invoice and its GRC. To correct one, reverse it and
   accept again.

   DELETE reverses the whole accept: the GRC goes, and the invoice returns to
   the sender's Pending list. It refuses once the GRC has been carried
   downstream into a Purchase Invoice, because that document's lines were
   copied from it. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await IcAutoPurchaseReceived.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await IcAutoPurchaseReceived.findById(id).lean();
  if (!existing) return json({ ok: true });

  if (existing.grcId) {
    const grc = await Grc.findById(existing.grcId).select('purchaseInvoiceId').lean();
    if (grc?.purchaseInvoiceId) {
      return json(
        { error: 'The GRC from this receipt is already on a purchase invoice. Delete that invoice first.' },
        409
      );
    }
  }

  /* release the invoice first: if the rest failed after that, it would
     simply reappear as pending, which is recoverable - the other order
     leaves an invoice pointing at a receipt that no longer exists */
  if (existing.icSalesInvoiceId) {
    await IcSalesInvoice.updateMany(
      { _id: existing.icSalesInvoiceId },
      { $set: { receivedId: null } }
    );
  }
  if (existing.grcId) await Grc.findByIdAndDelete(existing.grcId);
  await IcAutoPurchaseReceived.findByIdAndDelete(id);

  return json({ ok: true });
}
