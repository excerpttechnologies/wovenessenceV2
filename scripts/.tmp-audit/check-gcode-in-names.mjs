import XLSX from 'xlsx';
import fs from 'fs';
import { MongoClient } from 'mongodb';
const txt = (v) => String(v ?? '').trim();
const wb = XLSX.readFile('C:/Users/Admin/Downloads/hsr opening 19 10 (1).xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
let nameIsG = 0;
let codeNotG = 0;
const samples = [];
for (const r of rows) {
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (/^G\d+/i.test(name) && !/^G\d+/i.test(code)) { nameIsG++; if (samples.length < 10) samples.push({ itemCode: txt(r['Item Code']), item: txt(r['Item Name']), code, name }); }
  if (/^G\d+/i.test(code)) codeNotG++;
}
console.log(JSON.stringify({ rows: rows.length, nameLooksLikeGCode: nameIsG, properGCodeRows: codeNotG }, null, 2));
console.log(JSON.stringify(samples, null, 1));
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
for (const coll of ['contact', 'supplier']) {
  const weird = await db.collection(coll).find({ businessName: /^\s*G\d+/i }).project({ contactId: 1, businessName: 1 }).limit(20).toArray();
  console.log(`${coll} names starting with G-code:`, weird.length);
  for (const w of weird) console.log(' ', JSON.stringify({ code: w.contactId, name: w.businessName }));
  const exact = await db.collection(coll).find({ businessName: /^G\d+\s*$/i }).project({ contactId: 1, businessName: 1 }).limit(20).toArray();
  console.log(`${coll} names exactly a G-code:`, exact.length);
  for (const w of exact) console.log(' ', JSON.stringify({ code: w.contactId, name: w.businessName }));
}
await c.close();
