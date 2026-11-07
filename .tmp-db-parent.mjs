import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI;
await mongoose.connect(uri, { bufferCommands: false });
const db = mongoose.connection.db;
const report = async (coll, field) => {
  const docs = await db.collection(coll).find({ [field]: { $nin: [null, '', undefined] } }).project({ _id: 1, name: 1, stockPoint: 1, [field]: 1 }).limit(5).toArray();
  const vals = await db.collection(coll).distinct(field);
  console.log(coll + '.' + field, 'distinct', vals.length, 'valid', vals.filter((v) => mongoose.isValidObjectId(String(v))).length, JSON.stringify(docs));
};
for (const [c, f] of [['productgroup', 'parentId'], ['productfilter', 'parentId'], ['stockpoint', 'parentId'], ['paymentmethod', 'counterId']]) {
  await report(c, f);
}
for (const coll of ['productgroup', 'productfilter', 'stockpoint', 'poscounter', 'paymentmethod']) {
  const n = await db.collection(coll).estimatedDocumentCount();
  console.log(coll, 'count', n);
}
await mongoose.disconnect();
