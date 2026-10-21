#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n🔍 Checking HSR Transfer Result...\n');

const sample = await db.collection('barcodeLabel').findOne({ 
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK'
});

console.log('📋 Sample Barcode After Transfer:');
console.log(JSON.stringify({
  _id: sample._id,
  barcodeNo: sample.barcodeNo,
  locationId: sample.locationId,
  locationId_type: typeof sample.locationId,
  currentLocationId: sample.currentLocationId,
  currentLocationId_type: typeof sample.currentLocationId,
  status: sample.status
}, null, 2));

// Count by currentLocationId
const HSR_ID = '6a858d389d37d436b1fc02b0';
const HSR_OBJ = new mongoose.Types.ObjectId(HSR_ID);

console.log('\n📊 Counts:');

const asString = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  currentLocationId: HSR_ID
});
console.log(`   currentLocationId as string '${HSR_ID}': ${asString}`);

const asObjId = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  currentLocationId: HSR_OBJ
});
console.log(`   currentLocationId as ObjectId: ${asObjId}`);

await mongoose.disconnect();
