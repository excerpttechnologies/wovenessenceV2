import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';

const APPLY = process.argv.includes('--apply');
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const candidates = JSON.parse(fs.readFileSync('scripts/.tmp-audit/active-blank-supplier-apply.json', 'utf8'));
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const coll = db.collection('barcodeLabel');

const ids = candidates.map((x) => new ObjectId(x._id));
const before = await coll.find({ _id: { $in: ids } }).toArray();
const beforeById = new Map(before.map((r) => [String(r._id), r]));
const mismatched = candidates.filter((x) => {
  const r = beforeById.get(x._id);
  return !r || String(r.supplierId ?? '') !== String(x.oldSupplierId ?? '') || r.status !== 'IN_STOCK';
});
console.log('candidates', candidates.length, 'loaded', before.length, 'state mismatches', mismatched.length);
if (mismatched.length) {
  console.log(JSON.stringify(mismatched.slice(0, 10), null, 2));
  await c.close();
  process.exit(1);
}

const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backupPath = `scripts/backup/active-blank-supplier-fix-${ts}.json`;
fs.mkdirSync('scripts/backup', { recursive: true });
fs.writeFileSync(backupPath, JSON.stringify(before, null, 2));
console.log('backup', backupPath, 'docs', before.length);

if (!APPLY) {
  console.log('DRY RUN — no writes. Re-run with --apply.');
  await c.close();
  process.exit(0);
}

let matched = 0;
let modified = 0;
for (let i = 0; i < candidates.length; i += 500) {
  const chunk = candidates.slice(i, i + 500);
  const ops = chunk.map((x) => ({
    updateOne: {
      filter: { _id: new ObjectId(x._id), status: 'IN_STOCK', supplierId: x.oldSupplierId ?? null },
      update: { $set: { supplierId: x.targetId } },
    },
  }));
  const res = await coll.bulkWrite(ops, { ordered: false });
  matched += res.matchedCount;
  modified += res.modifiedCount;
}
console.log('bulk result', JSON.stringify({ matched, modified }));

const after = await coll.find({ _id: { $in: ids } }).toArray();
const afterById = new Map(after.map((r) => [String(r._id), r]));
let ok = 0;
let bad = 0;
for (const x of candidates) {
  const r = afterById.get(x._id);
  if (r && String(r.supplierId) === x.targetId) ok++;
  else bad++;
}
console.log('verification', JSON.stringify({ ok, bad }));

const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map();
for (const v of contacts) if (String(v.contactId || '').trim()) byCode.set(String(v.contactId).trim(), v);
const stock = await coll.find({ status: 'IN_STOCK' }).toArray();
const placeholder = '6a9986a73ce59c48713fedda';
const counts = { resolved: 0, placeholder: 0, blank: 0 };
for (const r of stock) {
  const key = String(r.supplierId ?? '').trim();
  if (!key) counts.blank++;
  else if (key === placeholder) counts.placeholder++;
  else {
    const sup = /^[0-9a-f]{24}$/i.test(key) ? byId.get(key) : byCode.get(key);
    if (sup && String(sup.businessName || '').trim() && !/^\(?unassigned\)?$/i.test(String(sup.businessName).trim())) counts.resolved++;
    else counts.placeholder++;
  }
}
console.log('post stock counts', JSON.stringify(counts));

await c.close();
