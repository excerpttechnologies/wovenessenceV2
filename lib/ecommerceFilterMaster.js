import mongoose, { isValidObjectId, Types } from 'mongoose';
import {
  BUILT_IN_FILTER_DEFS,
  BUILT_IN_FILTER_KEY_SET,
  BUILT_IN_FILTER_SLUG_SET,
} from './ecommerceFilterIcons';
import { slugify } from './ecommerceFilterConfig';

export const ECOMMERCE_FILTERS_COLLECTION = 'ecommercefilters';
export const ECOMMERCE_FILTER_VALUES_COLLECTION = 'ecommercefiltervalues';

const RESERVED_FILTER_KEYS = new Set([
  '_id', 'id', '__v', 'businessId', 'itemId', 'barcode', 'barcodes', 'publishedBarcodes',
  'ecommItemCode', 'productType', 'displayName', 'slug', 'status', 'isActive', 'isPublished',
  'isFeatured', 'isBestBuy', 'image', 'additionalImages', 'seoTitle', 'seoDescription',
  'printDescriptionOverride', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride',
  'ecommOffPercent', 'salesCount', 'createdAt', 'updatedAt', 'weaveDescription',
  'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription', 'colorDescription',
]);

const RESERVED_SLUGS = new Set([
  ...BUILT_IN_FILTER_SLUG_SET,
  'product', 'product-eccom', 'product-type', 'direct-stock-transfer', 'website-analytics',
  'seed-test', 'filters', 'add',
]);

export function businessOrFilter(businessId) {
  const id = String(businessId || '').trim();
  if (!isValidObjectId(id)) return id;
  return { $in: [new Types.ObjectId(id), id] };
}

export function toFilterKey(input) {
  const raw = String(input || '').trim();
  if (/^[a-zA-Z][a-zA-Z0-9]*$/.test(raw)) {
    return (raw.charAt(0).toLowerCase() + raw.slice(1)).slice(0, 48);
  }
  const words = raw
    .replace(/[^a-zA-Z0-9]+/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const camel = words
    .map((word, idx) => {
      const lower = word.toLowerCase();
      return idx === 0 ? lower : lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join('');
  return /^[a-zA-Z]/.test(camel) ? camel.slice(0, 48) : `f${camel}`.slice(0, 48);
}

export function toFilterSlug(input) {
  return slugify(input).slice(0, 60);
}

export function isValidFilterKey(key) {
  const k = String(key || '').trim();
  return /^[a-zA-Z][a-zA-Z0-9_]{1,47}$/.test(k) && !RESERVED_FILTER_KEYS.has(k);
}

export function isValidFilterSlug(slug) {
  const s = String(slug || '').trim();
  return /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(s) && s.length <= 60 && !RESERVED_SLUGS.has(s);
}

export function shapeFilterDefinition(row) {
  const slug = String(row.slug || '').trim();
  return {
    _id: row._id ? String(row._id) : row.key,
    key: String(row.key || '').trim(),
    slug,
    name: String(row.name || '').trim(),
    label: String(row.label || row.name || '').trim(),
    icon: String(row.icon || 'tag').trim() || 'tag',
    href: `/admin/ecommerce/filters/${slug}`,
    isBuiltIn: false,
    isActive: row.isActive !== false,
    ecommerceVisible: row.ecommerceVisible !== false,
    displayOrder: Number.isFinite(Number(row.displayOrder)) ? Number(row.displayOrder) : 100,
  };
}

export async function listFilterDefinitions(businessId, { includeInactive = false } = {}) {
  const builtIns = BUILT_IN_FILTER_DEFS.map((d) => ({ ...d, _id: d.key }));
  if (!isValidObjectId(String(businessId || ''))) return builtIns;

  const db = mongoose.connection.db;
  const rows = await db
    .collection(ECOMMERCE_FILTERS_COLLECTION)
    .find({
      businessId: businessOrFilter(businessId),
      ...(includeInactive ? {} : { isActive: { $ne: false } }),
    })
    .sort({ displayOrder: 1, name: 1, _id: 1 })
    .toArray();

  const seenKeys = new Set(BUILT_IN_FILTER_KEY_SET);
  const custom = [];
  for (const row of rows) {
    const shaped = shapeFilterDefinition(row);
    if (!shaped.key || !shaped.slug || seenKeys.has(shaped.key)) continue;
    seenKeys.add(shaped.key);
    custom.push(shaped);
  }
  return [...builtIns, ...custom];
}

export async function findCustomFilterDefinition(businessId, keyOrSlug, { includeInactive = false } = {}) {
  const needle = String(keyOrSlug || '').trim();
  if (!needle || !isValidObjectId(String(businessId || ''))) return null;
  const db = mongoose.connection.db;
  const row = await db.collection(ECOMMERCE_FILTERS_COLLECTION).findOne({
    businessId: businessOrFilter(businessId),
    ...(includeInactive ? {} : { isActive: { $ne: false } }),
    $or: [{ key: needle }, { slug: needle.toLowerCase() }],
  });
  return row ? shapeFilterDefinition(row) : null;
}

export async function getValidFilterKeys(businessId, { includeInactive = true } = {}) {
  const defs = await listFilterDefinitions(businessId, { includeInactive });
  return defs.map((d) => d.key);
}
