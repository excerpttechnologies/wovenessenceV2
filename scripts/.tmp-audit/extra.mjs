import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
for (const [kind, coll] of [['Supplier','supplier'],['Customer','customer'],['Agent','agent']]) {
  const src = new Set((await db.collection('contact').find({ contactKind: kind }, { projection: { _id: 1 } }).toArray()).map((d) => String(d._id)));
  const extra = (await db.collection(coll).find({}).toArray()).filter((d) => !src.has(String(d._id)));
  console.log(coll, 'records no longer in contact:', extra.length);
  for (const d of extra) console.log('  ', String(d._id), d.contactId, JSON.stringify(d.businessName), JSON.stringify([d.firstName, d.lastName].join(' ')), 'business', String(d.businessId), 'created', d.createdAt?.toISOString?.() ?? d.createdAt, 'updated', d.updatedAt?.toISOString?.() ?? d.updatedAt, 'gst', d.gstNo);
  if (extra.length) {
    const ids = extra.map((d) => d._id); const sids = ids.map(String);
    for (const [c, f] of [['grc','supplierId'],['barcodeLabel','supplierId'],['delivery','supplierId'],['purchaseinvoice','supplierId']]) {
      const n = await db.collection(c).countDocuments({ $or: [{ [f]: { $in: ids } }, { [f]: { $in: sids } }] });
      if (n) console.log('   referenced by', c + '.' + f, n);
    }
  }
}
const biz = await db.collection('business').find({}, { projection: { name: 1 } }).toArray();
console.log('\nbusinesses:', JSON.stringify(biz.map((b) => [String(b._id), b.name])));
await mongoose.disconnect();
