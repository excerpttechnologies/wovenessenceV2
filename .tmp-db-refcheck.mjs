import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI;
await mongoose.connect(uri, { bufferCommands: false });
const db = mongoose.connection.db;

const ids = await db.collection('posinvoice').aggregate([
  { $unwind: '$items' },
  { $match: { 'items.salesPerson': { $nin: ['', null] } } },
  { $group: { _id: '$items.salesPerson' } },
]).toArray();
const list = ids.map((x) => x._id).filter((x) => mongoose.isValidObjectId(x));
console.log('distinct pos line salesPerson ids:', list.length, list);
for (const coll of ['salesperson', 'agent', 'contact', 'user']) {
  const found = await db.collection(coll).find({ _id: { $in: list.map((id) => new mongoose.Types.ObjectId(id)) } }).project({ name: 1, businessName: 1, firstName: 1, lastName: 1, email: 1 }).toArray();
  console.log(coll, found.length, JSON.stringify(found));
}

// check ids from all common ref fields across docs resolve
for (const [coll, field] of [
  ['grc', 'supplierId'], ['grc', 'logisticId'], ['grc', 'purchaseGroupId'], ['grc', 'agentId'],
  ['delivery', 'transporterId'], ['delivery', 'supplierId'],
  ['posinvoice', 'locationId'], ['posinvoice', 'customerId'], ['posinvoice', 'counterId'],
  ['posreturn', 'customerId'],
]) {
  const vals = await db.collection(coll).distinct(field);
  const valid = vals.filter((v) => v && mongoose.isValidObjectId(String(v)));
  console.log(coll + '.' + field, 'distinct', vals.length, 'validIds', valid.length);
}
await mongoose.disconnect();
