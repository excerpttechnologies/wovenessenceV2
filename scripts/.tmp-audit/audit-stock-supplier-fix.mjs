import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';

const URI = 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const DB = 'grooretailerp1';
const BIZ = '6a853cdefb266c4358beb548';
const txt = (v) => String(v ?? '').trim();
const isOid = (v) => /^[0-9a-f]{24}$/i.test(txt(v));
const isPlaceholder = (v) => {
  const t = txt(v);
  return !t || t === '0' || /^\(?unassigned\)?$/i.test(t);
};

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excel = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });

const byBarcode = new Map();
const byItemCode = new Map();
const push = (map, key, pair) => {
  if (!key) return;
  if (!map.has(key)) map.set(key, new Map());
  const m = map.get(key);
  m.set(pair, (m.get(pair) || 0) + 1);
};
for (const r of excel) {
  const pair = `${txt(r['Supplier Code'])}|${txt(r['Supplier Name'])}`;
  push(byBarcode, txt(r['Item Code']), pair);
  push(byItemCode, txt(r['Item Code']), pair);
}

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(DB);

const contacts = await db.collection('contact').find({ contactKind: 'Supplier' }).toArray();
const supplierById = new Map(contacts.map((v) => [String(v._id), v]));
const supplierByCode = new Map();
for (const v of contacts) if (txt(v.contactId) && !supplierByCode.has(txt(v.contactId))) supplierByCode.set(txt(v.contactId), v);

const stock = await db.collection('barcodeLabel').find({ status: 'IN_STOCK' }).toArray();
const rows = stock.map((r) => {
  const key = txt(r.supplierId);
  const byId = isOid(key) ? supplierById.get(key) : null;
  const byCode = !isOid(key) && key ? supplierByCode.get(key) : null;
  const sup = byId || byCode || null;
  let status = 'resolved';
  if (!key) status = 'blank';
  else if (!sup) status = isOid(key) ? 'missing-id' : 'missing-code';
  else if (isPlaceholder(sup.businessName)) status = 'placeholder';
  else if (byCode && txt(r.businessId) && txt(sup.businessId) !== txt(r.businessId)) status = 'business-mismatch';
  return { r, key, sup, status };
});

const counts = {};
for (const x of rows) {
  counts[x.status] = (counts[x.status] || 0) + 1;
}
console.log('IN_STOCK rows:', rows.length);
console.log('status counts:', JSON.stringify(counts));

function candidates(x) {
  const out = [];
  const add = (label, map) => {
    const key = label === 'barcodeNo' ? txt(x.r.barcodeNo) : txt(x.r.itemCode);
    const m = map.get(key);
    if (!m) return;
    const pairs = [...m.entries()].filter(([p]) => {
      const [code, name] = p.split('|');
      return !isPlaceholder(code) && !isPlaceholder(name);
    });
    if (!pairs.length) return;
    const codes = new Set(pairs.map(([p]) => p.split('|')[0]));
    out.push({ key: label, value: key, pairs: pairs.sort((a, b) => b[1] - a[1]), unique: codes.size === 1, code: codes.size === 1 ? [...codes][0] : '' });
  };
  add('barcodeNo', byBarcode);
  add('itemCode', byItemCode);
  return out;
}

console.log('\nPROBLEM GROUPS');
const groups = new Map();
for (const x of rows) {
  if (x.status === 'resolved') continue;
  const gkey = `${x.status}|${x.key || '(blank)'}|${txt(x.r.businessId)}|${txt(x.r.source)}`;
  if (!groups.has(gkey)) groups.set(gkey, []);
  groups.get(gkey).push(x);
}
for (const [gkey, list] of [...groups.entries()].sort((a, b) => b[1].length - a[1].length)) {
  const [status, key, biz, source] = gkey.split('|');
  const c = candidates(list[0]);
  console.log(`\n${status} key=${key} biz=${biz} source=${source || '(blank)'} rows=${list.length}`);
  console.log('  sample:', JSON.stringify({ barcodeNo: txt(list[0].r.barcodeNo), itemCode: txt(list[0].r.itemCode), itemName: txt(list[0].r.itemName), printDescription: txt(list[0].r.printDescription), grcNo: txt(list[0].r.grcNo) }));
  for (const cc of c) {
    const top = cc.pairs.slice(0, 6).map(([p, n]) => `${p} x${n}`).join('; ');
    console.log(`  ${cc.key} ${cc.value || '(blank)'} unique=${cc.unique} code=${cc.code || '-'} ${top}`);
  }
  const uniqByBarcode = new Set();
  for (const x of list) {
    const cc = candidates(x).find((v) => v.key === 'barcodeNo' && v.unique);
    if (cc) uniqByBarcode.add(cc.code);
  }
  if (uniqByBarcode.size === 1) {
    const code = [...uniqByBarcode][0];
    const master = supplierByCode.get(code);
    console.log(`  VERIFIED by all barcodeNo -> ${code} master=${master ? String(master._id) : 'MISSING'} name=${master?.businessName || ''}`);
  } else if (uniqByBarcode.size > 1) {
    console.log(`  CONFLICT by barcodeNo -> ${[...uniqByBarcode].join(',')}`);
  } else {
    console.log('  NO single verified barcodeNo mapping');
  }
}

console.log('\nCANDIDATE MASTERS');
for (const code of ['G1267', 'G592', 'G1303', 'G916', 'G648', 'G1262', 'G29', 'G1315', 'G1311', 'G741', 'G1260', 'G742', 'S4']) {
  const m = supplierByCode.get(code);
  console.log(code, m ? `${m._id} | ${m.businessName} | biz=${m.businessId}` : 'NOT FOUND');
}

console.log('\nG741 ITEM HISTORY');
for (const itemCode of ['60016', '53626', '60026']) {
  const bcs = stock.filter((r) => txt(r.itemCode) === itemCode || txt(r.barcodeNo) === itemCode);
  const ids = bcs.map((r) => r._id);
  const [grcs, pis, moves, items] = await Promise.all([
    db.collection('grc').find({ $or: [{ itemCode }, { barcodeNo: itemCode }] }).limit(5).toArray(),
    db.collection('purchaseinvoice').find({ $or: [{ itemCode }, { barcodeNo: itemCode }] }).limit(5).toArray(),
    ids.length ? db.collection('stockmovement').find({ barcodeId: { $in: ids } }).limit(20).toArray() : [],
    db.collection('item').find({ $or: [{ itemCode }, { name: itemCode }] }).limit(5).toArray(),
  ]);
  console.log(itemCode, JSON.stringify({ barcodes: bcs.length, grc: grcs.length, purchaseinvoice: pis.length, movements: moves.length, items: items.length, grcSample: grcs.slice(0, 2), piSample: pis.slice(0, 2), itemSample: items.map((i) => ({ _id: String(i._id), name: i.name, itemCode: i.itemCode, supplierId: i.supplierId })) }));
}

await client.close();
