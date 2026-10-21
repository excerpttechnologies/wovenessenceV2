/* READ ONLY: every field, in every collection, that holds a contact _id */
import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const kindById = new Map();
for await (const d of db.collection('contact').find({}, { projection: { contactKind: 1 } })) kindById.set(String(d._id), d.contactKind);

const colls = (await db.listCollections().toArray()).map((c) => c.name).filter((n) => n !== 'contact' && !n.startsWith('system.'));
const HEX = /^[0-9a-f]{24}$/i;

function walk(v, path, out) {
  if (v == null) return;
  if (v instanceof mongoose.Types.ObjectId || v?._bsontype === 'ObjectId') {
    const s = String(v); if (kindById.has(s)) out.push([path, 'objectId', kindById.get(s)]); return;
  }
  if (typeof v === 'string') { if (HEX.test(v) && kindById.has(v)) out.push([path, 'string', kindById.get(v)]); return; }
  if (Array.isArray(v)) { v.forEach((x) => walk(x, path + '[]', out)); return; }
  if (typeof v === 'object' && !(v instanceof Date) && !Buffer.isBuffer(v)) for (const [k, x] of Object.entries(v)) { if (k !== '_id') walk(x, path ? path + '.' + k : k, out); }
}

const report = {};
for (const name of colls) {
  const n = await db.collection(name).estimatedDocumentCount();
  if (!n) continue;
  const cursor = db.collection(name).find({});
  for await (const doc of cursor) {
    const hits = []; walk(doc, '', hits);
    for (const [path, type, kind] of hits) {
      const key = name + ' :: ' + path;
      report[key] ||= { total: 0, types: {}, kinds: {} };
      report[key].total++; report[key].types[type] = (report[key].types[type] || 0) + 1; report[key].kinds[kind] = (report[key].kinds[kind] || 0) + 1;
    }
  }
}
for (const [k, v] of Object.entries(report).sort()) console.log(k.padEnd(60), JSON.stringify(v));

/* also: contact-ish named fields whose value does NOT resolve (orphans / other shapes) */
console.log('\n--- contact-named fields, resolution ---');
const FIELD = /^(supplierId|customerId|agentId|salesPersonId|vendorId|contactId|partyId)$/;
for (const name of colls) {
  const sample = await db.collection(name).findOne({});
  if (!sample) continue;
  const fields = Object.keys(sample).filter((k) => FIELD.test(k));
  for (const f of fields) {
    const agg = await db.collection(name).aggregate([{ $group: { _id: { $type: '$' + f }, n: { $sum: 1 } } }]).toArray();
    let resolved = 0, orphan = 0, blank = 0;
    for await (const d of db.collection(name).find({}, { projection: { [f]: 1 } })) {
      const v = d[f]; if (v == null || v === '') { blank++; continue; }
      kindById.has(String(v)) ? resolved++ : orphan++;
    }
    console.log((name + '.' + f).padEnd(45), 'types', JSON.stringify(agg), '| resolved', resolved, '| orphan', orphan, '| blank', blank);
  }
}
await mongoose.disconnect();
