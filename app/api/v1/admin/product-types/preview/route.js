import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { getStorefrontCatalog } from '@/lib/ecommerceCatalog';

const json = (data, status = 200) => Response.json(data, { status });

/* GET /api/v1/admin/product-types/preview?business=<id>

   Admin-side preview of exactly what GET /api/v1/storefront/product-groups
   will return for this business - same catalog builder, same cache, so the
   page can show the ecommerce result before the website fetches it. */
export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const businessId = new URL(req.url).searchParams.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Valid business ID required' }, 422);
  }

  await dbConnect();
  const catalog = await getStorefrontCatalog(businessId);
  return json({
    version: catalog.version,
    groups: catalog.groups,
  });
}
