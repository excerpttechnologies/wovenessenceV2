/* READ ONLY: the target GRC and its barcode rows */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const id = '6a980a0b3cfd7c0c4dc9673f';
const oid = new mongoose.Types.ObjectId(id);
const grc = await db.collection('grc').findOne({ _id: oid });
console.log('grc by ObjectId:', grc ? JSON.stringify({ _id: grc._id, grcNumber: grc.grcNumber, finYear: grc.finYear, supplierId: grc.supplierId, supplierIdType: typeof grc.supplierId, businessId: grc.businessId, locationId: grc.locationId, lastBarcodeSeq: grc.lastBarcodeSeq, status: grc.status, items: (grc.items || []).length, keys: Object.keys(grc) }) : null);
const bl = db.collection('barcodeLabel');
for (const [label, q] of [['grcId string', { grcId: id }], ['grcId ObjectId', { grcId: oid }], ['grcNo', grc ? { grcNo: grc.grcNumber } : null]]) {
  if (!q) continue;
  console.log(label, await bl.countDocuments(q));
}
const rows = await bl.find({ $or: [{ grcId: id }, { grcId: oid }] }).limit(4).toArray();
rows.forEach((r) => console.log(JSON.stringify(Object.fromEntries(Object.entries(r).filter(([k]) => !['__v'].includes(k))))));
const types = await bl.aggregate([{ $match: { $or: [{ grcId: id }, { grcId: oid }] } }, { $group: { _id: { grcId: { $type: '$grcId' }, supplierId: { $type: '$supplierId' }, barcodeNo: { $type: '$barcodeNo' }, gen: { $type: '$barcodeGenerated' }, seq: { $type: '$seq' } }, n: { $sum: 1 } } }]).toArray();
console.log('field types:', JSON.stringify(types));
if (grc?.supplierId) {
  const sid = String(grc.supplierId);
  console.log('supplier in contact:', !!(await db.collection('contact').findOne({ _id: new mongoose.Types.ObjectId(sid) })), '| in supplier:', !!(await db.collection('supplier').findOne({ _id: new mongoose.Types.ObjectId(sid) })));
}
await mongoose.disconnect();
