#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n' + '='.repeat(80));
console.log('✅ COMPLETE HSR OPENING STOCK DATA VERIFICATION');
console.log('='.repeat(80) + '\n');

// Get samples from each location
const hsrSample = await db.collection('barcodeLabel').findOne({
  source: 'HSR_OPENING_19_10',
  locationId: '6a874b62b5810c74e6a9b9c4',
  status: 'IN_STOCK'
});

const warehouseSample = await db.collection('barcodeLabel').findOne({
  source: 'HSR_OPENING_19_10',
  locationId: '6a858ded9d37d436b1fc02dc',
  status: 'IN_STOCK'
});

console.log('📋 SAMPLE FROM HSR (TEMPLE FABRICS, SILKS & SAREES):');
console.log(JSON.stringify({
  barcodeNo: hsrSample?.barcodeNo,
  locationId: hsrSample?.locationId,
  businessId: hsrSample?.businessId,
  openingQty: hsrSample?.openingQty,
  hsrPurPrice: hsrSample?.hsrPurPrice,
  stockDate: hsrSample?.stockDate,
  stockAge: hsrSample?.stockAge,
  status: hsrSample?.status
}, null, 2));

console.log('\n📋 SAMPLE FROM WAREHOUSE (TEMPLE FABRICS WAREHOUSE):');
console.log(JSON.stringify({
  barcodeNo: warehouseSample?.barcodeNo,
  locationId: warehouseSample?.locationId,
  businessId: warehouseSample?.businessId,
  openingQty: warehouseSample?.openingQty,
  hsrPurPrice: warehouseSample?.hsrPurPrice,
  stockDate: warehouseSample?.stockDate,
  stockAge: warehouseSample?.stockAge,
  status: warehouseSample?.status
}, null, 2));

// Statistics
console.log('\n' + '='.repeat(80));
console.log('📊 COMPLETE STATISTICS');
console.log('='.repeat(80) + '\n');

const total = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK'
});

const atHsr = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  locationId: '6a874b62b5810c74e6a9b9c4',
  status: 'IN_STOCK'
});

const atWarehouse = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  locationId: '6a858ded9d37d436b1fc02dc',
  status: 'IN_STOCK'
});

console.log('🏢 Location Distribution:');
console.log(`   HSR (TEMPLE FABRICS, SILKS & SAREES): ${atHsr}`);
console.log(`   WAREHOUSE (TEMPLE FABRICS WAREHOUSE): ${atWarehouse}`);
console.log(`   TOTAL: ${total}`);
console.log();

// Field completeness
const withOpeningQty = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  openingQty: { $exists: true, $ne: null }
});

const withHsrPurPrice = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  hsrPurPrice: { $exists: true, $ne: null }
});

const withStockDate = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  stockDate: { $exists: true, $ne: null }
});

const withStockAge = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  stockAge: { $exists: true, $ne: null }
});

console.log('📝 Field Completeness:');
console.log(`   openingQty populated: ${withOpeningQty} / ${total}`);
console.log(`   hsrPurPrice populated: ${withHsrPurPrice} / ${total}`);
console.log(`   stockDate populated: ${withStockDate} / ${total}`);
console.log(`   stockAge populated: ${withStockAge} / ${total}`);
console.log();

// Check for correct business IDs
const hsrBusiness = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  locationId: '6a874b62b5810c74e6a9b9c4',
  businessId: '6a853ba0fb266c4358beb530'
});

const warehouseBusiness = await db.collection('barcodeLabel').countDocuments({
  source: 'HSR_OPENING_19_10',
  status: 'IN_STOCK',
  locationId: '6a858ded9d37d436b1fc02dc',
  businessId: '6a853cdefb266c4358beb548'
});

console.log('🏢 Business ID Correctness:');
console.log(`   HSR with correct business ID: ${hsrBusiness} / ${atHsr}`);
console.log(`   Warehouse with correct business ID: ${warehouseBusiness} / ${atWarehouse}`);
console.log();

// Final verdict
console.log('='.repeat(80));
if (total === 13286 && 
    atHsr + atWarehouse === total &&
    withOpeningQty === total &&
    withHsrPurPrice === total &&
    withStockDate === total &&
    withStockAge === total &&
    hsrBusiness === atHsr &&
    warehouseBusiness === atWarehouse) {
  console.log('✅ ALL CHECKS PASSED - DATA IS COMPLETE AND CORRECT!');
} else {
  console.log('⚠️  SOME CHECKS FAILED - REVIEW ABOVE STATISTICS');
}
console.log('='.repeat(80) + '\n');

await mongoose.disconnect();
