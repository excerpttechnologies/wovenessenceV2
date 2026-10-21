import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const named = rows.filter((r) => /CTNSLK/i.test(txt(r['Item Name'])) && !/unassigned/i.test(txt(r['Supplier Code'])));
console.log('named 10.CTNSLK rows in opening excel:', named.length);
for (const r of named) console.log(JSON.stringify({ itemCode: txt(r['Item Code']), item: txt(r['Item Name']), supCode: txt(r['Supplier Code']), supName: txt(r['Supplier Name']), grc: txt(r['GRC No']), inv: txt(r['Supplier Invoice No']), qty: txt(r['Open Qty']), date: txt(r['Date']) }));
const g741 = rows.filter((r) => /CTNSLK/i.test(txt(r['Item Name'])) && /unassigned/i.test(txt(r['Supplier Code'])));
const codes = g741.map((r) => txt(r['Item Code']));
console.log('G741 10.CTNSLK item codes:', codes.length, 'sample', JSON.stringify(codes.slice(0, 8)));
const allCodes = new Set(codes);
const dir = 'purchase excels';
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
const hitFiles = [];
for (const f of files) {
  let w;
  try { w = XLSX.readFile(path.join(dir, f), { raw: false }); } catch { continue; }
  for (const name of w.SheetNames) {
    const rws = XLSX.utils.sheet_to_json(w.Sheets[name], { defval: '', raw: false, header: 1 });
    let hit = false;
    let overlap = 0;
    for (const row of rws) {
      const flat = row.map((v) => txt(v));
      if (flat.some((v) => /CTNSLK/i.test(v))) hit = true;
      if (flat.some((v) => allCodes.has(v))) overlap++;
    }
    if (hit || overlap) hitFiles.push({ file: f, sheet: name, ctns: hit, openingBarcodeOverlap: overlap });
  }
}
console.log('purchase files with CTNSLK and/or opening-barcode overlap:');
for (const h of hitFiles) console.log(JSON.stringify(h));
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const grcs = await db.collection('grc').find({ 'items.itemName': /CTNSLK/i }).limit(10).toArray();
console.log('\ngrc with CTNSLK items:', grcs.length);
for (const g of grcs) {
  const sup = await db.collection('contact').findOne({ _id: g.supplierId }).catch(() => null);
  console.log(JSON.stringify({ grc: g.grcNumber, supplier: sup ? `${sup.contactId}|${sup.businessName}` : String(g.supplierId), itemSample: (g.items || []).filter((i) => /CTNSLK/i.test(txt(i.itemName))).slice(0, 2).map((i) => `${i.itemCode}|${i.itemName}`) }));
}
const pins = await db.collection('purchaseinvoice').find({ 'items.itemName': /CTNSLK/i }).limit(10).toArray();
console.log('\npurchaseinvoice with CTNSLK items:', pins.length);
for (const p of pins) {
  const sup = await db.collection('contact').findOne({ _id: p.supplierId }).catch(() => null);
  console.log(JSON.stringify({ inv: p.purchaseInvoiceNo, grc: p.grcNumber, supplier: sup ? `${sup.contactId}|${sup.businessName}` : String(p.supplierId) }));
}
const grcBc = await db.collection('grc').find({ 'items.billSlNo': { $in: ['OM1098', 'OM1099', 'OM1100', 'OM1109'] } }).limit(5).toArray();
console.log('\ngrc by billSlNo OM...:', grcBc.length);
for (const g of grcBc) {
  const sup = await db.collection('contact').findOne({ _id: g.supplierId }).catch(() => null);
  console.log(JSON.stringify({ grc: g.grcNumber, supplier: sup ? `${sup.contactId}|${sup.businessName}` : String(g.supplierId) }));
}
await c.close();
