import mongoose from 'mongoose';
import dbConnect from '../lib/db.js';

await dbConnect();
const db = mongoose.connection.db;

const groups = await db.collection("productgroup").find().toArray();
console.log('Total productgroups:', groups.length);
groups.forEach(g => {
  console.log(`_id: ${g._id}, name: ${g.name}, parentId: ${g.parentId}, biz: ${g.businessId}`);
});

process.exit(0);
