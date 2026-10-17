import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { resolveRefLabels } from '@/lib/refLabels';

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 20;

/* /api/v1/admin/products
   
   GET: List products with e-commerce fields
   PATCH: Bulk update products with e-commerce fields
   
   This complements /api/item but focuses on e-commerce catalog management */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();
  const businessId = sp.get('business');

  const filter = {};
  if (businessId && isValidObjectId(businessId)) {
    filter.businessId = businessId;
  }

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [
      { name: rx },
      { itemCode: rx },
      { ecommItemCode: rx },
      { description: rx },
      { displayName: rx }
    ];
  }

  // Filter by product type if provided
  const productType = sp.get('productType');
  if (productType) {
    filter.productType = productType;
  }

  // Filter by featured status
  const featured = sp.get('featured');
  if (featured === 'true') {
    filter.isFeatured = true;
  }

  const total = await Item.countDocuments(filter);
  const rows = await Item.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  // Get stock counts from barcode labels
  const itemCodes = rows.map(r => r.itemCode).filter(Boolean);
  const stockFilter = {
    itemCode: { $in: itemCodes.map(code => new RegExp(`^${escapeRegex(code)}$`, 'i')) }
  };
  if (businessId) stockFilter.businessId = businessId;

  const barcodes = itemCodes.length
    ? await BarcodeLabel.find(stockFilter).select('itemCode qty status').lean()
    : [];

  const stockByCode = new Map();
  barcodes.forEach(b => {
    const code = String(b.itemCode || '').toLowerCase();
    if (!code) return;
    const qty = Number(b.qty) || 1;
    stockByCode.set(code, (stockByCode.get(code) || 0) + qty);
  });

  return json({
    rows: rows.map(r => ({
      ...r,
      _id: String(r._id),
      stock: stockByCode.get(String(r.itemCode || '').toLowerCase()) || 0,
    })),
    labels: await resolveRefLabels(rows),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

export async function PATCH(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const { sku, updates } = body;

  if (!sku) {
    return json({ error: 'SKU/barcode is required' }, 422);
  }

  if (!updates || typeof updates !== 'object') {
    return json({ error: 'Updates object is required' }, 422);
  }

  // Find item by itemCode or ecommItemCode
  const item = await Item.findOne({
    $or: [
      { itemCode: { $regex: `^${escapeRegex(sku)}$`, $options: 'i' } },
      { ecommItemCode: { $regex: `^${escapeRegex(sku)}$`, $options: 'i' } }
    ]
  });

  if (!item) {
    return json({ error: `Product with SKU "${sku}" not found` }, 404);
  }

  // Build update object with allowed fields only
  const allowedFields = [
    'productType',
    'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
    'weaveDescription', 'fabricDescription', 'craftDescription', 
    'occasionDescription', 'colourDescription', 'printDescriptionOverride',
    'slug', 'seoTitle', 'seoDescription',
    'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 
    'barcodeStatusOverride',
    'isFeatured', 'salesCount', 'displayName',
    'image', 'additionalImages',
    'description'
  ];

  const updateDoc = {};
  allowedFields.forEach(field => {
    if (updates.hasOwnProperty(field)) {
      // Validate array fields
      if (['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour', 'additionalImages'].includes(field)) {
        if (Array.isArray(updates[field])) {
          updateDoc[field] = updates[field];
        }
      }
      // Validate number fields
      else if (['ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount'].includes(field)) {
        const num = Number(updates[field]);
        if (Number.isFinite(num)) {
          updateDoc[field] = num;
        }
      }
      // Validate boolean fields
      else if (field === 'isFeatured') {
        updateDoc[field] = Boolean(updates[field]);
      }
      // String fields
      else {
        updateDoc[field] = String(updates[field] || '').trim();
      }
    }
  });

  if (Object.keys(updateDoc).length === 0) {
    return json({ error: 'No valid updates provided' }, 422);
  }

  // Update the item
  const updated = await Item.findByIdAndUpdate(
    item._id,
    { $set: updateDoc },
    { new: true, runValidators: true }
  ).lean();

  return json({ 
    ok: true, 
    product: {
      ...updated,
      _id: String(updated._id)
    }
  });
}
