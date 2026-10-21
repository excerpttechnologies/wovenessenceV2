import { MongoClient } from 'mongodb';
import fs from 'fs';
const APPLY = process.argv.includes('--apply');
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const zeroId = '6ad5f23c01314b34efca530b';
const gid = '6a9986a73ce59c48713fedda';
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: zeroId }).toArray();
const ts = new Date().toISOString().replace(/[:.]/g, '-');
fs.mkdirSync('scripts/backup', { recursive: true });
const backupPath = `scripts/backup/active-zero-to-unassigned-${ts}.json`;
fs.writeFileSync(backupPath, JSON.stringify(rows, null, 2));
console.log('rows', rows.length, 'backup', backupPath);
if (!APPLY) { console.log('DRY RUN — no writes.'); await c.close(); process.exit(0); }
const res = await db.collection('barcodeLabel').updateMany({ status: 'IN_STOCK', supplierId: zeroId }, { $set: { supplierId: gid } });
console.log('update', JSON.stringify({ matched: res.matchedCount, modified: res.modifiedCount }));
const counts = {
  zero: await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: zeroId }),
  g741: await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: gid }),
  blank: await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', $or: [{ supplierId: null }, { supplierId: '' }, { supplierId: { $exists: false } }] }),
  total: await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK' }),
};
console.log('post', JSON.stringify(counts));
await c.close();
