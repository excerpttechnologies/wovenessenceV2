#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

const WAREHOUSE_ID = '6a858ded9d37d436b1fc02dc';  // TEMPLE FABRICS WAREHOUSE
const HSR_ID = '6a858d389d37d436b1fc02b0';        // TEMPLE FABRIC JNR (HSR)

console.log('\n' + '='.repeat(80));
console.log('📊 STOCK QUERY COMPARISON - WHERE DOES STOCK SHOW?');
console.log('='.repeat(80) + '\n');

// Query 1: By locationId (string) - OLD WAY
console.log('1️⃣  Query by locationId (string) - Shows OWNERSHIP:');
console.log(`   Query: { locationId: "${WAREHOUSE_ID}", status: "IN_STOCK" }\n`);

const byWarehouseLocation = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  locationId: WAREHOUSE_ID,
  status: 'IN_STOCK'
});
console.log(`   ✅ WAREHOUSE: ${byWarehouseLocation} barcodes`);

const byHsrLocation = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  locationId: HSR_ID,
  status: 'IN_STOCK'
});
console.log(`   ❌ HSR: ${byHsrLocation} barcodes`);

console.log('\n' + '-'.repeat(80) + '\n');

// Query 2: By currentLocationId (ObjectId) - NEW WAY
console.log('2️⃣  Query by currentLocationId (ObjectId) - Shows WHERE DISPLAYED:');
console.log(`   Query: { currentLocationId: ObjectId("${HSR_ID}"), status: "IN_STOCK" }\n`);

const byWarehouseCurrent = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  currentLocationId: new mongoose.Types.ObjectId(WAREHOUSE_ID),
  status: 'IN_STOCK'
});
console.log(`   ❌ WAREHOUSE: ${byWarehouseCurrent} barcodes`);

const byHsrCurrent = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  currentLocationId: new mongoose.Types.ObjectId(HSR_ID),
  status: 'IN_STOCK'
});
console.log(`   ✅ HSR: ${byHsrCurrent} barcodes`);

console.log('\n' + '-'.repeat(80) + '\n');

// Query 3: Mixed query (what app might be using)
console.log('3️⃣  If your app queries locationId as STRING:');
console.log(`   It will show stock at: WAREHOUSE (${byWarehouseLocation})`);
console.log(`   It will NOT show at: HSR (${byHsrLocation})`);

console.log('\n4️⃣  If your app queries currentLocationId as OBJECTID:');
console.log(`   It will show stock at: HSR (${byHsrCurrent})`);
console.log(`   It will NOT show at: WAREHOUSE (${byWarehouseCurrent})`);

console.log('\n' + '='.repeat(80));
console.log('💡 SOLUTION:');
console.log('='.repeat(80));
console.log('\nYour application needs to query by BOTH fields to show in both places:');
console.log('\nOption A: Show at HSR only (current setup)');
console.log('   Query: { currentLocationId: ObjectId("locationId"), status: "IN_STOCK" }');
console.log('\nOption B: Show at BOTH locations');
console.log('   Query: { $or: [');
console.log('     { locationId: "locationId" },');
console.log('     { currentLocationId: ObjectId("locationId") }');
console.log('   ], status: "IN_STOCK" }');
console.log('\nOption C: Duplicate stock physically (not recommended)');
console.log('   Create 2 separate barcode records with different locationIds');
console.log();

await mongoose.disconnect();
