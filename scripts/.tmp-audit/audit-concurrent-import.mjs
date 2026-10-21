import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const all = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const newRows = all.filter((r) => r.createdAt && new Date(r.createdAt) >= new Date('2026-10-19T12:00:00Z'));
const oldRows = all.filter((r) => !r.createdAt || new Date(r.createdAt) < new Date('2026-10-19T12:00:00Z'));
console.log('in-stock total', all.length, 'new >=12:00', newRows.length, 'old', oldRows.length);
for (const [label, rows] of [['new', newRows], ['old', oldRows]]) {
  const s = {};
  for (const r of rows) {
    const k = String(r.supplierId ?? '') === gid ? 'G741' : !txt(r.supplierId) ? 'blank' : 'other';
    s[k] = (s[k] || 0) + 1;
  }
  console.log(label, 'supplier', JSON.stringify(s));
  const bySource = {};
  for (const r of rows) { const k = txt(r.source) || '(blank)'; bySource[k] = (bySource[k] || 0) + 1; }
  console.log(label, 'sources', JSON.stringify(bySource));
}
const newG = newRows.filter((r) => String(r.supplierId ?? '') === gid);
const newBlank = newRows.filter((r) => !txt(r.supplierId));
console.log('new G741', newG.length, 'new blank', newBlank.length);
console.log('new G741 sample', JSON.stringify(newG.slice(0, 5).map((r) => ({ _id: String(r._id), barcodeNo: r.barcodeNo, itemCode: r.itemCode, source: r.source, createdAt: r.createdAt }))));
console.log('new blank sample', JSON.stringify(newBlank.slice(0, 10).map((r) => ({ _id: String(r._id), barcodeNo: r.barcodeNo, itemCode: r.itemCode, source: r.source, createdAt: r.createdAt, supplierCode: r.supplierCode }))));
const newByBarcode = new Map();
for (const r of newRows) { const k = txt(r.barcodeNo); newByBarcode.set(k, (newByBarcode.get(k) || 0) + 1); }
const oldByBarcode = new Map();
for (const r of oldRows) { const k = txt(r.barcodeNo); oldByBarcode.set(k, (oldByBarcode.get(k) || 0) + 1); }
let overlap = 0;
for (const k of newByBarcode.keys()) if (oldByBarcode.has(k)) overlap++;
console.log('distinct new barcodeNo', newByBarcode.size, 'distinct old', oldByBarcode.size, 'barcodeNo overlap', overlap);
const exactDup = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK', source: 'HSR_OPENING_19_10' } },
  { $group: { _id: { barcodeNo: '$barcodeNo', locationId: '$locationId', businessId: '$businessId' }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: 'groups' },
]).toArray();
console.log('duplicate HSR barcode/location/business groups', JSON.stringify(exactDup));
const created = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK', createdAt: { $gte: new Date('2026-10-19T12:40:00Z') } } },
  { $group: { _id: { $dateToString: { format: '%H:%M:%S', date: '$createdAt' } }, n: { $sum: 1 } } },
  { $sort: { _id: 1 } },
]).toArray();
console.log('created seconds after 12:40', JSON.stringify(created));
await c.close();
