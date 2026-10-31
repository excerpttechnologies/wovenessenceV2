import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import StoreSalesReturn from '@/models/StoreSalesReturn';

/* /api/is-sales-return/<id> - read one.

   NO DELETE. A confirmed return has already moved stock at both stores and
   written two movement rows; removing the document would leave the inventory
   ledger describing goods with no paper behind them. To undo one, raise the
   opposite transaction. */

const SCREEN = { screen: SCREENS.IS_SALES_RETURN, label: 'inter store sales returns' };
const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);

  await dbConnect();
  const doc = await StoreSalesReturn.findById(id).lean();
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
  await dbConnect();

  const doc = await StoreSalesReturn.findById(id).select('businessId').lean();
  if (!doc) return json({ ok: true });

  const denied = await screenDenial({
    session, ...SCREEN, action: PERM.DELETE, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json(
    { error: 'A confirmed Sales Return has already moved stock and cannot be deleted. Raise the opposite transaction instead.' },
    409
  );
}
