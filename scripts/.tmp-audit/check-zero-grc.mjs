import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const nums = ['HSR/26/00003', 'HSR/26/00020', 'HSR/26/00024'];
const grcs = await db.collection('grc').find({ $or: [{ grcNumber: { $in: nums } }, { grcNo: { $in: nums } }, { grcNumber: { $in: nums.map((n) => n.replace(/^HSR\/26\//, '')) } }] }).toArray();
console.log('grcs', grcs.length);
for (const g of grcs) {
  console.log(JSON.stringify({ _id: String(g._id), grcNumber: g.grcNumber || g.grcNo, supplierId: g.supplierId, supplierCode: g.supplierCode, supplierName: g.supplierName, date: g.grcDate || g.date, items: (g.items || []).map((i) => ({ itemCode: i.itemCode, itemName: i.itemName, qty: i.qty })).slice(0, 20) }));
}
await c.close();
