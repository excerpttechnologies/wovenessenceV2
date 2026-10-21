import { MongoClient, ObjectId } from 'mongodb';
import XLSX from 'xlsx';

const URI = process.env.MONGODB_URI || 'mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1';
const DB = process.env.MONGODB_DB || 'grooretailerp1';
const txt = (v) => String(v ?? '').trim();

const client = new MongoClient(URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(DB);

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const excelByCode = new Map();
for (const r of rows) {
  const code = txt(r['Item Code']);
  if (!excelByCode.has(code)) excelByCode.set(code, []);
  excelByCode.get(code).push({
    sl: txt(r['sl no.']), itemCode: code, supplierCode: txt(r['Supplier Code']), supplierName: txt(r['Supplier Name']),
    grc: txt(r['GRC No']), qty: txt(r['Open Qty']), itemName: txt(r['Item Name']), printDescription: txt(r['Print Description']),
  });
}

const missingIds = [
  '6a8ee213de7bd6bc7418e68f', '6a8ee213de7bd6bc7418e6a3', '6a8ee214de7bd6bc7418e870',
  '6a8d672955fd0699d2daf395', '6a911cc9083438e2bfae98d5', '6a90303d6e43f6bd212b0d18',
  '6a8ee214de7bd6bc7418e8fe', '6a8ee214de7bd6bc7418e92d',
];

for (const id of missingIds) {
  const bcRows = await db.collection('barcodeLabel').find({ supplierId: id, status: 'IN_STOCK' }).toArray();
  console.log('\n=== MISSING SUPPLIER ID', id, 'in-stock rows:', bcRows.length, '===');
  console.log('source counts:', bcRows.reduce((a, r) => (a[r.source || ''] = (a[r.source || ''] || 0) + 1, a), {}));
  console.log('location counts:', bcRows.reduce((a, r) => (a[String(r.currentLocationId || r.locationId)] = (a[String(r.currentLocationId || r.locationId)] || 0) + 1, a), {}));
  console.log('finYear counts:', bcRows.reduce((a, r) => (a[r.finYear || ''] = (a[r.finYear || ''] || 0) + 1, a), {}));
  for (const r of bcRows.slice(0, 8)) {
    console.log('  barcode row:', JSON.stringify({
      barcodeNo: txt(r.barcodeNo), itemCode: txt(r.itemCode), itemName: txt(r.itemName), printDescription: txt(r.printDescription),
      qty: r.qtyNum ?? r.qty, source: r.source, biz: String(r.businessId), loc: String(r.currentLocationId || r.locationId),
      supplierId: String(r.supplierId), grcNo: txt(r.grcNo),
      excel: excelByCode.get(txt(r.barcodeNo)) || [],
    }));
  }
  const ex = bcRows.map((r) => (excelByCode.get(txt(r.barcodeNo)) || []).map((e) => e.supplierCode + '|' + e.supplierName));
  const exCounts = {};
  ex.flat().forEach((k) => { exCounts[k] = (exCounts[k] || 0) + 1; });
  console.log('  excel supplier matches by barcodeNo:', JSON.stringify(exCounts));
  const noMatch = bcRows.filter((r) => !excelByCode.has(txt(r.barcodeNo))).length;
  console.log('  rows with no excel barcodeNo match:', noMatch);
}

console.log('\n=== ALL IN-STOCK MISSING-ID ROWS vs EXCEL, by matching barcodeNo + printDescription ===');
for (const id of missingIds) {
  const bcRows = await db.collection('barcodeLabel').find({ supplierId: id, status: 'IN_STOCK' }).toArray();
  for (const r of bcRows) {
    const cands = (excelByCode.get(txt(r.barcodeNo)) || []).filter((e) => !e.printDescription || e.printDescription === txt(r.printDescription) || e.itemName === txt(r.itemName));
    const label = cands.length ? cands.map((e) => e.supplierCode).join(',') : 'NO-EXCEL-MATCH';
    console.log(id, txt(r.barcodeNo), '|', txt(r.printDescription).slice(0, 45), '|', label);
  }
}

await client.close();
