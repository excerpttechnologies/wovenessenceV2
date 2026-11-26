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
import {
  ECOMMERCE_FILTER_VALUES_COLLECTION,
  findCustomFilterDefinition,
  getValidFilterKeys,
} from '@/lib/ecommerceFilterMaster';
import {
  CLASSIFICATION_GROUPS,
  classificationGroupKey,
  classificationGroupKeyFor,
  classificationGroupsFor,
} from '@/lib/productClassificationConstants';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

const json = (d, s = 200) => Response.json(d, { status: s });

const classificationScreen = (type) => ({
  byWeave: SCREENS.ECOM_BY_WEAVE,
  byFabric: SCREENS.ECOM_BY_FABRIC,
  byCraft: SCREENS.ECOM_BY_CRAFT,
  byOccasion: SCREENS.ECOM_BY_OCCASION,
  byColour: SCREENS.ECOM_BY_COLOUR,
}[type] || SCREENS.ECOM_PRODUCT_TYPE);

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

  await dbConnect();
  const isBuiltIn = !type || CLASSIFICATION_FIELDS.includes(type);
  let resolvedType = type || '';
  if (type && !isBuiltIn) {
    const customDef = await findCustomFilterDefinition(businessId, type, { includeInactive: true });
    if (!customDef) {
      return json({ error: 'Invalid classification type' }, 422);
    }
    resolvedType = customDef.key;
  }

  const productTypeKey = classificationGroupKey(productType);
  const allTypes = resolvedType
    ? [resolvedType]
    : [...await getValidFilterKeys(businessId, { includeInactive: false })];

  let options = await listClassificationOptions(businessId, {
    types: allTypes,
    productType: productTypeKey || undefined,
  });

  const search = (sp.get('search') || '').trim().toLowerCase();
  if (search) options = options.filter((row) => String(row.name || '').toLowerCase().includes(search));

  const grouped = Object.fromEntries([...new Set([...CLASSIFICATION_FIELDS, ...allTypes])].map((t) => [t, []]));
  options.forEach((row) => {
    if (!grouped[row.type]) grouped[row.type] = [];
    grouped[row.type].push(shape(row));
  });

  const groups = resolvedType
    ? (CLASSIFICATION_FIELDS.includes(resolvedType) ? classificationGroupsFor(resolvedType) : CLASSIFICATION_GROUPS)
    : [];

  const response = {
    options: grouped,
    all: options.map(shape),
    groups,
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
  if (!type) {
    return json({ error: 'Valid classification type required' }, 422);
  }

  await dbConnect();
  const isBuiltIn = CLASSIFICATION_FIELDS.includes(type);
  let resolvedType = type;
  if (!isBuiltIn) {
    const customDef = await findCustomFilterDefinition(business, type, { includeInactive: true });
    if (!customDef) {
      return json({ error: 'Valid classification type required (built-in or registered custom filter)' }, 422);
    }
    resolvedType = customDef.key;
  }

  const denied = await screenDenial({
    session,
    screen: classificationScreen(resolvedType),
    action: PERM.CREATE,
    businessId: business,
    label: 'Classification option',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const applicableGroups = isBuiltIn ? classificationGroupsFor(resolvedType) : CLASSIFICATION_GROUPS;
  const rawProductType = classificationGroupKey(body.productType);
  const productType = rawProductType
    ? (applicableGroups.some((g) => g.value === rawProductType)
        ? rawProductType
        : classificationGroupKeyFor(rawProductType))
    : '';
  const trimmedName = String(name || '').trim().replace(/\s+/g, ' ');
  if (!trimmedName || trimmedName.length > 100) {
    return json({ error: 'Name is required and must be 100 characters or less' }, 422);
  }

  const db = mongoose.connection.db;
  const col = isBuiltIn
    ? classificationCollection(resolvedType)
    : db.collection(ECOMMERCE_FILTER_VALUES_COLLECTION);
  const pco = isBuiltIn ? db.collection('productclassificationoption') : null;
  const nameRegex = { $regex: `^${escapeRegex(trimmedName)}$`, $options: 'i' };
  const bScope = businessMatch(business);
  const customTypeScope = isBuiltIn ? {} : { filterKey: resolvedType };
  const groupScope = productType
    ? { $or: [{ productType }, { productType: '' }, { productType: null }, { productType: { $exists: false } }] }
    : {};

  // Reject active duplicates in the same business/group (or shared pool)
  const existingActiveCol = await col.findOne({
    businessId: bScope,
    ...customTypeScope,
    isActive: { $ne: false },
    name: nameRegex,
    ...groupScope,
  });
  if (existingActiveCol) {
    return json({ error: `"${trimmedName}" already exists.`, option: shape({ ...existingActiveCol, type: resolvedType }) }, 409);
  }

  let existingActivePco = null;
  if (pco) {
    try {
      existingActivePco = await pco.findOne({
        businessId: bScope,
        type: resolvedType,
        isActive: { $ne: false },
        name: nameRegex,
        ...groupScope,
      });
    } catch {}
  }
  if (existingActivePco) {
    await col.updateOne({ _id: existingActivePco._id }, { $set: { ...existingActivePco, type: resolvedType } }, { upsert: true });
    return json({ error: `"${trimmedName}" already exists.`, option: shape({ ...existingActivePco, type: resolvedType }) }, 409);
  }

  const now = new Date();
  // Reactivate soft-deleted entry cleanly if present instead of leaving a duplicate
  const inactiveMatch = await col.findOne({
    businessId: bScope,
    ...customTypeScope,
    isActive: false,
    name: nameRegex,
    ...(productType ? { productType: { $in: [productType, '', null] } } : {}),
  });
  if (inactiveMatch) {
    const reactivated = {
      ...inactiveMatch,
      ...(isBuiltIn ? {} : { filterKey: resolvedType }),
      type: resolvedType,
      name: trimmedName,
      productType: productType || inactiveMatch.productType || '',
      isActive: true,
      updatedAt: now,
    };
    delete reactivated.deletedAt;
    await col.updateOne(
      { _id: inactiveMatch._id },
      {
        $set: {
          name: reactivated.name,
          productType: reactivated.productType,
          isActive: true,
          updatedAt: now,
          ...(isBuiltIn ? {} : { filterKey: resolvedType, type: resolvedType }),
        },
        $unset: { deletedAt: '' },
      },
    );
    if (pco) {
      try {
        await pco.updateOne(
          { _id: inactiveMatch._id },
          { $set: { ...reactivated, type: resolvedType }, $unset: { deletedAt: '' } },
          { upsert: true },
        );
      } catch {}
    }
    return json({ ok: true, reactivated: true, option: shape(reactivated) }, 201);
  }

  const last = await col.find({ businessId: bScope, ...customTypeScope }, { projection: { displayOrder: 1 } })
    .sort({ displayOrder: -1 }).limit(1).toArray();
  const doc = {
    _id: new Types.ObjectId(),
    businessId: new Types.ObjectId(business),
    ...(isBuiltIn ? {} : { filterKey: resolvedType }),
    type: resolvedType,
    productType,
    name: trimmedName,
    displayOrder: (last[0]?.displayOrder ?? 0) + 1,
    isActive: true,
    createdAt: now,
    updatedAt: now,
  };
  await col.insertOne(doc);
  if (pco) {
    try {
      await pco.updateOne(
        { _id: doc._id },
        { $set: doc },
        { upsert: true }
      );
    } catch {}
  }

  return json({ ok: true, option: shape(doc) }, 201);
}

