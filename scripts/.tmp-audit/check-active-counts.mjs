import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const gid = '6a9986a73ce59c48713fedda';
const total = await db.collection('barcodeLabel').countDocuments();
const instock = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK' });
const g = await db.collection('barcodeLabel').countDocuments({ supplierId: gid });
const gi = await db.collection('barcodeLabel').countDocuments({ supplierId: gid, status: 'IN_STOCK' });
console.log({ total, instock, g, gi });
const bySource = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: '$source', n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('bySource', JSON.stringify(bySource));
const recent = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$createdAt' } }, n: { $sum: 1 } } },
  { $sort: { _id: -1 } },
  { $limit: 10 },
]).toArray();
console.log('recent', JSON.stringify(recent));
const gRecent = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK', supplierId: gid } },
  { $group: { _id: { source: '$source', minute: { $dateToString: { format: '%Y-%m-%d %H:%M', date: '$createdAt' } } }, n: { $sum: 1 } } },
  { $sort: { '_id.minute': -1 } },
  { $limit: 20 },
]).toArray();
console.log('gRecent', JSON.stringify(gRecent));
await c.close();
