import mongoose from 'mongoose';
await mongoose.connect('mongodb+srv://wovenessanceexcerpt_db_user:uqlZ3ZoCp6dQL5pb@cluster0.m3qylyn.mongodb.net/grooretailerp1');
const counts = await mongoose.connection.db.collection('ecommerceproduct').aggregate([
  { $group: { _id: { businessId: '$businessId', itemId: '$itemId' }, count: { $sum: 1 }, barcodes: { $push: '$barcode' }, ids: { $push: '$_id' } } },
  { $match: { count: { $gt: 1 } } }
]).toArray();
console.log('Duplicate (businessId, itemId) groups:', JSON.stringify(counts, null, 2));

const all = await mongoose.connection.db.collection('ecommerceproduct').find({}).toArray();
console.log('\nAll ecommerceproduct count:', all.length);
for (const p of all) {
  console.log({
    _id: p._id,
    barcode: p.barcode,
    itemId: p.itemId,
    businessId: p.businessId,
    productType: p.productType,
    displayName: p.displayName,
    isPublished: p.isPublished,
    status: p.status,
    isActive: p.isActive,
    barcodes: p.barcodes,
    publishedBarcodes: p.publishedBarcodes
  });
}
process.exit(0);
