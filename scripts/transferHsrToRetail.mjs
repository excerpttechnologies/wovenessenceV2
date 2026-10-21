#!/usr/bin/env node

/* ==============================================================================
   TRANSFER HSR OPENING STOCK TO RETAIL LOCATION (LOGICAL REFERENCE)
   
   Sets up dual-location logic:
   - locationId (home): TEMPLE FABRICS WAREHOUSE 
   - currentLocationId (display): TEMPLE FABRIC JNR (HSR)
   
   This allows stock to show at HSR retail while warehouse maintains ownership.
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/transferHsrToRetail.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const WAREHOUSE_ID = '6a858ded9d37d436b1fc02dc';  // TEMPLE FABRICS WAREHOUSE
const HSR_RETAIL_ID = '6a858d389d37d436b1fc02b0';  // TEMPLE FABRIC JNR (HSR)
const BUSINESS_ID = '6a853cdefb266c4358beb548';    // TEMPLE FABRICS
const SOURCE = 'HSR_OPENING_19_10';

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('🏪 HSR OPENING STOCK - LOGICAL TRANSFER TO RETAIL');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  console.log('📦 Transfer Logic:');
  console.log(`   Home (locationId):    WAREHOUSE (${WAREHOUSE_ID})`);
  console.log(`   Display (currentLocationId): HSR RETAIL (${HSR_RETAIL_ID})`);
  console.log();

  /* Connect */
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  /* Verify locations exist */
  const warehouse = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(WAREHOUSE_ID) 
  });
  const hsr = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(HSR_RETAIL_ID) 
  });

  console.log('📍 Location Verification:');
  console.log(`   Warehouse: ${warehouse ? '✅ ' + warehouse.name : '❌ NOT FOUND'}`);
  console.log(`   HSR Retail: ${hsr ? '✅ ' + hsr.name : '❌ NOT FOUND'}`);
  console.log();

  if (!warehouse || !hsr) {
    console.error('❌ ERROR: Location not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  /* Find all HSR opening stock barcodes */
  const query = {
    source: SOURCE,
    businessId: BUSINESS_ID,
    status: 'IN_STOCK'  // Only transfer stock that's not sold
  };

  const barcodes = await db.collection('barcodeLabel').find(query).toArray();
  console.log(`📦 Found ${barcodes.length} IN_STOCK barcodes to transfer\n`);

  if (barcodes.length === 0) {
    console.log('✅ No barcodes to transfer');
    await mongoose.disconnect();
    return;
  }

  /* Check current state */
  const currentStates = {};
  for (const bc of barcodes) {
    const state = `${bc.locationId}→${bc.currentLocationId || 'null'}`;
    currentStates[state] = (currentStates[state] || 0) + 1;
  }

  console.log('📊 Current Location States:');
  for (const [state, count] of Object.entries(currentStates)) {
    console.log(`   ${state}: ${count} barcodes`);
  }
  console.log();

  /* Create backup before changes */
  if (APPLY) {
    const backupDir = './.backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `hsr-logical-transfer-backup-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      operation: 'HSR_OPENING_LOGICAL_TRANSFER',
      from: { locationId: WAREHOUSE_ID, currentLocationId: 'various' },
      to: { locationId: WAREHOUSE_ID, currentLocationId: HSR_RETAIL_ID },
      barcodes: barcodes.map(bc => ({
        _id: bc._id,
        barcodeNo: bc.barcodeNo,
        old_locationId: bc.locationId,
        old_currentLocationId: bc.currentLocationId,
        new_locationId: WAREHOUSE_ID,
        new_currentLocationId: HSR_RETAIL_ID
      }))
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupFile}`);
    console.log(`   (${barcodes.length} records)\n`);
  }

  /* Execute transfer */
  if (APPLY) {
    console.log('🔄 Executing logical transfer...\n');

    const result = await db.collection('barcodeLabel').updateMany(
      query,
      { 
        $set: { 
          locationId: WAREHOUSE_ID,  // Home: Warehouse
          currentLocationId: new mongoose.Types.ObjectId(HSR_RETAIL_ID),  // Display: HSR Retail
          currentBusinessId: new mongoose.Types.ObjectId(BUSINESS_ID)
        } 
      }
    );

    console.log(`✅ Transfer complete!`);
    console.log(`   Matched: ${result.matchedCount}`);
    console.log(`   Modified: ${result.modifiedCount}\n`);

    /* Verify */
    console.log('🔍 Verifying transfer...');
    
    const atHsr = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      currentLocationId: HSR_RETAIL_ID,
      status: 'IN_STOCK'
    });

    const homeWarehouse = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: WAREHOUSE_ID,
      status: 'IN_STOCK'
    });

    console.log(`✅ Verification:`);
    console.log(`   Home at Warehouse (locationId): ${homeWarehouse}`);
    console.log(`   Display at HSR (currentLocationId): ${atHsr}`);
    
    if (atHsr === barcodes.length && homeWarehouse === barcodes.length) {
      console.log(`\n✅ SUCCESS! All ${barcodes.length} barcodes now show:`);
      console.log(`   - Owned by: WAREHOUSE`);
      console.log(`   - Displayed at: HSR RETAIL`);
    } else {
      console.log(`\n⚠️  Warning: Counts don't match expected values`);
    }

    console.log('\n📌 TO ROLLBACK: Restore from backup file if needed');

  } else {
    console.log(`\n⚠️  DRY RUN - Would transfer ${barcodes.length} barcodes`);
    console.log(`   Changes:`);
    console.log(`   - locationId: ${WAREHOUSE_ID} (warehouse owns stock)`);
    console.log(`   - currentLocationId: ${HSR_RETAIL_ID} (stock displays at HSR)`);
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
