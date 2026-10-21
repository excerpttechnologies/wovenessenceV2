/* Reconstruct the movement ledger from documents that already exist.

   WHY THIS IS NOT FABRICATION.

   The ledger starts the day it is installed, but the trading it is supposed
   to describe happened before that - and it is all still on disk, dated, in
   real documents: 65 GRCs, 21,000 barcode rows, POS invoices, vendor returns.
   This script reads those documents and writes the movement each one records.

   Every row it writes is marked `derived: true` with the document type it
   came from, so a reconstructed movement is never mistaken for one captured
   as it happened. Nothing is estimated, averaged or invented: a derived row
   exists only where a real dated document says that movement occurred, and
   carries that document's own date and number.

   IT ALSO CORRECTS STOCK THAT IS CURRENTLY WRONG.

   migrateBarcodeLifecycle.mjs had to assume every existing barcode was still
   in stock - the system had never recorded anything leaving. But the POS
   invoices on file show units that were sold in August. Those units are
   sitting in the stock figures as available. This script marks them SOLD
   against the invoice that sold them, which is the first time that has ever
   been recorded.

   SAFE BY DEFAULT - reports and exits. Pass --apply to write.
   Idempotent: a movement already on file for the same barcode, type and
   document is not written again.

     node --env-file=.env scripts/backfillMovementHistory.mjs
     node --env-file=.env scripts/backfillMovementHistory.mjs --apply
*/

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env');
  process.exit(1);
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const barcodes = db.collection('barcodeLabel');
  const movements = db.collection('stockmovement');

  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');

  /* Existing ledger rows, so a re-run adds nothing. Keyed on the three
     things that make a movement unique: which unit, what happened, and the
     document it happened on. */
  const seen = new Set(
    (await movements.find({}, { projection: { barcodeId: 1, type: 1, refNo: 1 } }).toArray())
      .map((m) => [String(m.barcodeId), m.type, m.refNo || ''].join('|'))
  );
  console.log(`\nledger already holds ${seen.size} movement(s).`);

  const toInsert = [];
  const statusFixes = [];
  const key = (barcodeId, type, refNo) => [String(barcodeId), type, refNo || ''].join('|');

  /* ============================================================ inward === */
  /* One GRC_IN per barcode row, dated when the row was created - that is the
     moment the stock came into existence in this system, and it is a real
     recorded timestamp, not a guess.

     319 rows carry a grcId and are attributed to their GRC. The other ~20,800
     came in through the supplier dump and have no GRC; they are attributed to
     the import rather than to an invented document number. */
  const grcs = await db.collection('grc').find({}, { projection: { grcNumber: 1, grcDate: 1 } }).toArray();
  const grcById = new Map(grcs.map((g) => [String(g._id), g]));

  const cursor = barcodes.find({}, {
    projection: {
      barcodeNo: 1, barcodeGenerated: 1, oldBarcode: 1, itemCode: 1, itemName: 1,
      printDescription: 1, supplierDescription: 1, uom: 1, batchType: 1, qtyNum: 1, qty: 1,
      grcId: 1, businessId: 1, locationId: 1, currentLocationId: 1, finYear: 1, createdAt: 1,
    },
  });

  let scanned = 0;
  for await (const b of cursor) {
    scanned += 1;
    const grc = b.grcId ? grcById.get(String(b.grcId)) : null;
    const refNo = grc?.grcNumber || '';
    if (seen.has(key(b._id, 'GRC_IN', refNo))) continue;

    toInsert.push({
      businessId: oid(b.businessId),
      finYear: b.finYear || '',
      type: 'GRC_IN',
      barcodeId: b._id,
      barcodeNo: b.barcodeNo || b.barcodeGenerated || b.oldBarcode || '',
      itemId: null,
      itemCode: b.itemCode || '',
      itemName: b.itemName || b.printDescription || b.supplierDescription || '',
      uom: b.uom || '',
      batchType: b.batchType || '',
      qty: Number(b.qtyNum ?? b.qty ?? 1) || 1,
      fromLocationId: null,
      toLocationId: oid(b.currentLocationId || b.locationId),
      statusBefore: '',
      statusAfter: 'IN_STOCK',
      refModel: grc ? 'grc' : 'barcodeImport',
      refId: grc ? oid(b.grcId) : null,
      refNo,
      reason: grc ? '' : 'Opening stock from the barcode import',
      notes: '',
      userId: null, userName: '', userEmail: '',
      /* the row's own creation time - a real recorded date */
      at: grc?.grcDate || b.createdAt || new Date(),
      derived: true,
      derivedFrom: grc ? 'grc' : 'barcodeImport',
      createdAt: new Date(), updatedAt: new Date(),
    });
  }
  console.log(`inward   : ${scanned} barcode rows scanned, ${toInsert.length} GRC_IN row(s) to write.`);

  /* ============================================================== sales === */
  /* POS invoice lines that name a barcode. Each line claims ONE distinct
     stock row - several lines quoting the same number (which happens, because
     some numbers were duplicated before numbering became atomic) consume
     separate rows rather than marking one unit sold twice. */
  const invoices = await db.collection('posinvoice').find({}).sort({ date: 1, createdAt: 1 }).toArray();

  const claimed = new Set();
  let saleLines = 0;
  let saleRows = 0;
  const unmatchedSales = [];

  for (const inv of invoices) {
    for (const line of (inv.items || [])) {
      const code = String(line.barcodeNo || line.barcode || '').trim();
      if (!code) continue;
      saleLines += 1;

      /* every stock row answering to that number, in the same business */
      const candidates = await barcodes.find({
        $or: [{ barcodeNo: code }, { barcodeGenerated: code }, { oldBarcode: code }],
        ...(inv.businessId ? { businessId: String(inv.businessId) } : {}),
      }).toArray();

      const unit = candidates.find((c) => !claimed.has(String(c._id)));
      if (!unit) {
        unmatchedSales.push({ invoice: inv.invoiceNo, code });
        continue;
      }
      claimed.add(String(unit._id));

      const at = inv.date || inv.createdAt || new Date();
      const qty = Number(line.qty ?? unit.qtyNum ?? 1) || 1;

      if (!seen.has(key(unit._id, 'POS_OUT', inv.invoiceNo || ''))) {
        toInsert.push({
          businessId: oid(inv.businessId),
          finYear: inv.finYear || unit.finYear || '',
          type: 'POS_OUT',
          barcodeId: unit._id,
          barcodeNo: unit.barcodeNo || unit.barcodeGenerated || unit.oldBarcode || code,
          itemId: null,
          itemCode: line.itemCode || line.code || unit.itemCode || '',
          itemName: line.itemName || line.name || unit.itemName || '',
          uom: line.uom || unit.uom || '',
          batchType: unit.batchType || '',
          qty: -Math.abs(qty),
          fromLocationId: oid(inv.locationId || unit.currentLocationId),
          toLocationId: null,
          statusBefore: 'IN_STOCK',
          statusAfter: 'SOLD',
          refModel: 'posInvoice',
          refId: inv._id,
          refNo: inv.invoiceNo || '',
          reason: '', notes: '',
          userId: null, userName: '', userEmail: '',
          at,
          derived: true,
          derivedFrom: 'posInvoice',
          createdAt: new Date(), updatedAt: new Date(),
        });
        saleRows += 1;
      }

      /* THE STOCK CORRECTION: this unit is not available, it was sold. */
      statusFixes.push({
        updateOne: {
          filter: { _id: unit._id, status: 'IN_STOCK' },
          update: {
            $set: {
              status: 'SOLD',
              billingId: inv._id,
              billingNo: inv.invoiceNo || '',
              soldAt: at,
            },
          },
        },
      });
    }
  }
  console.log(`sales    : ${invoices.length} invoices, ${saleLines} barcoded line(s), ` +
    `${saleRows} POS_OUT row(s) to write, ${statusFixes.length} unit(s) to mark SOLD.`);
  if (unmatchedSales.length) {
    console.log(`           ${unmatchedSales.length} sale line(s) could not claim a distinct stock row:`);
    unmatchedSales.slice(0, 8).forEach((u) => console.log(`             ${u.code} on ${u.invoice}`));
    console.log('           (the same number was billed more times than there are rows carrying it)');
  }

  /* ====================================================== vendor returns == */
  /* GRT lines that name a barcode - stock that went back to the supplier and
     is therefore not on the shelf either. */
  const grts = await db.collection('grt').find({}).toArray();
  let grtRows = 0;
  const grtFixes = [];

  for (const g of grts) {
    for (const line of (g.items || [])) {
      const code = String(line.barcodeGenerated || line.barcodeNo || line['Barcode No'] || '').trim();
      if (!code) continue;

      const unit = await barcodes.findOne({
        $or: [{ barcodeNo: code }, { barcodeGenerated: code }, { oldBarcode: code }],
        ...(g.businessId ? { businessId: String(g.businessId) } : {}),
      });
      if (!unit || claimed.has(String(unit._id))) continue;
      claimed.add(String(unit._id));

      const at = g.grtDate || g.createdAt || new Date();
      if (!seen.has(key(unit._id, 'GRC_VOID', g.grtNo || ''))) {
        toInsert.push({
          businessId: oid(g.businessId),
          finYear: g.finYear || unit.finYear || '',
          type: 'GRC_VOID',
          barcodeId: unit._id,
          barcodeNo: unit.barcodeNo || unit.barcodeGenerated || code,
          itemId: null,
          itemCode: unit.itemCode || '',
          itemName: unit.itemName || '',
          uom: unit.uom || '',
          batchType: unit.batchType || '',
          qty: -Math.abs(Number(unit.qtyNum ?? 1) || 1),
          fromLocationId: oid(unit.currentLocationId || unit.locationId),
          toLocationId: null,
          statusBefore: 'IN_STOCK',
          statusAfter: 'VOID',
          refModel: 'grt',
          refId: g._id,
          refNo: g.grtNo || '',
          reason: 'Returned to vendor', notes: '',
          userId: null, userName: '', userEmail: '',
          at,
          derived: true,
          derivedFrom: 'grt',
          createdAt: new Date(), updatedAt: new Date(),
        });
        grtRows += 1;
      }
      grtFixes.push({
        updateOne: {
          filter: { _id: unit._id, status: 'IN_STOCK' },
          update: { $set: { status: 'VOID', returnReason: 'Returned to vendor on ' + (g.grtNo || 'a GRT') } },
        },
      });
    }
  }
  console.log(`vendor   : ${grts.length} GRT(s), ${grtRows} GRC_VOID row(s) to write, ` +
    `${grtFixes.length} unit(s) to mark VOID.`);

  /* ============================================================== write == */
  if (!APPLY) {
    const months = new Map();
    toInsert.forEach((m) => {
      const k = new Date(m.at).toISOString().slice(0, 7);
      months.set(k, (months.get(k) || 0) + 1);
    });
    console.log('\nwould write ' + toInsert.length + ' movement(s), by month:');
    [...months.entries()].sort().forEach(([m, n]) => console.log(`  ${m}  ${n}`));
    console.log('\nDry run complete - nothing was written.');
    await mongoose.disconnect();
    return;
  }

  if (toInsert.length) {
    for (let i = 0; i < toInsert.length; i += 2000) {
      await movements.insertMany(toInsert.slice(i, i + 2000), { ordered: false });
      process.stdout.write(`  ...${Math.min(i + 2000, toInsert.length)}/${toInsert.length}\r`);
    }
    console.log(`\nwrote ${toInsert.length} movement(s).      `);
  }

  const fixes = [...statusFixes, ...grtFixes];
  if (fixes.length) {
    const res = await barcodes.bulkWrite(fixes, { ordered: false });
    console.log(`corrected ${res.modifiedCount} barcode status(es) that were showing as available.`);
  }

  console.log('\nensuring ledger indexes...');
  for (const spec of [{ businessId: 1, at: -1 }, { barcodeNo: 1, at: 1 }, { refModel: 1, refId: 1 }, { derived: 1 }]) {
    try { await movements.createIndex(spec); console.log('  +', JSON.stringify(spec)); }
    catch (e) { console.log('  ~', JSON.stringify(spec), '-', e.codeName || e.message); }
  }

  console.log('\nBackfill complete.');
  await mongoose.disconnect();
}

function oid(v) {
  if (!v) return null;
  const s = String(v);
  return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
}

main().catch((err) => { console.error(err); process.exit(1); });
