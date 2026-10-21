import dbConnect from '@/lib/db';
import StockTransferLocation from '@/models/StockTransferLocation';
import StockTransferPacket from '@/models/StockTransferPacket';
import { requireSession } from '@/lib/session';

/* /api/stock-transfer-location/<id> - read one, delete.

   There is no PUT. Every line came from a packet this transfer has already
   claimed, so editing it would put the two documents out of step. Deleting
   RELEASES the packets back into the picker - otherwise a deleted transfer
   would strand them permanently, the same reasoning behind the Dispatch and
   Inter Company Sales Invoice deletes. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await StockTransferLocation.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await StockTransferLocation.findById(id).select('receivedId').lean();
  if (!existing) return json({ ok: true });

  /* Once the destination has taken it into stock there is a receipt on the
     other side referencing it. Reverse that first. */
  if (existing.receivedId) {
    return json(
      { error: 'This transfer has already been received by the destination location and cannot be deleted.' },
      409
    );
  }

  /* release first, then remove: if the delete failed after the release the
     packets would simply look available again, which is recoverable - the
     other order strands them */
  await StockTransferPacket.updateMany(
    { stockTransferLocationId: existing._id },
    { $set: { stockTransferLocationId: null } }
  );
  await StockTransferLocation.findByIdAndDelete(id);

  return json({ ok: true });
}
