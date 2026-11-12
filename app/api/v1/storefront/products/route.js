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
import {
  parseFilterSelections,
  selectionError,
} from '@/lib/ecommerceFilterConfig';
import { classificationGroupKeyFor } from '@/lib/productClassificationConstants';
import { storefrontKeyConfigured, validStorefrontKey } from '@/lib/storefrontAuth';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const PAGE_SIZE = 24;
const SEARCH_MAX = 120;
const SORTS = new Set(['featured', 'newest', 'oldest']);

const escapeRegex = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const groupSummary = (group) => (group ? {
  key: group.key,
  name: group.name,
  displayName: group.displayName,
  slug: group.slug,
  description: group.description,
} : null);

const etagFor = (payload) => `W/"${createHash('sha1').update(JSON.stringify(payload)).digest('hex')}"`;

/* GET /api/v1/storefront/products

   Eligible products, dynamic filter values/counts and filtered results for
   one ERP product group. See ECOMMERCE_README.md section 5.2. */
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
  if (search.length > SEARCH_MAX) {
    return json({ error: `Search must be ${SEARCH_MAX} characters or fewer.` }, 422);
  }
  const sort = SORTS.has(params.get('sort')) ? params.get('sort') : 'featured';
  /* facets=0 skips the filter value/count block entirely */
  const includeFacets = params.get('facets') !== '0';
  const productTypeParam = String(params.get('group') || params.get('productType') || '').trim();

  const { selections, errors } = parseFilterSelections(params);
  if (errors.length) return json({ error: errors[0] }, 422);
  const hasSelections = Object.keys(selections).length > 0;

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);

  /* An unknown or disabled group is unavailable, never an empty listing. */
  const group = productTypeParam ? findCatalogGroup(catalog, productTypeParam) : null;
  if (productTypeParam && !group) {
    return json({ error: 'Product group not found.' }, 404);
  }
  if (!group && hasSelections) {
    return json({ error: 'Choose a product group before filtering.' }, 422);
  }
  if (group) {
    const error = selectionError(selections, group.filters);
    if (error) return json({ error }, 422);

    /* Every selected id must be a live classification master of this
       business AND of the group's classification group. */
    const classGroup = classificationGroupKeyFor(group.key);
    for (const [key, ids] of Object.entries(selections)) {
      const filter = group.filters.find((f) => f.key === key);
      const label = filter?.displayLabel || filter?.label || key;
      const found = await classificationCollection(key)
        .find({
          _id: { $in: ids.map((id) => new Types.ObjectId(id)) },
          businessId: businessMatch(businessId),
          isActive: { $ne: false },
          productType: { $regex: `^${escapeRegex(classGroup)}$`, $options: 'i' },
        })
        .project({ _id: 1 })
        .toArray();
      const foundIds = new Set(found.map((row) => String(row._id).toLowerCase()));
      if (ids.some((id) => !foundIds.has(id))) {
        return json({ error: `One or more selected ${label} values are not available for this group.` }, 422);
      }
    }
  }

  /* Eligible products only - active, published, not explicitly inactive,
     and backed by a real ERP item. */
  const itemIds = await Item.distinct('_id', { businessId: new Types.ObjectId(businessId) });
  const baseFilter = {
    businessId,
    status: 'active',
    isPublished: true,
    isActive: { $ne: false },
    itemId: { $in: itemIds },
  };
  if (group) {
    baseFilter.productType = { $regex: `^${escapeRegex(group.key)}$`, $options: 'i' };
  }
  if (search) {
    const escaped = escapeRegex(search);
    baseFilter.$or = [
      { displayName: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { productType: { $regex: escaped, $options: 'i' } },
    ];
  }

  const products = await EcommerceProduct.find(baseFilter).lean();
  const productItemIds = [...new Set(products.map((product) => String(product.itemId)))]
    .filter((id) => isValidObjectId(id));
  const items = productItemIds.length
    ? await Item.find({ _id: { $in: productItemIds.map((id) => new Types.ObjectId(id)) } })
        .select('name itemCode rsp image description').lean()
    : [];
  const itemById = new Map(items.map((item) => [String(item._id), item]));

  const classificationIds = [...new Set(products.flatMap((product) =>
    CLASSIFICATION_FIELDS.flatMap((field) => product[field] || [])
  ).map(String))];
  const classificationById = new Map([...(await classificationOptionsById(classificationIds))]
    .filter(([, option]) => option.isActive)
    .map(([id, option]) => [id, { id, name: option.name, type: option.type }]));

  /* rowsBase keeps each product's classification id sets for filtering and
     faceting (stripped from the response rows). */
  const rowsBase = products.flatMap((product) => {
    const item = itemById.get(String(product.itemId));
    if (!item) return [];
    const ids = {};
    CLASSIFICATION_FIELDS.forEach((field) => {
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
        CLASSIFICATION_FIELDS.map((field) => [
          field,
          [...ids[field]]
            .map((classificationId) => classificationById.get(classificationId))
            .filter(Boolean),
        ])
      ),
      updatedAt: product.updatedAt,
    }];
  });

  const matchesSelections = (row, exceptKey) => Object.entries(selections)
    .every(([key, ids]) => key === exceptKey || ids.some((id) => row._ids[key].has(id)));

  const filteredRows = rowsBase.filter((row) => matchesSelections(row, null));

  /* Facet options: each filter's counts are calculated with the other
     selected filters applied, so choosing a value does not hide the other
     values in the same filter. */
  let filterPayload = [];
  if (includeFacets && group) {
    const classGroup = classificationGroupKeyFor(group.key);
    const optionsByFilter = {};
    for (const filter of group.filters) {
      const candidates = rowsBase.filter((row) => matchesSelections(row, filter.key));
      const counts = new Map();
      candidates.forEach((row) => {
        row._ids[filter.key].forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
      });
      const meta = new Map([...(await classificationOptionsById([...counts.keys()]))]
        .filter(([, option]) => option.isActive
          && String(option.productType || '').trim().toUpperCase() === classGroup));
      optionsByFilter[filter.key] = [...counts.entries()]
        .map(([id, count]) => ({ id, count, option: meta.get(id) }))
        .filter(({ option }) => Boolean(option))
        .map(({ id, count, option }) => ({
          id,
          name: option.name || '',
          displayOrder: option.displayOrder || 0,
          count,
        }))
        .sort((a, b) => a.displayOrder - b.displayOrder
          || a.name.localeCompare(b.name)
          || b.count - a.count);
    }
    filterPayload = group.filters.map((filter) => ({
      ...filter,
      options: optionsByFilter[filter.key] || [],
    }));
  }

  /* Sort + paginate in memory: ordering needs the joined item data and the
     facets already required the full eligible set. */
  const sorted = [...filteredRows];
  if (sort === 'newest') {
    sorted.sort((a, b) => new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  } else if (sort === 'oldest') {
    sorted.sort((a, b) => new Date(a.updatedAt || 0) - new Date(b.updatedAt || 0));
  } else {
    sorted.sort((a, b) => Number(b.isFeatured) - Number(a.isFeatured)
      || new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0));
  }

  const total = sorted.length;
  const pages = Math.ceil(total / perPage);
  const pageRows = sorted.slice((page - 1) * perPage, page * perPage);

  /* Stock is only needed for the rows actually returned. */
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
    group: groupSummary(group),
    filters: filterPayload,
    appliedFilters: selections,
  };

  const etag = etagFor(payload);
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': 'no-store' },
    });
  }
  return json(payload, 200, { ETag: etag, 'Cache-Control': 'no-store' });
}
