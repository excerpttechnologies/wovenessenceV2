#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const sample = await db.collection('barcodeLabel').findOne({ source: 'HSR_OPENING_19_10' });

console.log('\n📋 Sample HSR Barcode:\n');
console.log(JSON.stringify({
  _id: sample._id,
  barcodeNo: sample.barcodeNo,
  locationId: sample.locationId,
  businessId: sample.businessId,
  status: sample.status,
  source: sample.source,
}, null, 2));

// Get location name
const loc = await db.collection('location').findOne({ _id: new mongoose.Types.ObjectId(sample.locationId) });
console.log(`\n📍 Location: ${loc?.locationName || 'UNKNOWN'} (${sample.locationId})`);

// Count total
const total = await db.collection('barcodeLabel').countDocuments({ source: 'HSR_OPENING_19_10' });
console.log(`\n📊 Total HSR barcodes: ${total}`);

await mongoose.disconnect();
