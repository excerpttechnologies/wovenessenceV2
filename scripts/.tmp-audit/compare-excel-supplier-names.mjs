import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const excel = new Map();
for (const r of rows) {
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (!code || isPlaceholder(code) || isPlaceholder(name)) continue;
  if (!excel.has(code)) excel.set(code, new Set());
  excel.get(code).add(name);
}
console.log('excel supplier codes', excel.size);
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const missing = [];
const mismatch = [];
for (const [code, names] of excel) {
  const sup = byCode.get(code);
  if (!sup) { missing.push(code); continue; }
  if (!names.has(txt(sup.businessName))) mismatch.push({ code, excel: [...names], db: txt(sup.businessName), id: String(sup._id) });
}
console.log('missing codes', missing.length, JSON.stringify(missing.slice(0, 30)));
console.log('name mismatches', mismatch.length, JSON.stringify(mismatch.slice(0, 30), null, 2));
for (const code of ['G1328', 'G1325', 'G1323', 'G1320', 'G741']) {
  const sup = byCode.get(code);
  console.log(code, 'excel', excel.has(code) ? [...excel.get(code)] : '(placeholder)', 'db', sup ? `${sup.businessName} | ${sup._id}` : 'MISSING');
}
await c.close();
