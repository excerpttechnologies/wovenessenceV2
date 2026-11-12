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
import { normalizeFilterConfig, normalizeGroupConfig, slugify } from '@/lib/ecommerceFilterConfig';

const json = (data, status = 200) => Response.json(data, { status });
const TYPE_COLLECTION = 'producttypes';
const VALID_FILTERS = new Set(Object.values(CLASSIFICATION_TYPES));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const businessId = params.get('business');
  /* all=1 is the management screen: it also lists disabled groups. Without
     it only active types are returned, preserving the product form
     dropdown. */
  const all = params.get('all') === '1';
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

  const types = await collection.find(all ? { businessId } : { businessId, isActive: true })
    .sort({ displayOrder: 1, label: 1 })
    .project({
      value: 1, label: 1, filters: 1, filterConfig: 1, displayOrder: 1,
      displayName: 1, ecommerceSlug: 1, ecommerceVisible: 1,
      description: 1, isActive: 1, _id: 0,
    })
    .toArray();
  const groups = types.filter((type) => {
    const value = String(type.value || '').trim();
    return value && value.toUpperCase() !== 'SIMPLE';
  });

  return json({
    types: all ? groups : [{ value: '', label: 'Not Specified' }, ...groups],
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
        ...(body.filterConfig ? (() => {
          const config = normalizeFilterConfig(body.filterConfig);
          return { filterConfig: config, filters: config.map((entry) => entry.key) };
        })() : {}),
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
  const label = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (!oldValue) return json({ error: 'Product type required' }, 422);
  if (!label) return json({ error: 'Enter a product type name.' }, 422);
  if (label.length > 60) return json({ error: 'Keep the name under 60 characters.' }, 422);

  const connection = await dbConnect();
  const db = connection.connection.db;
  const collection = db.collection(TYPE_COLLECTION);
  /* disabled rows are editable too, so a group can be re-enabled */
  const current = await collection.findOne({ businessId, value: oldValue });
  if (!current) return json({ error: 'Product type not found.' }, 404);

  /* Unknown filter keys are a client bug, not something to drop silently. */
  const filterInput = body.filterConfig !== undefined ? body.filterConfig : body.filters;
  const suppliedKeys = Array.isArray(filterInput)
    ? filterInput.map((entry) => String(entry?.key || entry?.field || entry || '').trim())
    : filterInput && typeof filterInput === 'object'
      ? Object.keys(filterInput)
      : [];
  const unknown = suppliedKeys.filter((key) => key && !VALID_FILTERS.has(key));
  if (unknown.length) {
    return json({ error: `Unknown filter "${unknown[0]}".` }, 422);
  }

  const filterConfig = body.filterConfig !== undefined
    ? normalizeFilterConfig(body.filterConfig)
    : null;
  const filters = filterConfig
    ? filterConfig.map((entry) => entry.key)
    : Array.isArray(body.filters)
      ? [...new Set(body.filters.map((filter) => String(filter || '').trim()).filter((filter) => VALID_FILTERS.has(filter)))]
      : undefined;

  const builtIn = BUILT_IN.has(oldValue);
  const newValue = builtIn ? oldValue : label.toUpperCase();

  const hasEcom = ['displayName', 'ecommerceSlug', 'description', 'ecommerceVisible']
    .some((key) => body[key] !== undefined);
  const ecom = hasEcom ? normalizeGroupConfig(body, { label, value: newValue }) : null;

  const others = await collection.find({
    businessId, isActive: { $ne: false }, _id: { $ne: current._id },
  }).project({
    value: 1, label: 1, displayName: 1, ecommerceSlug: 1, ecommerceVisible: 1,
  }).toArray();

  const labelKey = label.toUpperCase();
  if (others.some((row) => [row.value, row.label].some((value) => String(value || '').trim().toUpperCase() === labelKey))) {
    return json({ error: '"' + label + '" already exists.' }, 409);
  }

  /* duplicate live slugs would make two collections share one URL */
  if (ecom) {
    const clash = others.find((row) => {
      if (row.ecommerceVisible === false) return false;
      const slug = String(row.ecommerceSlug || '').trim()
        || slugify(row.displayName || row.label || row.value);
      return slug === ecom.ecommerceSlug;
    });
    if (clash) {
      return json({
        error: `Slug "${ecom.ecommerceSlug}" is already used by "${clash.displayName || clash.label}".`,
      }, 409);
    }
  }

  const hasOrder = body.displayOrder !== undefined && Number.isFinite(Number(body.displayOrder));
  const hasActive = body.isActive !== undefined;
  const nextActive = body.isActive === true || body.isActive === 'true'
    || body.isActive === 1 || body.isActive === '1';

  await collection.updateOne(
    { _id: current._id },
    {
      $set: {
        label,
        ...(builtIn ? {} : { value: newValue }),
        ...(ecom || {}),
        ...(hasActive ? { isActive: nextActive } : {}),
        ...(hasOrder ? { displayOrder: Number(body.displayOrder) } : {}),
        ...(filterConfig ? { filterConfig, filters } : {}),
        ...(!filterConfig && filters !== undefined ? { filters } : {}),
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
  return json({
    ok: true,
    type: {
      value: newValue,
      label,
      isActive: hasActive ? nextActive : current.isActive !== false,
      ...(filterConfig ? { filterConfig, filters } : {}),
    },
  });
}
