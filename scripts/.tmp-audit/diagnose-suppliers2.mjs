import { MongoClient, ObjectId } from 'mongodb';

const URI = process.env.MONGODB_URI || 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const DB = process.env.MONGODB_DB || 'grooretailerp1';
const txt = (v) => String(v ?? '').trim();

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(DB);

const allSuppliers = [];
for (const coll of ['contact', 'supplier']) {
  const rows = await db.collection(coll).find({ contactKind: 'Supplier' }).toArray();
  rows.forEach((r) => allSuppliers.push({ coll, ...r }));
  console.log(coll, 'suppliers:', rows.length);
}

console.log('\nALL suppliers named (Unassigned) or blank:');
allSuppliers.filter((s) => /^\(unassigned\)$/i.test(txt(s.businessName)) || !txt(s.businessName))
  .forEach((s) => console.log(' ', s.coll, JSON.stringify({
    _id: String(s._id), contactId: s.contactId, businessName: s.businessName,
    businessId: String(s.businessId), createdAt: s.createdAt, updatedAt: s.updatedAt,
    firstName: s.firstName, lastName: s.lastName, remarks: s.remarks,
  })));

console.log('\nG741 full record(s):');
for (const s of allSuppliers.filter((x) => txt(x.contactId).toUpperCase() === 'G741')) {
  console.log(' ', s.coll, JSON.stringify(s, null, 2));
}

const g741 = allSuppliers.find((x) => x.coll === 'contact' && txt(x.contactId).toUpperCase() === 'G741');
if (g741) {
  console.log('\nGRC refs to G741 _id:', await db.collection('grc').countDocuments({ supplierId: g741._id }));
  console.log('GRC sample:', JSON.stringify(await db.collection('grc').find({ supplierId: g741._id }).project({ grcNumber: 1, supplierId: 1, supplierName: 1, businessId: 1, locationId: 1, grcDate: 1 }).limit(5).toArray()));
  console.log('purchaseinvoice refs:', await db.collection('purchaseinvoice').countDocuments({ supplierId: g741._id }));
  console.log('delivery refs:', await db.collection('delivery').countDocuments({ supplierId: g741._id }));
  console.log('barcode rows pointing at _id:', await db.collection('barcodeLabel').countDocuments({ supplierId: String(g741._id) }));
  console.log('barcode rows supplierId code G741:', await db.collection('barcodeLabel').countDocuments({ supplierId: 'G741' }));
  const bc = await db.collection('barcodeLabel').find({ supplierId: String(g741._id) })
    .project({ barcodeNo: 1, supplierId: 1, supplierDescription: 1, printDescription: 1, itemName: 1, itemCode: 1, businessId: 1, locationId: 1, currentLocationId: 1, finYear: 1, status: 1, grcNo: 1, source: 1, sourcePayload: 1 })
    .limit(10).toArray();
  console.log('barcode samples:', JSON.stringify(bc, null, 2));
}

console.log('\nAll codes in barcode.supplierId that are non-ObjectId (in stock):');
const codeKeys = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK', supplierId: { $not: /^[a-f0-9]{24}$/i } } },
  { $group: { _id: { key: '$supplierId', biz: '$businessId' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
codeKeys.forEach((k) => console.log(' ', JSON.stringify(k._id), k.n));

console.log('\nIn-stock keys resolving in supplier collection but NOT contact:');
const keys = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: { key: '$supplierId', biz: '$businessId' }, n: { $sum: 1 } } },
]).toArray();
const objectIdKeys = [...new Set(keys.map((k) => txt(k._id.key)).filter((k) => /^[a-f0-9]{24}$/i.test(k)))];
const contactIds = new Set((await db.collection('contact').find({ _id: { $in: objectIdKeys.map((k) => new ObjectId(k)) } }).project({ _id: 1 }).toArray()).map((r) => String(r._id)));
const supplierIds = new Set((await db.collection('supplier').find({ _id: { $in: objectIdKeys.map((k) => new ObjectId(k)) } }).project({ _id: 1 }).toArray()).map((r) => String(r._id)));
for (const k of keys) {
  const key = txt(k._id.key);
  if (!/^[a-f0-9]{24}$/i.test(key)) continue;
  if (!contactIds.has(key) && supplierIds.has(key)) console.log(' only supplier coll:', JSON.stringify(k._id), k.n);
}
console.log('not in either collection:');
for (const k of keys) {
  const key = txt(k._id.key);
  if (!/^[a-f0-9]{24}$/i.test(key)) continue;
  if (!contactIds.has(key) && !supplierIds.has(key)) console.log(' ', JSON.stringify(k._id), k.n);
}

console.log('\nSupplier master records whose names look like placeholders:');
allSuppliers.filter((s) => /^\(?unassigned\)?$/i.test(txt(s.businessName)) || /^0+$/.test(txt(s.contactId)))
  .forEach((s) => console.log(' ', s.coll, s._id, JSON.stringify(s.contactId), JSON.stringify(s.businessName)));

console.log('\nSuppliers with Excel codes whose name differs from Excel (sample G741/G589):');
for (const code of ['G741', 'G589']) {
  const rows = allSuppliers.filter((s) => txt(s.contactId).toUpperCase() === code);
  console.log(' ', code, rows.map((r) => ({ coll: r.coll, _id: String(r._id), name: r.businessName, biz: String(r.businessId) })));
}

await client.close();
