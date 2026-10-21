import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const placeholders = new Map();
for (const r of stock) {
  const key = txt(r.supplierId);
  const sup = /^[0-9a-f]{24}$/i.test(key) ? byId.get(key) : byCode.get(key);
  if (!sup) { placeholders.set('MISSING:' + key, (placeholders.get('MISSING:' + key) || 0) + 1); continue; }
  const name = txt(sup.businessName);
  if (!name || name === '0' || /^\(?unassigned\)?$/i.test(name)) {
    const k = `${sup.contactId}|${name}|${sup._id}`;
    placeholders.set(k, (placeholders.get(k) || 0) + 1);
  }
}
console.log('placeholder suppliers', JSON.stringify([...placeholders.entries()].sort((a, b) => b[1] - a[1])));
await c.close();
