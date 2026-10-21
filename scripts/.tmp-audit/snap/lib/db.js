import mongoose from 'mongoose';

const MONGODB_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orbit_erp';

let cached = global._orbitMongoose;
if (!cached) cached = global._orbitMongoose = { conn: null, promise: null };

export default async function dbConnect() {
  if (cached.conn) return cached.conn;
  if (!cached.promise) {
    cached.promise = mongoose.connect(MONGODB_URI, { bufferCommands: false }).then((m) => m);
  }
  cached.conn = await cached.promise;
  return cached.conn;
}
