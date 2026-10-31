import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import StoreDeliveryChallan, { DC_STATUS } from '@/models/StoreDeliveryChallan';
import StoreDebitNote from '@/models/StoreDebitNote';
import StoreSalesReturn from '@/models/StoreSalesReturn';
import { r2 } from '@/lib/storeSell';

/* /api/is-sales-invoice/<id> - read one, delete one.

   Deleting an invoice RELEASES the challan quantities it claimed, so those
   units can be billed again. It is refused while a Received Debit Note or a
   Sales Return still points at the invoice - those documents quote its number
   and its lines, and removing it would leave them referencing nothing. */

const SCREEN = { screen: SCREENS.IS_SALES_INVOICE, label: 'inter store sales invoices' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);

  await dbConnect();
  const doc = await StoreSalesInvoice.findById(id).lean();
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
  const invoice = await StoreSalesInvoice.findById(id).lean();
  if (!invoice) return json({ ok: true });

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.DELETE, businessId: invoice.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const [note, ret] = await Promise.all([
    StoreDebitNote.exists({ salesInvoiceId: invoice._id }),
    StoreSalesReturn.exists({ salesInvoiceId: invoice._id }),
  ]);

  if (note || ret) {
    return json(
      { error: 'This invoice has a Received Debit Note or Sales Return against it. Delete those first.' },
      409
    );
  }

  /* give the billed quantities back to their challans */
  for (const line of (invoice.items || [])) {
    if (!line.challanId || !line.challanLineId) continue;
    await StoreDeliveryChallan.collection.updateOne(
      { _id: new Types.ObjectId(String(line.challanId)) },
      { $inc: { 'items.$[l].billedQty': -r2(line.qty) } },
      { arrayFilters: [{ 'l.lineId': String(line.challanLineId) }] }
    );
  }

  /* a challan with nothing billed again is back to "received" */
  for (const challanId of (invoice.deliveryChallanIds || [])) {
    const challan = await StoreDeliveryChallan.findById(challanId).lean();
    if (!challan) continue;
    const stillBilled = (challan.items || []).some((l) => r2(l.billedQty) > 0);
    if (!stillBilled) {
      await StoreDeliveryChallan.collection.updateOne(
        { _id: challan._id },
        { $set: { salesInvoiceId: null, status: DC_STATUS.RECEIVED } }
      );
    }
  }

  await StoreSalesInvoice.findByIdAndDelete(id);
  return json({ ok: true });
}
