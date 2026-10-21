/* Gives EXISTING GRC barcodes their display value in barcodeGenerated:

     SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * SERIAL_NO   e.g. "G512 * 05173 * 5 * 1"

   written with the GRC-wide SEQ as the SERIAL_NO - the rule every value made
   before per-bill-line serials followed.

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
     - a barcode that already carries a value of this GRC's rule - its
       supplier, its number, its own Bill Sl No. and a whole-number serial -
       KEEPS it, in barcodeGenerated or (an older row) in barcodeNo. That is
       what is printed on the goods: an older value with the GRC-wide SEQ in
       its fourth place, or a newer one numbered 1, 2, 3 per Bill Sl No.
       Only a missing barcodeGenerated copy of it is filled in
     - a barcode that already carries a SEQ keeps it (one without, but with a
       value it keeps, takes that value's fourth part); the others take the
       lowest free SEQ from 1 up - so three barcodes of bill line 5 become
       "G512 * 05173 * 5 * 1", "* 5 * 2", "* 5 * 3"
     - any other value is the GRC supplier's code, the GRC number, that
       barcode's OWN Bill Sl No. - the bill line it was received on, as the
       GRC's Item Summary shows it - and that SEQ (lib/barcodeValue.js).
       Never the quantity: that is a different column of the same row
     - a barcode with no Bill Sl No. composes nothing, so it KEEPS the value it
       has and is reported; nothing is stood in that place for it
     - every barcode gets it, whether in stock or already moved: only the
       display field changes, so a sold or transferred unit still scans and
       reports under the number it moved with
     - a value that is already taken is not written - it is reported. Taken
       means: carried, in either field and in ANY spelling ("G512*05173*5*1"
       is "G512 * 05173 * 5 * 1"), by another barcode of this GRC - now or
       after this run - or by a barcode of another GRC of the business; or,
       on a GRC that numbers serials per bill line, a serial its
       lastSerialByBill says that line may already have given out
     - a barcodeGenerated holding a number barcodeNo does not carry is never
       overwritten: it is the only copy of that number
     - serialNo is set to the fourth part of the value the barcode ends up
       with (the stored field is otherwise a copy of the Bill Sl No.)
   The GRC's lastBarcodeSeq is raised to its highest SEQ, and - on a GRC that
   numbers serials per bill line - each line's lastSerialByBill to the highest
   serial written on it, so none is given out again.

   Nothing that scans changes, so no label has to be reprinted for scanning -
   reprint only where the printed display value should show the new text. */

import mongoose from 'mongoose';
import { contactCollection } from '../lib/contactStorage.js';
import {
  composeBarcodeValue, barcodeValueProblem, hasComposedBarcode, composedValueOf, parseBarcodeValue,
  serialNoOfUnit, barcodeKey, sameBarcode, barcodeSpellings, serialFloorKey, billSlNoForBarcode,
} from '@/lib/barcodeValue';

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
let fieldsOnly = 0;
let conflicts = 0;

for (const grc of grcs) {
  const supplier = grc.supplierId ? await db.collection(contactCollection('Supplier')).findOne({ _id: grc.supplierId }, { projection: { contactId: 1 } }) : null;
  const supplierCode = String(supplier?.contactId || '').trim();
  const units = await db.collection('barcodeLabel').find({ grcId: String(grc._id) }).sort({ createdAt: 1, _id: 1 }).toArray();
  console.log(`GRC ${grc.grcNumber || '(no number)'}  [${grc._id}]  supplier ${supplierCode || '(no code)'}  - ${units.length} barcode(s)`);
  const problem = barcodeValueProblem({ supplierCode, grcNumber: grc.grcNumber });
  if (problem) { console.log('  SKIPPED - ' + problem + '\n'); continue; }
  if (!units.length) { console.log(''); continue; }

  const parts = { supplierCode, grcNumber: grc.grcNumber };
  /* the value of this GRC's rule a barcode already carries, canonical, or '' */
  const printedOf = (u) => (hasComposedBarcode(u, parts) ? composedValueOf(u) : '');

  /* SEQ: kept where a barcode has one (and it is not shared) - for one
     without, the fourth part of the value it keeps, when no stored SEQ holds
     that number - otherwise the lowest free number from 1. Stored SEQs are
     claimed first, so one read off a value never displaces them. */
  const used = new Set();
  const seqs = new Map();
  [(u) => seqOf(u.seq), (u) => (!seqOf(u.seq) && printedOf(u) ? seqOf(serialNoOfUnit(u)) : 0)].forEach((seqFor) => units.forEach((u) => {
    const s = seqFor(u);
    if (s && !used.has(s) && !seqs.has(String(u._id))) { used.add(s); seqs.set(String(u._id), s); }
  }));
  let free = 1;
  units.forEach((u) => {
    if (seqs.has(String(u._id))) return;
    while (used.has(free)) free += 1;
    used.add(free);
    seqs.set(String(u._id), free);
  });

  const plan = units.map((u) => {
    const seq = seqs.get(String(u._id));
    const printed = printedOf(u);
    /* a value of this rule that is already printed stays exactly that value,
       in the stored spelling. Any other is made from the unit's own Bill Sl
       No. - the bill line it was received on, which is what the third part of
       the value carries (lib/barcodeValue.js) - and its SEQ. A unit without a
       Bill Sl No. composes nothing and is reported, never restated with its
       quantity in that place. */
    const value = printed
      ? composeBarcodeValue(parseBarcodeValue(printed))
      : composeBarcodeValue({ ...parts, billSlNo: u.billSlNo, serialNo: seq });
    /* only barcodeGenerated is compared and written - never barcodeNo */
    const current = String(u.barcodeGenerated || '');
    return { u, seq, value, current, printed: Boolean(printed), keep: !value };
  });

  /* every value a barcode of THIS GRC carries now, in either field, or will
     carry after this run - by barcodeKey, so no spelling slips past */
  const holders = new Map();
  plan.forEach(({ u, value }) => [u.barcodeNo, u.barcodeGenerated, value].forEach((v) => {
    const key = barcodeKey(v);
    if (!key) return;
    if (!holders.has(key)) holders.set(key, new Set());
    holders.get(key).add(String(u._id));
  }));
  const takenOnGrc = (value, id) => [...(holders.get(barcodeKey(value)) || [])].some((other) => other !== id);

  /* on a GRC that numbers serials per bill line, every serial above its
     older GRC-wide floor (serialFloorBase) up to the line's lastSerialByBill
     may have been given on that line - by the save route, to a barcode that
     is not necessarily still here */
  const perLine = Boolean(grc.lastSerialByBill && typeof grc.lastSerialByBill === 'object');
  const lineGaveSerial = (billSlNo, serial) => perLine
    && serial > (Number(grc.serialFloorBase) || 0)
    && serial <= (Number(grc.lastSerialByBill[serialFloorKey(billSlNo)]) || 0);

  /* a value some barcode of ANOTHER GRC of the business already carries, in
     any of its spellings */
  const wanted = [...new Set(plan.filter((p) => !p.keep && !sameBarcode(p.value, p.current)).flatMap((p) => barcodeSpellings(p.value)))];
  const taken = wanted.length
    ? new Set((await db.collection('barcodeLabel').find({
      businessId: String(grc.businessId || ''), grcId: { $ne: String(grc._id) },
      $or: [{ barcodeGenerated: { $in: wanted } }, { barcodeNo: { $in: wanted } }],
    }, { projection: { barcodeGenerated: 1, barcodeNo: 1 } }).toArray())
      .flatMap((u) => [barcodeKey(u.barcodeGenerated), barcodeKey(u.barcodeNo)]).filter(Boolean))
    : new Set();

  const writes = [];
  const serialsByLine = new Map();
  plan.forEach(({ u, seq, value, current, printed, keep }) => {
    const set = {};
    if (String(u.seq ?? '') !== String(seq)) set.seq = String(seq);
    let final = current;
    let action;
    if (keep) {
      action = 'KEEPS (no Bill Sl No.)';
    } else if (sameBarcode(value, current)) {
      action = printed ? 'already right (as printed)' : 'already right';
    } else if (current.trim() && !parseBarcodeValue(current) && !sameBarcode(current, u.barcodeNo)) {
      /* barcodeGenerated holds a number barcodeNo does not (the two fields
         swapped, or barcodeNo blank): the only copy of it - overwriting it
         would lose that number */
      action = `NOT CHANGED - barcodeGenerated holds the unit's own number ${current}`;
      conflicts += 1;
    } else if (!printed && lineGaveSerial(u.billSlNo, seq)) {
      /* a GRC numbering per bill line has already given this serial on this
         line - to a barcode that may be deleted, with its label still on the
         goods */
      action = `NOT CHANGED - serial ${seq} was already given on bill line ${u.billSlNo} (lastSerialByBill)`;
      conflicts += 1;
    } else if (takenOnGrc(value, String(u._id))) {
      action = `NOT CHANGED - ${value} is already another barcode's on this GRC`;
      conflicts += 1;
    } else if (taken.has(barcodeKey(value))) {
      action = `NOT CHANGED - ${value} is already a barcode of another GRC`;
      conflicts += 1;
    } else {
      set.barcodeGenerated = value;
      final = value;
      action = `${u.barcodeNo}  generated ${current || '(blank)'}  ->  ${value}${printed ? '  (as printed)' : ''}`;
      revalued += 1;
    }
    /* the Serial No. is the fourth part of the value the barcode ends up
       with - never the copy of its Bill Sl No. the field used to get */
    const serialNo = serialNoOfUnit({ billSlNo: u.billSlNo, barcodeGenerated: final });
    if (serialNo) {
      if (String(u.serialNo ?? '').trim() !== serialNo) set.serialNo = serialNo;
      const line = billSlNoForBarcode(u.billSlNo);
      serialsByLine.set(line, Math.max(serialsByLine.get(line) || 0, Number(serialNo)));
    }
    if (!set.barcodeGenerated && (set.seq || set.serialNo)) fieldsOnly += 1;
    console.log(`  SEQ ${String(seq).padStart(3)}  bill ${String(u.billSlNo ?? '').padEnd(4)} qty ${String(u.qty).padEnd(6)} ${action}`
      + (set.serialNo ? `  (serialNo ${u.serialNo || '(blank)'} -> ${set.serialNo})` : ''));
    if (Object.keys(set).length) writes.push({ updateOne: { filter: { _id: u._id }, update: { $set: { ...set, updatedAt: new Date() } } } });
  });

  const highest = Math.max(0, ...seqs.values());
  /* a GRC that numbers serials per bill line keeps each line's highest, so a
     serial written here is never given out again on that line */
  const lineFloors = perLine
    ? Object.fromEntries([...serialsByLine].map(([line, serial]) => ['lastSerialByBill.' + serialFloorKey(line), serial]))
    : {};
  if (APPLY) {
    if (writes.length) await db.collection('barcodeLabel').bulkWrite(writes, { ordered: true });
    await db.collection('grc').updateOne({ _id: grc._id }, { $max: { lastBarcodeSeq: highest, ...lineFloors } });
  }
  console.log(`  lastBarcodeSeq -> ${highest}`
    + (perLine ? `, lastSerialByBill at least ${JSON.stringify(Object.fromEntries(serialsByLine))}` : '')
    + `${APPLY ? '' : ' (dry run)'}\n`);
}

console.log(`${revalued} barcode(s) ${APPLY ? 'given' : 'would be given'} their barcodeGenerated value, ${fieldsOnly} ${APPLY ? 'given' : 'would get'} a SEQ or Serial No. only, ${conflicts} conflict(s) left alone. barcodeNo untouched.`);
if (!APPLY) console.log('Nothing was written. Add --apply to write it.');
await mongoose.disconnect();
