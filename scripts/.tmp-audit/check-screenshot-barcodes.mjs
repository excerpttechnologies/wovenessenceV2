import XLSX from 'xlsx';
import { MongoClient, ObjectId } from 'mongodb';
import fs from 'fs';
const uri = fs.readFileSync('.env', 'utf8').match(/^MONGODB_URI=(.+)$/m)[1].trim();
const txt = (v) => String(v ?? '').trim();
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const header = Object.keys(rows[0] || {});
const bcKey = header.find((h) => /barcode/i.test(h)) || 'Barcode Number';
const itemKey = header.find((h) => /item code/i.test(h)) || 'Item Code';
const supCodeKey = header.find((h) => /supplier code/i.test(h)) || 'Supplier Code';
const supNameKey = header.find((h) => /supplier name/i.test(h)) || 'Supplier Name';
const wanted = ['OM1098', 'OM1099', 'OM1100', 'OM1101', 'OM1103', 'OM1104', 'OM1105', 'OM1106', 'OM1107', 'OM1108', 'OM1109'];
console.log('excel matches:');
for (const r of rows) {
  const bc = txt(r[bcKey]);
  if (!wanted.includes(bc)) continue;
  console.log(JSON.stringify({ barcode: bc, item: txt(r[itemKey]), supCode: txt(r[supCodeKey]), supName: txt(r[supNameKey]), qty: txt(r['Open Qty']) }));
}
const c = new MongoClient(uri);
await c.connect();
const db = c.db('grooretailerp1');
const docs = await db.collection('barcodeLabel').find({ barcodeNo: { $in: wanted } }).project({ barcodeNo: 1, itemCode: 1, supplierId: 1, itemName: 1, locationId: 1, status: 1 }).toArray();
console.log('\ndb rows:');
const supIds = [...new Set(docs.map((d) => txt(d.supplierId)).filter(Boolean))];
const sups = await db.collection('contact').find({ $or: [{ contactId: { $in: supIds } }, ...(supIds.filter((v) => /^[a-f0-9]{24}$/i.test(v)).map((v) => ({ _id: new ObjectId(v) })))] }).toArray();
const supName = new Map();
for (const s of sups) { supName.set(txt(s.contactId), txt(s.businessName)); supName.set(String(s._id), txt(s.businessName)); }
for (const d of docs.sort((a, b) => String(a.barcodeNo).localeCompare(String(b.barcodeNo)))) {
  console.log(JSON.stringify({ barcode: d.barcodeNo, item: txt(d.itemCode), supplierId: txt(d.supplierId), resolved: supName.get(txt(d.supplierId)) || null, status: d.status }));
}
await c.close();
