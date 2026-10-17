/* ==========================================================================
   NEW DB ONLY: keep just the newData.xlsx barcodes in barcodeLabel
   (user, 16-10-2026).

   scripts/copyMissingToDb.mjs copied the old database's barcodeLabel rows -
   old testing data - into the new database. This removes, in the NEW
   database only, every barcodeLabel row that is not from the Excel seed
   (source !== 'NEWDATA_EXCEL'). Nothing else is touched.

     TARGET_MONGODB_URI=<new db uri> node scripts/removeNonExcelBarcodes.mjs [--db=test] [--apply]

     (default)  DRY RUN - counts only.
     --apply    deletes, after saving every removed row to
                scripts/reports/removed-barcodes-<time>.json (so it can be
                put back).

   Refuses to run against the old database (grooretailerp1).
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const hit = process.argv.find((a) => a.startsWith('--db='));
const DB = hit ? hit.slice(5) : 'test';

async function main() {
  if (!process.env.TARGET_MONGODB_URI) throw new Error('Set TARGET_MONGODB_URI (the NEW database)');
  if (/grooretailerp1/i.test(process.env.TARGET_MONGODB_URI) || DB === 'grooretailerp1') {
    throw new Error('Refusing: this looks like the OLD database');
  }
  const conn = await mongoose.createConnection(process.env.TARGET_MONGODB_URI, { dbName: DB }).asPromise();
  const col = conn.db.collection('barcodeLabel');
  const filter = { source: { $ne: 'NEWDATA_EXCEL' } };

  const total = await col.countDocuments();
  const toRemove = await col.countDocuments(filter);
  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - ${conn.db.databaseName}.barcodeLabel: ${total} rows, ${toRemove} not from the Excel, ${total - toRemove} Excel rows kept`);

  if (APPLY && toRemove) {
    const rows = await col.find(filter).toArray();
    const dir = path.resolve('scripts', 'reports');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `removed-barcodes-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(file, JSON.stringify(rows));
    console.log('backup: ' + path.relative(process.cwd(), file));
    const res = await col.deleteMany(filter);
    console.log(`deleted ${res.deletedCount}; barcodeLabel now ${await col.countDocuments()} rows`);
  }
  if (!APPLY) console.log('*** DRY RUN - nothing deleted. Re-run with --apply. ***');
  await conn.close();
}

main().catch((err) => {
  console.error('FAILED:', err.message);
  process.exit(1);
});
