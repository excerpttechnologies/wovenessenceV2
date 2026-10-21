#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n' + '='.repeat(80));
console.log('📍 HSR OPENING STOCK - LOCATION DISTRIBUTION');
console.log('='.repeat(80) + '\n');

// Get all locations
const locations = await db.collection('location').find({}).toArray();
console.log('📋 Available Locations:');
locations.forEach(loc => {
  console.log(`   ${loc._id} → ${loc.locationName} (${loc.locationType || 'N/A'})`);
});

console.log('\n' + '-'.repeat(80) + '\n');

// Count by locationId
const distribution = await db.collection('barcodeLabel').aggregate([
  { $match: { source: 'HSR_OPENING_19_10' } },
  { $group: { 
    _id: '$locationId', 
    count: { $sum: 1 },
    sample_barcodes: { $push: '$barcodeNo' }
  }},
  { $project: {
    _id: 1,
    count: 1,
    sample_barcodes: { $slice: ['$sample_barcodes', 5] }
  }}
]).toArray();

console.log('📊 HSR Opening Stock Distribution:\n');

for (const dist of distribution) {
  const locDoc = await db.collection('location').findOne({ 
    _id: new mongoose.Types.ObjectId(dist._id) 
  });
  
  console.log(`Location: ${locDoc?.locationName || 'UNKNOWN'}`);
  console.log(`  ID: ${dist._id}`);
  console.log(`  Count: ${dist.count} barcodes`);
  console.log(`  Type: ${locDoc?.locationType || 'N/A'}`);
  console.log(`  Sample: ${dist.sample_barcodes.slice(0, 3).join(', ')}...\n`);
}

// Check for duplicates (same barcode at multiple locations)
const duplicateCheck = await db.collection('barcodeLabel').aggregate([
  { $match: { source: 'HSR_OPENING_19_10' } },
  { $group: {
    _id: '$barcodeNo',
    locations: { $addToSet: '$locationId' },
    count: { $sum: 1 }
  }},
  { $match: { count: { $gt: 1 } } }
]).toArray();

console.log('-'.repeat(80));
if (duplicateCheck.length > 0) {
  console.log(`\n⚠️  DUPLICATES FOUND: ${duplicateCheck.length} barcodes exist at multiple locations!`);
  console.log('\nSample duplicates:');
  duplicateCheck.slice(0, 5).forEach(dup => {
    console.log(`  ${dup._id}: ${dup.count} copies at locations: ${dup.locations.join(', ')}`);
  });
} else {
  console.log('\n✅ No duplicates - each barcode exists at only one location');
}

// Total count
const total = await db.collection('barcodeLabel').countDocuments({ 
  source: 'HSR_OPENING_19_10' 
});

console.log(`\n📦 TOTAL HSR OPENING STOCK: ${total} barcodes\n`);
console.log('='.repeat(80) + '\n');

await mongoose.disconnect();
