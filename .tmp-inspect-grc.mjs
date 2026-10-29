import mongoose from 'mongoose';
const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
await mongoose.connect(uri);
const db = mongoose.connection.db;
const ids = ['6a980a0a3cfd7c0c4dc96738', '6a980a053cfd7c0c4dc966ef', '6a980a073cfd7c0c4dc9670b', '6a9809ec3cfd7c0c4dc9650b'];
for (const id of ids) {
  const g = await db.collection('grc').findOne({ _id: new mongoose.Types.ObjectId(id) });
  const rows = await db.collection('barcodeLabel').find({ grcId: id }).sort({ billSlNo: 1, createdAt: 1 }).toArray();
  const summaryKeys = new Set(rows.map((r) => `${String(r.billSlNo ?? '').trim()}-${r.itemCode || r.itemName || 'item'}-${r.hsn || ''}-${r.gst || ''}-${r.uom || ''}`));
  console.log('\nGRC', g?.grcNumber, 'rows', rows.length, 'summaryRows', summaryKeys.size);
  console.log(rows.slice(0, 8).map((r) => JSON.stringify({ bill: r.billSlNo, serial: r.serialNo, seq: r.seq, item: r.itemCode, gen: r.barcodeGenerated, no: r.barcodeNo })).join('\n'));
  console.log('last', rows.slice(-3).map((r) => JSON.stringify({ bill: r.billSlNo, serial: r.serialNo, seq: r.seq, item: r.itemCode, gen: r.barcodeGenerated, no: r.barcodeNo })).join('\n'));
}
await mongoose.disconnect();
