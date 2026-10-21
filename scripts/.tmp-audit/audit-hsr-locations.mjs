import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', source: 'HSR_OPENING_19_10' }).toArray();
const group = (rows, fn) => {
  const m = {};
  for (const r of rows) { const k = fn(r); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
const newRows = rows.filter((r) => new Date(r.createdAt) >= new Date('2026-10-19T12:00:00Z'));
const oldRows = rows.filter((r) => new Date(r.createdAt) < new Date('2026-10-19T12:00:00Z'));
for (const [label, list] of [['old', oldRows], ['new', newRows]]) {
  console.log('\n' + label, list.length);
  console.log('business', JSON.stringify(group(list, (r) => `${txt(r.businessId)}|${txt(r.currentBusinessId)}`)));
  console.log('location', JSON.stringify(group(list, (r) => `${txt(r.currentLocationId || r.locationId)}|${txt(r.locationName)}`)));
  console.log('supplier', JSON.stringify(group(list, (r) => String(r.supplierId) === gid ? 'G741' : txt(r.supplierId) || 'blank')));
}
await c.close();
