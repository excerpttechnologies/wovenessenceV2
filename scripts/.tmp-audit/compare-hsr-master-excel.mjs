import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));

const wb = XLSX.readFile('HSR MASTER AS ON 1510 7 40.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
console.log('master rows', rows.length);
const bySupplier = {};
for (const r of rows) {
  const k = `${txt(r['Supplier Code'])}|${txt(r['Supplier Name'])}`;
  bySupplier[k] = (bySupplier[k] || 0) + 1;
}
console.log('suppliers', JSON.stringify(Object.entries(bySupplier).sort((a, b) => b[1] - a[1])));
const byLoc = {};
for (const r of rows) { const k = txt(r['Location Name']); byLoc[k] = (byLoc[k] || 0) + 1; }
console.log('locations', JSON.stringify(Object.entries(byLoc).sort((a, b) => b[1] - a[1])));

const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const byName = new Map();
for (const v of contacts) if (txt(v.businessName)) byName.set(txt(v.businessName), v);
const locs = await db.collection('companylocation').find({}).project({ name: 1 }).toArray();
const locByName = new Map(locs.map((l) => [txt(l.name), String(l._id)]));
console.log('db locations', JSON.stringify(locs.map((l) => ({ id: String(l._id), name: l.name }))));

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', source: 'hsr_master_stock_create' }).toArray();
console.log('db master rows', stock.length);
const dbByKey = new Map();
for (const r of stock) { const k = `${txt(r.barcodeNo)}|${String(r.currentLocationId || r.locationId)}`; if (!dbByKey.has(k)) dbByKey.set(k, []); dbByKey.get(k).push(r); }

let matched = 0;
let masterWithSupplier = 0;
let dbBlank = 0;
let dbG741 = 0;
let masterRealDbBlank = 0;
let masterRealDbG741 = 0;
let masterRealDbDifferent = 0;
let masterUnassigned = 0;
let noDb = 0;
const samples = [];
for (const r of rows) {
  const item = txt(r['Item Code']);
  const locName = txt(r['Location Name']);
  const locId = locByName.get(locName);
  if (!locId) { noDb++; continue; }
  const hits = dbByKey.get(`${item}|${locId}`) || [];
  if (!hits.length) { noDb++; continue; }
  matched++;
  const mCode = txt(r['Supplier Code']);
  const mName = txt(r['Supplier Name']);
  const real = !isPlaceholder(mCode) && !isPlaceholder(mName);
  if (real) masterWithSupplier++;
  else masterUnassigned++;
  for (const d of hits) {
    const dKey = txt(d.supplierId);
    const dSup = /^[0-9a-f]{24}$/i.test(dKey) ? contacts.find((v) => String(v._id) === dKey) : byCode.get(dKey);
    const dReal = dSup && !isPlaceholder(dSup.businessName);
    if (!dKey) dbBlank++;
    if (dKey === '6a9986a73ce59c48713fedda') dbG741++;
    if (real && !dReal) {
      if (!dKey) masterRealDbBlank++;
      else if (dKey === '6a9986a73ce59c48713fedda') masterRealDbG741++;
      else masterRealDbDifferent++;
      if (samples.length < 20) samples.push({ item, loc: locName, master: `${mCode}|${mName}`, dbSupplier: dSup ? `${dSup.contactId}|${dSup.businessName}` : `MISSING|${dKey}` });
    }
  }
}
console.log(JSON.stringify({ matched, noDb, masterWithSupplier, masterUnassigned, dbBlank, dbG741, masterRealDbBlank, masterRealDbG741, masterRealDbDifferent }));
console.log('samples', JSON.stringify(samples, null, 2));
await c.close();
