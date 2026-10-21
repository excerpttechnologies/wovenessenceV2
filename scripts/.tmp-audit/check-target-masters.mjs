import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const ids = ['6ad5f23c01314b34efca5325', '6ad5f23c01314b34efca5326', '6ad5f23c01314b34efca5327', '6ad5f23c01314b34efca531b', '6a9986a73ce59c48713fedda'];
for (const coll of ['contact', 'supplier']) {
  const docs = await db.collection(coll).find({ _id: { $in: ids.map((x) => new ObjectId(x)) } }).project({ contactId: 1, businessName: 1, businessId: 1 }).toArray();
  console.log(coll, JSON.stringify(docs.map((d) => ({ id: String(d._id), code: d.contactId, name: d.businessName, biz: d.businessId }))));
}
await c.close();
