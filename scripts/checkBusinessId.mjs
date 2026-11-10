#!/usr/bin/env node

/* Check Business IDs
   
   Quick script to list all businesses in the database
   Run: node scripts/checkBusinessId.mjs */

import mongoose from 'mongoose';

async function checkBusinesses() {
  try {
    // Connect to MongoDB
    const mongoUri = process.env.MONGODB_URI || process.env.MONGO_URI || 'mongodb://localhost:27017/wovenessence';
    await mongoose.connect(mongoUri);
    console.log('✅ Connected to MongoDB\n');

    const db = mongoose.connection.db;
    
    // Check business collection
    const businesses = await db.collection('business').find({}).toArray();
    
    if (businesses.length === 0) {
      console.log('❌ No businesses found in database');
      console.log('   You may need to create a business first');
    } else {
      console.log(`📊 Found ${businesses.length} business(es):\n`);
      businesses.forEach((biz, idx) => {
        console.log(`${idx + 1}. Name: ${biz.name || 'Unnamed'}`);
        console.log(`   ID: ${biz._id}`);
        console.log(`   Company: ${biz.companyName || 'N/A'}`);
        console.log(`   Active: ${biz.isActive !== false ? 'Yes' : 'No'}`);
        console.log();
      });
      
      console.log('💡 To run the migration, use:');
      console.log(`   node scripts/migrateToClassificationCollections.mjs --business=${businesses[0]._id}`);
    }

    // Check if old data exists
    console.log('\n🔍 Checking existing classification data...');
    
    const oldOptions = await db.collection('productclassificationoption').countDocuments({});
    console.log(`   Old collection (productclassificationoption): ${oldOptions} documents`);
    
    for (const [type, collName] of Object.entries({
      byWeave: 'byweave',
      byFabric: 'byfabric',
      byCraft: 'bycraft',
      byOccasion: 'byoccasion',
      byColour: 'bycolour',
    })) {
      const count = await db.collection(collName).countDocuments({});
      console.log(`   ${type} (${collName}): ${count} documents`);
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    process.exit(1);
  } finally {
    await mongoose.disconnect();
  }
}

checkBusinesses();
