import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';

const URI = 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const txt = (v) => String(v ?? '').trim();
const isOid = (v) => /^[0-9a-f]{24}$/i.test(txt(v));
const isPlaceholder = (v) => {
  const t = txt(v);
  return !t || t === '0' || /^\(?unassigned\)?$/i.test(t);
};
const codeOf = (r) => {
  const bg = txt(r.barcodeGenerated);
  if (bg) {
    const first = bg.split('*')[0].trim();
    if (first) return first;
  }
  return txt(r.supplierCode);
};

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const excelByBarcode = new Map();
for (const r of excel) {
  const k = txt(r['Item Code']);
  const code = txt(r['Supplier Code']);
  if (!k || isPlaceholder(code)) continue;
  if (!excelByBarcode.has(k)) excelByBarcode.set(k, new Set());
  excelByBarcode.get(k).add(code);
}

const c = new MongoClient(URI);
await c.connect();
const db = c.db('grooretailerp1');
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const byId = new Map(contacts.map((v) => [String(v._id), v]));
const byCode = new Map();
for (const v of contacts) if (txt(v.contactId)) byCode.set(txt(v.contactId), v);
const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();

const stats = { total: 0, resolved: 0, problem: 0, codeCandidate: 0, codeMissingMaster: 0, codeDisagreesExcel: 0, noCode: 0, bgOnly: 0, supCodeFieldOnly: 0, excelAgrees: 0 };
const groups = new Map();
for (const r of stock) {
  const key = txt(r.supplierId);
  const sup = isOid(key) ? byId.get(key) : byCode.get(key);
  const bad = !key || !sup || isPlaceholder(sup.businessName);
  if (!bad) { stats.resolved++; continue; }
  stats.problem++;
  const code = codeOf(r);
  const master = byCode.get(code);
  const ex = excelByBarcode.get(txt(r.barcodeNo));
  const groupKey = `${key || '(blank)'}|${code || '(no-code)'}|${txt(r.source) || '(blank)'}`;
  if (!groups.has(groupKey)) groups.set(groupKey, { n: 0, badMaster: 0, disagree: 0, noCode: 0, noExcel: 0, sample: r });
  const g = groups.get(groupKey);
  g.n++;
  if (!code) { stats.noCode++; g.noCode++; continue; }
  if (!master) { stats.codeMissingMaster++; g.badMaster++; continue; }
  stats.codeCandidate++;
  if (bgOnly(g.sample) === undefined) { /* noop */ }
  if (!txt(r.supplierId)) {
    if (txt(r.barcodeGenerated)) stats.bgOnly++;
    else if (txt(r.supplierCode)) stats.supCodeFieldOnly++;
  }
  if (ex) {
    if (ex.has(code)) stats.excelAgrees++;
    else { stats.codeDisagreesExcel++; g.disagree++; }
  } else g.noExcel++;
}
function bgOnly() { return undefined; }

console.log('STATS', JSON.stringify(stats));
console.log('\nGROUPS (supplierId | code | source): n, missingMaster, disagreesExcel, noCode, noExcel');
for (const [k, g] of [...groups.entries()].sort((a, b) => b[1].n - a[1].n)) {
  const r = g.sample;
  console.log(`${k}: n=${g.n} missingMaster=${g.badMaster} disagree=${g.disagree} noCode=${g.noCode} noExcel=${g.noExcel} sample=${JSON.stringify({ barcodeNo: txt(r.barcodeNo), bg: txt(r.barcodeGenerated), supCodeField: txt(r.supplierCode), current: txt(r.supplierId), itemCode: txt(r.itemCode), grc: txt(r.grcNo), biz: txt(r.businessId) })}`);
}

console.log('\nROWS WITH barcodeGenerated CODE MISSING MASTER');
for (const [k, g] of groups.entries()) {
  if (!g.badMaster) continue;
  console.log(k, 'n=', g.n, JSON.stringify({ barcodeNo: txt(g.sample.barcodeNo), bg: txt(g.sample.barcodeGenerated), itemCode: txt(g.sample.itemCode), grc: txt(g.sample.grcNo) }));
}

console.log('\nROWS WHERE BG CODE DISAGREES WITH EXCEL');
for (const [k, g] of groups.entries()) {
  if (!g.disagree) continue;
  console.log(k, 'n=', g.n, JSON.stringify({ barcodeNo: txt(g.sample.barcodeNo), bg: txt(g.sample.barcodeGenerated), excel: [...(excelByBarcode.get(txt(g.sample.barcodeNo)) || [])] }));
}

await c.close();
