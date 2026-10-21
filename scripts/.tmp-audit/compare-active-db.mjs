import { MongoClient } from 'mongodb';
import fs from 'fs';

const env = fs.readFileSync('.env', 'utf8');
const uri = env.match(/^MONGODB_URI=(.+)$/m)?.[1]?.trim();
const uriSafe = uri?.replace(/(mongodb\+srv:\/\/[^:]+:)[^@]+@/, '$1***@');
console.log('active uri', uriSafe);
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const counts = {};
for (const coll of ['barcodeLabel', 'contact', 'supplier', 'business']) counts[coll] = await db.collection(coll).countDocuments();
console.log('counts', counts);
const g741 = await db.collection('contact').find({ contactId: 'G741', contactKind: 'Supplier' }).toArray();
console.log('G741 contact', JSON.stringify(g741.map((v) => ({ _id: v._id, contactId: v.contactId, name: v.businessName, biz: v.businessId }))));
const g741s = await db.collection('supplier').find({ contactId: 'G741' }).toArray();
console.log('G741 supplier', JSON.stringify(g741s.map((v) => ({ _id: v._id, contactId: v.contactId, name: v.businessName, biz: v.businessId }))));
const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
console.log('in stock', stock.length);
const ids = [...new Set(stock.map((r) => String(r.supplierId || '')))];
const oids = ids.filter((v) => /^[0-9a-f]{24}$/i.test(v));
const codes = ids.filter((v) => v && !/^[0-9a-f]{24}$/i.test(v));
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map(contacts.map((v) => [String(v.contactId), v]));
const missing = [];
for (const key of ids) {
  if (!key) { missing.push('(blank)'); continue; }
  const sup = /^[0-9a-f]{24}$/i.test(key) ? byId.get(key) : byCode.get(key);
  if (!sup) missing.push(key);
}
console.log('distinct supplier keys', ids.length, 'oids', oids.length, 'codes', codes.length, 'missing', missing.length, JSON.stringify(missing.slice(0, 30)));
const g741Stock = stock.filter((r) => String(r.supplierId) === String(g741[0]?._id));
console.log('G741 stock rows', g741Stock.length, JSON.stringify(g741Stock.slice(0, 5).map((r) => ({ barcodeNo: r.barcodeNo, source: r.source, itemCode: r.itemCode, grcNo: r.grcNo, biz: r.businessId }))));
await c.close();
