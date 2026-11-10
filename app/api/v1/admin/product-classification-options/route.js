import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import {
  CLASSIFICATION_FIELDS,
  businessMatch,
  classificationCollection,
  listClassificationOptions,
} from '@/lib/classificationCollections';
import { classificationGroupKey, classificationGroupsFor } from '@/lib/productClassificationConstants';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const json = (d, s = 200) => Response.json(d, { status: s });

const classificationScreen = (type) => ({
  byWeave: SCREENS.ECOM_BY_WEAVE,
  byFabric: SCREENS.ECOM_BY_FABRIC,
  byCraft: SCREENS.ECOM_BY_CRAFT,
  byOccasion: SCREENS.ECOM_BY_OCCASION,
  byColour: SCREENS.ECOM_BY_COLOUR,
}[type]);

const shape = (row) => ({
  _id: String(row._id),
  name: row.name,
  type: row.type,
  productType: row.productType || '',
  displayOrder: row.displayOrder,
});

/* GET /api/v1/admin/product-classification-options
   Reads classification options from byweave / byfabric / bycraft / byoccasion / bycolour collections
   
   Query params:
   - business: business ID (required)
   - type: one of byWeave, byFabric, byCraft, byOccasion, byColour (optional, all if omitted)
   - productType: the group (SAREES, FABRICS, PLAIN FABRICS, DUPATTA, SIMPLE) (optional)
   - search: search term (optional)
   
   Returns: { options: { byWeave: [...], ... }, all: [...], groups: [...] }
*/
export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const businessId = sp.get('business');
  const type = sp.get('type');
  const productType = sp.get('productType');
  
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }
  if (type && !CLASSIFICATION_FIELDS.includes(type)) {
    return json({ error: 'Invalid classification type' }, 422);
  }

  await dbConnect();
  const productTypeKey = classificationGroupKey(productType);
  
  let options = await listClassificationOptions(businessId, {
    types: type ? [type] : CLASSIFICATION_FIELDS,
    productType: productTypeKey || undefined,
  });
  
  const search = (sp.get('search') || '').trim().toLowerCase();
  if (search) options = options.filter((row) => String(row.name || '').toLowerCase().includes(search));

  const grouped = Object.fromEntries(CLASSIFICATION_FIELDS.map((t) => [t, []]));
  options.forEach((row) => grouped[row.type].push(shape(row)));

  const response = {
    options: grouped,
    all: options.map(shape),
    groups: type ? classificationGroupsFor(type) : [],
  };
  
  return json(response);
}

/* POST /api/v1/admin/product-classification-options
   Adds one classification name to a specific type and group
   
   Body: { business, type, productType, name }
   Returns: { ok: true, option: {...} }
*/
export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const { business, type, name } = body;

  if (!business || !isValidObjectId(business)) {
    return json({ error: 'Valid business ID required' }, 422);
  }
  if (!type || !CLASSIFICATION_FIELDS.includes(type)) {
    return json({ error: 'Valid classification type required (byWeave, byFabric, byCraft, byOccasion, byColour)' }, 422);
  }
  const productType = classificationGroupKey(body.productType);
  const group = classificationGroupsFor(type).find((g) => g.value === productType);
  if (!group) {
    return json({ error: productType ? `"${body.productType}" does not use this list.` : 'Select a group first.' }, 422);
  }
  const trimmedName = String(name || '').trim();
  if (!trimmedName || trimmedName.length > 100) {
    return json({ error: 'Name is required and must be 100 characters or less' }, 422);
  }

  await dbConnect();
  const col = classificationCollection(type);
  const inGroup = { businessId: businessMatch(business), productType };

  const existing = await col.findOne({
    ...inGroup,
    isActive: { $ne: false },
    name: { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' },
  });
  if (existing) {
    return json({ error: `"${trimmedName}" already exists in ${group.label}` }, 422);
  }

  const last = await col.find(inGroup, { projection: { displayOrder: 1 } })
    .sort({ displayOrder: -1 }).limit(1).toArray();
  const now = new Date();
  const doc = {
    businessId: new Types.ObjectId(business),
    type,
    productType,
    name: trimmedName,
    displayOrder: (last[0]?.displayOrder ?? 0) + 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  const res = await col.insertOne(doc);

  return json({ ok: true, option: shape({ ...doc, _id: res.insertedId }) });
}

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
  const denied = await screenDenial({ session, screen: classificationScreen(type), action: PERM.DELETE, businessId: option.businessId, label: 'Classification option' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await classificationCollection(type).deleteOne({ _id });
  const products = await mongoose.connection.db.collection('ecommerceproduct').updateMany(
    { businessId: businessMatch(option.businessId), [type]: { $in: [_id, id] } },
    { $pull: { [type]: { $in: [_id, id] } }, $set: { updatedAt: new Date() } },
  );

  return json({ ok: true, productsUpdated: products.modifiedCount });
}
	