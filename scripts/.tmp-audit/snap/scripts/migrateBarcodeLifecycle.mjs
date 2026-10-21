/* Migration: bring existing barcode rows into the inventory lifecycle.

   WHY THIS IS REQUIRED.

   barcodeLabel gained a lifecycle (status, currentLocationId, qtyNum,
   uomType, batchType, barcodeNo) so that stock can be tracked from receipt to
   sale. Rows written before that have none of those fields, and two things
   break without this script:

   1. EVERY EXISTING BARCODE BECOMES UNSCANNABLE. The scan rules require a
      unit to be IN_STOCK; a row with no status is not, so the till and the
      transfer screen would refuse all 21,000 of them.

   2. NEW BARCODE NUMBERS WOULD COLLIDE WITH OLD ONES. Numbering now comes
      from an atomic counter that starts at zero. Left unseeded it would
      re-issue numbers that are already on physical labels - the one failure
      that cannot be undone once the goods are on the shop floor.

   Both are fixed here. The script is idempotent: rows that already carry a
   status are left alone, and counter floors are raised with $max, never
   lowered, so running it twice changes nothing the second time.

   SAFE BY DEFAULT. It reports what it would do and exits. Pass --apply to
   write, matching scripts/seedBarcodeDump.mjs.

     node --env-file=.env scripts/migrateBarcodeLifecycle.mjs
     node --env-file=.env scripts/migrateBarcodeLifecycle.mjs --apply
*/

import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');
const URI = process.env.MONGODB_URI;

if (!URI) {
  console.error('MONGODB_URI is not set. Run with --env-file=.env');
  process.exit(1);
}

/* Same matching the barcode engine uses - kept in step deliberately; if the
   engine's rule changes, this has to change with it. */
const METER_RX = /(^|[^a-z])(mtr|mts|meter|metre|meters|metres)([^a-z]|$)/i;
const PIECE_RX = /(^|[^a-z])(pc|pcs|piece|pieces|nos|no)([^a-z]|$)/i;

const uomTypeOf = (uom) => (METER_RX.test(String(uom || '')) ? 'MTR' : 'PC');
void PIECE_RX;

const batchTypeOf = (value, qty) => {
  const t = String(value ?? '').trim().toLowerCase();
  if (['unique', 'yes', 'y', 'true', '1'].includes(t)) return 'unique';
  if (['batch', 'no', 'n', 'false', '0'].includes(t)) return 'batch';
  /* Not recorded either way - which is the case for every row loaded from
     the supplier dump. One row carrying one quantity and its own printed
     barcode is a single unique piece; anything carrying more than one under
     a single barcode is by definition a batch. */
  return Number(qty) > 1 ? 'batch' : 'unique';
};

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;
  const barcodes = db.collection('barcodeLabel');

  console.log(APPLY ? '=== APPLYING ===' : '=== DRY RUN (pass --apply to write) ===');

  /* ---------------------------------------------------------- part 1 ----
     Backfill the lifecycle fields.

     Rows are treated as IN_STOCK at the location they were received into.
     That is the only defensible assumption: the system has never recorded
     them leaving, so as far as any record goes they are still there. Where
     that is wrong the stock was already wrong - this makes it visible and
     correctable through a stock adjustment, rather than leaving it
     unknowable. */
  const needing = await barcodes.countDocuments({
    $or: [{ status: { $exists: false } }, { status: null }, { status: '' }],
  });
  const total = await barcodes.countDocuments();
  console.log(`\nbarcodeLabel: ${total} rows, ${needing} without a lifecycle status.`);

  if (needing && APPLY) {
    /* Done in batches with bulkWrite: a single updateMany cannot derive
       qtyNum and uomType per row, and an aggregation pipeline update would
       be harder to read than it is worth for a one-off. */
    const cursor = barcodes.find(
      { $or: [{ status: { $exists: false } }, { status: null }, { status: '' }] },
      { projection: { qty: 1, uom: 1, batchUnique: 1, barcodeGenerated: 1, barcodeNo: 1, oldBarcode: 1, locationId: 1, businessId: 1, grcId: 1, billSlNo: 1 } }
    );

    let ops = [];
    let done = 0;
    for await (const row of cursor) {
      /* MOST OF THIS DATA HAS NO GENERATED BARCODE.

         20,793 of the rows in this database came from the supplier dump and
         carry only `oldBarcode` - the vendor's own printed number. That
         number is what is physically on the goods, so it is what a scanner
         will read, and it becomes the unit's barcode. lib/inventory.js
         matches oldBarcode as well for the same reason. */
      const barcodeNo = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
      const qtyNum = Number(row.qty) || 1;

      ops.push({
        updateOne: {
          filter: { _id: row._id },
          update: {
            $set: {
              status: 'IN_STOCK',
              barcodeNo,
              /* barcodeGenerated is left exactly as it was - a dump row
                 genuinely has no generated barcode, and writing the vendor's
                 number into that field would misrepresent where it came
                 from. barcodeNo is the field everything scans against. */
              qtyNum,
              uomType: uomTypeOf(row.uom),
              batchType: batchTypeOf(row.batchUnique, row.qty),
              serialNo: String(row.billSlNo || ''),
              currentLocationId: objId(row.locationId),
              currentBusinessId: objId(row.businessId),
            },
          },
        },
      });

      if (ops.length >= 1000) {
        await barcodes.bulkWrite(ops, { ordered: false });
        done += ops.length;
        ops = [];
        process.stdout.write(`  ...${done}/${needing}\r`);
      }
    }
    if (ops.length) { await barcodes.bulkWrite(ops, { ordered: false }); done += ops.length; }
    console.log(`  backfilled ${done} rows.            `);
  } else if (needing) {
    const sample = await barcodes.find(
      { $or: [{ status: { $exists: false } }, { status: null }] }
    ).limit(3).toArray();
    sample.forEach((r) => {
      const no = r.barcodeGenerated || r.oldBarcode || '(none)';
      console.log(`  would set: ${no} -> IN_STOCK @ ${r.locationId}, ` +
        `qtyNum ${Number(r.qty) || 1}, ${uomTypeOf(r.uom)}/${batchTypeOf(r.batchUnique, r.qty)}`);
    });

    const noNumber = await barcodes.countDocuments({
      $and: [
        { $or: [{ barcodeGenerated: '' }, { barcodeGenerated: null }] },
        { $or: [{ oldBarcode: '' }, { oldBarcode: null }] },
      ],
    });
    const fromDump = await barcodes.countDocuments({
      $or: [{ barcodeGenerated: '' }, { barcodeGenerated: null }],
      oldBarcode: { $nin: [null, ''] },
    });
    console.log(`  ${fromDump} row(s) will be identified by the supplier's own printed number (oldBarcode).`);
    if (noNumber) {
      console.log(`  WARNING: ${noNumber} row(s) have no barcode of any kind. They will be marked`);
      console.log('           IN_STOCK but can never be scanned - print labels for them, or write them off.');
    }
  }

  /* ---------------------------------------------------------- part 2 ----
     Seed the barcode counters so newly issued numbers continue ABOVE
     everything already printed.

     Grouped by business and by the (prefix, suffix) the number was issued
     under, because that is exactly how lib/barcodeEngine.js keys its
     counter. The prefix and suffix come from the Barcode Setting master; for
     each one the highest numeric middle already on disk becomes the floor. */
  const settings = await db.collection('barcodesetting')
    .find({}, { projection: { businessId: 1, prefix: 1, suffix: 1, numberLenght: 1 } })
    .toArray();

  /* one entry per business + format actually configured */
  const formats = new Map();
  settings.forEach((s) => {
    const key = String(s.businessId || '-') + '|' + (s.prefix || '') + '|' + (s.suffix || '');
    if (!formats.has(key)) {
      formats.set(key, {
        businessId: s.businessId ? String(s.businessId) : '',
        prefix: String(s.prefix || ''),
        suffix: String(s.suffix || ''),
      });
    }
  });

  console.log(`\nbarcode counters: ${formats.size} business/format combination(s) configured.`);

  const counters = db.collection('counter');

  for (const f of formats.values()) {
    /* every barcode issued under this exact prefix and suffix */
    const rx = new RegExp('^' + esc(f.prefix) + '\\d+' + esc(f.suffix) + '$');
    const rows = await barcodes.find(
      {
        ...(f.businessId ? { businessId: f.businessId } : {}),
        barcodeGenerated: { $regex: rx },
      },
      { projection: { barcodeGenerated: 1 } }
    ).toArray();

    const highest = rows.reduce((max, r) => {
      const middle = String(r.barcodeGenerated)
        .slice(f.prefix.length, f.suffix ? -f.suffix.length : undefined);
      const n = parseInt(middle, 10);
      return Number.isNaN(n) ? max : Math.max(max, n);
    }, 0);

    const key = ['barcode:' + (f.prefix || '-') + ':' + (f.suffix || '-'), f.businessId || '-', '-', '-'].join('|');

    console.log(`  ${f.prefix || '(none)'}#${f.suffix || ''}  business ${f.businessId.slice(-6) || 'any'}  ` +
      `${rows.length} existing, highest ${highest} -> counter floor ${highest}`);

    if (APPLY) {
      await counters.updateOne(
        { key },
        { $max: { seq: highest }, $setOnInsert: { createdAt: new Date() }, $set: { updatedAt: new Date() } },
        { upsert: true }
      );
    }
  }

  /* A safety net for numbers that match NO configured format - a prefix that
     was changed, or rows loaded from the supplier dump. They cannot collide
     with a counter that does not exist, but the highest is reported so an
     unexpected series is noticed rather than discovered later. */
  const unmatched = await barcodes.countDocuments({
    barcodeGenerated: { $nin: [null, ''] },
    $nor: [...formats.values()].map((f) => ({
      barcodeGenerated: { $regex: new RegExp('^' + esc(f.prefix) + '\\d+' + esc(f.suffix) + '$') },
    })),
  });
  if (unmatched) {
    console.log(`\n  note: ${unmatched} barcode(s) do not match any configured prefix/suffix.`);
    console.log('        They keep working - they are matched by exact number when scanned.');
  }

  /* ---------------------------------------------------------- part 2b ---
     Report barcode numbers that are on more than one row.

     These are the legacy of the browser-held counter: two operators
     generating at the same time both started from the same number, so the
     same label was printed for different pieces. The goods are already on the
     floor, so nothing here can renumber them.

     They are NOT broken - lib/inventory.js picks the next usable row when a
     number is ambiguous, so each scan consumes one of them and the stock
     figures stay right. What is lost is piece-level traceability for those
     specific labels. Listing them lets the client reprint if it matters. */
  const dupes = await barcodes.aggregate([
    {
      $project: {
        key: { $cond: [{ $in: ['$barcodeGenerated', [null, '']] }, '$oldBarcode', '$barcodeGenerated'] },
        biz: '$businessId',
      },
    },
    { $match: { key: { $nin: [null, ''] } } },
    { $group: { _id: { key: '$key', biz: '$biz' }, n: { $sum: 1 } } },
    { $match: { n: { $gt: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();

  if (dupes.length) {
    const rows = dupes.reduce((a, d) => a + d.n, 0);
    console.log(`
DUPLICATE BARCODE NUMBERS: ${dupes.length} number(s) across ${rows} rows.`);
    console.log('  Issued before numbering became atomic. Scanning still works - the engine');
    console.log('  picks the next usable unit - but these labels cannot identify one specific');
    console.log('  piece. Reprint them if piece-level traceability matters:');
    dupes.slice(0, 15).forEach((d) => console.log(`    ${d._id.key} x${d.n}`));
    if (dupes.length > 15) console.log(`    ...and ${dupes.length - 15} more`);
  } else {
    console.log('');
    console.log('No duplicate barcode numbers.');
  }

  /* ---------------------------------------------------------- part 3 ----
     Indexes. Declared on the schema, but the schema only builds them when
     the app first uses the model; creating them here means the first scan
     after deployment is fast rather than a collection scan. */
  if (APPLY) {
    console.log('\nensuring indexes...');
    await safeIndex(barcodes, { barcodeNo: 1, businessId: 1 });
    /* the supplier dump's own numbers are scanned too - see lib/inventory.js */
    await safeIndex(barcodes, { oldBarcode: 1, businessId: 1 });
    await safeIndex(barcodes, { businessId: 1, status: 1, currentLocationId: 1 });
    await safeIndex(barcodes, { businessId: 1, itemCode: 1, status: 1 });
    await safeIndex(barcodes, { transferId: 1, status: 1 });
    await safeIndex(counters, { key: 1 }, { unique: true });
    console.log('  done.');
  }

  console.log(APPLY ? '\nMigration complete.' : '\nDry run complete - nothing was written.');
  await mongoose.disconnect();
}

async function safeIndex(collection, spec, options = {}) {
  try {
    await collection.createIndex(spec, options);
    console.log('  +', JSON.stringify(spec));
  } catch (err) {
    /* an index that already exists under a different name is not a failure */
    console.log('  ~', JSON.stringify(spec), '-', err.codeName || err.message);
  }
}

const esc = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function objId(v) {
  if (!v) return null;
  const s = String(v);
  return mongoose.isValidObjectId(s) ? new mongoose.Types.ObjectId(s) : null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
