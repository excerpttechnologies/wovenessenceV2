import dbConnect from '@/lib/db';
import PosHold from '@/models/PosHold';
import { requireSession } from '@/lib/session';

/* /api/pos-hold/<id> - read one, discard one.

   Resuming is GET then DELETE: the till pulls the parked bill back onto the
   screen and the hold is removed, so the same bill cannot be resumed twice at
   two counters and end up billed twice. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  /* Next 15 hands `params` over as a Promise - destructuring it directly
     yields undefined and every lookup silently misses. */
  const { id } = await params;
  await dbConnect();

  const doc = await PosHold.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await PosHold.findByIdAndDelete(id);
  return json({ ok: true });
}
