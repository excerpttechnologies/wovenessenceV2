import { MongoClient } from 'mongodb';
import XLSX from 'xlsx';

const URI = 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const DB = 'grooretailerp1';
const txt = (v) => String(v ?? '').trim();
const isOid = (v) => /^[0-9a-f]{24}$/i.test(txt(v));
const isPlaceholder = (v) => {
  const t = txt(v);
  return !t || t === '0' || /^\(?unassigned\)?$/i.test(t);
};

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const byBarcode = new Map();
for (const r of excel) {
  const key = txt(r['Item Code']);
  if (!key) continue;
  const code = txt(r['Supplier Code']);
  const name = txt(r['Supplier Name']);
  if (isPlaceholder(code) || isPlaceholder(name)) continue;
  if (!byBarcode.has(key)) byBarcode.set(key, new Map());
  const m = byBarcode.get(key);
  const pair = `${code}|${name}`;
  m.set(pair, (m.get(pair) || 0) + 1);
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(DB);
const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const supplierById = new Map(contacts.map((v) => [String(v._id), v]));
const supplierByCode = new Map();
for (const v of contacts) if (txt(v.contactId) && !supplierByCode.has(txt(v.contactId))) supplierByCode.set(txt(v.contactId), v);

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const currentCode = (r) => {
  const key = txt(r.supplierId);
  const sup = isOid(key) ? supplierById.get(key) : supplierByCode.get(key);
  return sup && !isPlaceholder(sup.businessName) ? txt(sup.contactId) : '';
};
const rows = stock.map((r) => {
  const key = txt(r.supplierId);
  const sup = isOid(key) ? supplierById.get(key) : supplierByCode.get(key);
  let status = 'resolved';
  if (!key) status = 'blank';
  else if (!sup) status = isOid(key) ? 'missing-id' : 'missing-code';
  else if (isPlaceholder(sup.businessName)) status = 'placeholder';
  else if (!isOid(key) && txt(r.businessId) && txt(sup.businessId) !== txt(r.businessId)) status = 'business-mismatch';
  return { r, key, sup, status, current: currentCode(r) };
});

const byBarcodeStock = new Map();
for (const x of rows) {
  const k = txt(x.r.barcodeNo);
  if (!byBarcodeStock.has(k)) byBarcodeStock.set(k, []);
  byBarcodeStock.get(k).push(x);
}

const stats = { safe: 0, noCandidate: 0, conflictExcel: 0, missingMaster: 0, stockConflict: 0, already: 0 };
const safeByOldKey = new Map();
const safeByTarget = new Map();
const examples = { safe: [], noCandidate: [], conflictExcel: [], missingMaster: [], stockConflict: [] };

for (const x of rows) {
  if (x.status === 'resolved') continue;
  const k = txt(x.r.barcodeNo);
  const m = byBarcode.get(k);
  const pairs = m ? [...m.entries()] : [];
  const codes = new Set(pairs.map(([p]) => p.split('|')[0]));
  if (!pairs.length) {
    stats.noCandidate++;
    if (examples.noCandidate.length < 5) examples.noCandidate.push({ key: x.key, status: x.status, barcodeNo: k, itemCode: txt(x.r.itemCode), grc: txt(x.r.grcNo) });
    continue;
  }
  if (codes.size > 1) {
    stats.conflictExcel++;
    if (examples.conflictExcel.length < 5) examples.conflictExcel.push({ key: x.key, status: x.status, barcodeNo: k, pairs });
    continue;
  }
  const targetCode = [...codes][0];
  const master = supplierByCode.get(targetCode);
  if (!master) {
    stats.missingMaster++;
    if (examples.missingMaster.length < 5) examples.missingMaster.push({ key: x.key, status: x.status, barcodeNo: k, targetCode });
    continue;
  }
  const others = (byBarcodeStock.get(k) || []).filter((y) => y !== x && y.current);
  const othersDiff = [...new Set(others.map((y) => y.current))].filter((c) => c !== targetCode);
  if (othersDiff.length) {
    stats.stockConflict++;
    if (examples.stockConflict.length < 10) examples.stockConflict.push({ key: x.key, status: x.status, barcodeNo: k, targetCode, others: othersDiff, n: others.length });
    continue;
  }
  if (x.current === targetCode) {
    stats.already++;
    continue;
  }
  stats.safe++;
  safeByOldKey.set(`${x.status}|${x.key || '(blank)'}`, (safeByOldKey.get(`${x.status}|${x.key || '(blank)'}`) || 0) + 1);
  safeByTarget.set(targetCode, (safeByTarget.get(targetCode) || 0) + 1);
  if (examples.safe.length < 15) examples.safe.push({ oldKey: x.key || '(blank)', status: x.status, barcodeNo: k, itemCode: txt(x.r.itemCode), grc: txt(x.r.grcNo), targetCode, targetId: String(master._id), targetName: master.businessName, biz: txt(x.r.businessId) });
}

console.log('stats', JSON.stringify(stats));
console.log('safeByOldKey', JSON.stringify([...safeByOldKey.entries()].sort((a, b) => b[1] - a[1])));
console.log('safeByTarget', JSON.stringify([...safeByTarget.entries()].sort((a, b) => b[1] - a[1])));
for (const [name, list] of Object.entries(examples)) {
  console.log(`\n${name} (${list.length})`);
  list.forEach((e) => console.log(' ', JSON.stringify(e)));
}

console.log('\nDUPLICATE BARCODE IN STOCK (problem rows)');
for (const x of rows) {
  if (x.status === 'resolved') continue;
  const k = txt(x.r.barcodeNo);
  const all = byBarcodeStock.get(k) || [];
  if (all.length > 1) {
    console.log(k, 'stockRows', all.length, 'currentCodes', JSON.stringify([...new Set(all.map((y) => y.current || '(none)'))]));
  }
}

await client.close();
