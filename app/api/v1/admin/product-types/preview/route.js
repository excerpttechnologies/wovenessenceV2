import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { getStorefrontCatalog, findCatalogGroup, getGroupFacetData } from '@/lib/ecommerceCatalog';

const json = (data, status = 200) => Response.json(data, { status });

/* GET /api/v1/admin/product-types/preview?business=<id>&value=SAREES

   Admin-side preview of exactly what GET /api/v1/storefront/product-groups
   returns for one group, plus the live product count and each filter's
   options with their counts. Same catalog builder and cache as the
   storefront, so the page can show the ecommerce result before the website
   fetches it. */
export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const businessId = params.get('business');
  const value = String(params.get('value') || '').trim();
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }
  if (!value) return json({ error: 'Product type required' }, 422);

  const denial = await screenDenial({
    session, screen: SCREENS.ECOM_PRODUCT_TYPE, action: PERM.READ, businessId, label: 'Product Type',
  });
  if (denial) return json({ error: denial.message, code: denial.code }, 403);

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);
  const group = findCatalogGroup(catalog, value);
  if (!group) return json({ error: 'Product group not found.' }, 404);

  const { options, counts } = await getGroupFacetData(businessId, [group]);
  const groupOptions = options.get(group.key) || {};

  return json({
    ...group,
    productCount: counts.get(group.key) || 0,
    filters: group.filters.map((filter) => ({
      ...filter,
      options: groupOptions[filter.key] || [],
    })),
  });
}
