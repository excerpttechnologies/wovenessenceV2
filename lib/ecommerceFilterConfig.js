/* ECOMMERCE FILTER / GROUP CONFIG (12-11-2026)

   Pure helpers - no database access - that turn a `producttypes` document
   into the ecommerce group + filter configuration the storefront APIs
   return. Nothing here is hardcoded per group: the admin picks the filters
   on E-commerce -> Product Type and every value below is data-driven.

   Stored shape on a producttypes document (verified against MongoDB
   12-11-2026 - the collections already carry this schema):

     value, label, displayOrder, isActive, description
     displayName        ecommerce display name (flat field)
     ecommerceSlug      collection slug (flat field)
     ecommerceVisible   show/hide on the storefront (flat field)
     ecommerceEnabled   optional extra enable switch (flat field)
     ecommerceDisplayOrder  optional store ordering (falls back to
                       displayOrder)
     filters:      ['byWeave', 'byFabric', ...]   filters assigned to the
                   type - also drives the product-eccom Add/Edit form
     filterConfig: [ { key, field, label, displayLabel, displayOrder,
                       isActive, isVisible, isFilterable, selectionMode,
                       type: 'classification' }, ... ]

   A filter reaches the storefront only when it is assigned (in `filters`
   or described by a filterConfig entry) AND its config has
   isActive !== false and isVisible !== false. isFilterable === false
   means the filter is displayed but cannot narrow products.
   selectionMode is 'multiple' (default) or 'single'. */

export const FILTER_KEYS = ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'];

export const FILTER_LABELS = {
  byWeave: 'By Weave',
  byFabric: 'By Fabric',
  byCraft: 'By Craft',
  byOccasion: 'By Occasion',
  byColour: 'By Colour',
};

export const SELECTION_MODES = ['multiple', 'single'];

export const slugify = (value) => String(value || '').trim().toLowerCase()
  .normalize('NFKD').replace(/[^ -~]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const cleanText = (value, max = 200) => String(value ?? '').trim().replace(/\s+/g, ' ').slice(0, max);

const bool = (value, fallback = true) => (value === undefined || value === null ? fallback : value === true || value === 'true' || value === 'yes' || value === 1);

const cleanOrder = (value, fallback = 0) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
};

/* One canonical filterConfig entry. Accepts the stored array shape and the
   friendlier { label, displayOrder, isActive, isEcommerceVisible,
   filterable, selection } shape the admin page may send. */
function normalizeFilterEntry(raw, index) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const key = String(raw.key || raw.field || '').trim();
  if (!FILTER_KEYS.includes(key)) return null;
  const order = cleanOrder(raw.displayOrder ?? raw.order, index);
  const selectionMode = SELECTION_MODES.includes(raw.selectionMode || raw.selection)
    ? (raw.selectionMode || raw.selection)
    : 'multiple';
  const label = cleanText(raw.displayLabel ?? raw.label, 80) || FILTER_LABELS[key];
  return {
    key,
    field: key,
    label: cleanText(raw.label, 80) || label,
    displayLabel: label,
    displayOrder: order,
    isActive: raw.isActive === undefined ? true : bool(raw.isActive),
    isVisible: raw.isVisible === undefined ? bool(raw.isEcommerceVisible, true) : bool(raw.isVisible),
    isFilterable: raw.isFilterable === undefined ? bool(raw.filterable, true) : bool(raw.isFilterable),
    selectionMode,
    type: 'classification',
  };
}

/* Sanitise a filterConfig payload. Accepts the canonical array or a
   { key: {...} } map; returns the canonical array (possibly empty). */
export function normalizeFilterConfig(input) {
  if (Array.isArray(input)) {
    return input.map((entry, i) => normalizeFilterEntry(entry, i)).filter(Boolean);
  }
  if (input && typeof input === 'object') {
    return Object.keys(input)
      .map((key, i) => normalizeFilterEntry({ key, ...(input[key] || {}) }, i))
      .filter(Boolean);
  }
  return [];
}

/* Sanitise the ecommerce group fields. `input` may be a flat object using
   the stored field names or the nested { displayName, slug, description,
   displayOrder, isEnabled, isEcommerceVisible } shape; the result always
   uses the flat stored names. */
export function normalizeGroupConfig(input, { label = '', value = '' } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const displayName = cleanText(raw.displayName, 120) || cleanText(label, 120) || String(value || '');
  const slug = cleanText(raw.ecommerceSlug ?? raw.slug, 160) || slugify(displayName || value);
  const order = cleanOrder(raw.ecommerceDisplayOrder ?? raw.displayOrder, NaN);
  return {
    displayName,
    ecommerceSlug: slug,
    description: String(raw.description ?? '').trim().slice(0, 2000),
    ...(Number.isFinite(order) ? { ecommerceDisplayOrder: order } : {}),
    ecommerceEnabled: raw.ecommerceEnabled === undefined ? bool(raw.isEnabled, true) : bool(raw.ecommerceEnabled),
    ecommerceVisible: raw.ecommerceVisible === undefined ? bool(raw.isEcommerceVisible, true) : bool(raw.ecommerceVisible),
  };
}

/* Every filter configured for the type, resolved with defaults and sorted
   by displayOrder. Source of truth is the filterConfig array when present,
   merged with any keys still listed in `filters` (older documents). */
export function resolveGroupFilters(typeDoc) {
  const byKey = new Map();
  const stored = Array.isArray(typeDoc?.filterConfig) ? typeDoc.filterConfig : [];
  stored.forEach((entry, i) => {
    const normalized = normalizeFilterEntry(entry, i);
    if (normalized) byKey.set(normalized.key, normalized);
  });
  const assigned = Array.isArray(typeDoc?.filters) ? typeDoc.filters : [];
  assigned.forEach((key, i) => {
    const k = String(key || '').trim();
    if (FILTER_KEYS.includes(k) && !byKey.has(k)) {
      byKey.set(k, normalizeFilterEntry({ key: k, displayOrder: i }, i));
    }
  });
  /* a filterConfig entry for a key that is not assigned anywhere still
     counts as configured - the admin may keep it for later */
  stored.forEach((entry) => {
    const normalized = normalizeFilterEntry(entry, 0);
    if (normalized && !byKey.has(normalized.key)) byKey.set(normalized.key, normalized);
  });
  return [...byKey.values()].sort((a, b) =>
    a.displayOrder - b.displayOrder || FILTER_KEYS.indexOf(a.key) - FILTER_KEYS.indexOf(b.key));
}

/* Is this filter actually assigned to the type (usable on products and in
   the product form)? Assigned = listed in `filters` or present in
   filterConfig. */
function filterAssigned(typeDoc, key) {
  const inFilters = Array.isArray(typeDoc?.filters) && typeDoc.filters.map(String).includes(key);
  const inConfig = Array.isArray(typeDoc?.filterConfig)
    && typeDoc.filterConfig.some((entry) => String(entry?.key || entry?.field || '') === key);
  return Boolean(inFilters || inConfig);
}

/* The filters a storefront client may see for this type: assigned, active
   and visible. */
export function storefrontFilters(typeDoc) {
  return resolveGroupFilters(typeDoc)
    .filter((f) => filterAssigned(typeDoc, f.key) && f.isActive && f.isVisible);
}

/* Filter keys that may actually narrow products: visible, active,
   filterable and assigned. */
export function filterableKeys(typeDoc) {
  return storefrontFilters(typeDoc).filter((f) => f.isFilterable).map((f) => f.key);
}

/* A product type is exposed on the storefront when the type itself is
   active, the group is enabled and ecommerce-visible. */
export function groupVisibleOnStorefront(typeDoc) {
  if (!typeDoc || typeDoc.isActive === false) return false;
  return typeDoc.ecommerceEnabled !== false && typeDoc.ecommerceVisible !== false;
}
