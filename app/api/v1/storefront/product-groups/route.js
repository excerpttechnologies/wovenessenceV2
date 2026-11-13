import dbConnect from '@/lib/db';
import { getStorefrontCatalog, getGroupFacetData } from '@/lib/ecommerceCatalog';
import { isValidObjectId } from 'mongoose';
import { storefrontKeyConfigured, validStorefrontKey } from '@/lib/storefrontAuth';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });
const CONFIG_CACHE_CONTROL = 'no-cache, must-revalidate';

/* GET /api/v1/storefront/product-groups?business=<id>&includeValues=1

   Server-to-server (Bearer STOREFRONT_API_KEY). Returns the ecommerce
   groups configured on E-commerce -> Product Type, but only the ones that
   are active and ecommerce-visible, each with its active, visible and
   filterable filters in display order. `includeValues=1` adds each
   filter's live options and product counts. */
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
  const includeValues = params.get('includeValues') === '1';

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);
  const facetData = includeValues
    ? await getGroupFacetData(businessId, catalog.groups)
    : null;

  const groups = catalog.groups.map((group) => {
    const groupOptions = facetData?.options.get(group.key) || {};
    return {
      key: group.key,
      name: group.name,
      displayName: group.displayName,
      slug: group.slug,
      description: group.description,
      displayOrder: group.displayOrder,
      productTypes: group.productTypes,
      filters: group.filters.map((filter) => ({
        key: filter.key,
        field: filter.field,
        label: filter.displayLabel || filter.label,
        displayLabel: filter.displayLabel || filter.label,
        displayOrder: filter.displayOrder,
        isActive: filter.isActive,
        isVisible: filter.isVisible,
        isFilterable: filter.isFilterable,
        selectionMode: filter.selectionMode,
        type: filter.type,
        ...(includeValues ? { options: groupOptions[filter.key] || [] } : {}),
      })),
    };
  });

  const etag = `W/"pg-${catalog.version}-${includeValues ? 'values' : 'plain'}-${groups.length}"`;
  /* Live options/counts also change when products change, which the config
     version does not track - only the configuration-only response may 304. */
  if (!includeValues && req.headers.get('if-none-match') === etag) {
    return new Response(null, {
      status: 304,
      headers: { ETag: etag, 'Cache-Control': CONFIG_CACHE_CONTROL },
    });
  }

  return json(
    { business: String(businessId), version: catalog.version, groups },
    200,
    { ETag: etag, 'Cache-Control': CONFIG_CACHE_CONTROL },
  );
}
