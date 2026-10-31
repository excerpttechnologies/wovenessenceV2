import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreDeliveryChallan, { DC_STATUS } from '@/models/StoreDeliveryChallan';
import { receiveStoreStock } from '@/lib/storeStock';

/* POST /api/is-delivery-challan/<id>/receive

   The DESTINATION store accepts the despatched goods. This is what creates
   its barcode rows (lib/storeStock.js receiveStoreStock); despatching alone
   only took them out of the sender.

   Idempotent: a second call finds the rows it already created and adds
   nothing, so a double-click or a retried request cannot double the stock. */

const SCREEN = { screen: SCREENS.IS_DELIVERY_CHALLAN, label: 'inter store delivery challans' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Not found' }, 404);

  await dbConnect();
  const challan = await StoreDeliveryChallan.findById(id).lean();
  if (!challan) return json({ error: 'Not found' }, 404);

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.UPDATE, businessId: challan.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (challan.status === DC_STATUS.CANCELLED) {
    return json({ error: 'This challan was cancelled.' }, 409);
  }

  /* Receiving is a one-time state change; answering ok keeps a retry safe. */
  if (challan.receivedAt) {
    return json({ ok: true, alreadyReceived: true, id, dcNo: challan.dcNo });
  }

  const created = await receiveStoreStock({ challan, user: session });

  await StoreDeliveryChallan.collection.updateOne(
    { _id: challan._id, receivedAt: null },
    {
      $set: {
        receivedAt: new Date(),
        receivedBy: session.name || session.email || '',
        /* an already-invoiced challan keeps that status - receiving must not
           walk it backwards */
        status: challan.salesInvoiceId ? DC_STATUS.INVOICED : DC_STATUS.RECEIVED,
        updatedBy: session.name || session.email || '',
      },
    }
  );

  return json({ ok: true, id, dcNo: challan.dcNo, received: created.length });
}
