/* ==========================================================================
   COPY THE newData.xlsx DATA TO ANOTHER DATABASE (user, 16-10-2026).

   The Excel was seeded into the current DB (MONGODB_URI) by
   scripts/seedBarcodesFromNewData.mjs, and the item groups set by
   scripts/fixItemGroupsFromNewData.mjs. This copies exactly that data -
   plus the masters it points at - into a second, empty database, keeping
   every _id, so both databases hold identical Excel data.

     TARGET_MONGODB_URI=<uri> node --env-file=.env scripts/copyNewDataToDb.mjs [--db=test] [--apply]

     (default)  DRY RUN - counts what would be copied; writes nothing.
     --apply    writes (upsert by _id - safe to re-run, never duplicates).
     --db=NAME  target database name (default "test").

   The target URI is read from the environment only - never written into a
   file.

   What is copied (business = the business the Excel rows belong to):
     barcodeLabel    source 'NEWDATA_EXCEL'           (the Excel barcodes)
     stockmovement   refModel 'NEWDATA_EXCEL'         (their GRC_IN rows)
     business        that business
     companylocation that business's locations
     contacttype     that business's contact types
     contact         the suppliers the barcodes point at (contactKind Supplier)
     item            the items the barcodes point at
     productgroup    the barcodes' groups + the items' (sub) groups + parents
     hsn             the items' HSN + every HSN code the barcodes carry
     tax             that business's taxes
     uom             that business's UOMs
     purchaseratecode that business's rate codes
   ========================================================================== */

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const TARGET_DB = arg('db', 'test');
const { ObjectId } = mongoose.Types;
const oid = (v) => (v && ObjectId.isValid(String(v)) && String(v).length === 24 ? new ObjectId(String(v)) : null);
const uniq = (list) => [...new Map(list.filter(Boolean).map((v) => [String(v), v])).values()];
/* ids are held as ObjectId on some rows and as strings on others - match both */
const anyId = (ids) => {
  const o = uniq(ids.map(oid).filter(Boolean));
  return { $in: [...o, ...o.map(String)] };
};

async function main() {
  /* the DB the Excel was seeded into - SOURCE_MONGODB_URI when given (e.g.
     once .env already points at the new DB), else MONGODB_URI */
  const SOURCE = process.env.SOURCE_MONGODB_URI || process.env.MONGODB_URI;
  if (!SOURCE) throw new Error('No source DB: set SOURCE_MONGODB_URI or MONGODB_URI');
  if (!process.env.TARGET_MONGODB_URI) throw new Error('TARGET_MONGODB_URI is not set');

  const src = (await mongoose.createConnection(SOURCE).asPromise()).db;
  const tgtConn = await mongoose.createConnection(process.env.TARGET_MONGODB_URI, { dbName: TARGET_DB }).asPromise();
  const tgt = tgtConn.db;
  if (src.databaseName === tgt.databaseName && SOURCE === process.env.TARGET_MONGODB_URI) {
    throw new Error('Source and target are the same database');
  }

  /* ---- what to copy ---- */
  const barcodes = await src.collection('barcodeLabel').find({ source: 'NEWDATA_EXCEL' }).toArray();
  if (!barcodes.length) throw new Error('No NEWDATA_EXCEL barcodes in the source DB');
  const movements = await src.collection('stockmovement').find({ refModel: 'NEWDATA_EXCEL' }).toArray();

  const bizIds = uniq(barcodes.map((b) => b.businessId));
  const business = await src.collection('business').find({ _id: anyId(bizIds) }).toArray();
  const locations = await src.collection('companylocation').find({ businessId: anyId(bizIds) }).toArray();
  const contactTypes = await src.collection('contacttype').find({ businessId: anyId(bizIds) }).toArray();
  const suppliers = await src.collection('contact').find({ _id: anyId(barcodes.map((b) => b.supplierId)), contactKind: 'Supplier' }).toArray();
  const items = await src.collection('item').find({ _id: anyId(barcodes.map((b) => b.itemId)) }).toArray();

  const groupIds = [...barcodes.map((b) => b.groupId), ...items.map((i) => i.subGroupId)];
  let groups = await src.collection('productgroup').find({ _id: anyId(groupIds) }).toArray();
  const parents = await src.collection('productgroup').find({ _id: anyId(groups.map((g) => g.parentId)) }).toArray();
  /* one per _id (uniq() keys by String(value), which is useless for docs) */
  groups = [...new Map([...groups, ...parents].map((g) => [String(g._id), g])).values()];

  const hsnCodes = uniq(barcodes.map((b) => String(b.hsn || '').trim()).filter(Boolean));
  const hsnDocs = await src.collection('hsn').find({
    $or: [{ _id: anyId(items.map((i) => i.hsnId)) }, { businessId: anyId(bizIds), code: { $in: hsnCodes } }],
  }).toArray();
  const taxes = await src.collection('tax').find({ businessId: anyId(bizIds) }).toArray();
  const uoms = await src.collection('uom').find({ businessId: anyId(bizIds) }).toArray();
  const rateCodes = await src.collection('purchaseratecode').find({ businessId: anyId(bizIds) }).toArray();

  const plan = [
    ['business', business],
    ['companylocation', locations],
    ['contacttype', contactTypes],
    ['contact', suppliers],
    ['productgroup', groups],
    ['uom', uoms],
    ['tax', taxes],
    ['hsn', hsnDocs],
    ['item', items],
    ['purchaseratecode', rateCodes],
    ['barcodeLabel', barcodes],
    ['stockmovement', movements],
  ];

  console.log(`\n${APPLY ? 'APPLY' : 'DRY RUN'} - copy newData.xlsx data: ${src.databaseName} -> ${tgt.databaseName} (target cluster)\n`);
  const rows = [];
  for (const [name, docs] of plan) {
    const before = await tgt.collection(name).countDocuments({ _id: { $in: docs.map((d) => d._id) } });
    let written = 0;
    if (APPLY && docs.length) {
      for (let i = 0; i < docs.length; i += 500) {
        const res = await tgt.collection(name).bulkWrite(
          docs.slice(i, i + 500).map((d) => ({ replaceOne: { filter: { _id: d._id }, replacement: d, upsert: true } })),
          { ordered: false }
        );
        written += res.upsertedCount + res.modifiedCount;
      }
    }
    rows.push({ collection: name, toCopy: docs.length, alreadyInTarget: before, ...(APPLY ? { written } : {}) });
  }
  console.table(rows);
  if (!APPLY) console.log('\n*** DRY RUN - nothing written. Re-run with --apply to write. ***');

  await mongoose.disconnect();
  await tgtConn.close().catch(() => {});
}

main().catch(async (err) => {
  console.error('FAILED:', err.message);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
