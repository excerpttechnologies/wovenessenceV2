#!/usr/bin/env node

/* ==============================================================================
   FIX HSR OPENING STOCK - CORRECT PATTERN
   
   Updates HSR opening stock to match the reference pattern:
   - locationId: HSR (string)
   - currentLocationId: HSR (ObjectId)
   - customFields.hsrStock: true
   - customFields.origins: ['Temple Fabrics Warehouse']
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/fixHsrStockPattern.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const HSR_LOCATION_ID = '6a858d389d37d436b1fc02b0';  // TEMPLE FABRIC JNR (HSR)
const BUSINESS_ID = '6a853cdefb266c4358beb548';       // TEMPLE FABRICS
const SOURCE = 'HSR_OPENING_19_10';

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('🔧 FIX HSR OPENING STOCK - APPLY CORRECT PATTERN');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  console.log('📦 Correct Pattern (matching reference barcode):');
  console.log(`   locationId: "${HSR_LOCATION_ID}" (string)`);
  console.log(`   currentLocationId: ObjectId("${HSR_LOCATION_ID}")`);
  console.log(`   currentBusinessId: ObjectId("${BUSINESS_ID}")`);
  console.log(`   customFields.hsrStock: true`);
  console.log(`   customFields.origins: ["Temple Fabrics Warehouse"]`);
  console.log();

  /* Connect */
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  /* Verify HSR location exists */
  const hsrLocation = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(HSR_LOCATION_ID) 
  });

  console.log('📍 Location Verification:');
  console.log(`   HSR: ${hsrLocation ? '✅ ' + hsrLocation.name : '❌ NOT FOUND'}`);
  console.log();

  if (!hsrLocation) {
    console.error('❌ ERROR: HSR location not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  /* Find all HSR opening stock barcodes */
  const query = {
    source: SOURCE,
    status: 'IN_STOCK'
  };

  const barcodes = await db.collection('barcodeLabel').find(query).toArray();
  console.log(`📦 Found ${barcodes.length} IN_STOCK barcodes\n`);

  if (barcodes.length === 0) {
    console.log('✅ No barcodes to update');
    await mongoose.disconnect();
    return;
  }

  /* Analyze current state */
  let needsUpdate = 0;
  let alreadyCorrect = 0;

  for (const bc of barcodes) {
    const isCorrect = 
      bc.locationId === HSR_LOCATION_ID &&
      bc.currentLocationId?.toString() === HSR_LOCATION_ID &&
      bc.currentBusinessId?.toString() === BUSINESS_ID &&
      bc.customFields?.hsrStock === true &&
      Array.isArray(bc.customFields?.origins);

    if (isCorrect) {
      alreadyCorrect++;
    } else {
      needsUpdate++;
    }
  }

  console.log('📊 Current State:');
  console.log(`   Already correct: ${alreadyCorrect}`);
  console.log(`   Need update: ${needsUpdate}`);
  console.log();

  if (needsUpdate === 0) {
    console.log('✅ All barcodes already match the correct pattern!');
    await mongoose.disconnect();
    return;
  }

  /* Create backup */
  if (APPLY) {
    const backupDir = './.backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `hsr-pattern-fix-backup-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      operation: 'HSR_PATTERN_FIX',
      barcodes: barcodes.map(bc => ({
        _id: bc._id,
        barcodeNo: bc.barcodeNo,
        old_locationId: bc.locationId,
        old_currentLocationId: bc.currentLocationId,
        old_customFields: bc.customFields
      }))
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupFile}`);
    console.log(`   (${barcodes.length} records)\n`);
  }

  /* Execute update */
  if (APPLY) {
    console.log('🔄 Applying correct pattern...\n');

    const result = await db.collection('barcodeLabel').updateMany(
      query,
      { 
        $set: { 
          locationId: HSR_LOCATION_ID,  // String
          currentLocationId: new mongoose.Types.ObjectId(HSR_LOCATION_ID),  // ObjectId
          currentBusinessId: new mongoose.Types.ObjectId(BUSINESS_ID),  // ObjectId
          businessId: BUSINESS_ID,  // String
          'customFields.hsrStock': true,
          'customFields.origins': ['Temple Fabrics Warehouse']
        } 
      }
    );

    console.log(`✅ Update complete!`);
    console.log(`   Matched: ${result.matchedCount}`);
    console.log(`   Modified: ${result.modifiedCount}\n`);

    /* Verify */
    console.log('🔍 Verifying...');
    
    const atHsr = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: HSR_LOCATION_ID,
      status: 'IN_STOCK'
    });

    const withCustomFields = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      'customFields.hsrStock': true,
      status: 'IN_STOCK'
    });

    console.log(`✅ Verification:`);
    console.log(`   At HSR (locationId string): ${atHsr}`);
    console.log(`   With hsrStock flag: ${withCustomFields}`);
    
    if (atHsr === barcodes.length && withCustomFields === barcodes.length) {
      console.log(`\n✅ SUCCESS! All ${barcodes.length} barcodes now:`);
      console.log(`   - Show at HSR location (both fields)`);
      console.log(`   - Tagged with hsrStock: true`);
      console.log(`   - Track origins: Temple Fabrics Warehouse`);
    } else {
      console.log(`\n⚠️  Warning: Verification counts don't match`);
    }

    console.log('\n📌 TO ROLLBACK: Restore from backup file if needed');

  } else {
    console.log(`\n⚠️  DRY RUN - Would update ${needsUpdate} barcodes`);
    console.log(`\n   Changes:`);
    console.log(`   - locationId: "${HSR_LOCATION_ID}" (string)`);
    console.log(`   - currentLocationId: ObjectId("${HSR_LOCATION_ID}")`);
    console.log(`   - currentBusinessId: ObjectId("${BUSINESS_ID}")`);
    console.log(`   - customFields.hsrStock: true`);
    console.log(`   - customFields.origins: ["Temple Fabrics Warehouse"]`);
    console.log(`\n   Add --apply to execute\n`);
  }

  console.timeEnd('total');
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
