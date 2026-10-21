import XLSX from 'xlsx';
import { MongoClient } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const norm = (v) => txt(v).replace(/\s+/g, ' ').toLowerCase();
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const excel = new Map();
for (const r of rows) {
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (!code || isPlaceholder(code) || isPlaceholder(name)) continue;
  excel.set(code, name);
}
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const reportName = (r) => {
  const key = txt(r.supplierId);
  if (!key) return null;
  const sup = byId.get(key) || byCode.get(key);
  if (!sup) return null;
  return { code: txt(sup.contactId), name: txt(sup.businessName) };
};
const bySupplier = new Map();
for (const r of stock) {
  const s = reportName(r);
  if (!s || !s.code) continue;
  if (!bySupplier.has(s.code)) bySupplier.set(s.code, { name: s.name, n: 0 });
  bySupplier.get(s.code).n++;
}
let exact = 0;
let whitespace = 0;
let real = 0;
const mismatches = [];
for (const [code, info] of bySupplier) {
  const ex = excel.get(code);
  if (!ex) continue;
  if (info.name === ex) exact++;
  else if (norm(info.name) === norm(ex)) { whitespace++; }
  else { real++; if (mismatches.length < 20) mismatches.push({ code, excel: ex, db: info.name, stockRows: info.n }); }
}
console.log(JSON.stringify({ supplierCodesInStock: bySupplier.size, compared: exact + whitespace + real, exact, whitespaceOnly: whitespace, mismatches: real }, null, 2));
console.log('mismatch list', JSON.stringify(mismatches, null, 2));
for (const code of ['G1317', 'G1319', 'G1318', 'G1326', 'G1328', 'G1325', 'G1323', 'G1320']) {
  const info = bySupplier.get(code);
  console.log(code, 'excel', excel.get(code) || '(placeholder)', '| report', info ? `${info.name} (${info.n} rows)` : 'no stock');
}
await c.close();
