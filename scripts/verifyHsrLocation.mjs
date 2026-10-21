#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n🔍 Checking HSR Location...\n');

const HSR_LOCATION_ID = '6a858ded9d37d436b1fc02dc';

// Try to find as string
let hsrLoc = await db.collection('location').findOne({ _id: HSR_LOCATION_ID });
console.log('Search as string:', hsrLoc ? '✅ Found' : '❌ Not found');

// Try to find as ObjectId
try {
  hsrLoc = await db.collection('location').findOne({ 
    _id: new mongoose.Types.ObjectId(HSR_LOCATION_ID) 
  });
  console.log('Search as ObjectId:', hsrLoc ? '✅ Found' : '❌ Not found');
  
  if (hsrLoc) {
    console.log('\n📍 HSR Location Details:');
    console.log(JSON.stringify(hsrLoc, null, 2));
  }
} catch (err) {
  console.log('ObjectId conversion failed:', err.message);
}

// List all locations
console.log('\n📋 All Locations in Database:\n');
const allLocs = await db.collection('location').find({}).toArray();
allLocs.forEach(loc => {
  const highlight = loc._id.toString() === HSR_LOCATION_ID ? ' ← HSR MATCH' : '';
  console.log(`  ${loc._id} | ${loc.locationName} | ${loc.locationType || 'N/A'}${highlight}`);
});

// Check what's stored in barcodes
console.log('\n📦 Sample barcode locationId values:\n');
const samples = await db.collection('barcodeLabel')
  .find({ source: 'HSR_OPENING_19_10' })
  .limit(3)
  .toArray();

samples.forEach(bc => {
  console.log(`  Barcode: ${bc.barcodeNo}`);
  console.log(`    locationId: ${bc.locationId} (type: ${typeof bc.locationId})`);
  console.log(`    currentLocationId: ${bc.currentLocationId} (type: ${typeof bc.currentLocationId})`);
});

await mongoose.disconnect();
