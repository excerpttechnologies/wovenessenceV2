import mongoose from 'mongoose';

const uri = process.env.MONGODB_URI || 'mongodb://localhost:27017';
const conn = await mongoose.createConnection(uri, { dbName: 'woven_essence_web' }).asPromise();

const cats = await conn.db.collection('categories').find().toArray();
console.log('Total categories in web db:', cats.length);
cats.forEach(c => {
  console.log(`_id: ${c._id}, name: ${c.categoryName || c.name}, parentId: ${c.parentId}, slug: ${c.slug}`);
});

process.exit(0);
