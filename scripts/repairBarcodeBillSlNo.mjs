/* ==========================================================================
   REPAIR EVERY STORED BARCODE VALUE TO THE CURRENT RULE

     SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * SERIAL_NO   e.g. "G512 * 05173 * 5 * 1"

   The fourth part is the row's SEQ - the GRC-wide running number every value
   made before per-bill-line serials carries - or, for a barcode made since,
   its own Serial No. within its Bill Sl No. (1, 2, 3 per line). Both are
   what is printed on the goods, and both are left as they are.

   The third part is the BILL SL NO. - the bill line the item was received on,
   as the GRC's Item Summary shows it against that item (barcodeLabel.billSlNo,
   the "Bill Sl No." column of the Barcode Generation grid). Values stored
   before that rule carry something else there: most of this data was written
   as SUPPLIER * GRC * SEQ * QTY, so BOTH the third and the fourth part move.

     stored   G516 * 05167 * 2 * 1      (seq 2, qty 1)
     bill line 1, seq 2
     becomes  G516 * 05167 * 1 * 2

   WHAT IT TOUCHES
     barcodeGenerated, and only on rows that already hold a composed value
     (one containing " * "). A row whose barcodeGenerated is blank never had a
     display value and is not given one here - that is a different decision,
     not a repair.

   WHAT IT NEVER TOUCHES
     barcodeNo. It is the unit's own number - what the till scans, what a POS
     invoice line names, what the bars on an already printed label encode, and
     what lib/barcodeEngine.js counts on from. An earlier tool wrote display
     values into it and 1,173 rows had to be put back from a backup
     (scripts/restoreBarcodeNumbers.mjs). Not again.

     Nothing is deleted. No row is inserted. No GRC, item or quantity is
     touched. Stock, status and location are not read or written.

   HOW IT DECIDES
     The new value is built by the ONE canonical builder the save route uses,
     composeBarcodeValue() in lib/barcodeValue.js, from the row's OWN fields:
     its GRC's supplier code, its GRC's number, its own billSlNo, its own seq.
     Nothing is derived from a quantity, an array index, a row number or a
     position in the file. A row that cannot answer for one of those four
     parts is REPORTED, never guessed at.

     A row whose stored value already equals the composed one - in either
     spelling - is left alone, which is what makes a second run a no-op. So
     is a row whose value already carries this GRC, its supplier, its own
     Bill Sl No. and, in the fourth place, its own serialNo: that is a
     barcode numbered per bill line, and recomposing it with the GRC-wide SEQ
     would change a printed value.

     npm run barcodes:billslno              the plan, and an audit file
     npm run barcodes:billslno:apply        then write it
     npm run barcodes:billslno:verify       check the database afterwards

   Add --grc <number or id> (repeatable) to work on named GRCs only.
   ========================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import { contactCollection } from '../lib/contactStorage.js';
import {
  composeBarcodeValue, billSlNoForBarcode, grcNumberForBarcode, parseBarcodeValue, sameBarcode,
} from '@/lib/barcodeValue';

const argv = process.argv.slice(2);
const APPLY = argv.includes('--apply');
const VERIFY = argv.includes('--verify');
const named = argv.flatMap((arg, i) => (arg === '--grc' && argv[i + 1] ? [argv[i + 1]] : []));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

const COMPOSED = / \* /;                       /* a value this rule owns */
const text = (v) => String(v ?? '').trim();
/* the four parts of a stored value, read in either spelling */
const partsOf = (value) => {
  const parts = parseBarcodeValue(value);
  return parts ? [parts.supplierCode, parts.grcNumber, parts.billSlNo, parts.serialNo] : String(value || '').split(' * ');
};

/* ---------------------------------------------------------------- scope --
   Only rows that already carry a composed value. A blank barcodeGenerated is
   not a wrong barcode; it is no barcode, and inventing one here would be a
   different change to a different 22,000 rows. */
const filter = { barcodeGenerated: { $regex: COMPOSED } };
if (named.length) {
  const grcs = await db.collection('grc').find({
    $or: named.flatMap((key) => (ObjectId.isValid(key) && key.length === 24
      ? [{ _id: new ObjectId(key) }]
      : [{ grcNumber: key }, { grcNumber: 'GRC ' + key }])),
  }).toArray();
  filter.grcId = { $in: grcs.map((g) => String(g._id)) };
  console.log('Named GRCs: ' + (grcs.map((g) => g.grcNumber).join(', ') || '(none matched)'));
}

const rows = await db.collection('barcodeLabel').find(filter).sort({ grcId: 1, createdAt: 1, _id: 1 }).toArray();

/* the GRC header and its supplier's code, read once per GRC rather than once
   per barcode */
const grcCache = new Map();
async function grcOf(grcId) {
  const key = String(grcId || '');
  if (grcCache.has(key)) return grcCache.get(key);
  let entry = { grc: null, supplierCode: '' };
  if (ObjectId.isValid(key) && key.length === 24) {
    const grc = await db.collection('grc').findOne({ _id: new ObjectId(key) });
    if (grc) {
      const supplier = grc.supplierId
        ? await db.collection(contactCollection('Supplier')).findOne({ _id: grc.supplierId }, { projection: { contactId: 1 } })
        : null;
      entry = { grc, supplierCode: text(supplier?.contactId) };
    }
  }
  grcCache.set(key, entry);
  return entry;
}

/* ----------------------------------------------------------------- plan --
   One decision per row: keep, repair, or unresolved-and-reported. */
const plan = [];
const unresolved = [];
let already = 0;

for (const row of rows) {
  const { grc, supplierCode } = await grcOf(row.grcId);
  const stored = text(row.barcodeGenerated);
  const billSlNo = billSlNoForBarcode(row.billSlNo);
  const seq = text(row.seq);
  const serialNo = text(row.serialNo);

  /* a barcode numbered per bill line: this GRC's supplier and number, its own
     Bill Sl No. and its own serialNo - printed, and not this repair's to
     renumber with the GRC-wide SEQ */
  const [storedSupplier, storedGrc, storedBill, storedSerial] = partsOf(stored);
  if (grc && supplierCode && billSlNo && serialNo && parseBarcodeValue(stored)
    && storedSupplier === supplierCode && storedGrc === grcNumberForBarcode(grc.grcNumber)
    && storedBill === billSlNo && storedSerial === serialNo) {
    already++;
    continue;
  }

  const why = !grc ? 'its GRC header no longer exists'
    : !supplierCode ? 'its GRC supplier has no supplier code'
    : !text(grc.grcNumber) ? 'its GRC has no GRC number'
    : !billSlNo ? 'the row has no Bill Sl No. - the Item Summary line it was received on is not recorded'
    : !seq ? 'the row has no SEQ, so the serial part of the value cannot be written'
    : '';

  if (why) {
    unresolved.push({
      recordId: String(row._id), grcId: String(row.grcId || ''), grcNumber: text(grc?.grcNumber),
      itemId: row.itemId ? String(row.itemId) : '', itemCode: text(row.itemCode),
      barcodeNo: text(row.barcodeNo), currentBarcode: stored,
      billSlNo: text(row.billSlNo), seq, reason: why,
    });
    continue;
  }

  /* the GRC-wide SEQ in the Serial No. place - the rule every value this
     repair rewrites was printed under */
  const next = composeBarcodeValue({ supplierCode, grcNumber: grc.grcNumber, billSlNo, serialNo: seq });
  if (!next) {
    unresolved.push({
      recordId: String(row._id), grcId: String(row.grcId || ''), grcNumber: text(grc.grcNumber),
      itemId: row.itemId ? String(row.itemId) : '', itemCode: text(row.itemCode),
      barcodeNo: text(row.barcodeNo), currentBarcode: stored,
      billSlNo: text(row.billSlNo), seq, reason: 'the canonical builder could not make a value from these parts',
    });
    continue;
  }
  if (sameBarcode(next, stored)) { already++; continue; }

  plan.push({
    recordId: String(row._id),
    grcId: String(row.grcId || ''),
    grcNumber: text(grc.grcNumber),
    itemId: row.itemId ? String(row.itemId) : '',
    itemCode: text(row.itemCode),
    oldBarcode: stored,
    newBarcode: next,
    /* what the value CARRIED in the bill-line place before, and what it
       carries now - the two numbers this repair is about */
    oldBillSlNo: partsOf(stored)[2] ?? null,
    newBillSlNo: billSlNo,
    seq,
    qty: text(row.qty),
    barcodeNo: text(row.barcodeNo),
  });
}

/* ------------------------------------------------------------ the report -- */
const stamp = new Date().toISOString();
console.log((VERIFY ? 'VERIFY' : APPLY ? 'APPLYING' : 'DRY RUN') + ' - ' + stamp + '\n');

if (!VERIFY) {
  const byGrc = new Map();
  plan.forEach((p) => byGrc.set(p.grcNumber, (byGrc.get(p.grcNumber) || 0) + 1));
  for (const p of plan.slice(0, 40)) {
    console.log('  GRC ' + p.grcNumber.padEnd(8) + p.itemCode.padEnd(14)
      + 'bill line ' + String(p.newBillSlNo).padEnd(4) + 'qty ' + String(p.qty).padEnd(8)
      + p.oldBarcode + '  ->  ' + p.newBarcode);
  }
  if (plan.length > 40) console.log('  ... and ' + (plan.length - 40) + ' more (all of them are in the audit file)');

  console.log('\n  GRCs affected: ' + byGrc.size);
  for (const u of unresolved.slice(0, 20)) {
    console.log('  UNRESOLVED  ' + u.recordId + '  GRC ' + (u.grcNumber || u.grcId) + '  ' + u.itemCode
      + '  "' + u.currentBarcode + '"  - ' + u.reason);
  }
  if (unresolved.length > 20) console.log('  ... and ' + (unresolved.length - 20) + ' more unresolved (see the audit file)');

  /* THE AUDIT FILE, written for a dry run too: what a run would do is worth
     keeping even when nothing is written. */
  const dir = path.join(process.cwd(), 'backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, 'barcode-billslno-' + (APPLY ? 'applied' : 'dryrun') + '-'
    + stamp.replace(/[:.]/g, '-') + '.json');
  fs.writeFileSync(file, JSON.stringify({
    takenAt: stamp,
    mode: APPLY ? 'apply' : 'dry-run',
    rule: 'SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * SERIAL_NO (the row\'s SEQ; a value already carrying the row\'s own serialNo is kept)',
    scope: 'barcodeLabel rows whose barcodeGenerated already holds a composed value; barcodeNo is never written',
    scanned: rows.length,
    alreadyCorrect: already,
    toRepair: plan.length,
    unresolved: unresolved.length,
    changes: plan.map((p) => ({ ...p, timestamp: stamp })),
    unresolvedRecords: unresolved.map((u) => ({ ...u, timestamp: stamp })),
  }, null, 2));
  console.log('\n  audit file: ' + path.relative(process.cwd(), file));
}

/* ----------------------------------------------------------------- write -- */
let updated = 0;
let failed = 0;
if (APPLY && plan.length) {
  for (let i = 0; i < plan.length; i += 200) {
    const slice = plan.slice(i, i + 200);
    const res = await db.collection('barcodeLabel').bulkWrite(slice.map((p) => ({
      updateOne: {
        /* pinned to the value we planned against: a row someone else changed
           in the meantime is left alone rather than overwritten */
        filter: { _id: new ObjectId(p.recordId), barcodeGenerated: p.oldBarcode },
        update: { $set: { barcodeGenerated: p.newBarcode, updatedAt: new Date() } },
      },
    })), { ordered: false });
    updated += res.modifiedCount || 0;
  }
  failed = plan.length - updated;
}

/* ---------------------------------------------------------------- verify -- */
if (VERIFY || APPLY) {
  const after = await db.collection('barcodeLabel').find(filter).toArray();
  let right = 0, wrongThird = 0, wrongFourth = 0, thirdIsQty = 0, noBill = 0, bySeq = 0, bySerial = 0;
  for (const row of after) {
    const bill = billSlNoForBarcode(row.billSlNo);
    const parts = partsOf(row.barcodeGenerated);
    if (!bill) { noBill++; continue; }
    const thirdOk = parts[2] === bill;
    /* the fourth part is the row's SEQ (a value made under the GRC-wide
       rule) or its serialNo (one numbered per bill line) */
    const isSeq = Boolean(text(row.seq)) && parts[3] === text(row.seq);
    const isSerial = Boolean(text(row.serialNo)) && parts[3] === text(row.serialNo);
    const fourthOk = isSeq || isSerial;
    if (thirdOk && fourthOk) {
      right++;
      if (isSeq) bySeq++; else bySerial++;
    } else {
      if (!thirdOk) wrongThird++;
      if (!fourthOk) wrongFourth++;
      if (parts[2] === text(row.qty) && text(row.qty) !== bill) thirdIsQty++;
    }
  }
  console.log('\n  VALIDATION over ' + after.length + ' composed values');
  console.log('    third = Bill Sl No AND fourth right : ' + right);
  console.log('      ... fourth = SEQ                  : ' + bySeq);
  console.log('      ... fourth = Serial No (not SEQ)  : ' + bySerial);
  console.log('    third is not the Bill Sl No         : ' + wrongThird);
  console.log('    fourth is neither SEQ nor Serial No : ' + wrongFourth);
  console.log('    third is the quantity               : ' + thirdIsQty);
  console.log('    rows with no Bill Sl No to check by : ' + noBill);
}

console.log('\n  scanned            : ' + rows.length);
console.log('  already correct    : ' + already);
console.log('  needing repair     : ' + plan.length);
if (APPLY) {
  console.log('  repaired           : ' + updated);
  console.log('  failed             : ' + failed);
}
console.log('  unresolved         : ' + unresolved.length);
console.log('  barcodeNo written  : 0 (never)');
console.log('  records deleted    : 0 (never)');
if (!APPLY && !VERIFY) console.log('\nNothing was written. Add --apply to write it.');

await mongoose.disconnect();
process.exit(failed ? 1 : 0);
