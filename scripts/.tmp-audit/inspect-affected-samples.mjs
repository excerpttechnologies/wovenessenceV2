import { MongoClient } from 'mongodb';
const c = new MongoClient('mongodb+srv://myexcerpt1_db_user:yEXNF7BjVgDRanGI@cluster0.e3s8dbr.mongodb.net/grooretailerp1');
await c.connect();
const db = c.db('grooretailerp1');
for (const id of ['8A1009', '8A4243', '8A4088']) {
  const rows = await db.collection('barcodeLabel').find({ status: 'IN_STOCK', barcodeNo: id }).limit(5).toArray();
  console.log('\n', id, rows.length);
  rows.forEach((r) => console.log(JSON.stringify({
    _id: String(r._id), supplierId: r.supplierId, biz: String(r.businessId), loc: String(r.currentLocationId || r.locationId),
    source: r.source, grcNo: r.grcNo, itemCode: r.itemCode, itemName: r.itemName, qty: r.qtyNum,
    createdAt: r.createdAt, barcodeGenerated: r.barcodeGenerated, billSlNo: r.billSlNo,
  })));
}
await c.close();
