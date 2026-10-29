import { isValidObjectId, Types } from 'mongoose';
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

const json = (d, s = 200) => Response.json(d, { status: s });

/* /api/v1/admin/product-classification-options (rewritten 29-10-2026)

   Reads and writes the byweave / byfabric / bycraft / byoccasion / bycolour
   collections (lib/classificationCollections.js) - productclassificationoption
   is no longer used, and no default names are created any more: every name
   comes from E-commerce -> By Weave / By Fabric / ... or "Add New By ...".

   GET  ?business=&type=&productType=&search=
        type         one of byWeave, byFabric, byCraft, byOccasion, byColour (all when left out)
        productType  the group (SAREES, FABRICS, PLAIN FABRICS, DUPATTA, SIMPLE);
                     left out = every group
        answers { options: { byWeave: [...], ... }, all: [...], groups: [...] }
   POST { business, type, productType, name } adds one name to that group */

const shape = (row) => ({
  _id: String(row._id),
  name: row.name,
  type: row.type,
  productType: row.productType || '',
  displayOrder: row.displayOrder,
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const businessId = sp.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }
  const type = sp.get('type');
  if (type && !CLASSIFICATION_FIELDS.includes(type)) {
    return json({ error: 'Invalid classification type' }, 422);
  }

  await dbConnect();
  const productType = classificationGroupKey(sp.get('productType'));
  let options = await listClassificationOptions(businessId, {
    types: type ? [type] : CLASSIFICATION_FIELDS,
    productType: productType || undefined,
  });
  const search = (sp.get('search') || '').trim().toLowerCase();
  if (search) options = options.filter((row) => String(row.name || '').toLowerCase().includes(search));

  const grouped = Object.fromEntries(CLASSIFICATION_FIELDS.map((t) => [t, []]));
  options.forEach((row) => grouped[row.type].push(shape(row)));

  return json({
    options: grouped,
    all: options.map(shape),
    groups: type ? classificationGroupsFor(type) : [],
  });
}

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
