import mongoose, { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { withTransaction } from '@/lib/inventory';
import { bumpCatalogVersion } from '@/lib/ecommerceCatalog';
import { BUILT_IN_FILTER_DEFS } from '@/lib/ecommerceFilterIcons';
import { CLASSIFICATION_COLLECTIONS, classificationCollection } from '@/lib/classificationCollections';
import {
  ECOMMERCE_FILTERS_COLLECTION,
  ECOMMERCE_FILTER_VALUES_COLLECTION,
  businessOrFilter,
} from '@/lib/ecommerceFilterMaster';

const json = (data, status = 200) => Response.json(data, { status });
const TYPE_COLLECTION = 'producttypes';
const PRODUCT_COLLECTION = 'ecommerceproduct';
const AUDIT_COLLECTION = 'ecommercefilteraudit';

function matchFilterKey(entry, targetKey) {
  if (typeof entry === 'string') return entry.trim() === targetKey;
  if (entry && typeof entry === 'object') {
    return String(entry.key || entry.field || entry.filterId || '').trim() === targetKey;
  }
  return false;
}

async function resolveTargetFilter(db, businessId, rawParam) {
  const needle = decodeURIComponent(String(rawParam || '').trim());
  const lower = needle.toLowerCase();
  const builtIn = BUILT_IN_FILTER_DEFS.find(
    (d) => d.key.toLowerCase() === lower || d.slug.toLowerCase() === lower,
  );
  const bScope = businessOrFilter(businessId);
  const stored = await db.collection(ECOMMERCE_FILTERS_COLLECTION).findOne({
    businessId: bScope,
    $or: [
      { key: needle },
      { slug: lower },
      ...(builtIn ? [{ key: builtIn.key }] : []),
    ],
  });

  if (builtIn) {
    return {
      key: builtIn.key,
      slug: builtIn.slug,
      name: builtIn.name || builtIn.label,
      isBuiltIn: true,
      storedDoc: stored || null,
      alreadyDeleted: Boolean(stored && (stored.deletedAt != null || stored.isActive === false)),
    };
  }
  if (stored) {
    return {
      key: String(stored.key || '').trim(),
      slug: String(stored.slug || '').trim(),
      name: String(stored.name || stored.label || stored.key || '').trim(),
      isBuiltIn: Boolean(stored.isBuiltIn),
      storedDoc: stored,
      alreadyDeleted: Boolean(stored.deletedAt != null || stored.isActive === false),
    };
  }
  return {
    key: needle,
    slug: lower,
    name: needle,
    isBuiltIn: false,
    storedDoc: null,
    alreadyDeleted: true,
  };
}

/* GET /api/v1/admin/ecommerce-filters/by-key/[filterKey]?business=<id>
   Returns impact counts for the Delete Filter confirmation modal. */
export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { filterKey } = await params;
  const businessId = new URL(req.url).searchParams.get('business') || '';
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.DELETE,
    businessId,
    label: 'Ecommerce filter',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await dbConnect();
  const db = mongoose.connection.db;
  const target = await resolveTargetFilter(db, businessId, filterKey);
  const bScope = businessOrFilter(businessId);
  const isBuiltInCol = Boolean(CLASSIFICATION_COLLECTIONS[target.key]);

  const [valuesCount, productTypes, productsCount] = await Promise.all([
    isBuiltInCol
      ? classificationCollection(target.key).countDocuments({ businessId: bScope, deletedAt: null, isActive: { $ne: false } })
      : db.collection(ECOMMERCE_FILTER_VALUES_COLLECTION).countDocuments({
        businessId: bScope,
        deletedAt: null,
        isActive: { $ne: false },
        $or: [{ filterKey: target.key }, { type: target.key }],
      }),
    db.collection(TYPE_COLLECTION).find({ businessId: bScope }).project({ filters: 1, filterConfig: 1 }).toArray(),
    db.collection(PRODUCT_COLLECTION).countDocuments({
      businessId: bScope,
      [target.key]: { $exists: true, $ne: [] },
    }),
  ]);

  const productTypesCount = productTypes.filter((pt) => {
    const inFilters = Array.isArray(pt.filters) && pt.filters.some((e) => matchFilterKey(e, target.key));
    const inConfig = Array.isArray(pt.filterConfig) && pt.filterConfig.some((e) => matchFilterKey(e, target.key));
    return inFilters || inConfig;
  }).length;

  return json({
    filterKey: target.key,
    name: target.name,
    isBuiltIn: target.isBuiltIn,
    alreadyDeleted: target.alreadyDeleted,
    impact: {
      valuesCount,
      productTypesCount,
      productsCount,
    },
  });
}

/* DELETE /api/v1/admin/ecommerce-filters/by-key/[filterKey]?business=<id>
   Transactional, idempotent cascade delete of an entire filter. */
export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { filterKey } = await params;
  const sp = new URL(req.url).searchParams;
  let businessId = String(sp.get('business') || '').trim();
  if (!businessId) {
    const body = await req.json().catch(() => ({}));
    businessId = String(body.business || '').trim();
  }
  if (!isValidObjectId(businessId)) return json({ error: 'Valid business ID required' }, 422);

  const denied = await screenDenial({
    session,
    screen: SCREENS.ECOM_PRODUCT_TYPE,
    action: PERM.DELETE,
    businessId,
    label: 'Ecommerce filter',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await dbConnect();
  const db = mongoose.connection.db;
  const target = await resolveTargetFilter(db, businessId, filterKey);
  const bScope = businessOrFilter(businessId);
  const now = new Date();

  const summary = await withTransaction(async (dbSession) => {
    const opts = dbSession ? { session: dbSession } : {};

    // 1. Mark filter definition as deleted (custom or built-in marker)
    if (target.storedDoc) {
      await db.collection(ECOMMERCE_FILTERS_COLLECTION).updateOne(
        { _id: target.storedDoc._id },
        { $set: { isActive: false, deletedAt: target.storedDoc.deletedAt || now, updatedAt: now } },
        opts,
      );
    } else if (target.isBuiltIn) {
      await db.collection(ECOMMERCE_FILTERS_COLLECTION).updateOne(
        { businessId: bScope, key: target.key },
        {
          $set: {
            key: target.key,
            slug: target.slug,
            name: target.name,
            label: target.name,
            isBuiltIn: true,
            isActive: false,
            deletedAt: now,
            updatedAt: now,
          },
          $setOnInsert: { businessId, createdAt: now },
        },
        { ...opts, upsert: true },
      );
    }

    // 2. Remove from every Product Type's `filters` and `filterConfig`
    const ptDocs = await db.collection(TYPE_COLLECTION).find({ businessId: bScope }, opts).toArray();
    let productTypesUpdated = 0;
    for (const pt of ptDocs) {
      const hasInFilters = Array.isArray(pt.filters) && pt.filters.some((e) => matchFilterKey(e, target.key));
      const hasInConfig = Array.isArray(pt.filterConfig) && pt.filterConfig.some((e) => matchFilterKey(e, target.key));
      if (!hasInFilters && !hasInConfig) continue;

      const nextFilters = (Array.isArray(pt.filters) ? pt.filters : []).filter((e) => !matchFilterKey(e, target.key));
      const nextConfig = (Array.isArray(pt.filterConfig) ? pt.filterConfig : [])
        .filter((e) => !matchFilterKey(e, target.key))
        .map((e, idx) => ({ ...e, displayOrder: idx }));

      await db.collection(TYPE_COLLECTION).updateOne(
        { _id: pt._id },
        { $set: { filters: nextFilters, filterConfig: nextConfig, updatedAt: now } },
        opts,
      );
      productTypesUpdated += 1;
    }

    // 3. Soft-delete all values of this filter
    let valuesRemoved = 0;
    if (CLASSIFICATION_COLLECTIONS[target.key]) {
      const valRes = await classificationCollection(target.key).updateMany(
        { businessId: bScope, deletedAt: null },
        { $set: { isActive: false, deletedAt: now, updatedAt: now } },
        opts,
      );
      valuesRemoved = valRes.modifiedCount || 0;
    } else {
      const valRes = await db.collection(ECOMMERCE_FILTER_VALUES_COLLECTION).updateMany(
        {
          businessId: bScope,
          deletedAt: null,
          $or: [{ filterKey: target.key }, { type: target.key }],
        },
        { $set: { isActive: false, deletedAt: now, updatedAt: now } },
        opts,
      );
      valuesRemoved = valRes.modifiedCount || 0;
    }

    // 4. Clean references on EcommerceProduct records (never deleting products)
    const prodRes = await db.collection(PRODUCT_COLLECTION).updateMany(
      { businessId: bScope, [target.key]: { $exists: true } },
      { $unset: { [target.key]: '' }, $set: { updatedAt: now } },
      opts,
    );
    const productsUpdated = prodRes.modifiedCount || 0;

    // 5. Audit log entry
    await db.collection(AUDIT_COLLECTION).insertOne({
      businessId,
      filterKey: target.key,
      filterName: target.name,
      isBuiltIn: target.isBuiltIn,
      action: 'DELETE_FILTER',
      actorId: session.id || null,
      actorName: session.name || '',
      actorEmail: session.email || '',
      actorRole: session.role || '',
      valuesRemoved,
      productTypesUpdated,
      productsUpdated,
      idempotent: target.alreadyDeleted,
      createdAt: now,
    }, opts);

    return { valuesRemoved, productTypesUpdated, productsUpdated };
  });

  await bumpCatalogVersion(businessId);

  return json({
    ok: true,
    idempotent: target.alreadyDeleted,
    filterKey: target.key,
    ...summary,
  });
}
