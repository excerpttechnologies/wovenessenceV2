import { createHash } from 'node:crypto';
import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import EcommerceProduct from '@/models/EcommerceProduct';
import Item from '@/models/Item';
import {
  classificationCollection,
  classificationOptionsById,
  businessMatch,
  CLASSIFICATION_FIELDS,
} from '@/lib/classificationCollections';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { getStorefrontCatalog, findCatalogGroup } from '@/lib/ecommerceCatalog';
import { FILTER_KEYS } from '@/lib/ecommerceFilterConfig';
import { storefrontKeyConfigured, validStorefrontKey } from '@/lib/storefrontAuth';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const PAGE_SIZE = 24;
const SORTS = new Set(['newest', 'price_asc', 'price_desc', 'name', 'name_desc']);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* comma-separated and/or repeated query params -> trimmed unique strings */
const multiParam = (params, key) => [...new Set(
  params.getAll(key)
    .flatMap((value) => String(value).split(','))
    .map((value) => value.trim())
    .filter(Boolean),
)];

export async function GET(req) {
  if (!storefrontKeyConfigured()) {
    return json({ error: 'Storefront API is not configured.' }, 503);
  }
  if (!validStorefrontKey(req)) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const businessId = params.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'A valid business ID is required.' }, 422);
  }

  const page = Math.max(1, Number(params.get('page') || 1) || 1);
  const perPage = Math.min(100, Math.max(1, Number(params.get('perPage') || PAGE_SIZE) || PAGE_SIZE));
  const search = String(params.get('search') || '').trim();
  const sort = SORTS.has(params.get('sort')) ? params.get('sort') : 'newest';
  const productTypeParam = String(params.get('productType') || params.get('group') || '').trim();

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);

  /* The group the request targets. When the param matches a configured
     group (by key, slug, display name or label) the canonical productType
     value is used; an unknown value still filters literally but has no
     configured filters, so classification params are rejected below. */
  const group = productTypeParam ? findCatalogGroup(catalog, productTypeParam) : null;
  const productTypeValue = group ? group.key : productTypeParam.toUpperCase();

  /* Filter keys this request may use: the target group's filterable
     filters, or the union across all visible groups when no group was
     given. Anything else is rejected - the ERP config is the only source. */
  const allowedKeys = productTypeParam
    ? new Set((group?.filters || []).filter((f) => f.isFilterable).map((f) => f.key))
    : new Set(catalog.groups.flatMap((g) => g.filters.filter((f) => f.isFilterable).map((f) => f.key)));

  /* Parse + validate the requested classification selections. Values within
     one filter are OR-ed ($in), different filters are AND-ed by Mongo. */
  const selections = {};
  for (const key of FILTER_KEYS) {
    const raw = multiParam(params, key);
    if (!raw.length) continue;
    if (!CLASSIFICATION_FIELDS.includes(key) || !allowedKeys.has(key)) {
      return json({ error: `Filter "${key}" is not available for this product type.` }, 422);
    }
    const invalid = raw.filter((id) => !isValidObjectId(id));
    if (invalid.length) return json({ error: `Filter "${key}" contains an invalid value.` }, 422);
    selections[key] = [...new Set(raw.map((id) => id.toLowerCase()))];
  }

  /* Every selected id must be a live classification option of this business
     and of the matching type - no guessing, no cross-tenant ids. */
  for (const [key, ids] of Object.entries(selections)) {
    const found = await classificationCollection(key)
      .find({
        _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
        businessId: businessMatch(businessId),
        isActive: { $ne: false },
      })
      .project({ _id: 1 })
      .toArray();
    const foundIds = new Set(found.map((row) => String(row._id).toLowerCase()));
    if (ids.some((id) => !foundIds.has(id))) {
      return json({ error: `Filter "${key}" contains an unknown value.` }, 422);
    }
  }

  /* Eligible products only - the same rule everywhere: active, published,
     not explicitly inactive, and backed by a real ERP item (checked up
     front so `total` and facets never count orphans). */
  const itemIds = await Item.distinct('_id', { businessId: new Types.ObjectId(businessId) });
  const baseFilter = {
    businessId,
    status: 'active',
    isPublished: true,
    isActive: { $ne: false },
    itemId: { $in: itemIds },
  };
  if (productTypeValue) {
    baseFilter.productType = { $regex: `^${escapeRegex(productTypeValue)}$`, $options: 'i' };
  }
  if (search) {
    const escaped = escapeRegex(search);
    baseFilter.$or = [
      { displayName: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { productType: { $regex: escaped, $options: 'i' } },
    ];
  }

  const emptyPayload = {
    rows: [], total: 0, page, perPage, pages: 0,
    productType: productTypeValue || '',
    group: group ? { key: group.key, slug: group.slug, displayName: group.displayName } : null,
    filters: group?.filters || [],
    filterOptions: {},
    appliedFilters: selections,
    sort,
    version: catalog.version,
  };
  if (!itemIds.length) {
    return json(emptyPayload, 200, { ETag: etagFor(emptyPayload) });
  }

  /* Fetch the base eligible set WITHOUT classification filters so the same
     rows can produce both the filtered result and the per-filter option
     counts (facets). */
  const products = await EcommerceProduct.find(baseFilter).lean();
  const productItemIds = [...new Set(products.map((p) => String(p.itemId)))];
  const items = productItemIds.length
    ? await Item.find({ _id: { $in: productItemIds.map((id) => new Types.ObjectId(id)) } })
        .select('name itemCode rsp image description').lean()
    : [];
  const itemById = new Map(items.map((item) => [String(item._id), item]));

  const classificationIds = [...new Set(products.flatMap((product) =>
    FILTER_KEYS.flatMap((field) => product[field] || [])
  ).map(String))];
  const classificationById = new Map([...(await classificationOptionsById(classificationIds))]
    .filter(([, option]) => option.isActive)
    .map(([id, option]) => [id, { id, name: option.name, type: option.type }]));

  /* rowsBase: every eligible product with its classification id sets kept
     internally for filtering/faceting (stripped before the response). */
  const rowsBase = products.flatMap((product) => {
    const item = itemById.get(String(product.itemId));
    if (!item) return [];
    const ids = {};
    FILTER_KEYS.forEach((field) => {
      ids[field] = new Set((product[field] || []).map(String));
    });
    return [{
      _ids: ids,
      id: String(product.itemId),
      itemCode: product.ecommItemCode || item.itemCode || '',
      name: product.displayName || item.name || '',
      description: product.printDescriptionOverride || item.description || '',
      productType: product.productType || '',
      image: product.image || item.image || '',
      additionalImages: product.additionalImages || [],
      price: product.barcodePriceOverride ?? item.rsp ?? null,
      discountPercent: product.ecommOffPercent ?? null,
      barcodeStatusOverride: product.barcodeStatusOverride || '',
      status: product.status,
      isPublished: product.isPublished,
      isFeatured: product.isFeatured,
      slug: product.slug || '',
      seoTitle: product.seoTitle || '',
      seoDescription: product.seoDescription || '',
      classifications: Object.fromEntries(
        FILTER_KEYS.map((field) => [
          field,
          [...ids[field]]
            .map((cid) => classificationById.get(cid))
            .filter(Boolean),
        ])
      ),
      updatedAt: product.updatedAt,
    }];
  });

  const matchesSelections = (row, exceptKey) => Object.entries(selections)
    .every(([key, ids]) => key === exceptKey || ids.some((id) => row._ids[key].has(id)));

  const filteredRows = rowsBase.filter((row) => matchesSelections(row, null));

  /* Facet options: for each filterable filter of the target group (or the
     union when no group), count values across rows that match every OTHER
     selected filter - the standard "options reflect current filters" rule. */
  const facetKeys = [...allowedKeys];
  const facetCandidates = {};
  const facetIdSet = new Set();
  for (const key of facetKeys) {
    const candidates = rowsBase.filter((row) => matchesSelections(row, key));
    facetCandidates[key] = candidates;
    candidates.forEach((row) => row._ids[key].forEach((id) => facetIdSet.add(id)));
  }
  const facetNames = new Map([...(await classificationOptionsById([...facetIdSet]))]
    .filter(([, option]) => option.isActive)
    .map(([id, option]) => [id, option.name]));

  const filterOptions = {};
  for (const key of facetKeys) {
    const counts = new Map();
    facetCandidates[key].forEach((row) => {
      row._ids[key].forEach((id) => {
        if (facetNames.has(id)) counts.set(id, (counts.get(id) || 0) + 1);
      });
    });
    filterOptions[key] = [...counts.entries()]
      .map(([id, count]) => ({ id, name: facetNames.get(id) || '', count }))
      .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name));
  }

  /* Sort + paginate in memory: price/name ordering needs the joined item
     data, and facets already required the full eligible set. */
  const sorted = [...filteredRows];
  if (sort === 'price_asc' || sort === 'price_desc') {
    const dir = sort === 'price_asc' ? 1 : -1;
    sorted.sort((a, b) => {
      const pa = a.price === null || a.price === undefined ? null : Number(a.price);
      const pb = b.price === null || b.price === undefined ? null : Number(b.price);
      if (pa === null && pb === null) return 0;
      if (pa === null) return 1;
      if (pb === null) return -1;
      return (pa - pb) * dir;
    });
  } else if (sort === 'name' || sort === 'name_desc') {
    const dir = sort === 'name' ? 1 : -1;
    sorted.sort((a, b) => dir * a.name.localeCompare(b.name));
  } else {
    sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)
      || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  const total = sorted.length;
  const pages = Math.ceil(total / perPage);
  const pageRows = sorted.slice((page - 1) * perPage, page * perPage);

  /* Stock is only needed for the rows actually returned - keep the barcode
     lookup scoped to this page exactly like before. */
  const pageItemIds = pageRows.map((row) => row.id);
  const pageObjectIds = pageItemIds.map((id) => new Types.ObjectId(id));
  const pageItems = pageItemIds.length
    ? await Item.find({ _id: { $in: pageObjectIds } }).select('itemCode').lean()
    : [];
  const itemCodeCounts = new Map();
  pageItems.forEach((item) => {
    const code = String(item.itemCode || '').trim().toLowerCase();
    if (code) itemCodeCounts.set(code, (itemCodeCounts.get(code) || 0) + 1);
  });
  const uniqueItemCodes = [...itemCodeCounts]
    .filter(([, count]) => count === 1)
    .map(([code]) => code);
  const itemCodeByKey = new Map(pageItems
    .filter((item) => item.itemCode && itemCodeCounts.get(String(item.itemCode).trim().toLowerCase()) === 1)
    .map((item) => [String(item.itemCode).trim().toLowerCase(), String(item._id)]));
  const barcodeRows = pageItemIds.length
    ? await BarcodeLabel.find({
      status: BARCODE_STATUS.IN_STOCK,
      $or: [
        { itemId: { $in: pageObjectIds }, currentBusinessId: new Types.ObjectId(businessId) },
        { itemId: { $in: pageObjectIds }, currentBusinessId: null, businessId: String(businessId) },
        ...(uniqueItemCodes.length ? [{
          itemId: null,
          itemCode: { $in: uniqueItemCodes.map((code) => new RegExp(`^${escapeRegex(code)}$`, 'i')) },
          currentBusinessId: null,
          businessId: String(businessId),
        }] : []),
      ],
    }).select('itemId itemCode qty qtyNum').lean()
    : [];
  const stockByItemId = new Map();
  barcodeRows.forEach((barcode) => {
    const itemId = barcode.itemId
      ? String(barcode.itemId)
      : itemCodeByKey.get(String(barcode.itemCode || '').trim().toLowerCase());
    if (!itemId || !pageItemIds.includes(itemId)) return;
    const parsedQty = Number(barcode.qtyNum);
    const legacyQty = Number(barcode.qty);
    const qty = Number.isFinite(parsedQty) && parsedQty >= 0
      ? parsedQty
      : Number.isFinite(legacyQty) && legacyQty > 0 ? legacyQty : 1;
    stockByItemId.set(itemId, (stockByItemId.get(itemId) || 0) + qty);
  });

  const rows = pageRows.map(({ _ids, ...row }) => ({
    ...row,
    stock: stockByItemId.get(row.id) || 0,
    availableForSale: (stockByItemId.get(row.id) || 0) > 0 || row.barcodeStatusOverride === 'PRE_ORDER',
  }));
  rows.forEach((row) => { delete row.barcodeStatusOverride; });

  const payload = {
    rows,
    total,
    page,
    perPage,
    pages,
    productType: productTypeValue || '',
    group: group ? { key: group.key, slug: group.slug, displayName: group.displayName } : null,
    filters: group?.filters || [],
    filterOptions,
    appliedFilters: selections,
    sort,
    version: catalog.version,
  };

  const etag = etagFor(payload);
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }
  return json(payload, 200, { ETag: etag });
}

function etagFor(payload) {
  return `W/"${createHash('sha1').update(JSON.stringify(payload)).digest('hex')}"`;
}
