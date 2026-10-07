import mongoose from 'mongoose';
import ProductGroup from '../models/ProductGroup.js';

/* One-time fix: the 20 group names seeded by seedProductGroups.mjs went in
   with businessId: null. This updates just those docs to the real
   businessId so they line up with the rest of the seeded data. */

const GROUP_NAMES = [
  '3 PC SET',
  '3 PCS SUIT',
  'BORDER',
  'DUPATTA',
  'FABRICS',
  'General',
  'INSKIRT',
  'LAST BITS',
  'MAGTA SHALYA',
  'MASK',
  'PAVADA',
  'PLAIN FABRICS',
  'READY BITS',
  'READY BITS PACK',
  'READYMADE',
  'SAREE FALLS',
  'SAREEES',
  'SAREES',
  'SINGLE READY BIT',
  'Womens',
];

const BUSINESS_ID = '6a853cdefb266c4358beb548';

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/updateProductGroupsBusinessId.mjs');
  process.exit(1);
}

async function run() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const result = await ProductGroup.updateMany(
    { name: { $in: GROUP_NAMES }, businessId: null },
    { $set: { businessId: BUSINESS_ID } }
  );

  console.log(`Matched: ${result.matchedCount}, Modified: ${result.modifiedCount}`);

  await mongoose.disconnect();
}

run().catch((err) => {
  console.error('Update failed:', err);
  process.exit(1);
});
