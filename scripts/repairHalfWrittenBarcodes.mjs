/* ==========================================================================
   REPAIR HALF-WRITTEN BARCODE RECORDS ON NAMED GRCs

     node --env-file=.env --import ./scripts/aliasRegister.mjs \
          scripts/repairHalfWrittenBarcodes.mjs --grc <id>[,<id>...] [--apply]

   A complete barcode record carries TWO values (lib/barcodeValue.js):

     barcodeNo         the unit's own number            "9A1135"
     barcodeGenerated  SUPPLIER * GRC * BILL * SERIAL   "G1318 * 05178 * 1 * 1"

   and its label prints the number on the left and the value on the right,
   with the bars encoding the value. Two earlier versions of the save route
   wrote only one of them, into both fields:

     NUMBER ONLY  barcodeNo = barcodeGenerated = "9A1140"
                  -> gets its value, composed by the one canonical builder
                     from its own Bill Sl No. and the SEQ slot the save route
                     set aside for it (nextSeqStart leaves the lowest SEQs to
                     rows saved before SEQ was stored), in number order
     VALUE ONLY   barcodeNo = barcodeGenerated = "G1319 * 05182 * 1 * 6"
                  -> keeps its value exactly, and gets a number of its own
                     from the business's Barcode Setting counter (the same
                     reserveBarcodeNumbers the save route uses); its opening
                     ledger entries are re-labelled with that number

   Every row of those GRCs also gets serialNo = the fourth part of its value
   (an old fallback copied the Bill Sl No. there).

   NEVER: deletes or inserts anything, changes an _id, a Bill Sl No., a
   quantity, a price, an item, a status or a location, or rewrites a value
   that is already composed. A row is skipped - and said so - when it cannot
   be answered for: no Bill Sl No., no free SEQ slot, a value already on
   another barcode of the business, or a number already named on a sale,
   transfer or return.

   Dry run by default. Every run writes the before-images of everything it
   would touch to backups/barcode-halfwritten-<dryrun|applied>-<time>.json.
   --apply writes in one transaction, each update pinned to the values it was
   planned against.
   ========================================================================== */
import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { contactCollection } from '../lib/contactStorage.js';
import { reserveBarcodeNumbers } from '@/lib/barcodeEngine';
import {
  composeBarcodeValue, composedValueOf, unitNumberOf, parseBarcodeValue, barcodeKey,
  billSlNoForBarcode, grcNumberForBarcode, BARCODE_SEPARATOR,
} from '@/lib/barcodeValue';

const args = process.argv.slice(2);
const APPLY = args.includes('--apply');
const grcArg = args[args.indexOf('--grc') + 1];
if (!args.includes('--grc') || !grcArg) {
  console.error('Name the GRCs to repair: --grc <id>[,<id>...]');
  process.exit(2);
}
const grcIds = grcArg.split(',').map((s) => s.trim()).filter(Boolean);
if (grcIds.some((id) => !mongoose.isValidObjectId(id))) {
  console.error('Not a GRC id: ' + grcIds.filter((id) => !mongoose.isValidObjectId(id)).join(', '));
  process.exit(2);
}

const text = (v) => String(v ?? '').trim();
const seqOf = (v) => (/^\d+$/.test(text(v)) ? Number(v) : 0);
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const units = db.collection('barcodeLabel');
const ledger = db.collection('stockmovement');

const plan = [];          // { grc, unit, set, pin, kind, ledgerIds? }
const skipped = [];
const backup = { at: new Date().toISOString(), apply: APPLY, grcs: [], units: [], ledger: [] };

for (const grcId of grcIds) {
  const grc = await db.collection('grc').findOne({ _id: new mongoose.Types.ObjectId(grcId) });
  if (!grc) { skipped.push({ grcId, why: 'GRC not found' }); continue; }
  const supplier = grc.supplierId
    ? await db.collection(contactCollection('Supplier')).findOne({ _id: grc.supplierId }, { projection: { contactId: 1 } })
    : null;
  const supplierCode = text(supplier?.contactId);
  const grcNumber = grcNumberForBarcode(grc.grcNumber);
  if (!supplierCode || !grcNumber) { skipped.push({ grcId, why: 'GRC has no supplier code or no GRC number' }); continue; }
  backup.grcs.push(grc);

  const rows = await units.find({ grcId }).sort({ barcodeNo: 1, _id: 1 }).toArray();

  /* every composed value already on goods in the business under this
     supplier code and GRC number - a repaired value must not repeat one */
  const stem = '^' + escapeRegex(supplierCode + BARCODE_SEPARATOR + grcNumber + BARCODE_SEPARATOR);
  const elsewhere = await units.find({
    businessId: String(grc.businessId || ''),
    $or: [{ barcodeGenerated: { $regex: stem } }, { barcodeNo: { $regex: stem } }],
  }, { projection: { barcodeNo: 1, barcodeGenerated: 1 } }).toArray();
  const taken = new Set([...rows, ...elsewhere].map((u) => barcodeKey(composedValueOf(u))).filter(Boolean));

  /* the SEQ slots rows without one were left: the lowest SEQs no live row holds */
  const liveSeqs = new Set(rows.map((u) => seqOf(u.seq)).filter(Boolean));
  const last = Math.max(Number(grc.lastBarcodeSeq) || 0, ...[...liveSeqs, 0]);
  const freeSlots = [];
  for (let s = 1; s <= last; s += 1) if (!liveSeqs.has(s)) freeSlots.push(s);

  for (const u of rows) {
    const composed = composedValueOf(u);
    const number = unitNumberOf(u);
    const bill = billSlNoForBarcode(u.billSlNo);
    const pin = { _id: u._id, barcodeNo: u.barcodeNo, barcodeGenerated: u.barcodeGenerated, status: u.status };
    const label = `${grc.grcNumber} ${u.itemCode || ''} ${u.barcodeNo || ''}`.trim();

    if (!composed && number) {
      /* NUMBER ONLY */
      if (!bill) { skipped.push({ unit: label, why: 'no Bill Sl No.' }); continue; }
      let serial = seqOf(u.seq);
      if (!serial) serial = freeSlots.shift() || 0;
      if (!serial) { skipped.push({ unit: label, why: 'no free SEQ slot left on this GRC' }); continue; }
      const value = composeBarcodeValue({ supplierCode, grcNumber, billSlNo: bill, serialNo: serial });
      if (!value) { skipped.push({ unit: label, why: 'value could not be composed' }); continue; }
      if (taken.has(barcodeKey(value))) { skipped.push({ unit: label, why: 'value ' + value + ' is already on another barcode' }); continue; }
      taken.add(barcodeKey(value));
      backup.units.push(u);
      plan.push({ grc, unit: u, kind: 'NUMBER_ONLY', pin, set: { barcodeGenerated: value, seq: String(serial), serialNo: String(serial) } });
      continue;
    }

    if (composed && !number) {
      /* VALUE ONLY */
      const parts = parseBarcodeValue(composed);
      if (parts.supplierCode !== supplierCode || parts.grcNumber !== grcNumber || parts.billSlNo !== bill) {
        skipped.push({ unit: label, why: 'its value ' + composed + ' is not this GRC\'s / this row\'s' }); continue;
      }
      const oldNo = text(u.barcodeNo);
      const [onSale, onTransfer, onReturn] = oldNo ? await Promise.all([
        db.collection('posinvoice').countDocuments({ 'items.barcodeNo': oldNo }).catch(() => 0),
        db.collection('stocktransfer').countDocuments({ 'lines.barcodeNo': oldNo }).catch(() => 0),
        db.collection('posreturn').countDocuments({ 'items.barcodeNo': oldNo }).catch(() => 0),
      ]) : [0, 0, 0];
      if (onSale || onTransfer || onReturn) { skipped.push({ unit: label, why: 'its number is named on a sale / transfer / return' }); continue; }
      const moves = await ledger.find({ barcodeId: { $in: [u._id, String(u._id)] } }).toArray();
      backup.units.push(u);
      backup.ledger.push(...moves);
      const stored = composeBarcodeValue({ supplierCode, grcNumber, billSlNo: bill, serialNo: parts.serialNo });
      plan.push({
        grc, unit: u, kind: 'VALUE_ONLY', pin,
        set: {
          barcodeGenerated: stored,
          serialNo: parts.serialNo,
          ...(seqOf(u.seq) ? {} : { seq: parts.serialNo }),
        },
        needsNumber: true,
        oldNo,
        batch: u.batchType === 'batch' && text(u.batchNo) === oldNo,
        ledgerIds: moves.filter((m) => text(m.barcodeNo) === oldNo).map((m) => m._id),
      });
      continue;
    }

    if (composed && number) {
      /* COMPLETE - only the serialNo field, when it disagrees with the value */
      const serial = parseBarcodeValue(composed).serialNo;
      if (text(u.serialNo) !== serial) {
        backup.units.push(u);
        plan.push({ grc, unit: u, kind: 'SERIAL_ONLY', pin, set: { serialNo: serial } });
      }
      continue;
    }

    skipped.push({ unit: label, why: 'record has neither a number nor a value' });
  }
}

const count = (kind) => plan.filter((p) => p.kind === kind).length;
console.log(`${APPLY ? 'APPLY' : 'DRY RUN'} - GRCs: ${grcIds.join(', ')}`);
console.log(`  number-only rows to give a value:  ${count('NUMBER_ONLY')}`);
console.log(`  value-only rows to give a number:  ${count('VALUE_ONLY')}`);
console.log(`  complete rows whose serialNo is corrected: ${count('SERIAL_ONLY')}`);
console.log(`  skipped: ${skipped.length}`);
plan.forEach((p) => {
  const u = p.unit;
  const what = p.kind === 'VALUE_ONLY'
    ? `barcodeNo ${u.barcodeNo} -> <next number from the counter>, value kept ${p.set.barcodeGenerated}, serialNo ${u.serialNo} -> ${p.set.serialNo}, ledger rows ${p.ledgerIds.length}`
    : Object.entries(p.set).map(([k, v]) => `${k} ${JSON.stringify(u[k] ?? '')} -> ${JSON.stringify(v)}`).join(', ');
  console.log(`  ${p.kind.padEnd(11)} ${p.grc.grcNumber} ${String(u._id)} ${what}`);
});
skipped.forEach((s) => console.log('  SKIP', JSON.stringify(s)));

const stamp = new Date().toISOString().replace(/[:.]/g, '-');
const file = path.join('backups', `barcode-halfwritten-${APPLY ? 'applied' : 'dryrun'}-${stamp}.json`);

if (APPLY && plan.length) {
  /* numbers first, outside the transaction - as the save route does: a
     rolled-back run leaves a harmless gap, never a reissued number */
  const needing = plan.filter((p) => p.needsNumber);
  const byScope = new Map();
  needing.forEach((p) => {
    const key = String(p.grc.businessId || '') + '|' + String(p.grc.finYear || '');
    if (!byScope.has(key)) byScope.set(key, []);
    byScope.get(key).push(p);
  });
  for (const list of byScope.values()) {
    const numbers = await reserveBarcodeNumbers(list.length, { businessId: String(list[0].grc.businessId || ''), finYear: list[0].grc.finYear || '' });
    list.forEach((p, i) => {
      const no = text(numbers[i]);
      if (!no || no.includes('*')) throw new Error('counter gave no usable number for ' + String(p.unit._id));
      p.set.barcodeNo = no;
      if (p.batch) p.set.batchNo = no;
    });
  }
  backup.planned = plan.map((p) => ({ _id: p.unit._id, kind: p.kind, set: p.set, ledgerIds: p.ledgerIds || [] }));
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));

  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      for (const p of plan) {
        const res = await units.updateOne(p.pin, { $set: { ...p.set, updatedAt: new Date() } }, { session });
        if (res.matchedCount !== 1) throw new Error('changed since planned: ' + String(p.unit._id));
        if (p.ledgerIds?.length) {
          const moved = await ledger.updateMany(
            { _id: { $in: p.ledgerIds }, barcodeNo: p.oldNo },
            { $set: { barcodeNo: p.set.barcodeNo } },
            { session },
          );
          if (moved.matchedCount !== p.ledgerIds.length) throw new Error('ledger changed since planned: ' + String(p.unit._id));
        }
      }
    });
  } finally {
    await session.endSession();
  }
  console.log('applied. before-images and the applied changes: ' + file);
  plan.filter((p) => p.needsNumber).forEach((p) => console.log(`  ${String(p.unit._id)} barcodeNo ${p.oldNo} -> ${p.set.barcodeNo}`));
} else {
  fs.writeFileSync(file, JSON.stringify(backup, null, 1));
  console.log((APPLY ? 'nothing to apply. ' : 'dry run - nothing written to the database. ') + 'before-images: ' + file);
}

await mongoose.disconnect();
