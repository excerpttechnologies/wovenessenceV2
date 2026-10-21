import XLSX from 'xlsx';
import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const excelRows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const isPlaceholder = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const g741 = excelRows.filter((r) => isPlaceholder(r['Supplier Code']));
const named = excelRows.filter((r) => !isPlaceholder(r['Supplier Code']));
console.log('excel G741/blank rows', g741.length, 'named rows', named.length);
const g741ByItem = new Map();
for (const r of g741) {
  const k = txt(r['Item Name']);
  g741ByItem.set(k, (g741ByItem.get(k) || 0) + 1);
}
const namedByItem = new Map();
for (const r of named) {
  const k = txt(r['Item Name']);
  if (!namedByItem.has(k)) namedByItem.set(k, new Map());
  const m = namedByItem.get(k);
  const sup = `${txt(r['Supplier Code'])}|${txt(r['Supplier Name'])}`;
  m.set(sup, (m.get(sup) || 0) + 1);
}
console.log('\ntop G741 item names and same-item named suppliers:');
const top = [...g741ByItem.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12);
for (const [item, n] of top) {
  const sups = namedByItem.get(item);
  console.log(JSON.stringify({ item, g741Rows: n, namedSuppliers: sups ? [...sups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 4).map(([k, c]) => `${k} x${c}`) : [] }));
}
const focus = '10.CTNSLK-SL';
console.log(`\nfocus item ${focus}:`);
console.log(JSON.stringify({ g741Rows: g741ByItem.get(focus) || 0, namedSuppliers: namedByItem.get(focus) ? [...namedByItem.get(focus).entries()] : [] }, null, 1));
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
console.log('\ncollections:', (await db.listCollections().toArray()).map((x) => x.name).join(', '));
const g741Id = '6a9986a73ce59c48713fedda';
const focusRows = await db.collection('barcodeLabel').find({ $or: [{ itemCode: focus }, { itemName: focus }] }).project({ barcodeNo: 1, supplierId: 1, itemCode: 1, itemName: 1, status: 1 }).limit(500).toArray();
const supCounts = new Map();
for (const r of focusRows) { const k = txt(r.supplierId) || '(blank)'; supCounts.set(k, (supCounts.get(k) || 0) + 1); }
const supIds = [...supCounts.keys()].filter((v) => /^[a-f0-9]{24}$/i.test(v));
const supDocs = supIds.length ? await db.collection('contact').find({ _id: { $in: supIds.map((v) => new ObjectId(v)) } }).project({ contactId: 1, businessName: 1 }).toArray() : [];
const supNames = new Map(supDocs.map((s) => [String(s._id), `${s.contactId}|${s.businessName}`]));
console.log(`\ndb barcodeLabel rows for ${focus}:`, focusRows.length);
for (const [k, n] of [...supCounts.entries()].sort((a, b) => b[1] - a[1])) console.log(JSON.stringify({ supplier: supNames.get(k) || k, rows: n, isG741: k === g741Id }));
const grcs = await db.collection('grc').find({ $or: [{ 'items.barcodeNo': { $in: ['OM1098', 'OM1099', 'OM1100', 'OM1101', 'OM1103', 'OM1104', 'OM1105', 'OM1106', 'OM1107', 'OM1108', 'OM1109'] } }, { 'items.itemCode': focus }, { 'items.itemName': focus }] }).limit(5).toArray();
console.log('\ngrc hits', grcs.length);
for (const g of grcs.slice(0, 3)) console.log(JSON.stringify({ grcNo: g.grcNo, supplierName: g.supplierName, supplierCode: g.supplierCode, supplierId: String(g.supplierId || ''), items: (g.items || []).length }));
const itemDocs = await db.collection('item').find({ $or: [{ itemName: focus }, { itemCode: focus }, { name: focus }] }).limit(3).toArray();
console.log('\nitem master hits', itemDocs.length);
for (const it of itemDocs.slice(0, 3)) console.log(JSON.stringify(it, null, 1).slice(0, 1500));
await c.close();
