import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { MongoClient } from 'mongodb';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
dotenv.config({ path: path.join(ROOT, '.env') });

const client = new MongoClient(process.env.SOURCE_MONGODB_URI, { serverSelectionTimeoutMS: 30000 });
await client.connect();
const db = client.db(process.env.SOURCE_DB_NAME || 'test');

for (const name of ['barcodeLabel', 'barcodelabelsetting', 'barcodesetting', 'stockmovement', 'stocktransfer', 'grc', 'purchaseinvoice', 'salesinvoice', 'storedebitnote', 'loyaltytransaction']) {
  const col = db.collection(name);
  const count = await col.countDocuments();
  const sample = await col.findOne({}, { projection: { _id: 1 } });
  const keys = sample ? Object.keys(await col.findOne()) : [];
  console.log(name, 'count=', count, 'sampleKeys=', keys.slice(0, 40).join(','));
}

await client.close();
