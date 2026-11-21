import mongoose from 'mongoose';

// Connect to woven_essence_web
const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const conn = await mongoose.createConnection(uri, { dbName: 'woven_essence_web' }).asPromise();

console.log('=== COLLECTIONS IN woven_essence_web ===');
const cols = await conn.db.listCollections().toArray();
console.log(cols.map(c => c.name));

for (const c of ['categories', 'collections', 'menuitems', 'sitesettings', 'productwebmetas']) {
  if (cols.some(col => col.name === c)) {
    const count = await conn.db.collection(c).countDocuments();
    const sample = await conn.db.collection(c).findOne();
    console.log(`\nCollection "${c}" count: ${count}`);
    if (sample) {
      console.log('Sample keys:', Object.keys(sample));
      console.log('Sample:', JSON.stringify(sample).slice(0, 300));
    }
  }
}

process.exit(0);
