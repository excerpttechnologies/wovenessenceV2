import mongoose, { isValidObjectId, Types } from 'mongoose';
import EcommerceProduct from '@/models/EcommerceProduct';
import Item from '@/models/Item';
import { classificationOptionsById } from '@/lib/classificationCollections';
import { classificationGroupKeyFor } from '@/lib/productClassificationConstants';
import {
  slugify,
  resolveGroupFilters,
  storefrontFilters,
  groupVisibleOnStorefront,
} from '@/lib/ecommerceFilterConfig';

/* ECOMMERCE CATALOG CACHE (12-11-2026)

   Builds the storefront view of the `producttypes` collection: ecommerce
   groups (display name, slug, description, order, visibility) plus the
   active, visible and filterable filters configured on each group.

   Cache: an in-process Map keyed by businessId holding { version, data }.
   The version is a counter kept in the `storefrontcatalogversion`
   collection, bumped by every admin write to product-types (POST/PUT).
   Because the version lives in Mongo, other server instances pick up the
   change on their next request instead of serving a stale config. */

const VERSION_COLLECTION = 'storefrontcatalogversion';
const TYPE_COLLECTION = 'producttypes';

const cache = new Map();

const versionCol = () => mongoose.connection.db.collection(VERSION_COLLECTION);

export async function getCatalogVersion(businessId) {
  const doc = await versionCol().findOne({ _id: String(businessId) });
  return Number(doc?.version) || 0;
}

/* Call after any product-types write. Returns the new version. */
export async function bumpCatalogVersion(businessId) {
  const key = String(businessId);
  const doc = await versionCol().findOneAndUpdate(
    { _id: key },
    {
      $inc: { version: 1 },
      $set: { updatedAt: new Date() },
      $setOnInsert: { createdAt: new Date() },
    },
    { upsert: true, returnDocument: 'after' },
  );
  cache.delete(key);
  return Number(doc?.version) || 1;
}

const businessOr = (businessId) => {
  const values = [String(businessId)];
  if (isValidObjectId(String(businessId))) values.push(new Types.ObjectId(String(businessId)));
  return { $in: values };
};

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* The documented storefront group shape. `name` is the ERP product-type
   value, `slug` the collection URL identifier. */
function shapeGroup(typeDoc) {
  const key = String(typeDoc.value || '');
  const displayName = String(typeDoc.displayName || typeDoc.label || key);
  return {
    key,
    name: key,
    displayName,
    slug: String(typeDoc.ecommerceSlug || '') || slugify(displayName || key),
    description: String(typeDoc.description || ''),
    displayOrder: Number(typeDoc.displayOrder) || 0,
    productTypes: [key],
    filters: storefrontFilters(typeDoc),
  };
}

/* { version, groups } for one business. `groups` contains only types that
   are active and ecommerce-visible - exactly what the storefront may
   expose. */
export async function getStorefrontCatalog(businessId) {
  const key = String(businessId);
  const version = await getCatalogVersion(businessId);
  const hit = cache.get(key);
  if (hit && hit.version === version) return hit.data;

  const types = await mongoose.connection.db
    .collection(TYPE_COLLECTION)
    .find({ businessId: businessOr(businessId) })
    .sort({ displayOrder: 1, label: 1 })
    .toArray();

  const data = {
    version,
    groups: types.filter(groupVisibleOnStorefront).map(shapeGroup)
      .sort((a, b) => a.displayOrder - b.displayOrder || a.displayName.localeCompare(b.displayName)),
  };
  cache.set(key, { version, data });
  return data;
}

/* Look a group up by product-type value, ecommerce slug or display name
   (case-insensitive). Returns the shaped group or null. */
export function findCatalogGroup(catalog, productType) {
  const needle = String(productType || '').trim().toLowerCase();
  if (!needle) return null;
  return catalog.groups.find((g) =>
    g.key.toLowerCase() === needle
    || g.slug.toLowerCase() === needle
    || g.displayName.toLowerCase() === needle
    || g.name.toLowerCase() === needle,
  ) || null;
}

/* Live values + product counts for the filters of the given groups. Only
   eligible products are counted: active, published, not explicitly
   inactive and backed by an existing ERP item. Options are restricted to
   active classification masters of the group's classification group.

   Returns { options: Map(groupKey -> { filterKey: [option] }),
             counts: Map(groupKey -> productCount) }. */
export async function getGroupFacetData(businessId, groups) {
  const options = new Map();
  const counts = new Map();
  const list = (Array.isArray(groups) ? groups : []).filter((group) => group?.key);
  if (!list.length) return { options, counts };

  const itemIds = await Item.distinct('_id', { businessId: new Types.ObjectId(String(businessId)) });
  if (!itemIds.length) return { options, counts };

  const byUpper = new Map(list.map((group) => [group.key.toUpperCase(), group]));
  const products = await EcommerceProduct.find({
    businessId,
    status: 'active',
    isPublished: true,
    isActive: { $ne: false },
    itemId: { $in: itemIds },
    productType: { $in: list.map((group) => new RegExp(`^${escapeRegex(group.key)}$`, 'i')) },
  }).select(['productType', ...list.flatMap((group) => group.filters.map((f) => f.key))].join(' ')).lean();

  const buckets = new Map();
  list.forEach((group) => {
    const perFilter = {};
    group.filters.forEach((filter) => { perFilter[filter.key] = new Map(); });
    buckets.set(group.key, perFilter);
  });

  products.forEach((product) => {
    const group = byUpper.get(String(product.productType || '').trim().toUpperCase());
    if (!group) return;
    counts.set(group.key, (counts.get(group.key) || 0) + 1);
    const perFilter = buckets.get(group.key);
    group.filters.forEach((filter) => {
      const bucket = perFilter[filter.key];
      (product[filter.key] || []).forEach((id) => {
        const key = String(id);
        bucket.set(key, (bucket.get(key) || 0) + 1);
      });
    });
  });

  const allIds = new Set();
  buckets.forEach((perFilter) => {
    Object.values(perFilter).forEach((bucket) => bucket.forEach((_, id) => allIds.add(id)));
  });
  const meta = new Map([...(await classificationOptionsById([...allIds]))]
    .filter(([, option]) => option.isActive));

  list.forEach((group) => {
    const classGroup = classificationGroupKeyFor(group.key);
    const perFilter = buckets.get(group.key);
    const groupOptions = {};
    group.filters.forEach((filter) => {
      groupOptions[filter.key] = [...perFilter[filter.key].entries()]
        .map(([id, count]) => ({ id, count, option: meta.get(id) }))
        .filter(({ option }) => option
          && option.isActive
          && String(option.productType || '').trim().toUpperCase() === classGroup)
        .map(({ id, count, option }) => ({
          id,
          name: option.name || '',
          displayOrder: option.displayOrder || 0,
          count,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder
          || a.name.localeCompare(b.name)
          || b.count - a.count);
    });
    options.set(group.key, groupOptions);
  });

  return { options, counts };
}
