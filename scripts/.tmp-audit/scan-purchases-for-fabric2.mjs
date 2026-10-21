import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
import { MongoClient } from 'mongodb';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const needles = ['CTNSLK', 'SPUN SILK', 'CTN SLK', 'COTTON SILK'];
const dir = 'purchase excels';
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
let found = 0;
for (const f of files) {
  let wb;
  try { wb = XLSX.readFile(path.join(dir, f), { raw: false }); } catch { continue; }
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, header: 1 });
    for (const row of rows) {
      const flat = row.map((v) => txt(v));
      if (flat.some((v) => needles.some((n) => v.toUpperCase().includes(n)))) {
        found++;
        if (found <= 10) console.log('EXCEL HIT', JSON.stringify({ file: f, sheet: name, row: flat.filter(Boolean).slice(0, 14) }));
      }
    }
  }
}
console.log('purchase excel fabric hits', found);
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
for (const coll of ['purchaseinvoice', 'grt', 'grc']) {
  const sample = await db.collection(coll).findOne({});
  console.log(`\n${coll} sample keys:`, sample ? Object.keys(sample).join(', ') : '(empty)');
  if (sample && sample.items && sample.items.length) console.log(coll, 'item keys:', Object.keys(sample.items[0]).join(', '));
}
const patterns = [/CTNSLK/i, /OM1098/i, /OM1109/i, /SOFT.*SPUN/i];
for (const coll of ['purchaseinvoice', 'grt', 'grc', 'purchase_invoice']) {
  let hits = [];
  try {
    hits = await db.collection(coll).find({ $where: 'function() { return JSON.stringify(this).match(/CTNSLK|OM1098|OM1109/) !== null; }' }).limit(3).toArray();
  } catch (e) { console.log(coll, 'scan error', e.message); continue; }
  console.log(`\n${coll} text-scan hits`, hits.length);
  for (const h of hits) console.log(JSON.stringify({ grcNo: h.grcNo || h.invoiceNo || h.billNo, supplierName: h.supplierName, supplierCode: h.supplierCode, supplierId: String(h.supplierId || ''), keys: Object.keys(h).slice(0, 15) }));
}
await c.close();
