import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const candidates = JSON.parse(fs.readFileSync('scripts/.tmp-audit/active-blank-supplier-apply.json', 'utf8'));
const ids = candidates.map((x) => x.targetId);
const contacts = await db.collection('contact').find({ _id: { $in: [...new Set(ids)].map((v) => new ObjectId(v)) } }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const rows = await db.collection('barcodeLabel').find({ _id: { $in: candidates.map((x) => new ObjectId(x._id)) } }).toArray();
const byTarget = {};
for (const r of rows) {
  const s = byId.get(String(r.supplierId));
  const k = s ? `${s.contactId}|${s.businessName}` : 'UNRESOLVED';
  byTarget[k] = (byTarget[k] || 0) + 1;
}
console.log('updated rows', rows.length, 'targets', JSON.stringify(Object.entries(byTarget).sort((a, b) => b[1] - a[1])));

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const placeholder = '6a9986a73ce59c48713fedda';
const blank = stock.filter((r) => !txt(r.supplierId));
const g741 = stock.filter((r) => String(r.supplierId) === placeholder);
console.log('remaining blank', blank.length, 'G741 placeholder', g741.length);
console.log('blank sources', JSON.stringify(blank.reduce((a, r) => { const k = txt(r.source) || '(blank)'; a[k] = (a[k] || 0) + 1; return a; }, {})));
console.log('blank sample', JSON.stringify(blank.slice(0, 10).map((r) => ({ barcodeNo: r.barcodeNo, itemCode: r.itemCode, source: r.source, grcNo: r.grcNo }))));

const book = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(book.Sheets[book.SheetNames[0]], { defval: '', raw: false });
const exByCode = new Map();
for (const r of excel) {
  const k = txt(r['Item Code']);
  if (!k) continue;
  exByCode.set(k, { code: txt(r['Supplier Code']), name: txt(r['Supplier Name']) });
}
const trulyUnassigned = blank.filter((r) => {
  const e = exByCode.get(txt(r.barcodeNo));
  return e && (/^\(?unassigned\)?$/i.test(e.code) || /^\(?unassigned\)?$/i.test(e.name) || e.code === '0');
});
console.log('blank rows confirmed unassigned in Excel', trulyUnassigned.length, 'of', blank.length);

await c.close();
