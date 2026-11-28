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



import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { CLASSIFICATION_TYPES, PRODUCT_TYPES } from '@/lib/productClassificationConstants';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { businessMatch } from '@/lib/classificationCollections';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import {
  FILTER_PLACEMENTS,
  LEGACY_DEFAULT_PLACEMENT,
  NEW_DEFAULT_PLACEMENT,
  isValidPlacement,
  normalizeFilterConfig,
  normalizeGroupConfig,
  resolveGroupFilters,
} from '@/lib/ecommerceFilterConfig';
import { getDeletedFilterKeys, getValidFilterKeys } from '@/lib/ecommerceFilterMaster';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
/* These two lists drive the E-Commerce sidebar and the Product Type screen,
   so a browser or proxy must never answer a later load with a stale copy of
   a record that has since been deleted. */
const NO_STORE = { 'Cache-Control': 'no-store, max-age=0' };
const TYPE_COLLECTION = 'producttypes';
const BUILT_IN_FILTERS = new Set(Object.values(CLASSIFICATION_TYPES));

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
  const bScope = businessMatch(businessId);

  const [validFilterKeys, deletedFilterKeys] = await Promise.all([
    getValidFilterKeys(businessId, { includeInactive: true }),
    getDeletedFilterKeys(businessId),
  ]);
  const validKeySet = [...new Set([...BUILT_IN_FILTERS, ...validFilterKeys])].filter((k) => !deletedFilterKeys.has(k));

  const types = await collection.find(all ? { businessId: bScope } : { businessId: bScope, isActive: { $ne: false } })
    .sort({ displayOrder: 1, label: 1 })
    .project({
      value: 1, label: 1, filters: 1, filterConfig: 1, displayOrder: 1,
      displayName: 1, ecommerceVisible: 1,
      description: 1, isActive: 1, _id: 1,
    })
    .toArray();
  const validKeyLookup = new Set(validKeySet);
  const groups = types
    .map((type) => {
      const resolvedConfig = resolveGroupFilters(type, { validKeys: validKeySet });
      const normalizedFilters = Array.isArray(type.filters)
        ? type.filters
          .map((f) => (f && typeof f === 'object' ? String(f.key || f.field || f.filterId || '').trim() : String(f || '').trim()))
          .filter((k) => k && validKeyLookup.has(k))
        : [];
      return {
        ...type,
        _id: String(type._id),
        filters: normalizedFilters.length ? normalizedFilters : resolvedConfig.map((entry) => entry.key),
        filterConfig: resolvedConfig,
      };
    })
    .filter((type) => {
      const value = String(type.value || '').trim();
      return value && value.toUpperCase() !== 'SIMPLE';
    });

  return json({
    types: all ? groups : [{ value: '', label: 'Not Specified' }, ...groups],
  }, 200, NO_STORE);
}

function validateFilterPlacements(filterInput) {
  const entries = Array.isArray(filterInput)
    ? filterInput
    : filterInput && typeof filterInput === 'object'
      ? Object.values(filterInput)
      : [];
  for (const entry of entries) {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) continue;
    if (entry.placement !== undefined && entry.placement !== null && entry.placement !== '' && !isValidPlacement(entry.placement)) {
      return `Invalid filter placement "${entry.placement}". Allowed: ${FILTER_PLACEMENTS.join(', ')}.`;
    }
  }
  return null;
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
  const label = String(body.name || '').trim().replace(/\s+/g, ' ');
  if (!label) return json({ error: 'Enter a product type name.' }, 422);
  if (label.length > 60) return json({ error: 'Keep the name under 60 characters.' }, 422);
  const value = label.toUpperCase();

  const connection = await dbConnect();
  const validFilterKeys = await getValidFilterKeys(businessId, { includeInactive: true });
  const validSet = new Set([...BUILT_IN_FILTERS, ...validFilterKeys]);

  const filterInput = body.filterConfig !== undefined ? body.filterConfig : body.filters;
  const placementError = validateFilterPlacements(filterInput);
  if (placementError) return json({ error: placementError }, 422);
  const suppliedKeys = Array.isArray(filterInput)
    ? filterInput.map((entry) => String(entry?.key || entry?.field || entry?.filterId || entry || '').trim())
    : filterInput && typeof filterInput === 'object'
      ? Object.keys(filterInput)
      : [];
  const unknown = suppliedKeys.filter((key) => key && !validSet.has(key));
  if (unknown.length) {
    return json({ error: `Unknown filter "${unknown[0]}".` }, 422);
  }

  let initialFilterPatch = {};
  if (body.filterConfig !== undefined) {
    const config = normalizeFilterConfig(body.filterConfig, { validKeys: [...validSet], defaultPlacement: NEW_DEFAULT_PLACEMENT });
    initialFilterPatch = { filterConfig: config, filters: config.map((entry) => entry.key) };
  } else if (Array.isArray(body.filters)) {
    const config = normalizeFilterConfig(
      body.filters.map((f, index) => (f && typeof f === 'object' ? { ...f, displayOrder: f.displayOrder ?? index } : { key: String(f || '').trim(), displayOrder: index })),
      { validKeys: [...validSet], defaultPlacement: NEW_DEFAULT_PLACEMENT },
    );
    initialFilterPatch = { filterConfig: config, filters: config.map((entry) => entry.key) };
  }

  const collection = connection.connection.db.collection(TYPE_COLLECTION);
  const bScope = businessMatch(businessId);
  const existing = await collection.findOne({ businessId: bScope, value });
  if (existing?.isActive) return json({ error: '"' + label + '" already exists.' }, 409);

  const last = await collection.find({ businessId: bScope }).sort({ displayOrder: -1 }).limit(1).toArray();
  const displayOrder = Number(last[0]?.displayOrder ?? -1) + 1;
  /* a type deleted before comes back instead of a second copy */
  await collection.updateOne(
    { businessId: existing ? existing.businessId : businessId, value },
    {
      $set: {
        label, isActive: true, displayOrder, updatedAt: new Date(),
        ...(body.ecommerce ? normalizeGroupConfig(body.ecommerce, { label, value }) : {}),
        ...initialFilterPatch,
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
  const bScope = businessMatch(businessId);
  /* disabled rows are editable too, so a group can be re-enabled */
  const current = await collection.findOne({ businessId: bScope, value: oldValue });
  if (!current) return json({ error: 'Product type not found.' }, 404);

  /* Unknown filter keys are a client bug, not something to drop silently. */
  const [validFilterKeys, deletedFilterKeys] = await Promise.all([
    getValidFilterKeys(businessId, { includeInactive: true }),
    getDeletedFilterKeys(businessId),
  ]);
  const validSet = new Set(
    [...BUILT_IN_FILTERS, ...validFilterKeys].filter((k) => !deletedFilterKeys.has(k)),
  );
  const filterInput = body.filterConfig !== undefined ? body.filterConfig : body.filters;
  const placementError = validateFilterPlacements(filterInput);
  if (placementError) return json({ error: placementError }, 422);
  const suppliedKeys = Array.isArray(filterInput)
    ? filterInput.map((entry) => String(entry?.key || entry?.field || entry?.filterId || entry || '').trim())
    : filterInput && typeof filterInput === 'object'
      ? Object.keys(filterInput)
      : [];
  const unknown = suppliedKeys.filter((key) => key && !validSet.has(key) && !deletedFilterKeys.has(key));
  if (unknown.length) {
    return json({ error: `Unknown filter "${unknown[0]}".` }, 422);
  }

  const filterConfig = body.filterConfig !== undefined
    ? normalizeFilterConfig(body.filterConfig, { validKeys: [...validSet], defaultPlacement: LEGACY_DEFAULT_PLACEMENT })
    : Array.isArray(body.filters) && body.filters.some((f) => f && typeof f === 'object')
      ? normalizeFilterConfig(body.filters, { validKeys: [...validSet], defaultPlacement: LEGACY_DEFAULT_PLACEMENT })
      : null;
  const filters = filterConfig
    ? filterConfig.map((entry) => entry.key)
    : Array.isArray(body.filters)
      ? [...new Set(body.filters.map((filter) => String(filter || '').trim()).filter((filter) => validSet.has(filter)))]
      : undefined;

  const builtIn = BUILT_IN.has(oldValue);
  const newValue = builtIn ? oldValue : label.toUpperCase();

  const hasEcom = ['displayName', 'ecommerceSlug', 'description', 'ecommerceVisible']
    .some((key) => body[key] !== undefined);
  const ecom = hasEcom ? normalizeGroupConfig(body, { label, value: newValue }) : null;

  const others = await collection.find({
    businessId: businessMatch(businessId), isActive: { $ne: false }, _id: { $ne: current._id },
  }).project({
    value: 1, label: 1, displayName: 1, ecommerceVisible: 1,
  }).toArray();

  const labelKey = label.toUpperCase();
  if (others.some((row) => [row.value, row.label].some((value) => String(value || '').trim().toUpperCase() === labelKey))) {
    return json({ error: '"' + label + '" already exists.' }, 409);
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

export async function DELETE(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const body = await req.json().catch(() => ({}));
  const businessId = String(params.get('business') || body.business || '').trim();
  const id = String(params.get('id') || body.id || body._id || '').trim();
  const value = String(params.get('value') || body.value || '').trim().toUpperCase();
  const filterKey = String(params.get('filterKey') || body.filterKey || '').trim();

  if (!isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }
  if (!value && !isValidObjectId(id)) {
    return json({ error: 'Product type identifier required' }, 422);
  }

  const denial = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.DELETE,
    businessId,
    label: filterKey ? 'Product Type Filter' : 'Product Type',
  });
  if (denial) return json({ error: denial.message, code: denial.code }, 403);

  const connection = await dbConnect();
  const db = connection.connection.db;
  const collection = db.collection(TYPE_COLLECTION);
  const bScope = businessMatch(businessId);

  const filter = isValidObjectId(id)
    ? { _id: new Types.ObjectId(id), businessId: bScope }
    : { businessId: bScope, value };
  const existing = await collection.findOne(filter);
  if (!existing) {
    return json({ error: 'Product type not found.' }, 404);
  }

  /* Deleting a single filter removes only its association/configuration on
     this Product Type, leaving shared filter masters and other groups intact. */
  if (filterKey) {
    const assignedList = Array.isArray(existing.filters) ? existing.filters.map(String) : [];
    const existingConfig = Array.isArray(existing.filterConfig) ? existing.filterConfig : [];
    const configKeys = existingConfig.map((entry) => String(entry?.key || entry?.field || '')).filter(Boolean);
    if (!assignedList.includes(filterKey) && !configKeys.includes(filterKey)) {
      return json({
        error: `Filter "${filterKey}" is not configured on "${existing.label || existing.value}".`,
      }, 404);
    }

    const validFilterKeys = await getValidFilterKeys(businessId, { includeInactive: true });
    const allKeys = [...new Set([...BUILT_IN_FILTERS, ...validFilterKeys, ...assignedList, ...configKeys])];
    const resolved = resolveGroupFilters(existing, { validKeys: allKeys });
    const nextConfig = resolved
      .filter((entry) => entry.key !== filterKey)
      .map((entry) => ({
        key: entry.key,
        field: entry.field,
        label: entry.label,
        displayLabel: entry.displayLabel,
        displayOrder: entry.displayOrder,
        isActive: entry.isActive,
        isVisible: entry.isVisible,
        isFilterable: entry.isFilterable,
        selectionMode: entry.selectionMode,
        type: entry.type,
      }));
    const nextFilters = nextConfig.map((entry) => entry.key);

    await collection.updateOne(
      { _id: existing._id },
      {
        $set: {
          filterConfig: nextConfig,
          filters: nextFilters,
          updatedAt: new Date(),
        },
      },
    );
    await bumpCatalogVersion(businessId);

    return json({
      ok: true,
      deletedFilterKey: filterKey,
      filters: nextFilters,
      filterConfig: nextConfig,
    });
  }

  const targetValue = String(existing.value || '').trim();
  /* Referential integrity: an e-commerce product still pointing at this type
     would be orphaned by the delete. Match the value case-insensitively so a
     legacy "Sarees" row is found too, not only the stored uppercase value. */
  const usedCount = targetValue
    ? await db.collection('ecommerceproduct').countDocuments({
        businessId: bScope,
        productType: { $regex: `^${escapeRegex(targetValue)}$`, $options: 'i' },
      })
    : 0;
  if (usedCount > 0) {
    return json({
      error: `Cannot delete "${existing.label || targetValue}" because it is used by ${usedCount} product(s). Change their Product Type first.`,
    }, 409);
  }

  /* Remove every row carrying this value for the business, not just the one
     document that was read: a duplicate left behind would bring the deleted
     type straight back on the next refresh or login. */
  await collection.deleteMany(targetValue
    ? { businessId: bScope, value: targetValue }
    : { _id: existing._id });
  await bumpCatalogVersion(businessId);

  return json({ ok: true, deletedValue: targetValue }, 200, NO_STORE);
}
