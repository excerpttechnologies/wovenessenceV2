/* Gives EXISTING GRC barcodes their display value in barcodeGenerated:

     SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY          e.g. "G1318 * 05178 * 1 * 16"

   barcodeNo IS NEVER WRITTEN. It is the unit's own number (8A4086) - what
   scans, what bills, transfers and the stock ledger name, what the barcode
   engine counts on from. An earlier version of this script wrote the display
   value into barcodeNo as well, which is what scripts/restoreBarcodeNumbers.mjs
   had to undo on 1,173 rows.

   DRY RUN unless --apply. Name the GRCs - by number or id - or pass --all:

     npm run barcodes:restate -- --grc 05178
     npm run barcodes:restate -- --grc 05178 --grc 05177 --apply
     npm run barcodes:restate -- --all                 (look before you apply!)

   For each GRC, in the order its barcodes were created:
     - a barcode that already carries a SEQ keeps it; the others take the
       lowest free SEQ from 1 up - so GRC 05178's 16, 16, 89 become
       "G1318 * 05178 * 1 * 16", "* 2 * 16", "* 3 * 89"
     - the value is the GRC supplier's code, the GRC number, that SEQ and that
       barcode's OWN quantity (lib/barcodeValue.js - the save route's rule)
     - every barcode gets it, whether in stock or already moved: only the
       display field changes, so a sold or transferred unit still scans and
       reports under the number it moved with
     - a value another barcode of the business already carries in
       barcodeGenerated is not written - it is reported
   The GRC's lastBarcodeSeq is raised to its highest SEQ.

   Nothing that scans changes, so no label has to be reprinted for scanning -
   reprint only where the printed display value should show the new text. */

import mongoose from 'mongoose';
import { composeBarcodeValue, barcodeValueProblem } from '@/lib/barcodeValue';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const ALL = argv.includes('--all');
const named = argv.flatMap((arg, i) => (arg === '--grc' && argv[i + 1] ? [argv[i + 1]] : []));
if (!ALL && !named.length) {
  console.error('Name the GRCs to restate with --grc <number or id> (repeatable), or pass --all. Nothing is written without --apply.');
  process.exit(1);
}

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const filter = ALL ? {} : {
  $or: named.flatMap((key) => (ObjectId.isValid(key) && String(key).length === 24
    ? [{ _id: new ObjectId(key) }]
    : [{ grcNumber: key }, { grcNumber: 'GRC ' + key }])),
};
const grcs = await db.collection('grc').find(filter).sort({ grcDate: 1, _id: 1 }).toArray();
console.log(`${APPLY ? 'APPLYING' : 'DRY RUN'} - ${grcs.length} GRC(s)\n`);

const seqOf = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : 0);

let revalued = 0;
let seqOnly = 0;
let conflicts = 0;

for (const grc of grcs) {
  const supplier = grc.supplierId ? await db.collection('contact').findOne({ _id: grc.supplierId }, { projection: { contactId: 1 } }) : null;
  const supplierCode = String(supplier?.contactId || '').trim();
  const units = await db.collection('barcodeLabel').find({ grcId: String(grc._id) }).sort({ createdAt: 1, _id: 1 }).toArray();
  console.log(`GRC ${grc.grcNumber || '(no number)'}  [${grc._id}]  supplier ${supplierCode || '(no code)'}  - ${units.length} barcode(s)`);
  const problem = barcodeValueProblem({ supplierCode, grcNumber: grc.grcNumber });
  if (problem) { console.log('  SKIPPED - ' + problem + '\n'); continue; }
  if (!units.length) { console.log(''); continue; }

  /* SEQ: kept where a barcode has one (and it is not shared), otherwise the
     lowest free number from 1 */
  const used = new Set();
  const seqs = new Map();
  units.forEach((u) => {
    const s = seqOf(u.seq);
    if (s && !used.has(s)) { used.add(s); seqs.set(String(u._id), s); }
  });
  let free = 1;
  units.forEach((u) => {
    if (seqs.has(String(u._id))) return;
    while (used.has(free)) free += 1;
    used.add(free);
    seqs.set(String(u._id), free);
  });

  const plan = units.map((u) => {
    const seq = seqs.get(String(u._id));
    const value = composeBarcodeValue({ supplierCode, grcNumber: grc.grcNumber, seq, qty: u.qty });
    /* only barcodeGenerated is compared and written - never barcodeNo */
    const current = String(u.barcodeGenerated || '');
    return { u, seq, value, current, keep: !value };
  });

  /* a display value some OTHER barcode of the business already carries */
  const wanted = plan.filter((p) => !p.keep && p.value !== p.current).map((p) => p.value);
  const taken = wanted.length
    ? new Set((await db.collection('barcodeLabel').find({
      businessId: String(grc.businessId || ''), barcodeGenerated: { $in: wanted }, grcId: { $ne: String(grc._id) },
    }, { projection: { barcodeGenerated: 1 } }).toArray()).map((u) => u.barcodeGenerated))
    : new Set();

  const writes = [];
  plan.forEach(({ u, seq, value, current, keep }) => {
    const set = {};
    if (String(u.seq ?? '') !== String(seq)) set.seq = String(seq);
    let action;
    if (keep) {
      action = 'KEEPS (no quantity)';
      if (set.seq) seqOnly += 1;
    } else if (value === current) {
      action = 'already right';
    } else if (taken.has(value)) {
      action = `NOT CHANGED - ${value} is already another barcode's`;
      conflicts += 1;
    } else {
      set.barcodeGenerated = value;
      action = `${u.barcodeNo}  generated ${current || '(blank)'}  ->  ${value}`;
      revalued += 1;
    }
    console.log(`  SEQ ${String(seq).padStart(3)}  qty ${String(u.qty).padEnd(6)} ${action}`);
    if (Object.keys(set).length) writes.push({ updateOne: { filter: { _id: u._id }, update: { $set: { ...set, updatedAt: new Date() } } } });
  });

  const highest = Math.max(0, ...seqs.values());
  if (APPLY) {
    if (writes.length) await db.collection('barcodeLabel').bulkWrite(writes, { ordered: true });
    await db.collection('grc').updateOne({ _id: grc._id }, { $max: { lastBarcodeSeq: highest } });
  }
  console.log(`  lastBarcodeSeq -> ${highest}${APPLY ? '' : ' (dry run)'}\n`);
}

console.log(`${revalued} barcode(s) ${APPLY ? 'given' : 'would be given'} their barcodeGenerated value, ${seqOnly} ${APPLY ? 'given' : 'would get'} a SEQ only, ${conflicts} conflict(s) left alone. barcodeNo untouched.`);
if (!APPLY) console.log('Nothing was written. Add --apply to write it.');
await mongoose.disconnect();
