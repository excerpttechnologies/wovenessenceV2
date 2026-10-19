import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import EcommerceProduct from '@/models/EcommerceProduct';
import { requireSession } from '@/lib/session';

const json = (d, s = 200) => Response.json(d, { status: s });

/* /api/v1/admin/products/facets
   
   GET: Return facets (unique values) for filtering products
        - Product types
        - Available classification values
        - Status values
        - Featured count */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const businessId = sp.get('business');
  const filter = {};
  
  if (businessId && isValidObjectId(businessId)) {
    filter.businessId = businessId;
  }

  // Get unique product types
  const productTypes = await EcommerceProduct.distinct('productType', filter);

  // Get counts for featured
  const featuredCount = await EcommerceProduct.countDocuments({ 
    ...filter, 
    isFeatured: true 
  });

  // Get status override values used
  const statusValues = await EcommerceProduct.distinct('barcodeStatusOverride', filter);

  return json({
    facets: {
      productTypes: productTypes.filter(Boolean).sort(),
      statusValues: statusValues.filter(Boolean).sort(),
      featuredCount,
    }
  });
}
