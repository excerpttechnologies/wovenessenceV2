import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const norm = (v) => txt(v).toLowerCase().replace(/\s+/g, ' ').trim();
const G741 = '6a9986a73ce59c48713fedda';
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const g = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: G741 }).toArray();

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const assigned = excel.filter((r) => {
  const code = txt(r['Supplier Code']); const name = txt(r['Supplier Name']);
  return code && code !== '0' && !/^\(?unassigned\)?$/i.test(code) && name && name !== '0' && !/^\(?unassigned\)?$/i.test(name);
});
console.log('excel assigned rows', assigned.length);
const byDesc = new Map();
for (const r of assigned) {
  const k = norm(r['Print Description']);
  if (!k) continue;
  if (!byDesc.has(k)) byDesc.set(k, new Map());
  const m = byDesc.get(k); const p = `${txt(r['Supplier Code'])}|${txt(r['Supplier Name'])}`; m.set(p, (m.get(p) || 0) + 1);
}
let descMatchUnique = 0, descMatchMulti = 0, descNo = 0;
const descTargets = {};
for (const r of g) {
  const m = byDesc.get(norm(r.printDescription));
  if (!m) { descNo++; continue; }
  const codes = [...new Set([...m.keys()].map((p) => p.split('|')[0]))];
  if (codes.length === 1) { descMatchUnique++; descTargets[codes[0]] = (descTargets[codes[0]] || 0) + 1; }
  else descMatchMulti++;
}
console.log('G741 by exact printDescription: unique', descMatchUnique, 'multi', descMatchMulti, 'none', descNo, 'targets', JSON.stringify(descTargets));

const grc = await db.collection('grc').findOne({});
console.log('grc keys', Object.keys(grc || {}));
if (grc?.items?.[0]) console.log('grc item keys', Object.keys(grc.items[0]), JSON.stringify(grc.items[0]).slice(0, 800));
const pi = await db.collection('purchaseinvoice').findOne({});
console.log('purchaseinvoice keys', Object.keys(pi || {}));
if (pi?.items?.[0]) console.log('pi item keys', Object.keys(pi.items[0]), JSON.stringify(pi.items[0]).slice(0, 800));

const codes = [...new Set(g.map((r) => txt(r.barcodeNo)).filter(Boolean))];
console.log('G741 distinct barcodeNo', codes.length);
for (const coll of ['grc', 'purchaseinvoice']) {
  const supplierByCode = new Map();
  let docsMatched = 0;
  for (let i = 0; i < codes.length; i += 1000) {
    const chunk = codes.slice(i, i + 1000);
    const docs = await db.collection(coll).find({
      $or: [
        { 'items.itemCode': { $in: chunk } },
        { 'items.barcodeNo': { $in: chunk } },
        { itemCode: { $in: chunk } },
        { barcodeNo: { $in: chunk } },
      ],
    }).project({ supplierId: 1, supplierName: 1, items: 1, itemCode: 1, barcodeNo: 1 }).toArray();
    docsMatched += docs.length;
    for (const d of docs) {
      const s = String(d.supplierId || '');
      if (!s) continue;
      for (const it of d.items || []) {
        const k = txt(it.itemCode) || txt(it.barcodeNo);
        if (chunk.includes(k)) {
          if (!supplierByCode.has(k)) supplierByCode.set(k, new Set());
          supplierByCode.get(k).add(s);
        }
      }
      const k = txt(d.itemCode) || txt(d.barcodeNo);
      if (chunk.includes(k)) {
        if (!supplierByCode.has(k)) supplierByCode.set(k, new Set());
        supplierByCode.get(k).add(s);
      }
    }
  }
  const unique = [...supplierByCode.entries()].filter(([, v]) => v.size === 1);
  const targetCounts = {};
  for (const [, v] of unique) { const s = [...v][0]; targetCounts[s] = (targetCounts[s] || 0) + 1; }
  console.log(coll, 'docsMatched', docsMatched, 'codesWithSupplier', supplierByCode.size, 'uniqueSupplier', unique.length, 'targets', JSON.stringify(targetCounts).slice(0, 1500));
}

const nonG = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: { $ne: G741 } }).toArray();
const nonByBarcode = new Map();
for (const r of nonG) { const k = txt(r.barcodeNo); if (!nonByBarcode.has(k)) nonByBarcode.set(k, []); nonByBarcode.get(k).push(r); }
let sameBarcode = 0, sameBarcodeSameSupplier = 0;
const sameTargets = {};
for (const r of g) {
  const list = nonByBarcode.get(txt(r.barcodeNo));
  if (!list?.length) continue;
  sameBarcode++;
  const sups = [...new Set(list.map((x) => String(x.supplierId)))];
  if (sups.length === 1) { sameBarcodeSameSupplier++; sameTargets[sups[0]] = (sameTargets[sups[0]] || 0) + 1; }
}
console.log('G741 barcodeNos also in non-G741 stock', sameBarcode, 'unique supplier', sameBarcodeSameSupplier, 'targets', JSON.stringify(sameTargets));

await c.close();
