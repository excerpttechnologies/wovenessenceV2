import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import {
  CLASSIFICATION_FIELDS,
  businessMatch,
  classificationCollection,
} from '@/lib/classificationCollections';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const json = (d, s = 200) => Response.json(d, { status: s });

const classificationScreen = (type) => ({
  byWeave: SCREENS.ECOM_BY_WEAVE,
  byFabric: SCREENS.ECOM_BY_FABRIC,
  byCraft: SCREENS.ECOM_BY_CRAFT,
  byOccasion: SCREENS.ECOM_BY_OCCASION,
  byColour: SCREENS.ECOM_BY_COLOUR,
}[type]);

/* PUT /api/v1/admin/product-classification-options/[id]
   Renames one classification option inside its own collection
   (byweave / byfabric / bycraft / byoccasion / bycolour). */
export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Invalid ID' }, 422);
  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);

  await dbConnect();
  const _id = new Types.ObjectId(id);
  let type = null;
  let option = null;
  for (const candidate of CLASSIFICATION_FIELDS) {
    option = await classificationCollection(candidate).findOne({ _id, businessId: businessMatch(businessId) });
    if (option) { type = candidate; break; }
  }
  if (!option) return json({ error: 'Classification option not found' }, 404);
  const denied = await screenDenial({ session, screen: classificationScreen(type), action: PERM.UPDATE, businessId, label: 'Classification option' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const name = String(body.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!name || name.length > 100) return json({ error: 'Name is required and must be 100 characters or less' }, 422);
  const duplicate = await classificationCollection(type).findOne({
    _id: { $ne: _id },
    businessId: businessMatch(businessId),
    productType: option.productType,
    isActive: { $ne: false },
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
  });
  if (duplicate) return json({ error: '"' + name + '" already exists in this group' }, 422);
  await classificationCollection(type).updateOne(
    { _id },
    { $set: { name, updatedAt: new Date() } },
  );
  return json({ ok: true, option: { _id: id, name, type, productType: option.productType, displayOrder: option.displayOrder } });
}

/* DELETE /api/v1/admin/product-classification-options/[id]
   Removes the name from its own collection and takes it off every
   e-commerce product of that business that had it ticked, so the website
   stops showing it straight away. */
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
  const denied = await screenDenial({ session, screen: classificationScreen(type), action: PERM.DELETE, businessId: option.businessId, label: 'Classification option' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await classificationCollection(type).deleteOne({ _id });
  const products = await mongoose.connection.db.collection('ecommerceproduct').updateMany(
    { businessId: businessMatch(option.businessId), [type]: { $in: [_id, id] } },
    { $pull: { [type]: { $in: [_id, id] } }, $set: { updatedAt: new Date() } },
  );

  return json({ ok: true, productsUpdated: products.modifiedCount });
}
