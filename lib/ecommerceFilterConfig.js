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

import { isValidObjectId, Types } from 'mongoose';

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
   the documented stored field names (displayName, ecommerceSlug,
   description, ecommerceVisible) or their nested admin aliases; the result
   always uses the flat stored names. displayOrder and isActive belong to the
   producttypes row itself and are handled by the admin route. */
export function normalizeGroupConfig(input, { label = '', value = '' } = {}) {
  const raw = input && typeof input === 'object' && !Array.isArray(input) ? input : {};
  const displayName = cleanText(raw.displayName, 120) || cleanText(label, 120) || String(value || '');
  const slug = slugify(raw.ecommerceSlug ?? raw.slug) || slugify(displayName || value);
  return {
    displayName,
    ecommerceSlug: slug,
    description: String(raw.description ?? '').trim().slice(0, 2000),
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

/* STOREFRONT FILTER PARAMETERS

   The documented API accepts three forms, combined into one selection map:

     ?filter=byFabric:<id>,<id>&filter=byWeave:<id>   (repeatable)
     ?filters=byFabric:<id>|<id>;byWeave:<id>         (shorthand)
     ?byFabric=<id>,<id>                              (plain params)

   Returns { selections, errors } with ids de-duplicated; errors holds the
   first message for 422 responses. No database access. */
export function parseFilterSelections(params) {
  const selections = {};
  const errors = [];

  const add = (rawKey, ids) => {
    const key = String(rawKey || '').trim();
    if (!key) {
      errors.push('Filter parameter is missing a filter key.');
      return;
    }
    if (!FILTER_KEYS.includes(key)) {
      errors.push(`Filter "${key}" is not available for this group.`);
      return;
    }
    const cleaned = ids.map((id) => String(id || '').trim().toLowerCase()).filter(Boolean);
    if (!cleaned.length) return;
    selections[key] = [...new Set([...(selections[key] || []), ...cleaned])];
  };

  FILTER_KEYS.forEach((key) => {
    params.getAll(key).forEach((value) => add(key, String(value).split(',')));
  });

  params.getAll('filter').forEach((entry) => {
    const separator = String(entry).indexOf(':');
    if (separator < 1) {
      errors.push('Filter parameters must look like filter=byFabric:<id>,<id>.');
      return;
    }
    add(entry.slice(0, separator), entry.slice(separator + 1).split(','));
  });

  params.getAll('filters').forEach((entry) => {
    String(entry).split(';').filter((part) => part.trim()).forEach((part) => {
      const separator = part.indexOf(':');
      if (separator < 1) {
        errors.push('Filter parameters must look like filters=byFabric:<id>|<id>.');
        return;
      }
      add(part.slice(0, separator), part.slice(separator + 1).split('|'));
    });
  });

  return { selections, errors };
}

/* Validate the selections against one group's returned filters. `filters`
   is the storefront filter list (key, displayLabel/label, selectionMode).
   Returns an error message or null - no database access. */
export function selectionError(selections, filters = []) {
  const byKey = new Map(filters.map((filter) => [filter.key, filter]));
  for (const [key, ids] of Object.entries(selections || {})) {
    const filter = byKey.get(key);
    if (!filter) return `Filter "${key}" is not available for this group.`;
    const label = filter.displayLabel || filter.label || key;
    if (ids.some((id) => !isValidObjectId(String(id)))) {
      return `Filter "${label}" contains an invalid value.`;
    }
    if (filter.selectionMode === 'single' && ids.length > 1) {
      return `Filter "${label}" accepts only one value.`;
    }
  }
  return null;
}

/* Mongo match for one product set: values inside a filter are OR-ed ($in),
   different filters are AND-ed by the document query itself. */
export function buildSelectionMatch(selections) {
  const match = {};
  Object.entries(selections || {}).forEach(([key, ids]) => {
    if (Array.isArray(ids) && ids.length) {
      match[key] = { $in: ids.map((id) => new Types.ObjectId(String(id))) };
    }
  });
  return match;
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

/* The filters a storefront client may see for this type: assigned, active,
   visible and filterable - exactly what the documented storefront contract
   says. */
export function storefrontFilters(typeDoc) {
  return resolveGroupFilters(typeDoc)
    .filter((f) => filterAssigned(typeDoc, f.key) && f.isActive && f.isVisible && f.isFilterable);
}

/* Filter keys that may actually narrow products: the same set. */
export function filterableKeys(typeDoc) {
  return storefrontFilters(typeDoc).map((f) => f.key);
}

/* A product type is exposed on the storefront when the type itself is
   active and ecommerce-visible. */
export function groupVisibleOnStorefront(typeDoc) {
  if (!typeDoc || typeDoc.isActive === false) return false;
  return typeDoc.ecommerceVisible !== false;
}
