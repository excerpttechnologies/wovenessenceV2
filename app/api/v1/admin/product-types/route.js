// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
// import { PRODUCT_TYPES } from '@/lib/productClassificationConstants';

// const json = (data, status = 200) => Response.json(data, { status });
// const TYPE_COLLECTION = 'producttypes';

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const businessId = new URL(req.url).searchParams.get('business');
//   if (!businessId || !isValidObjectId(businessId)) {
//     return json({ error: 'Valid business ID required' }, 422);
//   }

//   const connection = await dbConnect();
//   const collection = connection.connection.db.collection(TYPE_COLLECTION);
//   const defaults = PRODUCT_TYPES.filter((type) => type.value).map((type, index) => ({
//     businessId,
//     value: type.value,
//     label: type.label,
//     displayOrder: index,
//     isActive: true,
//   }));

//   await collection.bulkWrite(defaults.map((type) => ({
//     updateOne: {
//       filter: { businessId, value: type.value },
//       update: { $setOnInsert: type },
//       upsert: true,
//     },
//   })));

//   const types = await collection.find({ businessId, isActive: true })
//     .sort({ displayOrder: 1, label: 1 })
//     .project({ value: 1, label: 1, _id: 0 })
//     .toArray();

//   return json({ types: [{ value: '', label: 'Not Specified' }, ...types] });
// }

// /* E-commerce -> Product Type page (29-10-2026): a type added here shows in the
//    Product Type dropdown on product-eccom/add straight away (same collection). */
// const BUILT_IN = new Set(PRODUCT_TYPES.map((type) => type.value).filter(Boolean));

// export async function POST(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const body = await req.json().catch(() => ({}));
//   const businessId = String(body.business || '');
//   if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);
//   const label = String(body.name || '').trim().replace(/\s+/g, ' ');
//   if (!label) return json({ error: 'Enter a product type name.' }, 422);
//   if (label.length > 60) return json({ error: 'Keep the name under 60 characters.' }, 422);
//   const value = label.toUpperCase();

//   const connection = await dbConnect();
//   const collection = connection.connection.db.collection(TYPE_COLLECTION);
//   const existing = await collection.findOne({ businessId, value });
//   if (existing?.isActive) return json({ error: '"' + label + '" already exists.' }, 409);

//   const last = await collection.find({ businessId }).sort({ displayOrder: -1 }).limit(1).toArray();
//   const displayOrder = Number(last[0]?.displayOrder ?? -1) + 1;
//   /* a type deleted before comes back instead of a second copy */
//   await collection.updateOne(
//     { businessId, value },
//     { $set: { label, isActive: true, displayOrder, updatedAt: new Date() }, $setOnInsert: { businessId, value, createdAt: new Date() } },
//     { upsert: true },
//   );
//   return json({ type: { value, label } }, 201);
// }

// export async function DELETE(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const params = new URL(req.url).searchParams;
//   const businessId = params.get('business') || '';
//   const value = String(params.get('value') || '').trim();
//   if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);
//   if (!value) return json({ error: 'Product type required' }, 422);
//   /* the website's categories (Sarees, Fabrics...) are built on these */
//   if (BUILT_IN.has(value)) return json({ error: 'Built-in product types cannot be deleted.' }, 422);

//   const connection = await dbConnect();
//   const db = connection.connection.db;
//   const used = await db.collection('ecommerceproduct').countDocuments({ productType: value });
//   if (used) return json({ error: '"' + value + '" is used by ' + used + ' e-commerce product(s). Change their Product Type first.' }, 409);

//   const result = await db.collection(TYPE_COLLECTION).updateOne(
//     { businessId, value, isActive: true },
//     { $set: { isActive: false, updatedAt: new Date() } },
//   );
//   if (!result.matchedCount) return json({ error: 'Product type not found.' }, 404);
//   return json({ ok: true });
// }



import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { CLASSIFICATION_TYPES, PRODUCT_TYPES } from '@/lib/productClassificationConstants';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { businessMatch } from '@/lib/classificationCollections';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import { normalizeFilterConfig, normalizeGroupConfig } from '@/lib/ecommerceFilterConfig';

const json = (data, status = 200) => Response.json(data, { status });
const TYPE_COLLECTION = 'producttypes';
const VALID_FILTERS = new Set(Object.values(CLASSIFICATION_TYPES));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const businessId = new URL(req.url).searchParams.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  const connection = await dbConnect();
  const collection = connection.connection.db.collection(TYPE_COLLECTION);
  const defaults = PRODUCT_TYPES.filter((type) => type.value).map((type, index) => ({
    businessId,
    value: type.value,
    label: type.label,
    displayOrder: index,
    isActive: true,
  }));

  await collection.bulkWrite(defaults.map((type) => ({
    updateOne: {
      filter: { businessId, value: type.value },
      update: { $setOnInsert: type },
      upsert: true,
    },
  })));

  const types = await collection.find({ businessId, isActive: true })
    .sort({ displayOrder: 1, label: 1 })
    .project({
      value: 1, label: 1, filters: 1, filterConfig: 1, displayOrder: 1,
      displayName: 1, ecommerceSlug: 1, ecommerceVisible: 1,
      ecommerceEnabled: 1, ecommerceDisplayOrder: 1, description: 1, _id: 0,
    })
    .toArray();

  return json({
    types: [
      { value: '', label: 'Not Specified' },
      ...types.filter((type) => String(type.value || '').trim().toUpperCase() !== 'SIMPLE'),
    ],
  });
}

/* E-commerce -> Product Type page (29-10-2026): a type added here shows in the
   Product Type dropdown on product-eccom/add straight away (same collection). */
const BUILT_IN = new Set(PRODUCT_TYPES.map((type) => type.value).filter(Boolean));

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);
  const denial = await screenDenial({ session, screen: SCREENS.ECOM_PRODUCT_TYPE, action: PERM.CREATE, businessId, label: 'Product Type' });
  if (denial) return json({ error: denial.message, code: denial.code }, 403);
  const label = String(body.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!label) return json({ error: 'Enter a product type name.' }, 422);
  if (label.length > 60) return json({ error: 'Keep the name under 60 characters.' }, 422);
  const value = label.toUpperCase();

  const connection = await dbConnect();
  const collection = connection.connection.db.collection(TYPE_COLLECTION);
  const existing = await collection.findOne({ businessId, value });
  if (existing?.isActive) return json({ error: '"' + label + '" already exists.' }, 409);

  const last = await collection.find({ businessId }).sort({ displayOrder: -1 }).limit(1).toArray();
  const displayOrder = Number(last[0]?.displayOrder ?? -1) + 1;
  /* a type deleted before comes back instead of a second copy */
  await collection.updateOne(
    { businessId, value },
    {
      $set: {
        label, isActive: true, displayOrder, updatedAt: new Date(),
        ...(body.ecommerce ? normalizeGroupConfig(body.ecommerce, { label, value }) : {}),
        ...(body.filterConfig ? { filterConfig: normalizeFilterConfig(body.filterConfig) } : {}),
      },
      $setOnInsert: { businessId, value, createdAt: new Date() },
    },
    { upsert: true },
  );
  await bumpCatalogVersion(businessId);
  return json({ type: { value, label } }, 201);
}

export async function PUT(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  const body = await req.json().catch(() => ({}));
  const businessId = String(body.business || '');
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);
  const denial = await screenDenial({ session, screen: SCREENS.ECOM_PRODUCT_TYPE, action: PERM.UPDATE, businessId, label: 'Product Type' });
  if (denial) return json({ error: denial.message, code: denial.code }, 403);

  const oldValue = String(body.value || '').trim().toUpperCase();
  const label = String(body.name || '').trim().replace(/\s+/g, ' ').toUpperCase();
  if (!oldValue) return json({ error: 'Product type required' }, 422);
  if (!label) return json({ error: 'Enter a product type name.' }, 422);
  if (label.length > 60) return json({ error: 'Keep the name under 60 characters.' }, 422);

  const connection = await dbConnect();
  const db = connection.connection.db;
  const collection = db.collection(TYPE_COLLECTION);
  const current = await collection.findOne({ businessId, value: oldValue, isActive: true });
  if (!current) return json({ error: 'Product type not found.' }, 404);

  const builtIn = BUILT_IN.has(oldValue);
  const newValue = builtIn ? oldValue : label;
  const duplicates = await collection.find({
    businessId, isActive: true, _id: { $ne: current._id },
  }).toArray();
  if (duplicates.some((row) => [row.value, row.label].some((value) => String(value || '').trim().toUpperCase() === label))) {
    return json({ error: '"' + label + '" already exists.' }, 409);
  }
  const hasFilters = Array.isArray(body.filters);
  const filters = hasFilters
    ? [...new Set(body.filters.map((filter) => String(filter || '').trim()).filter((filter) => VALID_FILTERS.has(filter)))]
    : undefined;
  const hasFilterConfig = body.filterConfig && typeof body.filterConfig === 'object' && !Array.isArray(body.filterConfig);
  const hasEcommerce = body.ecommerce && typeof body.ecommerce === 'object' && !Array.isArray(body.ecommerce);
  await collection.updateOne(
    { _id: current._id },
    {
      $set: {
        label,
        ...(builtIn ? {} : { value: newValue }),
        ...(hasFilters ? { filters } : {}),
        ...(hasFilterConfig ? { filterConfig: normalizeFilterConfig(body.filterConfig) } : {}),
        ...(hasEcommerce ? normalizeGroupConfig(body.ecommerce, { label, value: newValue }) : {}),
        updatedAt: new Date(),
      },
    },
  );
  await bumpCatalogVersion(businessId);
  if (!builtIn && newValue !== oldValue) {
    await db.collection('ecommerceproduct').updateMany(
      { businessId: businessMatch(businessId), productType: oldValue },
      { $set: { productType: newValue, updatedAt: new Date() } },
    );
  }
  return json({ ok: true, type: { value: newValue, label, ...(hasFilters ? { filters } : {}) } });
}

export async function DELETE(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const businessId = params.get('business') || '';
  const value = String(params.get('value') || '').trim();
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);
  if (!value) return json({ error: 'Product type required' }, 422);
  const denial = await screenDenial({ session, screen: SCREENS.ECOM_PRODUCT_TYPE, action: PERM.DELETE, businessId, label: 'Product Type' });
  if (denial) return json({ error: denial.message, code: denial.code }, 403);

  const connection = await dbConnect();
  const db = connection.connection.db;
  const used = await db.collection('ecommerceproduct').countDocuments({ businessId: businessMatch(businessId), productType: value });
  if (used) return json({ error: 'This type is used by ' + used + ' products. Change those products first.' }, 409);

  const result = await db.collection(TYPE_COLLECTION).updateOne(
    { businessId, value, isActive: true },
    { $set: { isActive: false, updatedAt: new Date() } },
  );
  if (!result.matchedCount) return json({ error: 'Product type not found.' }, 404);
  await bumpCatalogVersion(businessId);
  return json({ ok: true });
}