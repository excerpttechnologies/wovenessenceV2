import mongoose from 'mongoose';
import EcommerceProduct from '../models/EcommerceProduct.js';

const APPLY = process.argv.includes('--apply');
const FIELDS = [
  'ecommItemCode', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
  'weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription',
  'displayName', 'printDescriptionOverride', 'slug', 'seoTitle', 'seoDescription',
  'ecommOffPercent', 'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride',
  'isFeatured', 'salesCount', 'image', 'additionalImages',
];

function hasValue(field, value) {
  if (value === undefined || value === null || value === '') return false;
  if (Array.isArray(value)) return value.length > 0;
  if (field === 'isFeatured') return value === true;
  if (field === 'salesCount') return Number(value) > 0;
  return true;
}

async function main() {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI is not set. Run with --env-file=.env.');
  await mongoose.connect(process.env.MONGODB_URI);

  const items = await mongoose.connection.db.collection('item').find({ businessId: { $exists: true } }).toArray();
  let candidates = 0;
  let existing = 0;
  let copied = 0;
  let failed = 0;

  for (const item of items) {
    if (!item.businessId || !FIELDS.some((field) => hasValue(field, item[field]))) continue;
    candidates += 1;

    const found = await EcommerceProduct.exists({ businessId: item.businessId, itemId: item._id });
    if (found) {
      existing += 1;
      continue;
    }

    const metadata = Object.fromEntries(FIELDS
      .filter((field) => hasValue(field, item[field]))
      .map((field) => [field, item[field]]));

    if (!APPLY) continue;
    try {
      await EcommerceProduct.updateOne(
        { businessId: item.businessId, itemId: item._id },
        { $setOnInsert: { businessId: item.businessId, itemId: item._id, ...metadata } },
        { upsert: true, setDefaultsOnInsert: true }
      );
      copied += 1;
    } catch (error) {
      failed += 1;
      console.error(`Failed to migrate Item ${item._id}: ${error.message}`);
    }
  }

  console.log(`Items with legacy e-commerce data: ${candidates}`);
  console.log(`Already present in ecommerceproduct: ${existing}`);
  if (APPLY) {
    console.log(`Copied to ecommerceproduct: ${copied}`);
    console.log(`Failed: ${failed}`);
  } else {
    console.log(`Would copy: ${candidates - existing}`);
    console.log('Dry run only. Re-run with --apply to copy data.');
  }
}

main()
  .catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (mongoose.connection.readyState) await mongoose.disconnect();
  });
