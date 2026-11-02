/* Re-price Inter Store challans whose lines all carry rate 0 (raised before the
   barcode lookup read the right price field). Dry run by default; --apply
   writes a JSON backup first. */
import mongoose from 'mongoose';
import fs from 'node:fs';
import dbConnect from '@/lib/db';
import StoreDeliveryChallan from '@/models/StoreDeliveryChallan';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { resolveGstRate } from '@/lib/storeGst';
import { applyStoreTotals } from '@/lib/storeSell';

const APPLY = process.argv.includes('--apply');
const rateOf = (row) => Number(
  row?.retailPrice || row?.offerPrice || row?.wspPrice || row?.dpPrice || row?.purRate || 0
) || 0;

await dbConnect();
const docs = await StoreDeliveryChallan.find({ module: 'interStoreSell' }).lean();
const changes = [];

for (const doc of docs) {
  const items = doc.items || [];
  if (!items.length) continue;
  if (items.some((l) => Number(l.unitRate) > 0)) continue; /* already priced */

  const priced = [];
  let ok = true;
  for (const line of items) {
    const rows = await BarcodeLabel.find({ barcodeNo: String(line.barcodeNo || '') })
      .select('retailPrice offerPrice wspPrice dpPrice purRate locationId').lean();
    const at = rows.find((r) => String(r.locationId) === String(doc.locationId)) || rows[0];
    const rate = rateOf(at);
    if (!(rate > 0)) { ok = false; console.log('SKIP', doc.dcNo, '- barcode', line.barcodeNo, 'has no price'); break; }
    const gst = await resolveGstRate({ businessId: String(doc.businessId), hsnCode: line.hsn, amount: rate * Number(line.qty) });
    priced.push({ ...line, unitRate: rate, gstPct: gst.gstPct });
  }
  if (!ok) continue;

  const t = applyStoreTotals(priced, {
    mode: doc.gstMode,
    discountPercent: doc.discountPercent,
    roundOffDiscountAmt: doc.roundOffDiscountAmt,
  });

  console.log(doc.dcNo, '| net', doc.netValue, '->', t.netValue,
    '| taxable', t.taxableValue, '| cgst', t.cgstTotal, '| sgst', t.sgstTotal, '| igst', t.igstTotal);
  t.items.forEach((l) => console.log('   line', l.barcodeNo, 'qty', l.qty, 'rate', l.unitRate, 'gst', l.gstPct, 'net', l.netAmount));

  changes.push({ id: String(doc._id), dcNo: doc.dcNo, totals: t, items: t.items });
}

if (!changes.length) { console.log('nothing to re-price'); await mongoose.connection.close(); process.exit(0); }
if (!APPLY) { console.log('\nDRY RUN - re-run with --apply to write'); await mongoose.connection.close(); process.exit(0); }

const backup = 'scripts/.tmp-audit/reprice-backup-' + Date.now() + '.json';
fs.writeFileSync(backup, JSON.stringify(changes, null, 1));
console.log('\nbackup written:', backup);

for (const c of changes) {
  await StoreDeliveryChallan.collection.updateOne(
    { _id: new mongoose.Types.ObjectId(c.id) },
    {
      $set: {
        items: c.items,
        taxableValue: c.totals.taxableValue,
        igstTotal: c.totals.igstTotal,
        cgstTotal: c.totals.cgstTotal,
        sgstTotal: c.totals.sgstTotal,
        roundOff: c.totals.roundOff,
        totalQty: c.totals.totalQty,
        netValue: c.totals.netValue,
        updatedAt: new Date(),
      },
    }
  );
  console.log('updated', c.dcNo, '-> net', c.totals.netValue);
}
await mongoose.connection.close();
