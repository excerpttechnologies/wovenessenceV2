import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';

/* POST /api/sell-pos/<id>/archive  (21-10-2026)

   The POS list's Delete button. The bill is MOVED, not destroyed: it is
   copied into the `posinvoicearchive` collection - unchanged, same _id, plus
   who deleted it and when - and then removed from `posinvoice`, so it leaves
   the POS list, its summary cards and every report that reads posinvoice,
   and shows on Archive -> POS Bills instead.

   Deliberately NOTHING else changes: the barcodes on the bill stay as they
   are (SOLD), and loyalty / payments / returns are not touched.

   Any logged-in user may delete (user, 21-10-2026). */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Bill not found' }, 404);
  await dbConnect();

  const db = mongoose.connection.db;
  const live = db.collection('posinvoice');
  const archive = db.collection('posinvoicearchive');
  const _id = new Types.ObjectId(id);

  const doc = await live.findOne({ _id });
  if (!doc) return json({ error: 'Bill not found (it may already be archived).' }, 404);

  /* copy first, then remove - if the remove fails the copy is taken back, so
     a bill is never in both places or in neither */
  await archive.replaceOne(
    { _id },
    {
      ...doc,
      archivedAt: new Date(),
      archivedBy: { id: String(session.id || ''), name: session.name || '', email: session.email || '' },
    },
    { upsert: true },
  );
  try {
    const res = await live.deleteOne({ _id });
    if (res.deletedCount !== 1) throw new Error('not removed');
  } catch {
    await archive.deleteOne({ _id });
    return json({ error: 'Could not delete the bill. Nothing was changed.' }, 500);
  }

  return json({ ok: true, id, invoiceNo: doc.invoiceNo || '' });
}
