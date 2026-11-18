import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI, { bufferCommands: false });
for (const c of ['business','companylocation','supplier','contact','item']) {
  const rows = await mongoose.connection.db.collection(c).find({ name: { $regex: /barcode/i } }).limit(10).project({ name: 1, businessName: 1, businessPrintName: 1 }).toArray();
  console.log(c, JSON.stringify(rows));
}
await mongoose.disconnect();
