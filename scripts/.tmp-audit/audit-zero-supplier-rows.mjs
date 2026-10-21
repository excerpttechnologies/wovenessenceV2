import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: '6ad5f23c01314b34efca530b' }).toArray();
console.log('rows', rows.length);
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const ex = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const byBarcode = new Map();
for (const r of ex) {
  const k = String(r['Item Code'] || '').trim();
  if (!k) continue;
  if (!byBarcode.has(k)) byBarcode.set(k, []);
  byBarcode.get(k).push(r);
}
for (const r of rows) {
  const matches = byBarcode.get(String(r.barcodeNo || '').trim()) || [];
  console.log(JSON.stringify({ _id: String(r._id), barcodeNo: r.barcodeNo, itemCode: r.itemCode, source: r.source, createdAt: r.createdAt, excel: matches.map((m) => ({ code: m['Supplier Code'], name: m['Supplier Name'], grc: m['GRC No'], inv: m['Supplier Invoice No'] })) }));
}
await c.close();
