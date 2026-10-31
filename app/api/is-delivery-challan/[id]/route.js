import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreDeliveryChallan from '@/models/StoreDeliveryChallan';
import { restoreDespatchedStock } from '@/lib/storeStock';

/* /api/is-delivery-challan/<id> - read one, edit its header, delete one. */

const SCREEN = { screen: SCREENS.IS_DELIVERY_CHALLAN, label: 'inter store delivery challans' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);

  await dbConnect();
  const doc = await StoreDeliveryChallan.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.READ, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({ doc: { ...doc, _id: String(doc._id) } });
}

/* EDITING - header detail only, and only while nobody has acted on it.

   The LINES are deliberately not editable: they are the record of stock that
   has already left the source store, and a Sales Invoice may already have
   claimed them. Rewriting a quantity here would leave the barcode rows and
   the movement ledger describing goods this document no longer lists.
   Changing what was shipped means deleting this challan (which restores the
   stock) and raising a corrected one. */
export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Not found' }, 404);

  const body = await req.json();
  await dbConnect();

  const existing = await StoreDeliveryChallan.findById(id).lean();
  if (!existing) return json({ error: 'Not found' }, 404);

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.UPDATE, businessId: body.business || existing.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (existing.receivedAt || existing.salesInvoiceId) {
    return json(
      {
        error: existing.salesInvoiceId
          ? 'This challan is on a Sales Invoice and cannot be edited.'
          : 'The destination store has received this challan and it cannot be edited. Raise a Sales Return for a correction.',
      },
      409
    );
  }

  const patch = { updatedBy: session.name || session.email || '' };
  if (body.data?.remarks !== undefined) patch.remarks = String(body.data.remarks || '');
  if (body.data?.stockPointId !== undefined) {
    patch.stockPointId = isValidObjectId(body.data.stockPointId) ? body.data.stockPointId : null;
  }

  await StoreDeliveryChallan.collection.updateOne({ _id: existing._id }, { $set: patch });
  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ ok: true });

  await dbConnect();
  const existing = await StoreDeliveryChallan.findById(id).lean();
  if (!existing) return json({ ok: true });

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.DELETE, businessId: existing.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (existing.salesInvoiceId) {
    return json(
      { error: 'This challan is on an Inter Store Sales Invoice. Delete that invoice first.' },
      409
    );
  }

  /* Once the destination store has the goods, this document is the record of
     its receipt. Deleting it would leave stock at the far end that nothing
     explains, so it is refused - a return is the way back from there. */
  if (existing.receivedAt) {
    return json(
      { error: 'The destination store has already received this challan. Raise a Sales Return instead of deleting it.' },
      409
    );
  }

  /* the goods left the source store but never arrived - put them back */
  await restoreDespatchedStock({ challan: existing, user: session });
  await StoreDeliveryChallan.findByIdAndDelete(id);

  return json({ ok: true });
}
