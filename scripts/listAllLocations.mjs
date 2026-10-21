#!/usr/bin/env node
import mongoose from 'mongoose';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n' + '='.repeat(80));
console.log('📍 ALL LOCATIONS IN DATABASE');
console.log('='.repeat(80) + '\n');

const locations = await db.collection('companylocation').find({}).toArray();

console.log(`Found ${locations.length} locations:\n`);

locations.forEach((loc, i) => {
  console.log(`${i + 1}. ${loc.locationName}`);
  console.log(`   ID: ${loc._id}`);
  console.log(`   Type: ${loc.locationType || 'N/A'}`);
  console.log(`   Business: ${loc.businessId}`);
  console.log(`   Status: ${loc.isActive !== false ? 'Active' : 'Inactive'}`);
  console.log();
});

// Check TEMPLE FABRICS WAREHOUSE
const warehouse = locations.find(l => l.locationName === 'TEMPLE FABRICS WAREHOUSE');
if (warehouse) {
  console.log('✅ TEMPLE FABRICS WAREHOUSE exists:');
  console.log(`   ID: ${warehouse._id}`);
  
  const count = await db.collection('barcodeLabel').countDocuments({
    locationId: String(warehouse._id)
  });
  console.log(`   Barcodes at this location: ${count}\n`);
}

// Check for any HSR-like location
const hsrLike = locations.filter(l => /hsr|fabric.*jnr/i.test(l.locationName));
if (hsrLike.length > 0) {
  console.log('🏪 HSR-related locations found:');
  hsrLike.forEach(loc => {
    console.log(`   ${loc.locationName} → ${loc._id}`);
  });
} else {
  console.log('⚠️  No HSR-related location found in database');
}

await mongoose.disconnect();
