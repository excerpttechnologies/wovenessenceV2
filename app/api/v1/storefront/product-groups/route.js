import dbConnect from '@/lib/db';
import { getStorefrontCatalog } from '@/lib/ecommerceCatalog';
import { isValidObjectId } from 'mongoose';
import { storefrontKeyConfigured, validStorefrontKey } from '@/lib/storefrontAuth';

const json = (data, status = 200, headers = {}) => Response.json(data, { status, headers });

/* GET /api/v1/storefront/product-groups?business=<id>

   Server-to-server (Bearer STOREFRONT_API_KEY). Returns the ecommerce
   groups configured on E-commerce -> Product Type, but only the ones that
   are active, enabled and ecommerce-visible, each with its active,
   ecommerce-visible filters in display order. Configuration is read from
   Mongo on every version change - see lib/ecommerceCatalog.js. */
export async function GET(req) {
  if (!storefrontKeyConfigured()) {
    return json({ error: 'Storefront API is not configured.' }, 503);
  }
  if (!validStorefrontKey(req)) return json({ error: 'Unauthorized' }, 401);

  const businessId = new URL(req.url).searchParams.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'A valid business ID is required.' }, 422);
  }

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);

  const etag = `W/"pg-${catalog.version}-${catalog.groups.length}"`;
  if (req.headers.get('if-none-match') === etag) {
    return new Response(null, { status: 304, headers: { ETag: etag } });
  }

  return json(
    {
      version: catalog.version,
      groups: catalog.groups.map((g) => ({
        key: g.key,
        name: g.displayName || g.label,
        label: g.label,
        displayName: g.displayName,
        slug: g.slug,
        description: g.description,
        displayOrder: g.displayOrder,
        isEnabled: g.isEnabled,
        isEcommerceVisible: g.isEcommerceVisible,
        filters: g.filters.map((f) => ({
          key: f.key,
          field: f.field,
          label: f.displayLabel || f.label,
          displayLabel: f.displayLabel || f.label,
          displayOrder: f.displayOrder,
          isActive: f.isActive,
          isVisible: f.isVisible,
          isFilterable: f.isFilterable,
          selectionMode: f.selectionMode,
        })),
      })),
    },
    200,
    { ETag: etag },
  );
}
