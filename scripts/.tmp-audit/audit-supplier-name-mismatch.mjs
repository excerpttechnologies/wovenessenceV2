import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const codes = ['G1317', 'G1326', 'G1192', 'G1318', 'G1319'];
for (const coll of ['contact', 'supplier']) {
  const docs = await db.collection(coll).find({ contactId: { $in: codes } }).toArray();
  console.log('\n' + coll, docs.length);
  for (const d of docs) {
    console.log(JSON.stringify({ id: String(d._id), code: d.contactId, businessName: d.businessName, first: d.firstName, middle: d.middleName, last: d.lastName, biz: d.businessId, kind: d.contactKind }));
  }
}
console.log('\nstock usage');
for (const code of codes) {
  const contacts = await db.collection('contact').find({ contactId: code }).toArray();
  for (const sup of contacts) {
    const id = String(sup._id);
    const byId = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: id });
    const byCode = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: code });
    console.log(JSON.stringify({ code, id, dbName: sup.businessName, byId, byCode }));
  }
  const supplierDocs = await db.collection('supplier').find({ contactId: code }).toArray();
  for (const sup of supplierDocs) {
    const id = String(sup._id);
    const byId = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: id });
    const byCode = await db.collection('barcodeLabel').countDocuments({ status: 'IN_STOCK', supplierId: code });
    console.log(JSON.stringify({ code, id, coll: 'supplier', dbName: sup.businessName, byId, byCode }));
  }
}
await c.close();
