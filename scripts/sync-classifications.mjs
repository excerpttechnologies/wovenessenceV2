import 'dotenv/config';
import mongoose, { Types } from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const mapping = {
  byWeave: 'byweave',
  byFabric: 'byfabric',
  byCraft: 'bycraft',
  byOccasion: 'byoccasion',
  byColour: 'bycolour',
};

const allOptions = await db.collection('productclassificationoption').find({}).toArray();
console.log(`Found ${allOptions.length} total options in productclassificationoption.`);

let synced = 0;
for (const doc of allOptions) {
  const targetCol = mapping[doc.type];
  if (!targetCol) continue;
  
  const payload = {
    _id: doc._id,
    businessId: doc.businessId,
    type: doc.type,
    productType: doc.productType || '',
    name: doc.name,
    displayOrder: doc.displayOrder ?? 0,
    isActive: doc.isActive !== false,
    createdAt: doc.createdAt || new Date(),
    updatedAt: doc.updatedAt || new Date(),
  };

  await db.collection(targetCol).updateOne(
    { _id: doc._id },
    { $set: payload },
    { upsert: true }
  );
  synced++;
}

console.log(`Synced ${synced} options into dedicated collections.`);

for (const [type, col] of Object.entries(mapping)) {
  const count = await db.collection(col).countDocuments();
  console.log(`${col} count: ${count}`);
}

process.exit(0);
