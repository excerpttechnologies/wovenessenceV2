import mongoose from 'mongoose';
import dbConnect from '../lib/db.js';

await dbConnect();
const db = mongoose.connection.db;

const collections = await db.listCollections().toArray();
for (const col of collections) {
  const c = db.collection(col.name);
  try {
    const found = await c.find({
      $or: [
        { name: { $regex: 'viscose|crape|crepe', $options: 'i' } },
        { description: { $regex: 'viscose|crape|crepe', $options: 'i' } },
        { printDescription: { $regex: 'viscose|crape|crepe', $options: 'i' } },
        { displayName: { $regex: 'viscose|crape|crepe', $options: 'i' } },
        { itemName: { $regex: 'viscose|crape|crepe', $options: 'i' } },
      ]
    }).limit(3).toArray();
    if (found.length) {
      console.log(`Found in collection "${col.name}":`, found.length, 'records');
      found.forEach(f => {
        console.log(' - Record:', {
          _id: f._id,
          name: f.name || f.displayName || f.itemName,
          type: f.type || f.itemType || f.productType,
          printDescription: f.printDescription
        });
      });
    }
  } catch (err) {
    // Ignore indexing/unsupported field errors
  }
}

process.exit(0);
