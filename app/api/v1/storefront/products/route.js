import { timingSafeEqual } from 'node:crypto';
import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import EcommerceProduct from '@/models/EcommerceProduct';
import Item from '@/models/Item';
import ProductClassificationOption from '@/models/ProductClassificationOption';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';

const json = (data, status = 200) => Response.json(data, { status });
const PAGE_SIZE = 24;

function validApiKey(req) {
  const expected = process.env.STOREFRONT_API_KEY || '';
  const supplied = String(req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!expected || !supplied) return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(supplied);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function GET(req) {
  if (!process.env.STOREFRONT_API_KEY) {
    return json({ error: 'Storefront API is not configured.' }, 503);
  }
  if (!validApiKey(req)) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const businessId = params.get('business');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'A valid business ID is required.' }, 422);
  }

  await dbConnect();

  const page = Math.max(1, Number(params.get('page') || 1));
  const perPage = Math.min(100, Math.max(1, Number(params.get('perPage') || PAGE_SIZE)));
  const search = String(params.get('search') || '').trim();
  const filter = { businessId, status: 'active', isPublished: true };
  if (search) {
    const escaped = search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { displayName: { $regex: escaped, $options: 'i' } },
      { slug: { $regex: escaped, $options: 'i' } },
      { productType: { $regex: escaped, $options: 'i' } },
    ];
  }

  const [total, products] = await Promise.all([
    EcommerceProduct.countDocuments(filter),
    EcommerceProduct.find(filter)
      .sort({ isFeatured: -1, updatedAt: -1, _id: 1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
  ]);

  const itemIds = products.map((product) => product.itemId);
  const items = itemIds.length
    ? await Item.find({ _id: { $in: itemIds }, businessId }).select('name itemCode rsp image description').lean()
    : [];
  const itemById = new Map(items.map((item) => [String(item._id), item]));

  const itemCodeCounts = new Map();
  items.forEach((item) => {
    const code = String(item.itemCode || '').trim().toLowerCase();
    if (code) itemCodeCounts.set(code, (itemCodeCounts.get(code) || 0) + 1);
  });
  const uniqueItemCodes = [...itemCodeCounts]
    .filter(([, count]) => count === 1)
    .map(([code]) => code);
  const itemCodeByKey = new Map(items
    .filter((item) => item.itemCode && itemCodeCounts.get(String(item.itemCode).trim().toLowerCase()) === 1)
    .map((item) => [String(item.itemCode).trim().toLowerCase(), String(item._id)]));
  const barcodeRows = itemIds.length
    ? await BarcodeLabel.find({
      status: BARCODE_STATUS.IN_STOCK,
      $or: [
        { itemId: { $in: itemIds }, currentBusinessId: new Types.ObjectId(businessId) },
        { itemId: { $in: itemIds }, currentBusinessId: null, businessId: String(businessId) },
        ...(uniqueItemCodes.length ? [{
          itemId: null,
          itemCode: { $in: uniqueItemCodes.map((code) => new RegExp(`^${code.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}$`, 'i')) },
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
    if (!itemId || !itemById.has(itemId)) return;
    const parsedQty = Number(barcode.qtyNum);
    const legacyQty = Number(barcode.qty);
    const qty = Number.isFinite(parsedQty) && parsedQty >= 0
      ? parsedQty
      : Number.isFinite(legacyQty) && legacyQty > 0 ? legacyQty : 1;
    stockByItemId.set(itemId, (stockByItemId.get(itemId) || 0) + qty);
  });

  const classificationIds = [...new Set(products.flatMap((product) =>
    ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].flatMap((field) => product[field] || [])
  ).map(String))];
  const classifications = classificationIds.length
    ? await ProductClassificationOption.find({ _id: { $in: classificationIds }, businessId, isActive: true }).select('name type').lean()
    : [];
  const classificationById = new Map(classifications.map((option) => [String(option._id), { id: String(option._id), name: option.name, type: option.type }]));

  const rows = products.flatMap((product) => {
    const item = itemById.get(String(product.itemId));
    if (!item) return [];
    const stock = stockByItemId.get(String(product.itemId)) || 0;
    return [{
      id: String(product.itemId),
      itemCode: product.ecommItemCode || item.itemCode || '',
      name: product.displayName || item.name || '',
      description: product.printDescriptionOverride || item.description || '',
      productType: product.productType || '',
      image: product.image || item.image || '',
      additionalImages: product.additionalImages || [],
      price: product.barcodePriceOverride ?? item.rsp ?? null,
      discountPercent: product.ecommOffPercent ?? null,
      stock,
      availableForSale: stock > 0 || product.barcodeStatusOverride === 'PRE_ORDER',
      status: product.status,
      isPublished: product.isPublished,
      isFeatured: product.isFeatured,
      slug: product.slug || '',
      seoTitle: product.seoTitle || '',
      seoDescription: product.seoDescription || '',
      classifications: Object.fromEntries(
        ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].map((field) => [
          field,
          (product[field] || []).map((id) => classificationById.get(String(id))).filter(Boolean),
        ])
      ),
      updatedAt: product.updatedAt,
    }];
  });

  return json({ rows, total, page, perPage, pages: Math.ceil(total / perPage) });
}
