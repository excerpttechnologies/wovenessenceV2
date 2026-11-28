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
    })
    .sort({ displayOrder: 1, name: 1, _id: 1 })
    .toArray();

  const deletedBuiltInKeys = new Set();
  for (const row of rows) {
    const key = String(row.key || '').trim();
    if (BUILT_IN_FILTER_KEY_SET.has(key) && (row.deletedAt != null || row.isActive === false)) {
      deletedBuiltInKeys.add(key);
    }
  }

  const activeBuiltIns = builtIns.filter((d) => !deletedBuiltInKeys.has(d.key));
  const seenKeys = new Set(BUILT_IN_FILTER_KEY_SET);
  const custom = [];
  for (const row of rows) {
    if (row.deletedAt != null) continue;
    if (!includeInactive && row.isActive === false) continue;
    const shaped = shapeFilterDefinition(row);
    if (!shaped.key || !shaped.slug || seenKeys.has(shaped.key)) continue;
    seenKeys.add(shaped.key);
    custom.push(shaped);
  }
  return [...activeBuiltIns, ...custom];
}

export async function findCustomFilterDefinition(businessId, keyOrSlug, { includeInactive = false } = {}) {
  const needle = String(keyOrSlug || '').trim();
  if (!needle || !isValidObjectId(String(businessId || ''))) return null;
  const db = mongoose.connection.db;
  const row = await db.collection(ECOMMERCE_FILTERS_COLLECTION).findOne({
    businessId: businessOrFilter(businessId),
    deletedAt: null,
    ...(includeInactive ? {} : { isActive: { $ne: false } }),
    $or: [{ key: needle }, { slug: needle.toLowerCase() }],
  });
  return row ? shapeFilterDefinition(row) : null;
}

export async function getDeletedFilterKeys(businessId) {
  if (!isValidObjectId(String(businessId || ''))) return new Set();
  const db = mongoose.connection.db;
  const rows = await db
    .collection(ECOMMERCE_FILTERS_COLLECTION)
    .find({
      businessId: businessOrFilter(businessId),
      $or: [{ deletedAt: { $ne: null } }, { isBuiltIn: true, isActive: false }],
    })
    .project({ key: 1 })
    .toArray();
  return new Set(rows.map((r) => String(r.key || '').trim()).filter(Boolean));
}

export function resolveBuiltInFilterMatch({ name = '', label = '', key = '', slug = '' } = {}) {
  const n = String(name || '').trim().toLowerCase();
  const l = String(label || '').trim().toLowerCase();
  const k = String(key || '').trim().toLowerCase();
  const s = String(slug || '').trim().toLowerCase();

  const byKey = k ? BUILT_IN_FILTER_DEFS.find((b) => b.key.toLowerCase() === k) || null : null;
  const bySlug = s ? BUILT_IN_FILTER_DEFS.find((b) => b.slug.toLowerCase() === s) || null : null;
  const byName = (n || l)
    ? BUILT_IN_FILTER_DEFS.find(
      (b) => (n && b.name.toLowerCase() === n) || (l && b.label.toLowerCase() === l),
    ) || null
    : null;

  const matched = [byKey, bySlug, byName].filter(Boolean);
  if (!matched.length) return { kind: 'none' };

  const uniqueKeys = new Set(matched.map((b) => b.key));
  if (uniqueKeys.size > 1) {
    const target = byKey || bySlug || byName;
    return {
      kind: 'conflict',
      error: `Filter "${name || key}" conflicts with existing built-in filter "${target.name}".`,
    };
  }

  const builtIn = matched[0];
  /* If the caller matched by name/label, or matched both key and slug of the
     same built-in filter, they are referencing that existing built-in filter
     so it can be reused. A standalone key/slug collision with an unrelated
     name is still rejected as a conflict. */
  if (byName || (byKey && bySlug)) {
    return { kind: 'reuse', builtIn };
  }
  if (byKey) {
    return {
      kind: 'conflict',
      error: `Filter key "${key}" is reserved by built-in filter "${builtIn.name}".`,
    };
  }
  return {
    kind: 'conflict',
    error: `Slug "${slug}" is reserved by built-in filter "${builtIn.name}".`,
  };
}

export function classifyExistingCustomMatch(activeMatches = [], { name = '', label = '', key = '', slug = '' } = {}) {
  if (!activeMatches.length) return { kind: 'none' };
  if (activeMatches.length > 1) {
    return {
      kind: 'conflict',
      error: `Filter "${name || key}" conflicts with multiple existing filters.`,
    };
  }
  const existing = activeMatches[0];
  const n = String(name || '').trim().toLowerCase();
  const l = String(label || '').trim().toLowerCase();
  const k = String(key || '').trim().toLowerCase();
  const s = String(slug || '').trim().toLowerCase();

  const sameKey = k && String(existing.key || '').trim().toLowerCase() === k;
  const sameSlug = s && String(existing.slug || '').trim().toLowerCase() === s;
  const sameName = n && String(existing.name || '').trim().toLowerCase() === n;
  const sameLabel = l && String(existing.label || '').trim().toLowerCase() === l;

  if (sameName || sameLabel || (sameKey && sameSlug)) {
    return { kind: 'reuse', existing };
  }
  if (sameKey) {
    return {
      kind: 'conflict',
      error: `Filter key "${key}" already belongs to "${existing.name}".`,
    };
  }
  return {
    kind: 'conflict',
    error: `Filter slug "${slug}" already belongs to "${existing.name}".`,
  };
}

export async function getValidFilterKeys(businessId, { includeInactive = true } = {}) {
  const defs = await listFilterDefinitions(businessId, { includeInactive });
  return defs.map((d) => d.key);
}
