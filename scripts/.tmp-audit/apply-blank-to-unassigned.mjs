import { MongoClient } from 'mongodb';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', $or: [{ supplierId: null }, { supplierId: '' }, { supplierId: { $exists: false } }] }).toArray();
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `scripts/backup/active-blank-to-unassigned-${ts}.json`;
fs.mkdirSync('scripts/backup', { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
console.log('blank rows', rows.length, 'backup', backupPath);
if (!APPLY) {
  console.log('DRY RUN — no writes. Re-run with --apply.');
  await c.close();
  process.exit(0);
}
let matched = 0;
let modified = 0;
for (let i = 0; i < rows.length; i += 500) {
  const chunk = rows.slice(i, i + 500);
  const res = await db.collection('barcodeLabel').bulkWrite(chunk.map((r) => ({
    updateOne: {
      filter: { _id: r._id, status: 'IN_STOCK', $or: [{ supplierId: null }, { supplierId: '' }, { supplierId: { $exists: false } }] },
      update: { $set: { supplierId: gid } },
    },
  })), { ordered: false });
  matched += res.matchedCount;
  modified += res.modifiedCount;
}
console.log('bulk result', JSON.stringify({ matched, modified }));
const after = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', $or: [{ supplierId: null }, { supplierId: '' }, { supplierId: { $exists: false } }] });
const g = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: gid });
const total = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK' });
console.log('post', JSON.stringify({ blank: after, g741: g, total }));
await c.close();
