import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const types = await db.collection('barcodeLabel').aggregate([
  { $match: { source: 'HSR_OPENING_19_10' } },
  { $group: { _id: { $type: '$createdAt' }, n: { $sum: 1 } } },
]).toArray();
console.log('types', JSON.stringify(types));
console.log('date find', await db.collection('barcodeLabel').countDocuments({ source: 'HSR_OPENING_19_10', createdAt: { $gte: new Date('2026-10-19T12:00:00Z') } }));
const r = await db.collection('barcodeLabel').findOne({ _id: new ObjectId('6ad611eeaf9e9c3b8dea5ae1') });
console.log('new raw', JSON.stringify({ createdAt: r.createdAt, type: typeof r.createdAt, inst: r.createdAt instanceof Date }));
const last = await db.collection('barcodeLabel').find({ source: 'HSR_OPENING_19_10' }).sort({ createdAt: -1, _id: -1 }).limit(3).project({ createdAt: 1, barcodeNo: 1 }).toArray();
console.log('last3', JSON.stringify(last));
await c.close();
