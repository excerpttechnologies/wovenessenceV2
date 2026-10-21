import mongoose from 'mongoose';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
console.log(JSON.stringify(await db.collection('counter').find({ createdAt: { $gte: new Date('2026-09-15T00:00:00Z') } }).toArray()));
console.log('contactSplitRun:', JSON.stringify(await db.collection('contactSplitRun').find({}).project({ _id: 1, completedAt: 1, startedAt: 1, finishedAt: 1 }).toArray()));
await mongoose.disconnect();
