#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n' + '='.repeat(80));
console.log('🔍 INSPECTING HSR IDs - WHAT IS ACTUALLY STORED');
console.log('='.repeat(80) + '\n');

// Sample from HSR location
const hsrSample = await db.collection('barcodeLabel').findOne({
  source: 'HSR_OPENING_19_10',
  locationId: '6a858d389d37d436b1fc02b0'
});

// Sample from Warehouse location
const warehouseSample = await db.collection('barcodeLabel').findOne({
  source: 'HSR_OPENING_19_10',
  locationId: '6a858ded9d37d436b1fc02dc'
});

// Sample from reference (hsr_stock_correct source)
const referenceSample = await db.collection('barcodeLabel').findOne({
  source: 'hsr_stock_correct'
});

console.log('📋 HSR LOCATION SAMPLE:');
if (hsrSample) {
  console.log(JSON.stringify({
    barcodeNo: hsrSample.barcodeNo,
    locationId: hsrSample.locationId,
    locationId_type: typeof hsrSample.locationId,
    currentLocationId: hsrSample.currentLocationId,
    currentLocationId_type: typeof hsrSample.currentLocationId,
    businessId: hsrSample.businessId,
    businessId_type: typeof hsrSample.businessId,
    currentBusinessId: hsrSample.currentBusinessId,
    currentBusinessId_type: typeof hsrSample.currentBusinessId,
  }, null, 2));
} else {
  console.log('❌ No barcode found at HSR location!');
}

console.log('\n' + '-'.repeat(80) + '\n');

console.log('📋 WAREHOUSE LOCATION SAMPLE:');
if (warehouseSample) {
  console.log(JSON.stringify({
    barcodeNo: warehouseSample.barcodeNo,
    locationId: warehouseSample.locationId,
    locationId_type: typeof warehouseSample.locationId,
    currentLocationId: warehouseSample.currentLocationId,
    currentLocationId_type: typeof warehouseSample.currentLocationId,
    businessId: warehouseSample.businessId,
    businessId_type: typeof warehouseSample.businessId,
    currentBusinessId: warehouseSample.currentBusinessId,
    currentBusinessId_type: typeof warehouseSample.currentBusinessId,
  }, null, 2));
} else {
  console.log('❌ No barcode found at Warehouse location!');
}

console.log('\n' + '-'.repeat(80) + '\n');

console.log('📋 REFERENCE SAMPLE (hsr_stock_correct):');
if (referenceSample) {
  console.log(JSON.stringify({
    barcodeNo: referenceSample.barcodeNo,
    locationId: referenceSample.locationId,
    locationId_type: typeof referenceSample.locationId,
    currentLocationId: referenceSample.currentLocationId,
    currentLocationId_type: typeof referenceSample.currentLocationId,
    businessId: referenceSample.businessId,
    businessId_type: typeof referenceSample.businessId,
    currentBusinessId: referenceSample.currentBusinessId,
    currentBusinessId_type: typeof referenceSample.currentBusinessId,
  }, null, 2));
  
  console.log('\n📍 Reference Location IDs:');
  console.log(`   locationId: "${referenceSample.locationId}"`);
  console.log(`   currentLocationId: ${referenceSample.currentLocationId}`);
} else {
  console.log('❌ No reference barcode found!');
}

console.log('\n' + '='.repeat(80));
console.log('🏢 EXPECTED HSR LOCATION ID FROM YOUR REFERENCE:');
console.log('='.repeat(80));

// Get the actual location from reference barcode
if (referenceSample && referenceSample.locationId) {
  const refLocation = await db.collection('companylocation').findOne({
    _id: new mongoose.Types.ObjectId(referenceSample.locationId)
  });
  
  if (refLocation) {
    console.log(`\n✅ Reference uses: ${refLocation.name}`);
    console.log(`   ID: ${refLocation._id}`);
    console.log(`   Type: ${refLocation.locationType || 'N/A'}`);
  }
}

// Check what we're currently using
console.log('\n📦 WHAT WE USED IN SCRIPTS:');
console.log(`   HSR_ID: "6a858d389d37d436b1fc02b0" (TEMPLE FABRIC JNR)`);
console.log(`   WAREHOUSE_ID: "6a858ded9d37d436b1fc02dc" (TEMPLE FABRICS WAREHOUSE)`);

console.log('\n💡 DIAGNOSIS:');
if (referenceSample && referenceSample.locationId === '6a874b62b5810c74e6a9b9c4') {
  console.log('❌ WRONG! Reference uses DIFFERENT location ID!');
  console.log(`   Reference: ${referenceSample.locationId}`);
  console.log(`   We used: 6a858d389d37d436b1fc02b0`);
  console.log('\n   This is the problem - we need to use the CORRECT HSR location ID!');
}

await mongoose.disconnect();
