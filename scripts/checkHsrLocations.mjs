#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n🔍 Checking HSR Opening Stock Locations...\n');

// Get distinct locationIds
const locs = await db.collection('barcodeLabel').distinct('locationId', { 
  source: 'HSR_OPENING_19_10' 
});

console.log(`Found ${locs.length} distinct locationId(s):`);
locs.forEach(loc => console.log(`  - ${loc}`));

// Count by location
const counts = await db.collection('barcodeLabel').aggregate([
  { $match: { source: 'HSR_OPENING_19_10' } },
  { $group: { _id: '$locationId', count: { $sum: 1 } } }
]).toArray();

console.log('\n📊 Counts by locationId:');
for (const c of counts) {
  // Look up location name
  const locDoc = await db.collection('location').findOne({ _id: new mongoose.Types.ObjectId(c._id) });
  console.log(`  ${c._id} (${locDoc?.locationName || 'UNKNOWN'}): ${c.count}`);
}

// Check HSR location
const HSR_LOCATION_ID = '6a858ded9d37d436b1fc02dc';
const hsrCount = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  locationId: HSR_LOCATION_ID
});

console.log(`\n🎯 Already at HSR location (${HSR_LOCATION_ID}): ${hsrCount}`);

// Check warehouse location
const warehouseDoc = await db.collection('location').findOne({ locationName: 'TEMPLE FABRICS WAREHOUSE' });
if (warehouseDoc) {
  const warehouseCount = await db.collection('barcodeLabel').countDocuments({
    source: 'HSR_OPENING_19_10',
    locationId: String(warehouseDoc._id)
  });
  console.log(`📦 At TEMPLE FABRICS WAREHOUSE (${warehouseDoc._id}): ${warehouseCount}`);
}

await mongoose.disconnect();
