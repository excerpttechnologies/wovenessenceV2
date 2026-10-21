import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const cls = { resolved: 0, placeholder: 0, missing: 0, blankName: 0 };
const missingKeys = new Map();
const names = {};
const locs = {};
for (const r of stock) {
  const key = txt(r.supplierId);
  const sup = /^[0-9a-f]{24}$/i.test(key) ? byId.get(key) : byCode.get(key);
  let kind;
  if (!key) { kind = 'missing'; missingKeys.set('(blank)', (missingKeys.get('(blank)') || 0) + 1); }
  else if (!sup) { kind = 'missing'; missingKeys.set(key, (missingKeys.get(key) || 0) + 1); }
  else if (isPlaceholder(sup.businessName)) kind = 'placeholder';
  else if (!txt(sup.businessName)) kind = 'blankName';
  else { kind = 'resolved'; names[txt(sup.contactId)] = (names[txt(sup.contactId)] || 0) + 1; }
  cls[kind]++;
  const lk = txt(r.locationId || r.currentLocationId);
  locs[lk] = (locs[lk] || 0) + 1;
}
console.log('classification', JSON.stringify(cls));
console.log('locations', JSON.stringify(Object.entries(locs).sort((a, b) => b[1] - a[1])));
console.log('missing keys', JSON.stringify([...missingKeys.entries()].sort((a, b) => b[1] - a[1]).slice(0, 20)));
console.log('top resolved names', JSON.stringify(Object.entries(names).sort((a, b) => b[1] - a[1]).slice(0, 10)));
const g = stock.filter((r) => txt(r.supplierId) === '6a9986a73ce59c48713fedda');
console.log('G741 total', g.length, 'by location', JSON.stringify(g.reduce((a, r) => { const k = txt(r.locationId || r.currentLocationId); a[k] = (a[k] || 0) + 1; return a; }, {})));
const fixed = JSON.parse(fs.readFileSync('scripts/.tmp-audit/active-blank-supplier-apply.json', 'utf8'));
const fixedIds = new Set(fixed.map((x) => x._id));
const fixedRows = stock.filter((r) => fixedIds.has(String(r._id)));
const fixedOk = fixedRows.filter((r) => {
  const sup = byId.get(String(r.supplierId));
  return sup && txt(sup.contactId) === (fixed.find((x) => x._id === String(r._id)) || {}).targetCode;
});
console.log('fixed rows', fixedRows.length, 'correct', fixedOk.length);
const dup = await db.collection('barcodeLabel').aggregate([
  { $match: { status: 'IN_STOCK' } },
  { $group: { _id: { barcodeNo: '$barcodeNo', locationId: '$locationId', businessId: '$businessId' }, n: { $sum: 1 } } },
  { $match: { n: { $gt: 1 } } },
  { $count: 'groups' },
]).toArray();
console.log('duplicate barcode/location/business groups', JSON.stringify(dup));
await c.close();
