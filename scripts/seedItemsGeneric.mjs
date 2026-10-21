import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import path from 'path';

import Item from '../models/Item.js';
import ProductGroup from '../models/ProductGroup.js';

/* Generic Item seeder (Group Name / Item Name / Item Code rows).

   Usage (run from project root):
     node --env-file=.env scripts/seedItemsGeneric.mjs <businessId> <itemsJsonFile>

   Example:
     node --env-file=.env scripts/seedItemsGeneric.mjs 6a853ba0fb266c4358beb530 scripts/items_seed_2.json

   <itemsJsonFile> is a JSON array of { groupName, name, itemCode }, path
   relative to project root. Requires the matching ProductGroup docs to
   already exist for this businessId (run seedGroups.mjs first).

   Re-running is safe: skips any itemCode that already exists for this
   business. A failed batch is logged and skipped, not fatal. */

const [, , businessIdArg, itemsFileArg] = process.argv;

if (!businessIdArg || !itemsFileArg) {
  console.error('Usage: node --env-file=.env scripts/seedItemsGeneric.mjs <businessId> <itemsJsonFile>');
  process.exit(1);
}

const BATCH_SIZE = 500;

const MONGODB_URI = process.env.MONGODB_URI;
if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set.');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const filePath = path.resolve(process.cwd(), itemsFileArg);
  const rows = JSON.parse(readFileSync(filePath, 'utf-8'));
  console.log(`Loaded ${rows.length} rows from ${filePath}`);

  // 1. Resolve Group Name -> ProductGroup._id for this business
  const groups = await ProductGroup.find({ businessId: businessIdArg }).lean();
  const groupIdByName = new Map(groups.map((g) => [g.name, String(g._id)]));

  const missingGroups = new Set();
  for (const row of rows) {
    if (!groupIdByName.has(row.groupName)) missingGroups.add(row.groupName);
  }
  if (missingGroups.size) {
    console.error('Aborting: these Group Names were not found in ProductGroup for this business:');
    console.error([...missingGroups].join(', '));
    console.error('Run seedGroups.mjs for this business first.');
    await mongoose.disconnect();
    process.exit(1);
  }

  // 2. Skip itemCodes that already exist for this business (safe re-run)
  const existing = await Item.find({ businessId: businessIdArg }, { itemCode: 1 }).lean();
  const existingCodes = new Set(existing.map((i) => i.itemCode));
  console.log(`${existingCodes.size} items already exist for this business`);

  const toInsert = rows
    .filter((r) => !existingCodes.has(r.itemCode))
    .map((r) => ({
      businessId: businessIdArg,
      name: r.name,
      itemCode: r.itemCode,
      subGroupId: groupIdByName.get(r.groupName),
    }));

  console.log(`${toInsert.length} new items to insert (${rows.length - toInsert.length} skipped, already exist)`);

  // 3. Insert in batches - a failed batch is logged and skipped, not fatal
  let inserted = 0;
  let failedBatches = 0;
  const failedItemCodes = [];

  for (let i = 0; i < toInsert.length; i += BATCH_SIZE) {
    const batch = toInsert.slice(i, i + BATCH_SIZE);
    try {
      const result = await Item.insertMany(batch, { ordered: false });
      inserted += result.length;
    } catch (err) {
      const insertedInBatch = err.insertedDocs?.length || err.result?.insertedCount || 0;
      inserted += insertedInBatch;
      failedBatches++;

      const writeErrors = err.writeErrors || [];
      for (const we of writeErrors) {
        failedItemCodes.push({ itemCode: batch[we.index]?.itemCode, message: we.errmsg || we.err?.errmsg });
      }
      console.error(`Batch ${i}-${i + batch.length} had errors: ${writeErrors.length} failed, ${insertedInBatch} inserted. First error:`, writeErrors[0]?.errmsg || err.message);
    }
    console.log(`Progress: ${inserted} inserted / ${toInsert.length} total (batch ${Math.floor(i / BATCH_SIZE) + 1})`);
  }

  console.log(`\nDone. Inserted ${inserted} new items.`);
  console.log(`Skipped (already existed): ${rows.length - toInsert.length}`);
  if (failedBatches) {
    console.log(`Batches with errors: ${failedBatches}, failed rows: ${failedItemCodes.length}`);
    console.log('First 10 failures:', failedItemCodes.slice(0, 10));
  }

  const finalCount = await Item.countDocuments({ businessId: businessIdArg });
  console.log(`\nFinal Item count in DB for this business: ${finalCount}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
