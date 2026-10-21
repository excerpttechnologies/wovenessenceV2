#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n📅 Checking Date and Age Fields...\n');

const samples = await db.collection('barcodeLabel')
  .find({ source: 'HSR_OPENING_19_10', status: 'IN_STOCK' })
  .limit(10)
  .toArray();

console.log('📋 Sample Barcodes (first 10):\n');
samples.forEach((bc, i) => {
  console.log(`${i + 1}. ${bc.barcodeNo}`);
  console.log(`   stockDate: ${bc.stockDate ? bc.stockDate.toISOString().split('T')[0] : 'NOT SET'}`);
  console.log(`   stockAge: ${bc.stockAge || 'NOT SET'}`);
  console.log();
});

// Count barcodes with/without date and age
const withDate = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  stockDate: { $exists: true, $ne: null }
});

const withoutDate = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  $or: [
    { stockDate: { $exists: false } },
    { stockDate: null }
  ]
});

const withAge = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  stockAge: { $exists: true, $gt: 0 }
});

const withoutAge = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  $or: [
    { stockAge: { $exists: false } },
    { stockAge: { $lte: 0 } }
  ]
});

console.log('📊 Statistics:');
console.log(`   With stockDate: ${withDate}`);
console.log(`   Without stockDate: ${withoutDate}`);
console.log(`   With stockAge: ${withAge}`);
console.log(`   Without stockAge: ${withoutAge}`);
console.log();

await mongoose.disconnect();
