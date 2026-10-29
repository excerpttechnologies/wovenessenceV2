import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { CLASSIFICATION_FIELDS, businessMatch, classificationCollection } from '@/lib/classificationCollections';

const json = (d, s = 200) => Response.json(d, { status: s });

/* /api/v1/admin/product-classification-options/[id] (rewritten 29-10-2026)

   DELETE removes the name from its own collection (byweave / byfabric / ...)
   and takes it off every e-commerce product of that business that had it
   ticked, so the website stops showing it straight away.
   productclassificationoption is no longer used. */

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return json({ error: 'Invalid ID' }, 422);
  }

  await dbConnect();
  const _id = new Types.ObjectId(id);
  let type = null;
  let option = null;
  for (const t of CLASSIFICATION_FIELDS) {
    option = await classificationCollection(t).findOne({ _id });
    if (option) { type = t; break; }
  }
  if (!option) {
    return json({ error: 'Classification option not found' }, 404);
  }

  await classificationCollection(type).deleteOne({ _id });
  const products = await mongoose.connection.db.collection('ecommerceproduct').updateMany(
    { businessId: businessMatch(option.businessId), [type]: { $in: [_id, id] } },
    { $pull: { [type]: { $in: [_id, id] } }, $set: { updatedAt: new Date() } },
  );

  return json({ ok: true, productsUpdated: products.modifiedCount });
}
