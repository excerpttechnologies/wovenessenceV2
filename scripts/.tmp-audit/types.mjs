import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const rows = await mongoose.connection.db.collection('contacttype').find({}, { projection: { name: 1, contactType: 1, prefix: 1, businessId: 1, status: 1 } }).toArray();
console.log(JSON.stringify(rows));
await mongoose.disconnect();
