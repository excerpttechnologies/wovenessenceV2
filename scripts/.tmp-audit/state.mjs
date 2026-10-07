import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const out = {};
for (const [k, c] of [['Supplier','supplier'],['Customer','customer'],['Agent','agent']]) {
  out[c] = { split: await db.collection(c).countDocuments(), contact: await db.collection('contact').countDocuments({ contactKind: k }) };
}
out.testSuppliersLeft = await db.collection('supplier').countDocuments({ businessId: new mongoose.Types.ObjectId('6aa91823d4d8c0ce11a9f4fa') });
const names = (await db.listCollections().toArray()).map((c) => c.name);
out.runCollections = names.filter((n) => /split|migrat/i.test(n));
for (const n of out.runCollections) out[n] = await db.collection(n).find({}).limit(5).toArray();
console.log(JSON.stringify(out, null, 1).slice(0, 3000));
await mongoose.disconnect();
