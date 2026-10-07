import dbConnect from '@/lib/db';
import StockTransferReceived from '@/models/StockTransferReceived';
import StockTransferLocation from '@/models/StockTransferLocation';
import { requireSession } from '@/lib/session';

/* /api/stock-transfer-received/<id> - read one, reverse.

   There is no PUT. A receipt is a record of something that happened; its
   figures came from the transfer it accepted. To correct one, reverse it and
   receive again.

   DELETE reverses the whole accept: the receipt goes and the transfer returns
   to the sender's Pending list. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await StockTransferReceived.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await StockTransferReceived.findById(id).lean();
  if (!existing) return json({ ok: true });

  /* release first, then remove: if the delete failed after the release the
     transfer would simply reappear as pending, which is recoverable - the
     other order leaves a transfer pointing at a receipt that no longer
     exists */
  if (existing.stockTransferLocationId) {
    await StockTransferLocation.updateMany(
      { _id: existing.stockTransferLocationId },
      { $set: { receivedId: null } }
    );
  }
  await StockTransferReceived.findByIdAndDelete(id);

  return json({ ok: true });
}
