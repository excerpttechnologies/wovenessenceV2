import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const total = await db.collection('barcodeLabel').countDocuments();
const instock = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK' });
const g = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: gid });
const blank = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', $or: [{ supplierId: null }, { supplierId: '' }, { supplierId: { $exists: false } }] });
console.log(JSON.stringify({ total, instock, g, blank }));
const bySource = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: '$source', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('sources', JSON.stringify(bySource));
const byLoc = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK', source: 'HSR_OPENING_19_10' } },
  { $group: { _id: '$currentLocationId', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('hsr locations', JSON.stringify(byLoc));
const max = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).sort({ _id: -1 }).limit(1).project({ _id: 1, createdAt: 1, source: 1, supplierId: 1 }).toArray();
console.log('last _id', JSON.stringify(max));
const fixed = JSON.parse(fs.readFileSync('scripts/.tmp-audit/active-blank-supplier-apply.json', 'utf8'));
const fixedIds = fixed.map((x) => x._id);
const { ObjectId } = await import('mongodb');
const fixedDocs = await db.collection('barcodeLabel').find({ _id: { $in: fixedIds.map((x) => new ObjectId(x)) } }).project({ supplierId: 1, status: 1 }).toArray();
const byTarget = {};
for (const r of fixedDocs) { const k = String(r.supplierId); byTarget[k] = (byTarget[k] || 0) + 1; }
console.log('fixed surviving', fixedDocs.length, JSON.stringify(byTarget));
const blank76 = JSON.parse(fs.readFileSync('scripts/backup/active-blank-to-unassigned-2026-10-19T12-54-00-927Z.json', 'utf8')).map((x) => x._id);
const docs76 = await db.collection('barcodeLabel').find({ _id: { $in: blank76.map((x) => new ObjectId(x)) } }).project({ supplierId: 1 }).toArray();
console.log('76 surviving', docs76.length, 'g741', docs76.filter((r) => String(r.supplierId) === gid).length);
await c.close();
