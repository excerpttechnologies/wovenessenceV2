/* Remove everything scripts/seedBarcodeDump.mjs inserted.

   Usage, from the project root:
     node scripts/deleteBarcodeDump.mjs            dry run - reports, deletes nothing
     node scripts/deleteBarcodeDump.mjs --apply    actually deletes

   HOW IMPORTED ROWS ARE TOLD APART FROM REAL ONES
   Rows created by the barcode-generation screen always carry BOTH a grcId
   (the GRC they belong to) and a barcodeGenerated (the barcode itself). The
   import writes neither - there is no source for them in the spreadsheet.
   So the signature is: no grcId AND no barcodeGenerated AND sitting in one
   of the three business+location pairs the import targeted.

   All three conditions must hold. Any one of them alone would be too loose:
   a hand-made row missing a grcId, or a future row in the same location,
   must not be swept up by this.

   After deleting, the collection should be back to exactly what it was
   before the import - the script prints the before/after counts so you can
   see that for yourself.                                                    */

import fs from 'fs';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

/* the same three pairs seedBarcodeDump.mjs writes to - keep them in step */
const MAP = {
  'TEMPLE FABRICS, SILKS & SAREES': { biz: '6a853ba0fb266c4358beb530', loc: '6a874b62b5810c74e6a9b9c4' },
  'SUVARNA FABRICS':                { biz: '6a853bf6fb266c4358beb538', loc: '6a8c28fbc67379ce90586e44' },
  'Temple Fabrics':                 { biz: '6a853cdefb266c4358beb548', loc: '6a858ded9d37d436b1fc02dc' },
};

/* the import wrote no grcId and no barcodeGenerated; real rows have both */
const FILTER = {
  grcId: { $exists: false },
  barcodeGenerated: { $exists: false },
  $or: Object.values(MAP).map((m) => ({ businessId: m.biz, locationId: m.loc })),
};

function loadEnv() {
  for (const f of ['.env.local', '.env']) {
    if (!fs.existsSync(f)) continue;
    for (const line of fs.readFileSync(f, 'utf8').split(/\r?\n/)) {
      const m = line.match(/^\s*([\w.-]+)\s*=\s*(.*)\s*$/);
      if (!m) continue;
      const v = m[2].trim().replace(/^["']|["']$/g, '');
      if (!(m[1] in process.env)) process.env[m[1]] = v;
    }
  }
}

async function main() {
  loadEnv();
  if (!process.env.MONGODB_URI) {
    console.error('MONGODB_URI is not set. Add it to .env.');
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGODB_URI);
  const col = mongoose.connection.db.collection('barcodeLabel');

  const total = await col.countDocuments();
  const doomed = await col.countDocuments(FILTER);
  const keep = total - doomed;

  console.log('barcodeLabel rows now      : ' + total);
  console.log('imported rows to delete    : ' + doomed);
  console.log('rows that will be KEPT     : ' + keep);

  if (doomed === 0) {
    console.log('\nNothing to do - no imported rows found.');
    await mongoose.disconnect();
    return;
  }

  console.log('\nto delete, by branch:');
  for (const [b, m] of Object.entries(MAP)) {
    const n = await col.countDocuments({
      grcId: { $exists: false },
      barcodeGenerated: { $exists: false },
      businessId: m.biz,
      locationId: m.loc,
    });
    console.log('   ' + b.padEnd(34) + n);
  }

  /* prove the rows being kept really are the barcode-generated ones */
  const keptSample = await col.find({ grcId: { $exists: true } })
    .project({ itemCode: 1, barcodeGenerated: 1, grcId: 1 }).limit(3).toArray();
  console.log('\nsample of rows being KEPT (they have grcId + barcodeGenerated):');
  keptSample.forEach((r) => console.log('   itemCode=' + String(r.itemCode || '').padEnd(10)
    + ' barcode=' + String(r.barcodeGenerated || '').padEnd(12) + ' grcId=' + r.grcId));

  const doomedSample = await col.find(FILTER)
    .project({ itemCode: 1, printDescription: 1, retailPrice: 1 }).limit(3).toArray();
  console.log('\nsample of rows being DELETED:');
  doomedSample.forEach((r) => console.log('   itemCode=' + String(r.itemCode || '').padEnd(10)
    + ' item=' + String(r.printDescription || '').padEnd(16) + ' rsp=' + r.retailPrice));

  if (!APPLY) {
    console.log('\n*** DRY RUN - nothing deleted. Re-run with --apply to delete. ***');
    await mongoose.disconnect();
    return;
  }

  console.log('\ndeleting...');
  const res = await col.deleteMany(FILTER);
  console.log('deleted ' + res.deletedCount);

  const after = await col.countDocuments();
  console.log('barcodeLabel rows now : ' + after);
  console.log(after === keep
    ? 'OK - exactly the expected rows remain.'
    : 'WARNING - expected ' + keep + ' to remain but found ' + after);

  await mongoose.disconnect();
}

main().catch((e) => { console.error('ERR ' + e.message); process.exit(1); });
