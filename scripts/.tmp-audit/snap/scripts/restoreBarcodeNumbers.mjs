/* Put each unit's own barcode number back into barcodeLabel.barcodeNo.
   ============================================================================

   WHAT WENT WRONG

   restateGrcBarcodes.mjs wrote the composed display value - "G833 * 05151 * 37
   * 16" - into BOTH barcodeNo and barcodeGenerated. barcodeNo is the field the
   rest of the ERP scans and looks a unit up by, so it must hold that unit's own
   number (8A4086, 9A1119, pr0144su). Only barcodeGenerated is the display
   string.

   WHY NOT "barcodeNo = itemCode"

   Because itemCode is usually the DESIGN code, shared by many units: 10-PLNBTM
   is on 120 rows, 15-SA-PURE on 477. Copying it into barcodeNo would give those
   rows the same barcode and make a scan ambiguous. Only 288 of the affected
   rows have a per-unit code in itemCode. The real numbers survive in the backup
   restateGrcBarcodes.mjs took before it overwrote them, so that is what this
   restores.

   WHAT IT TOUCHES

   barcodeNo, and nothing else. barcodeGenerated keeps the composed value, which
   is what it is for. No document is created or deleted, and no other field -
   grcId, grcNo, supplierId, itemCode, itemName, seq, qty, prices, customFields,
   status - is read for writing or changed.

   SAFE TO RE-RUN

   A row is restored only when its CURRENT barcodeNo is still a composed value.
   Once restored it no longer matches, so a second run reports it as already
   done and writes nothing.

     npm run barcodes:restore                 dry run - prints the plan
     npm run barcodes:restore:apply           write it
       --backup <file>   a different pre-restate backup
       --grc <number>    limit to one GRC, e.g. --grc 05151 */

import path from 'path';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
function argValue(flag) {
  const i = process.argv.indexOf(flag);
  if (i === -1) return null;
  const next = process.argv[i + 1];
  return next && !next.startsWith('--') ? next : '';
}

const ROOT = process.cwd();
const DEFAULT_BACKUP = 'backups/barcode-values-before-restate-2026-09-11T15-47-53-701Z.json';
const BACKUP = path.resolve(ROOT, argValue('--backup') || DEFAULT_BACKUP);
const ONLY_GRC = argValue('--grc');
const URI = process.env.MONGODB_URI;

/* the composed display value is the only thing we are willing to overwrite */
const isComposed = (v) => typeof v === 'string' && v.includes('*');

async function main() {
  if (!URI) throw new Error('MONGODB_URI is not set - run through the npm script so --env-file applies.');
  if (!existsSync(BACKUP)) throw new Error(`Backup not found: ${BACKUP}`);

  const backup = JSON.parse(readFileSync(BACKUP, 'utf8'));
  const units = backup.units || [];
  if (!units.length) throw new Error(`Backup holds no units: ${BACKUP}`);
  console.log(`backup   : ${path.relative(ROOT, BACKUP)}`);
  console.log(`taken at : ${backup.takenAt || '(unknown)'}`);
  console.log(`units    : ${units.length}`);
  console.log(`mode     : ${APPLY ? 'APPLY' : 'dry run'}${ONLY_GRC ? `  (only GRC ${ONLY_GRC})` : ''}\n`);

  await mongoose.connect(URI);
  const bc = mongoose.connection.db.collection('barcodeLabel');

  /* ---- the state of the collection, before anything is written ---------- */
  const total = await bc.countDocuments({});
  const noItemCode = await bc.countDocuments({ $or: [{ itemCode: { $in: [null, ''] } }, { itemCode: { $exists: false } }] });
  const composedNow = await bc.countDocuments({ barcodeNo: /\*/ });
  console.log('barcodeLabel documents            : ' + total);
  console.log('  with itemCode missing or empty  : ' + noItemCode);
  console.log('  barcodeNo still a composed value: ' + composedNow);

  /* ---- build the plan --------------------------------------------------- */
  const byId = new Map(units.filter((u) => u.barcodeNo).map((u) => [String(u._id), u]));
  const query = { barcodeNo: /\*/ };
  if (ONLY_GRC) query.grcNo = ONLY_GRC;
  const rows = await bc.find(query).project({ barcodeNo: 1, barcodeGenerated: 1, itemCode: 1, grcNo: 1, status: 1 }).toArray();

  const plan = [];
  const noBackup = [];
  for (const r of rows) {
    const u = byId.get(String(r._id));
    if (!u) { noBackup.push(r); continue; }
    if (!isComposed(r.barcodeNo)) continue;          // already restored
    if (u.barcodeNo === r.barcodeNo) continue;       // backup holds the same string - nothing to undo
    plan.push({ _id: r._id, from: r.barcodeNo, to: u.barcodeNo, itemCode: r.itemCode, grcNo: r.grcNo, status: r.status });
  }

  /* ---- refuse to create a duplicate barcode ----------------------------- */
  const wanted = plan.map((p) => p.to);
  const dupWithinPlan = wanted.length - new Set(wanted).size;
  const planIds = plan.map((p) => p._id);
  const taken = await bc.find({ barcodeNo: { $in: wanted }, _id: { $nin: planIds } })
    .project({ barcodeNo: 1 }).toArray();
  const takenSet = new Set(taken.map((t) => t.barcodeNo));
  const blocked = plan.filter((p) => takenSet.has(p.to));
  const safe = plan.filter((p) => !takenSet.has(p.to));

  console.log('\nrows examined                     : ' + rows.length);
  console.log('  restorable from the backup      : ' + plan.length);
  console.log('  not in the backup (left alone)  : ' + noBackup.length);
  console.log('  duplicate targets within plan   : ' + dupWithinPlan);
  console.log('  target already used by another row: ' + blocked.length);
  console.log('  SAFE TO WRITE                   : ' + safe.length);

  if (noBackup.length) {
    console.log('\nno backup entry - these keep their composed barcodeNo:');
    noBackup.slice(0, 20).forEach((r) => console.log(`   ${r._id}  ${r.barcodeNo}  itemCode=${r.itemCode}  GRC ${r.grcNo || '-'}`));
    if (noBackup.length > 20) console.log(`   ... and ${noBackup.length - 20} more`);
  }
  if (blocked.length) {
    console.log('\nBLOCKED - the old number is already on another row:');
    blocked.slice(0, 20).forEach((p) => console.log(`   ${p._id}  ${p.from} -> ${p.to}`));
  }

  console.log('\nsample of what will be written:');
  safe.slice(0, 8).forEach((p) => console.log(`   GRC ${String(p.grcNo || '-').padEnd(6)} ${p.from.padEnd(24)} -> ${String(p.to).padEnd(12)} (itemCode "${p.itemCode}" left as it is)`));

  if (!APPLY) {
    console.log('\nDry run - nothing was written. Add --apply to write it.');
    await mongoose.disconnect();
    return;
  }
  if (!safe.length) {
    console.log('\nNothing to do.');
    await mongoose.disconnect();
    return;
  }

  /* ---- its own backup, then the write ----------------------------------- */
  const stamp = (backup.takenAt || '').replace(/[:.]/g, '-') || 'unknown';
  const outFile = path.resolve(ROOT, `backups/barcode-no-before-restore-from-${stamp}.json`);
  writeFileSync(outFile, JSON.stringify({ source: path.relative(ROOT, BACKUP), rows: safe }, null, 2));
  console.log(`\nwrote ${path.relative(ROOT, outFile)} before changing anything`);

  let written = 0;
  for (const p of safe) {
    /* the filter repeats the old value, so a concurrent change loses this
       write instead of being overwritten by it */
    const res = await bc.updateOne(
      { _id: p._id, barcodeNo: p.from },
      { $set: { barcodeNo: p.to } },
    );
    written += res.modifiedCount;
  }
  console.log(`barcodeNo restored on ${written} row(s); barcodeGenerated untouched.`);

  const left = await bc.countDocuments({ barcodeNo: /\*/ });
  console.log(`rows still holding a composed barcodeNo: ${left}`);
  await mongoose.disconnect();
}

main().catch((e) => { console.error(e); process.exit(1); });
