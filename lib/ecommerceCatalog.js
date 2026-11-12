import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import {
  slugify,
  resolveGroupFilters,
  storefrontFilters,
  groupVisibleOnStorefront,
} from '@/lib/ecommerceFilterConfig';

/* ECOMMERCE CATALOG CACHE (12-11-2026)

   Builds the storefront view of the `producttypes` collection: ecommerce
   groups (display name, slug, description, order, visibility) plus the
   active, ecommerce-visible filters configured on each group.

   Cache: an in-process Map keyed by businessId holding { version, data }.
   The version is a counter kept in the `storefrontcatalogversion`
   collection, bumped by every admin write to product-types (POST/PUT/
   DELETE). Because the version lives in Mongo, other server instances pick
   up the change on their next request instead of serving a stale config. */

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

function shapeGroup(typeDoc) {
  const displayName = String(typeDoc.displayName || typeDoc.label || typeDoc.value || '');
  const order = Number(typeDoc.ecommerceDisplayOrder);
  return {
    key: String(typeDoc.value || ''),
    label: String(typeDoc.label || ''),
    displayName,
    slug: String(typeDoc.ecommerceSlug || '') || slugify(displayName || typeDoc.value),
    description: String(typeDoc.description || ''),
    displayOrder: Number.isFinite(order) ? order : Number(typeDoc.displayOrder) || 0,
    isEnabled: typeDoc.ecommerceEnabled !== false,
    isEcommerceVisible: typeDoc.ecommerceVisible !== false,
    isActive: typeDoc.isActive !== false,
    filters: storefrontFilters(typeDoc),
    /* every configured filter incl. inactive/hidden, for admin previews */
    allFilters: resolveGroupFilters(typeDoc),
  };
}

/* { version, groups } for one business. `groups` contains only types that
   are active, enabled and ecommerce-visible - exactly what the storefront
   may expose. */
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
      .sort((a, b) => a.displayOrder - b.displayOrder || a.label.localeCompare(b.label)),
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
    || g.label.toLowerCase() === needle,
  ) || null;
}
