import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const isPlaceholder = (v) => {
  const t = txt(v);
  return !t || t === '0' || /^\(?unassigned\)?$/i.test(t);
};
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const byId = new Map(contacts.map((v) => [String(v._id), v]));

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const exByBarcode = new Map();
const exUnassigned = new Map();
for (const r of excel) {
  const k = txt(r['Item Code']);
  if (!k) continue;
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (isPlaceholder(code) || isPlaceholder(name)) {
    if (!exUnassigned.has(k)) exUnassigned.set(k, 0);
    exUnassigned.set(k, exUnassigned.get(k) + 1);
    continue;
  }
  if (!exByBarcode.has(k)) exByBarcode.set(k, new Map());
  const m = exByBarcode.get(k); const p = `${code}|${name}`; m.set(p, (m.get(p) || 0) + 1);
}

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const blank = stock.filter((r) => !txt(r.supplierId));
console.log('active blank supplier rows', blank.length);
const grp = (fn) => { const m = {}; for (const r of blank) { const k = fn(r); m[k] = (m[k] || 0) + 1; } return Object.entries(m).sort((a, b) => b[1] - a[1]); };
console.log('sources', JSON.stringify(grp((r) => txt(r.source) || '(blank)')));
console.log('businesses', JSON.stringify(grp((r) => txt(r.businessId))));
console.log('locations', JSON.stringify(grp((r) => txt(r.currentLocationId || r.locationId))));
console.log('has barcodeGenerated', blank.filter((r) => txt(r.barcodeGenerated)).length, 'has supplierCode', blank.filter((r) => txt(r.supplierCode)).length, 'has supplierDescription', blank.filter((r) => txt(r.supplierDescription)).length);
console.log('samples');
for (const r of blank.slice(0, 15)) console.log(JSON.stringify({ _id: String(r._id), barcodeNo: r.barcodeNo, itemCode: r.itemCode, itemName: r.itemName, source: r.source, grcNo: r.grcNo, barcodeGenerated: r.barcodeGenerated, supplierCode: r.supplierCode, supplierDescription: r.supplierDescription, biz: r.businessId, loc: r.currentLocationId || r.locationId, createdAt: r.createdAt }));

const stats = { byBg: 0, byExcel: 0, both: 0, disagreement: 0, noCandidate: 0, missingMaster: 0, excelUnassignedOnly: 0 };
const targets = {};
const examples = { byBg: [], byExcel: [], disagreement: [], noCandidate: [], missingMaster: [] };
for (const r of blank) {
  const bg = txt(r.barcodeGenerated);
  const bgCode = bg.includes('*') ? txt(bg.split('*')[0]) : '';
  const m = exByBarcode.get(txt(r.barcodeNo));
  const exCodes = m ? [...new Set([...m.keys()].map((p) => p.split('|')[0]))] : [];
  const exCode = exCodes.length === 1 ? exCodes[0] : '';
  const bgMaster = bgCode ? byCode.get(bgCode) : null;
  const exMaster = exCode ? byCode.get(exCode) : null;
  if (bgCode && exCode && bgCode !== exCode) { stats.disagreement++; if (examples.disagreement.length < 10) examples.disagreement.push({ barcodeNo: r.barcodeNo, bgCode, exCode, pairs: [...m.keys()] }); continue; }
  if (bgCode && !bgMaster) { stats.missingMaster++; if (examples.missingMaster.length < 10) examples.missingMaster.push({ barcodeNo: r.barcodeNo, bgCode, source: r.source }); continue; }
  if (exCode && !exMaster) { stats.missingMaster++; if (examples.missingMaster.length < 10) examples.missingMaster.push({ barcodeNo: r.barcodeNo, exCode, source: r.source }); continue; }
  if (bgCode && exCode) stats.both++;
  const target = bgCode || exCode;
  if (target) {
    const master = bgCode ? bgMaster : exMaster;
    if (bgCode && !exCode) { stats.byBg++; if (examples.byBg.length < 8) examples.byBg.push({ barcodeNo: r.barcodeNo, target, name: master.businessName, source: r.source }); }
    if (exCode && !bgCode) { stats.byExcel++; if (examples.byExcel.length < 8) examples.byExcel.push({ barcodeNo: r.barcodeNo, target, name: master.businessName, source: r.source }); }
    targets[target] = (targets[target] || 0) + 1;
  } else {
    stats.noCandidate++;
    if (exUnassigned.has(txt(r.barcodeNo))) stats.excelUnassignedOnly++;
    if (examples.noCandidate.length < 8) examples.noCandidate.push({ barcodeNo: r.barcodeNo, source: r.source, itemCode: r.itemCode, excelUnassigned: exUnassigned.has(txt(r.barcodeNo)) });
  }
}
console.log('\nBLANK RESOLUTION STATS', JSON.stringify(stats));
console.log('targets', JSON.stringify(Object.entries(targets).sort((a, b) => b[1] - a[1])));
for (const [k, v] of Object.entries(examples)) { console.log(`\n${k}`); v.forEach((e) => console.log(' ', JSON.stringify(e))); }

await c.close();
