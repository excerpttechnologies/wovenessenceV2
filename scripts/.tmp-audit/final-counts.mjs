import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const stock = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $addFields: { supKey: { $toString: '$supplierId' } } },
  { $group: { _id: '$supKey', n: { $sum: 1 } } },
]).toArray();
const byKey = new Map(stock.map((x) => [x._id, x.n]));
const total = stock.reduce((a, x) => a + x.n, 0);
const g741 = byKey.get('6a9986a73ce59c48713fedda') || 0;
const blank = byKey.get('null') || 0;
const zero = byKey.get('6ad5f23c01314b34efca530b') || 0;
const byLocation = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: { $ifNull: ['$currentLocationId', '$locationId'] }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log(JSON.stringify({ total, g741, blank, zero, resolved: total - g741 - blank - zero, byLocation }, null, 2));
await c.close();
