import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import EcommerceProduct from '@/models/EcommerceProduct';
import Item from '@/models/Item';
import ProductClassificationOption, { CLASSIFICATION_TYPES } from '@/models/ProductClassificationOption';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

const json = (data, status = 200) => Response.json(data, { status });
const CLASSIFICATION_FIELDS = {
  byWeave: CLASSIFICATION_TYPES.BY_WEAVE,
  byFabric: CLASSIFICATION_TYPES.BY_FABRIC,
  byCraft: CLASSIFICATION_TYPES.BY_CRAFT,
  byOccasion: CLASSIFICATION_TYPES.BY_OCCASION,
  byColour: CLASSIFICATION_TYPES.BY_COLOUR,
};
const ALLOWED_FIELDS = [
  'ecommItemCode', 'productType', ...Object.keys(CLASSIFICATION_FIELDS),
  'displayName', 'printDescriptionOverride', 'slug', 'seoTitle', 'seoDescription',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride',
  'isFeatured', 'salesCount', 'image', 'additionalImages', 'status', 'isPublished',
];
const NUMBER_FIELDS = ['ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'salesCount'];
const STRING_FIELDS = ['ecommItemCode', 'displayName', 'printDescriptionOverride', 'seoTitle', 'seoDescription', 'barcodeStatusOverride', 'image'];
const SLUGIFY = (value) => String(value || '').trim().toLowerCase()
  .normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
  .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

async function findItem(business, itemCode) {
  const escaped = escapeRegex(itemCode);
  const item = await Item.findOne({ businessId: business, itemCode: { $regex: `^${escaped}$`, $options: 'i' } })
    .select('_id businessId name itemCode rsp image description').lean();
  if (item) return item;

  const ecommerce = await EcommerceProduct.findOne({ businessId: business, ecommItemCode: { $regex: `^${escaped}$`, $options: 'i' } })
    .select('itemId').lean();
  return ecommerce
    ? Item.findOne({ _id: ecommerce.itemId, businessId }).select('_id businessId name itemCode rsp image description').lean()
    : null;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const params = new URL(req.url).searchParams;
  const business = params.get('business') || '';
  const itemCode = String(params.get('itemCode') || '').trim();
  if (!isValidObjectId(business) || !itemCode) return json({ error: 'Business and item code are required.' }, 422);

  await dbConnect();
  const item = await findItem(business, itemCode);
  if (!item) return json({ error: `Item "${itemCode}" was not found in this business.` }, 404);

  const product = await EcommerceProduct.findOne({ businessId: business, itemId: item._id }).lean();
  return json({ item, product: product || null });
}

export async function PATCH(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const business = String(body.business || '').trim();
  const itemCode = String(body.itemCode || '').trim();
  const updates = body.updates;
  if (!isValidObjectId(business) || !itemCode) return json({ error: 'Business and item code are required.' }, 422);
  if (!updates || typeof updates !== 'object' || Array.isArray(updates)) return json({ error: 'Product updates are required.' }, 422);

  await dbConnect();
  const item = await findItem(business, itemCode);
  if (!item) return json({ error: `Item "${itemCode}" was not found in this business.` }, 404);

  const updateDoc = {};
  for (const field of ALLOWED_FIELDS) {
    if (!Object.hasOwn(updates, field)) continue;
    const value = updates[field];
    if (Object.hasOwn(CLASSIFICATION_FIELDS, field)) {
      if (!Array.isArray(value) || value.some((id) => !isValidObjectId(String(id)))) {
        return json({ error: `${field} must be an array of valid classification IDs.` }, 422);
      }
      const count = value.length ? await ProductClassificationOption.countDocuments({
        _id: { $in: value }, businessId: business, type: CLASSIFICATION_FIELDS[field], isActive: true,
      }) : 0;
      if (count !== value.length) return json({ error: `${field} contains an invalid or inactive classification.` }, 422);
      updateDoc[field] = value;
      continue;
    }
    if (NUMBER_FIELDS.includes(field)) {
      if (value === '' || value === null) { updateDoc[field] = null; continue; }
      const number = Number(value);
      if (!Number.isFinite(number) || number < 0 || (field === 'ecommOffPercent' && number > 100)) {
        return json({ error: `${field} has an invalid value.` }, 422);
      }
      updateDoc[field] = number;
      continue;
    }
    if (field === 'isFeatured' || field === 'isPublished') {
      if (typeof value !== 'boolean') return json({ error: `${field} must be true or false.` }, 422);
      updateDoc[field] = value;
      continue;
    }
    if (field === 'salesCount') continue;
    if (field === 'additionalImages') {
      if (!Array.isArray(value) || value.some((url) => typeof url !== 'string')) return json({ error: 'additionalImages must be an array of URLs.' }, 422);
      updateDoc[field] = value.map((url) => url.trim()).filter(Boolean);
      continue;
    }
    if (field === 'status') {
      if (!['draft', 'active', 'archived'].includes(value)) return json({ error: 'Status must be draft, active, or archived.' }, 422);
      updateDoc.status = value;
      continue;
    }
    if (field === 'productType') {
      if (typeof value !== 'string' || value.length > 100) return json({ error: 'Product type is invalid.' }, 422);
      updateDoc.productType = value.trim();
      continue;
    }
    if (field === 'slug') {
      if (typeof value !== 'string') return json({ error: 'URL slug must be text.' }, 422);
      updateDoc.slug = SLUGIFY(value);
      continue;
    }
    if (STRING_FIELDS.includes(field)) {
      if (typeof value !== 'string') return json({ error: `${field} must be text.` }, 422);
      updateDoc[field] = value.trim();
    }
  }

  if (Object.keys(updateDoc).length === 0) return json({ error: 'No supported product fields were supplied.' }, 422);
  if (!updateDoc.slug && Object.hasOwn(updates, 'slug')) {
    updateDoc.slug = SLUGIFY(updateDoc.displayName || item.name || item.itemCode);
  }
  if (updateDoc.slug) {
    const duplicate = await EcommerceProduct.findOne({
      businessId: business,
      slug: updateDoc.slug,
      itemId: { $ne: item._id },
    }).select('_id').lean();
    if (duplicate) return json({ error: 'That product URL slug is already in use.' }, 409);
  }
  if (updateDoc.status === 'archived') updateDoc.isPublished = false;

  const product = await EcommerceProduct.findOneAndUpdate(
    { businessId: business, itemId: item._id },
    { $set: updateDoc, $setOnInsert: { businessId: business, itemId: item._id } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true }
  ).lean();
  return json({ ok: true, item, product });
}
