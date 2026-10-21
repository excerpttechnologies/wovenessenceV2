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
const byId = new Map();
for (const v of contacts) { if (txt(v.contactId)) byCode.set(txt(v.contactId), v); byId.set(String(v._id), v); }

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const exByBarcode = new Map();
for (const r of excel) {
  const k = txt(r['Item Code']);
  const code = txt(r['Supplier Code']); const name = txt(r['Supplier Name']);
  if (!k || isPlaceholder(code) || isPlaceholder(name)) continue;
  if (!exByBarcode.has(k)) exByBarcode.set(k, new Set());
  exByBarcode.get(k).add(code);
}

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const rows = stock.map((r) => {
  const key = txt(r.supplierId);
  const sup = /^[0-9a-f]{24}$/i.test(key) ? byId.get(key) : byCode.get(key);
  return { r, key, sup, currentCode: sup && !isPlaceholder(sup.businessName) ? txt(sup.contactId) : '' };
});
const byBarcode = new Map();
for (const x of rows) { const k = txt(x.r.barcodeNo); if (!byBarcode.has(k)) byBarcode.set(k, []); byBarcode.get(k).push(x); }

const stats = { blank: 0, target: 0, noTarget: 0, conflict: 0, supplierCodeMismatch: 0, supplierCodeMatch: 0, missingMaster: 0 };
const byTarget = {};
const byTargetSource = {};
const byTargetBiz = {};
const sampleConflicts = [];
const sampleSupplierCode = [];
const apply = [];
for (const x of rows) {
  if (x.key) continue;
  stats.blank++;
  const m = exByBarcode.get(txt(x.r.barcodeNo));
  const codes = m ? [...m] : [];
  if (codes.length !== 1) { stats.noTarget++; continue; }
  const target = codes[0];
  const master = byCode.get(target);
  if (!master) { stats.missingMaster++; continue; }
  const sc = txt(x.r.supplierCode);
  if (sc && sc !== target) { stats.supplierCodeMismatch++; if (sampleSupplierCode.length < 10) sampleSupplierCode.push({ barcodeNo: x.r.barcodeNo, supplierCode: sc, target, source: x.r.source }); continue; }
  if (sc && sc === target) stats.supplierCodeMatch++;
  const conflict = (byBarcode.get(txt(x.r.barcodeNo)) || []).filter((y) => y.currentCode && y.currentCode !== target);
  if (conflict.length) { stats.conflict++; if (sampleConflicts.length < 10) sampleConflicts.push({ barcodeNo: x.r.barcodeNo, target, conflicts: [...new Set(conflict.map((y) => y.currentCode))], n: conflict.length }); continue; }
  stats.target++;
  byTarget[target] = (byTarget[target] || 0) + 1;
  byTargetSource[`${target}|${txt(x.r.source)}`] = (byTargetSource[`${target}|${txt(x.r.source)}`] || 0) + 1;
  byTargetBiz[`${target}|${txt(x.r.businessId)}`] = (byTargetBiz[`${target}|${txt(x.r.businessId)}`] || 0) + 1;
  apply.push({ _id: x.r._id, barcodeNo: x.r.barcodeNo, oldSupplierId: x.r.supplierId, targetCode: target, targetId: String(master._id), targetName: master.businessName, source: x.r.source, biz: x.r.businessId, loc: x.r.currentLocationId || x.r.locationId, supplierCodeField: sc });
}

console.log('STATS', JSON.stringify(stats));
console.log('byTarget', JSON.stringify(Object.entries(byTarget).sort((a, b) => b[1] - a[1])));
console.log('byTargetSource', JSON.stringify(Object.entries(byTargetSource).sort((a, b) => b[1] - a[1])));
console.log('byTargetBiz', JSON.stringify(Object.entries(byTargetBiz).sort((a, b) => b[1] - a[1])));
console.log('conflicts', JSON.stringify(sampleConflicts));
console.log('supplierCode mismatches', JSON.stringify(sampleSupplierCode));
console.log('masters');
for (const code of Object.keys(byTarget)) { const m = byCode.get(code); console.log(code, m ? `${m._id} | ${m.businessName} | ${m.businessId}` : 'MISSING'); }
console.log('apply sample');
apply.slice(0, 12).forEach((a) => console.log(JSON.stringify(a)));
fs.writeFileSync('scripts/.tmp-audit/active-blank-supplier-apply.json', JSON.stringify(apply, null, 2));
console.log('wrote candidates', apply.length);

await c.close();
