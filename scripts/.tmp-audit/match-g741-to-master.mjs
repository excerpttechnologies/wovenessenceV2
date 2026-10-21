import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));

const wb = XLSX.readFile('HSR MASTER AS ON 1510 7 40.xlsx', { raw: false });
const master = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const byBarcode = new Map();
for (const r of master) {
  const item = txt(r['Item Code']);
  if (!item) continue;
  if (!byBarcode.has(item)) byBarcode.set(item, new Set());
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (!isPlaceholder(code) && !isPlaceholder(name)) byBarcode.get(item).add(`${code}|${name}`);
}

const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: gid }).toArray();
console.log('db G741 rows', rows.length, 'distinct barcode', new Set(rows.map((r) => txt(r.barcodeNo))).size);
const stats = { rows: rows.length, matched: 0, unique: 0, multi: 0, none: 0, uniqueTargets: {} };
const multiSamples = [];
const uniqueSamples = [];
const noneSamples = [];
for (const r of rows) {
  const set = byBarcode.get(txt(r.barcodeNo));
  if (!set || !set.size) {
    stats.none++;
    if (noneSamples.length < 10) noneSamples.push({ barcodeNo: r.barcodeNo, itemCode: r.itemCode });
    continue;
  }
  stats.matched++;
  if (set.size === 1) {
    const [target] = [...set];
    stats.unique++;
    stats.uniqueTargets[target] = (stats.uniqueTargets[target] || 0) + 1;
    if (uniqueSamples.length < 15) uniqueSamples.push({ barcodeNo: r.barcodeNo, itemCode: r.itemCode, target });
  } else {
    stats.multi++;
    if (multiSamples.length < 10) multiSamples.push({ barcodeNo: r.barcodeNo, itemCode: r.itemCode, targets: [...set] });
  }
}
console.log('stats', JSON.stringify({ ...stats, uniqueTargets: Object.entries(stats.uniqueTargets).sort((a, b) => b[1] - a[1]).slice(0, 30) }));
console.log('unique samples', JSON.stringify(uniqueSamples, null, 2));
console.log('multi samples', JSON.stringify(multiSamples, null, 2));
console.log('none samples', JSON.stringify(noneSamples, null, 2));
await c.close();
