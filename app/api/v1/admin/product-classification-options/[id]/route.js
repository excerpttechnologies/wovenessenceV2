import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import {
  CLASSIFICATION_FIELDS,
  businessMatch,
  classificationCollection,
} from '@/lib/classificationCollections';
import { ECOMMERCE_FILTER_VALUES_COLLECTION } from '@/lib/ecommerceFilterMaster';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const json = (d, s = 200) => Response.json(d, { status: s });

const classificationScreen = (type) => ({
  byWeave: SCREENS.ECOM_BY_WEAVE,
  byFabric: SCREENS.ECOM_BY_FABRIC,
  byCraft: SCREENS.ECOM_BY_CRAFT,
  byOccasion: SCREENS.ECOM_BY_OCCASION,
  byColour: SCREENS.ECOM_BY_COLOUR,
}[type] || SCREENS.ECOM_PRODUCT_TYPE);

/* PUT /api/v1/admin/product-classification-options/[id]
   Renames one classification option in both its dedicated collection
   (byweave / byfabric / bycraft / byoccasion / bycolour) and legacy
   productclassificationoption so every reader stays in sync. */
export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Invalid ID' }, 422);
  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);

  await dbConnect();
  const db = mongoose.connection.db;
  const pco = db.collection('productclassificationoption');
  const customCol = db.collection(ECOMMERCE_FILTER_VALUES_COLLECTION);
  const _id = new Types.ObjectId(id);
  const bScope = businessMatch(businessId);
  let type = null;
  let option = null;
  let isCustom = false;
  for (const candidate of CLASSIFICATION_FIELDS) {
    option = await classificationCollection(candidate).findOne({
      _id,
      businessId: bScope,
      isActive: { $ne: false },
    });
    if (option) { type = candidate; break; }
  }
  if (!option) {
    const pcoDoc = await pco.findOne({ _id, businessId: bScope, isActive: { $ne: false } });
    if (pcoDoc && CLASSIFICATION_FIELDS.includes(pcoDoc.type)) {
      option = pcoDoc;
      type = pcoDoc.type;
    }
  }
  if (!option) {
    const customDoc = await customCol.findOne({ _id, businessId: bScope, isActive: { $ne: false } });
    if (customDoc) {
      option = customDoc;
      type = customDoc.filterKey || customDoc.type;
      isCustom = true;
    }
  }
  if (!option || !type) return json({ error: 'Classification option not found' }, 404);

  const denied = await screenDenial({ session, screen: classificationScreen(type), action: PERM.UPDATE, businessId, label: 'Classification option' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const name = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (!name || name.length > 100) return json({ error: 'Name is required and must be 100 characters or less' }, 422);
  const duplicateQuery = {
    _id: { $ne: _id },
    businessId: bScope,
    isActive: { $ne: false },
    name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
    ...(option.productType ? { productType: { $in: [option.productType, '', null] } } : {}),
  };
  const duplicate = isCustom
    ? await customCol.findOne({ ...duplicateQuery, $or: [{ filterKey: type }, { type }] })
    : (await classificationCollection(type).findOne(duplicateQuery)
      || await pco.findOne({ ...duplicateQuery, type }));
  if (duplicate) return json({ error: '"' + name + '" already exists in this group' }, 409);

  const now = new Date();
  if (isCustom) {
    await customCol.updateOne(
      { _id },
      { $set: { name, updatedAt: now, isActive: true } },
    );
  } else {
    await classificationCollection(type).updateOne(
      { _id },
      {
        $set: { name, updatedAt: now, isActive: true },
        $setOnInsert: {
          businessId: option.businessId,
          type,
          productType: option.productType || '',
          displayOrder: option.displayOrder ?? 0,
          createdAt: option.createdAt || now,
        },
      },
      { upsert: true },
    );
    try {
      await pco.updateOne(
        { _id },
        { $set: { name, updatedAt: now, isActive: true } },
      );
    } catch {}
  }
  return json({ ok: true, option: { _id: id, name, type, productType: option.productType || '', displayOrder: option.displayOrder } });
}

/* DELETE /api/v1/admin/product-classification-options/[id]
   Soft-deactivates the option across both its dedicated collection and legacy
   productclassificationoption (or ecommercefiltervalues for custom filters) so
   existing ecommerceproduct references remain intact while active master lists
   and filter pickers stop showing it. */
export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) {
    return json({ error: 'Invalid ID' }, 422);
  }

  await dbConnect();
  const db = mongoose.connection.db;
  const pco = db.collection('productclassificationoption');
  const customCol = db.collection(ECOMMERCE_FILTER_VALUES_COLLECTION);
  const _id = new Types.ObjectId(id);
  let type = null;
  let option = null;
  let isCustom = false;
  for (const t of CLASSIFICATION_FIELDS) {
    option = await classificationCollection(t).findOne({ _id, isActive: { $ne: false } });
    if (option) { type = t; break; }
  }
  if (!option) {
    const pcoDoc = await pco.findOne({ _id, isActive: { $ne: false } });
    if (pcoDoc && CLASSIFICATION_FIELDS.includes(pcoDoc.type)) {
      option = pcoDoc;
      type = pcoDoc.type;
    }
  }
  if (!option) {
    const customDoc = await customCol.findOne({ _id, isActive: { $ne: false } });
    if (customDoc) {
      option = customDoc;
      type = customDoc.filterKey || customDoc.type;
      isCustom = true;
    }
  }
  if (!option || !type) {
    return json({ error: 'Classification option not found' }, 404);
  }
  const denied = await screenDenial({ session, screen: classificationScreen(type), action: PERM.DELETE, businessId: option.businessId, label: 'Classification option' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const now = new Date();
  const usedCount = await db.collection('ecommerceproduct').countDocuments({
    businessId: businessMatch(option.businessId),
    [type]: { $in: [_id, id] },
  });

  if (isCustom) {
    await customCol.updateOne(
      { _id },
      { $set: { isActive: false, deletedAt: now, updatedAt: now } },
    );
  } else {
    await classificationCollection(type).updateOne(
      { _id },
      {
        $set: { isActive: false, deletedAt: now, updatedAt: now },
        $setOnInsert: {
          businessId: option.businessId,
          type,
          productType: option.productType || '',
          name: option.name || '',
          displayOrder: option.displayOrder ?? 0,
          createdAt: option.createdAt || now,
        },
      },
      { upsert: true },
    );
    try {
      await pco.updateOne(
        { _id },
        { $set: { isActive: false, deletedAt: now, updatedAt: now } },
      );
    } catch {}
  }

  return json({ ok: true, softDeleted: true, usedCount });
}
