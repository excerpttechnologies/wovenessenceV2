import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1');
await c.connect();
const db = c.db('grooretailerp1');
const dup = await db.collection('contact').aggregate([
  { $match: { contactKind: 'Supplier', contactId: { $nin: ['', null] } } },
  { $group: { _id: '$contactId', n: { $sum: 1 }, biz: { $addToSet: '$businessId' }, names: { $addToSet: '$businessName' } } },
  { $match: { n: { $gt: 1 } } },
]).toArray();
console.log('duplicate supplier codes', dup.length);
console.log(JSON.stringify(dup.slice(0, 30), null, 2));
await c.close();
