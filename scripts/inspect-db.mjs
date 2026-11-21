import mongoose from 'mongoose';
import dbConnect from '../lib/db.js';

await dbConnect();
const db = mongoose.connection.db;

const fabrics = await db.collection('productclassificationoption')
  .find({ type: 'byFabric' })
  .toArray();

console.log('Total byFabric options:', fabrics.length);
console.log('Sample byFabric options:');
fabrics.slice(0, 30).forEach(f => console.log(String(f._id), f.name, f.productType || '(all)'));

const viscose = await db.collection('productclassificationoption')
  .find({ name: { $regex: 'viscose|crape|crepe|fabric', $options: 'i' } })
  .toArray();
console.log('\nOptions matching viscose/crape/crepe/fabric:');
viscose.forEach(v => console.log(String(v._id), v.type, v.name, v.productType || '(all)'));

process.exit(0);
