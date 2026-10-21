import { MongoClient, ObjectId } from 'mongodb';

const URI = process.env.MONGODB_URI || 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const DB = process.env.MONGODB_DB || 'grooretailerp1';

const txt = (v) => String(v ?? '').trim();

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(DB);

console.log('DB:', DB);
const cols = (await db.listCollections().toArray()).map((c) => c.name).sort();
console.log('collections:', cols.join(', '));

for (const name of ['barcodeLabel', 'contact', 'supplier', 'business', 'companylocation']) {
  try {
    console.log(name, 'count=', await db.collection(name).countDocuments());
  } catch (e) {
    console.log(name, 'ERROR', e.message);
  }
}

const businesses = await db.collection('business').find({}).project({ name: 1, isMainBranch: 1 }).toArray();
console.log('\nBUSINESSES');
businesses.forEach((b) => console.log(' ', String(b._id), b.name, b.isMainBranch ? '[MAIN]' : ''));

const locations = await db.collection('companylocation').find({}).project({ name: 1, businessId: 1 }).toArray();
console.log('\nLOCATIONS');
locations.forEach((l) => console.log(' ', String(l._id), l.name, 'biz=', String(l.businessId)));

for (const coll of ['contact', 'supplier']) {
  const byKind = await db.collection(coll).aggregate([
    { $group: { _id: { kind: '$contactKind', biz: '$businessId' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  console.log(`\n${coll} by contactKind/business:`);
  byKind.forEach((r) => console.log(' ', JSON.stringify(r._id), r.n));
}

console.log('\nSUPPLIER MASTER RECORDS for G741 / G589');
for (const coll of ['contact', 'supplier']) {
  const rows = await db.collection(coll).find({
    $or: [
      { contactId: { $in: ['G741', 'G589', 'g741', 'g589'] } },
      { contactId: { $regex: '^\\s*G0*(741|589)\\s*$', $options: 'i' } },
      { businessName: { $regex: 'CRN FABRICS', $options: 'i' } },
    ],
  }).toArray();
  console.log(` ${coll}: ${rows.length}`);
  rows.forEach((r) => console.log('   ', JSON.stringify({
    _id: String(r._id), contactId: r.contactId, businessName: r.businessName,
    firstName: r.firstName, lastName: r.lastName, businessId: String(r.businessId),
    contactKind: r.contactKind,
  })));
}

console.log('\nBARCODE ROWS for G741 / G589 supplierId');
for (const code of ['G741', 'G589']) {
  const filter = {
    $or: [
      { supplierId: code },
      { supplierId: new RegExp('^\\s*' + code + '\\s*$', 'i') },
    ],
  };
  const total = await db.collection('barcodeLabel').countDocuments(filter);
  const byStatus = await db.collection('barcodeLabel').aggregate([
    { $match: filter },
    { $group: { _id: { status: '$status', biz: '$businessId' }, n: { $sum: 1 } } },
    { $sort: { n: -1 } },
  ]).toArray();
  console.log(` ${code}: total=${total}`);
  byStatus.forEach((r) => console.log('   ', JSON.stringify(r._id), r.n));
  const samples = await db.collection('barcodeLabel').find(filter)
    .project({ barcodeNo: 1, supplierId: 1, supplierDescription: 1, printDescription: 1, itemName: 1, itemCode: 1, businessId: 1, locationId: 1, currentLocationId: 1, finYear: 1, status: 1, grcNo: 1, source: 1 })
    .limit(5).toArray();
  samples.forEach((r) => console.log('    sample:', JSON.stringify(r)));
}

console.log('\nDISTINCT IN-STOCK SUPPLIER KEYS');
const keys = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: { key: '$supplierId', biz: '$businessId' }, n: { $sum: 1 } } },
  { $sort: { n: -1 } },
]).toArray();
console.log('distinct (supplierId,businessId):', keys.length, 'in-stock rows:', keys.reduce((a, k) => a + k.n, 0));

const keyList = [...new Set(keys.map((k) => txt(k._id.key)).filter(Boolean))];
console.log('distinct non-empty keys:', keyList.length);
const objectIdKeys = keyList.filter((k) => /^[a-f0-9]{24}$/i.test(k));
const codeKeys = keyList.filter((k) => !/^[a-f0-9]{24}$/i.test(k));
console.log('ObjectId-looking keys:', objectIdKeys.length, 'code-looking keys:', codeKeys.length);

const allContacts = await db.collection('contact').find({
  $or: [
    { _id: { $in: objectIdKeys.map((k) => new ObjectId(k)) } },
    { contactId: { $in: codeKeys } },
  ],
}).project({ _id: 1, contactId: 1, businessName: 1, firstName: 1, lastName: 1, businessId: 1, contactKind: 1 }).toArray();
const contactById = new Map(allContacts.map((c) => [String(c._id), c]));
const contactByCode = new Map(allContacts.filter((c) => txt(c.contactId)).map((c) => [txt(c.contactId).toUpperCase(), c]));

const unresolved = [];
for (const k of keys) {
  const key = txt(k._id.key);
  if (!key) { unresolved.push({ ...k, reason: 'blank key' }); continue; }
  const hit = contactById.get(key) || contactByCode.get(key.toUpperCase());
  if (!hit) { unresolved.push({ key, biz: String(k._id.biz), n: k.n, reason: 'no contact match' }); continue; }
  if (txt(hit.businessId) !== txt(k._id.biz)) {
    unresolved.push({ key, biz: String(k._id.biz), n: k.n, reason: 'business mismatch', supplierId: String(hit._id), supplierBiz: String(hit.businessId), name: hit.businessName });
  }
}
console.log('\nUNRESOLVED / BUSINESS-MISMATCH IN-STOCK KEYS:', unresolved.length);
unresolved.slice(0, 100).forEach((u) => console.log(' ', JSON.stringify(u)));

const byReason = unresolved.reduce((a, u) => (a[u.reason] = (a[u.reason] || 0) + 1, a), {});
console.log('by reason:', byReason);
const rowCountByReason = unresolved.reduce((a, u) => (a[u.reason] = (a[u.reason] || 0) + (u.n || 0), a), {});
console.log('rows affected by reason:', rowCountByReason);

await client.close();
