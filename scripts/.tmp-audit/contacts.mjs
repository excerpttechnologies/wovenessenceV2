/* READ ONLY audit of the contact collection */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log('database:', db.databaseName);
const c = db.collection('contact');
console.log('total contact docs:', await c.countDocuments());
console.log('by contactKind:', JSON.stringify(await c.aggregate([{ $group: { _id: { k: '$contactKind', t: { $type: '$contactKind' } }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
const names = (await db.listCollections().toArray()).map((x) => x.name);
console.log('existing target collections:', ['suppliers','customers','agents','supplier','customer','agent'].filter((n) => names.includes(n)));
console.log('\nINDEXES on contact:');
for (const i of await c.indexes()) console.log(' ', JSON.stringify(i));
console.log('\ncontactId duplicates (same code on >1 doc):');
const dup = await c.aggregate([{ $match: { contactId: { $type: 'string', $ne: '' } } }, { $group: { _id: '$contactId', n: { $sum: 1 }, kinds: { $addToSet: '$contactKind' } } }, { $match: { n: { $gt: 1 } } }, { $sort: { n: -1 } }, { $limit: 15 }]).toArray();
console.log('  count of dup codes:', (await c.aggregate([{ $match: { contactId: { $type: 'string', $ne: '' } } }, { $group: { _id: '$contactId', n: { $sum: 1 }, kinds: { $addToSet: '$contactKind' } } }, { $match: { n: { $gt: 1 } } }, { $count: 'n' }]).toArray())[0]?.n || 0);
console.log('  sample:', JSON.stringify(dup));
console.log('  dup codes spanning >1 kind:', (await c.aggregate([{ $match: { contactId: { $type: 'string', $ne: '' } } }, { $group: { _id: '$contactId', kinds: { $addToSet: '$contactKind' } } }, { $match: { 'kinds.1': { $exists: true } } }, { $count: 'n' }]).toArray())[0]?.n || 0);
console.log('\ncontactId prefixes per kind:');
console.log(JSON.stringify(await c.aggregate([{ $project: { k: '$contactKind', p: { $regexFind: { input: { $ifNull: ['$contactId', ''] }, regex: /^[^0-9]*/ } } } }, { $group: { _id: { k: '$k', p: '$p.match' }, n: { $sum: 1 } } }, { $sort: { '_id.k': 1, n: -1 } }]).toArray()));
console.log('\ntypeId per kind (with contactType prefix):');
const types = await db.collection('contacttype').find({}).toArray();
console.log('contacttype docs:', types.length, JSON.stringify(types.map((t) => ({ _id: String(t._id), name: t.name || t.typeName, prefix: t.prefix, kind: t.kind || t.contactKind, businessId: t.businessId }))));
console.log(JSON.stringify(await c.aggregate([{ $group: { _id: { k: '$contactKind', t: '$typeId' }, n: { $sum: 1 } } }, { $sort: { n: -1 } }]).toArray()));
console.log('\nfield keys actually present (union) per kind:');
for (const k of ['Supplier', 'Customer', 'Agent']) {
  const keys = await c.aggregate([{ $match: { contactKind: k } }, { $project: { a: { $objectToArray: '$$ROOT' } } }, { $unwind: '$a' }, { $group: { _id: '$a.k' } }]).toArray();
  const schemaKeys = new Set(Object.keys((await import('../../models/Contact.js')).default.schema.paths));
  const extra = keys.map((x) => x._id).filter((x) => !schemaKeys.has(x));
  console.log(' ', k, keys.length, 'keys | not in schema:', JSON.stringify(extra));
}
console.log('\n_id types:', JSON.stringify(await c.aggregate([{ $group: { _id: { $type: '$_id' }, n: { $sum: 1 } } }]).toArray()));
console.log('businessId types:', JSON.stringify(await c.aggregate([{ $group: { _id: { $type: '$businessId' }, n: { $sum: 1 } } }]).toArray()));
console.log('agentId types on contacts:', JSON.stringify(await c.aggregate([{ $group: { _id: { $type: '$agentId' }, n: { $sum: 1 } } }]).toArray()));
await mongoose.disconnect();
