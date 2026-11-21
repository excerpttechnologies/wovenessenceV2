import mongoose from 'mongoose';
import dbConnect from '../lib/db.js';

await dbConnect();
const db = mongoose.connection.db;

const docs = await db.collection("producttypes")
  .find(
    { isActive: { $ne: false }, ecommerceVisible: { $ne: false }, ecommerceEnabled: { $ne: false } },
    { projection: { value: 1, label: 1, displayName: 1, ecommerceSlug: 1, businessId: 1, filters: 1, filterConfig: 1 } },
  )
  .toArray();

console.log('Total producttypes:', docs.length);
docs.forEach(d => {
  console.log(`_id: ${d._id}, value: ${d.value}, label: ${d.label}, slug: ${d.ecommerceSlug}, biz: ${d.businessId}, filters: ${JSON.stringify(d.filters)}`);
});

process.exit(0);
