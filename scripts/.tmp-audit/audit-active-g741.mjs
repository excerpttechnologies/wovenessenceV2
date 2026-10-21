import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';
import fs from 'fs';

const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const G741 = '6a9986a73ce59c48713fedda';
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', supplierId: G741 }).toArray();
console.log('G741 IN_STOCK rows', rows.length);
const group = (fn) => {
  const m = {};
  for (const r of rows) { const k = fn(r); m[k] = (m[k] || 0) + 1; }
  return Object.entries(m).sort((a, b) => b[1] - a[1]);
};
console.log('sources', JSON.stringify(group((r) => txt(r.source) || '(blank)')));
console.log('businesses', JSON.stringify(group((r) => txt(r.businessId))));
console.log('locations', JSON.stringify(group((r) => txt(r.currentLocationId || r.locationId))));
console.log('distinct barcodeNo', new Set(rows.map((r) => txt(r.barcodeNo))).size);
console.log('distinct itemCode', new Set(rows.map((r) => txt(r.itemCode))).size);
console.log('distinct grcNo', new Set(rows.map((r) => txt(r.grcNo))).size);
console.log('grc nonblank', rows.filter((r) => txt(r.grcNo)).length);
console.log('invoice-ish fields', Object.keys(rows[0] || {}).filter((k) => /invoice|supplier|grc|source|batch/i.test(k)));
console.log('samples');
for (const r of rows.slice(0, 12)) {
  console.log(JSON.stringify({ _id: String(r._id), barcodeNo: r.barcodeNo, itemCode: r.itemCode, itemName: r.itemName, qty: r.qtyNum ?? r.qty, source: r.source, grcNo: r.grcNo, billSlNo: r.billSlNo, barcodeGenerated: r.barcodeGenerated, supplierCode: r.supplierCode, biz: r.businessId, loc: r.currentLocationId || r.locationId, createdAt: r.createdAt }));
}

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const exByCode = new Map();
for (const r of excel) {
  const k = txt(r['Item Code']);
  if (!exByCode.has(k)) exByCode.set(k, []);
  exByCode.get(k).push(r);
}
const exUnassigned = excel.filter((r) => /^\(?unassigned\)?$/i.test(txt(r['Supplier Code'])) || /^\(?unassigned\)?$/i.test(txt(r['Supplier Name'])) || txt(r['Supplier Code']) === '0');
console.log('\nEXCEL rows', excel.length, 'unassigned rows', exUnassigned.length);
console.log('excel unassigned with grc', exUnassigned.filter((r) => txt(r['GRC No'])).length, 'with invoice', exUnassigned.filter((r) => txt(r['Supplier Invoice No'])).length, 'with purchase date', exUnassigned.filter((r) => txt(r['Purchase Date'])).length);
console.log('excel unassigned qty sum', exUnassigned.reduce((a, r) => a + (Number(r['Open Qty']) || 0), 0));
const dbCodes = new Map();
for (const r of rows) { const k = txt(r.barcodeNo); dbCodes.set(k, (dbCodes.get(k) || 0) + 1); }
let inExcel = 0, notInExcel = 0, excelUnassigned = 0, excelAssigned = 0, examplesAssigned = [];
for (const [code, n] of dbCodes) {
  const list = exByCode.get(code);
  if (!list) { notInExcel += n; continue; }
  inExcel += n;
  const allUn = list.every((r) => /^\(?unassigned\)?$/i.test(txt(r['Supplier Code'])) || /^\(?unassigned\)?$/i.test(txt(r['Supplier Name'])) || txt(r['Supplier Code']) === '0');
  if (allUn) excelUnassigned += n;
  else { excelAssigned += n; if (examplesAssigned.length < 10) examplesAssigned.push({ code, n, list: list.slice(0, 3).map((r) => ({ sup: r['Supplier Code'], name: r['Supplier Name'], grc: r['GRC No'], inv: r['Supplier Invoice No'], qty: r['Open Qty'] })) }); }
}
console.log('G741 rows matched to Excel by barcodeNo: inExcel', inExcel, 'notInExcel', notInExcel, 'excelUnassigned', excelUnassigned, 'excelAssigned', excelAssigned);
console.log('examplesAssigned', JSON.stringify(examplesAssigned, null, 2));

const grcNos = [...new Set(rows.map((r) => txt(r.grcNo)).filter(Boolean))];
console.log('\ndistinct G741 GRC nos', grcNos.length, grcNos.slice(0, 20));
if (grcNos.length) {
  const grcs = await db.collection('grc').find({ $or: [{ grcNo: { $in: grcNos } }, { grcNumber: { $in: grcNos } }, { docNo: { $in: grcNos } }] }).limit(50).toArray();
  console.log('grc docs found', grcs.length);
  for (const g of grcs.slice(0, 10)) console.log(JSON.stringify({ _id: String(g._id), grcNo: g.grcNo || g.grcNumber || g.docNo, supplierId: g.supplierId, supplierName: g.supplierName, items: g.items?.length, itemCodes: (g.items || []).slice(0, 5).map((i) => i.itemCode) }));
}

await c.close();
