import mongoose from 'mongoose';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

import Item from '../models/Item.js';
import ProductGroup from '../models/ProductGroup.js';

/* Seeds Item documents from item12.xlsx (Group Name / Item Name / Item Code).

   - Group Name is resolved against the already-seeded ProductGroup
     collection and stored as subGroupId.
   - Re-running this script is safe: it skips any itemCode that already
     exists for this business rather than re-inserting it.
   - A failed batch is logged and SKIPPED rather than aborting the whole
     run, so one bad row can't stop the other 24,000 good ones. */

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const BUSINESS_ID = '6a853cdefb266c4358beb548';
const BATCH_SIZE = 500; // smaller batches = smaller blast radius per failure

const MONGODB_URI = process.env.MONGODB_URI;

if (!MONGODB_URI) {
  console.error('MONGODB_URI is not set. Run with: node --env-file=.env scripts/seedItems.mjs');
  process.exit(1);
}

async function seed() {
  await mongoose.connect(MONGODB_URI);
  console.log('Connected to MongoDB');

  const raw = readFileSync(path.join(__dirname, 'items_seed.json'), 'utf-8');
  const rows = JSON.parse(raw);
  console.log(`Loaded ${rows.length} rows from items_seed.json`);

  // 1. Resolve Group Name -> ProductGroup._id for this business
  const groups = await ProductGroup.find({ businessId: BUSINESS_ID }).lean();
  const groupIdByName = new Map(groups.map((g) => [g.name, String(g._id)]));

  const missingGroups = new Set();
  for (const row of rows) {
    if (!groupIdByName.has(row.groupName)) missingGroups.add(row.groupName);
  }
  if (missingGroups.size) {
    console.error('Aborting: these Group Names were not found in ProductGroup for this business:');
    console.error([...missingGroups].join(', '));
    await mongoose.disconnect();
    process.exit(1);
  }

  // 2. Skip itemCodes that already exist for this business (safe re-run)
  const existing = await Item.find({ businessId: BUSINESS_ID }, { itemCode: 1 }).lean();
  const existingCodes = new Set(existing.map((i) => i.itemCode));
  console.log(`${existingCodes.size} items already exist for this business`);

  const toInsert = rows
    .filter((r) => !existingCodes.has(r.itemCode))
    .map((r) => ({
      businessId: BUSINESS_ID,
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
      // insertMany with ordered:false still inserts the good docs in the
      // batch before throwing - err.insertedDocs / err.writeErrors tell us
      // exactly what happened instead of losing the whole batch silently.
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

  const finalCount = await Item.countDocuments({ businessId: BUSINESS_ID });
  console.log(`\nFinal Item count in DB for this business: ${finalCount}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
