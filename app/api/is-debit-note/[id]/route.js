import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreDebitNote from '@/models/StoreDebitNote';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import { r2 } from '@/lib/storeSell';

/* /api/is-debit-note/<id> - read one, delete one.

   Deleting gives the adjusted quantity back to the invoice line. No stock is
   involved either way - that is the point of a debit note. */

const SCREEN = { screen: SCREENS.IS_DEBIT_NOTE, label: 'inter store received debit notes' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);

  await dbConnect();
  const doc = await StoreDebitNote.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.READ, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ ok: true });

  await dbConnect();
  const doc = await StoreDebitNote.findById(id).lean();
  if (!doc) return json({ ok: true });

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.DELETE, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (doc.salesInvoiceId) {
    for (const line of (doc.items || [])) {
      await StoreSalesInvoice.collection.updateOne(
        { _id: new Types.ObjectId(String(doc.salesInvoiceId)) },
        { $inc: { 'items.$[l].debitedQty': -r2(line.qty) } },
        { arrayFilters: [{ 'l.lineId': String(line.lineId) }] }
      );
    }
  }

  await StoreDebitNote.findByIdAndDelete(id);
  return json({ ok: true });
}
