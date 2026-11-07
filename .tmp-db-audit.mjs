import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI;
if (!uri) { console.error('MONGODB_URI not set'); process.exit(1); }
await mongoose.connect(uri, { bufferCommands: false });
const db = mongoose.connection.db;
console.log('connected db:', db.databaseName);
const collections = await db.listCollections().toArray();
const names = collections.map((c) => c.name).sort();
console.log('collections:', names.length);
for (const name of names) {
  const count = await db.collection(name).estimatedDocumentCount();
  if (count > 0) console.log(String(count).padStart(8), name);
}
await mongoose.disconnect();
