#!/usr/bin/env node
import mongoose from 'mongoose';

console.log('\n🔗 Connecting to:', process.env.MONGODB_URI.replace(/:[^:@]+@/, ':***@'));

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('✅ Connected to database:', db.databaseName);
console.log('\n📚 Collections in database:\n');

const collections = await db.listCollections().toArray();
collections.forEach(c => console.log(`   - ${c.name}`));

console.log('\n📊 Document counts:\n');

// Count barcodes
const barcodeCount = await db.collection('barcodelabels').countDocuments({});
console.log(`   barcodelabels: ${barcodeCount}`);

const locationCount = await db.collection('locations').countDocuments({});
console.log(`   locations: ${locationCount}`);

// Try different possible collection names
const altNames = ['barcodeLabel', 'BarcodeLabel', 'barcode_labels', 'location', 'Location'];
for (const name of altNames) {
  try {
    const count = await db.collection(name).countDocuments({});
    if (count > 0) {
      console.log(`   ${name}: ${count} ✅`);
    }
  } catch (err) {
    // skip
  }
}

await mongoose.disconnect();
