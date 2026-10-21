#!/usr/bin/env node

/* ==============================================================================
   FIX HSR STOCK WITH CORRECT IDs
   
   Updates all HSR_OPENING_19_10 barcodes to use the CORRECT location:
   - HSR Location: 6a874b62b5810c74e6a9b9c4 (TEMPLE FABRICS, SILKS & SAREES)
   - Business: 6a853ba0fb266c4358beb530
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/fixHsrCorrectIds.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const CORRECT_HSR_ID = '6a874b62b5810c74e6a9b9c4';     // TEMPLE FABRICS, SILKS & SAREES
const CORRECT_BUSINESS_ID = '6a853ba0fb266c4358beb530';
const WAREHOUSE_ID = '6a858ded9d37d436b1fc02dc';        // TEMPLE FABRICS WAREHOUSE
const WAREHOUSE_BUSINESS_ID = '6a853cdefb266c4358beb548';
const SOURCE = 'HSR_OPENING_19_10';

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('🔧 FIX HSR STOCK WITH CORRECT LOCATION IDs');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  console.log('✅ CORRECT HSR IDs (from reference barcode):');
  console.log(`   HSR Location: ${CORRECT_HSR_ID} (TEMPLE FABRICS, SILKS & SAREES)`);
  console.log(`   Business: ${CORRECT_BUSINESS_ID}`);
  console.log();
  console.log('📦 WAREHOUSE IDs:');
  console.log(`   Warehouse Location: ${WAREHOUSE_ID} (TEMPLE FABRICS WAREHOUSE)`);
  console.log(`   Business: ${WAREHOUSE_BUSINESS_ID}`);
  console.log();

  /* Connect */
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  /* Verify locations */
  const hsrLoc = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(CORRECT_HSR_ID) 
  });
  const warehouseLoc = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(WAREHOUSE_ID) 
  });

  console.log('📍 Location Verification:');
  console.log(`   HSR: ${hsrLoc ? '✅ ' + hsrLoc.name : '❌ NOT FOUND'}`);
  console.log(`   Warehouse: ${warehouseLoc ? '✅ ' + warehouseLoc.name : '❌ NOT FOUND'}`);
  console.log();

  if (!hsrLoc || !warehouseLoc) {
    console.error('❌ ERROR: Location not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  /* Find all HSR_OPENING stock */
  const allStock = await db.collection('barcodeLabel').find({
    source: SOURCE,
    status: 'IN_STOCK'
  }).toArray();

  console.log(`📦 Total HSR Opening Stock: ${allStock.length} barcodes\n`);

  /* Separate by what needs fixing */
  const wrongIds = allStock.filter(bc => 
    bc.locationId !== CORRECT_HSR_ID && bc.locationId !== WAREHOUSE_ID
  );
  
  const atCorrectHsr = allStock.filter(bc => bc.locationId === CORRECT_HSR_ID);
  const atWarehouse = allStock.filter(bc => bc.locationId === WAREHOUSE_ID);

  console.log('📊 Current Distribution:');
  console.log(`   At CORRECT HSR: ${atCorrectHsr.length}`);
  console.log(`   At WAREHOUSE: ${atWarehouse.length}`);
  console.log(`   At WRONG location: ${wrongIds.length}`);
  console.log();

  /* Create backup */
  if (APPLY) {
    const backupDir = './.backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `hsr-correct-ids-backup-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      operation: 'HSR_CORRECT_IDS_FIX',
      total: allStock.length,
      corrections: allStock.map(bc => ({
        _id: bc._id,
        barcodeNo: bc.barcodeNo,
        old_locationId: bc.locationId,
        old_businessId: bc.businessId,
      }))
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupFile}\n`);
  }

  /* Execute updates */
  if (APPLY) {
    console.log('🔄 Fixing location IDs...\n');

    // Update all HSR stock (currently at wrong HSR or TEMPLE FABRIC JNR) to correct HSR
    const hsrQuery = {
      source: SOURCE,
      status: 'IN_STOCK',
      $or: [
        { locationId: '6a858d389d37d436b1fc02b0' },  // Wrong HSR (TEMPLE FABRIC JNR)
        { locationId: WAREHOUSE_ID }  // Move from warehouse to HSR
      ]
    };

    const hsrResult = await db.collection('barcodeLabel').updateMany(
      hsrQuery,
      { 
        $set: { 
          locationId: CORRECT_HSR_ID,
          currentLocationId: new mongoose.Types.ObjectId(CORRECT_HSR_ID),
          businessId: CORRECT_BUSINESS_ID,
          currentBusinessId: new mongoose.Types.ObjectId(CORRECT_BUSINESS_ID),
          'customFields.hsrStock': true,
          'customFields.origins': ['Temple Fabrics Warehouse']
        } 
      }
    );

    console.log(`✅ HSR Location Update:`);
    console.log(`   Matched: ${hsrResult.matchedCount}`);
    console.log(`   Modified: ${hsrResult.modifiedCount}\n`);

    /* Verify */
    console.log('🔍 Verifying...');
    
    const atCorrectHsrFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: CORRECT_HSR_ID,
      status: 'IN_STOCK'
    });

    const atWarehouseFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: WAREHOUSE_ID,
      status: 'IN_STOCK'
    });

    console.log(`\n✅ Final Distribution:`);
    console.log(`   📍 HSR (TEMPLE FABRICS, SILKS & SAREES): ${atCorrectHsrFinal} barcodes`);
    console.log(`   📍 WAREHOUSE: ${atWarehouseFinal} barcodes`);
    
    if (atCorrectHsrFinal === allStock.length) {
      console.log(`\n✅ SUCCESS! All ${allStock.length} barcodes now at CORRECT HSR location!`);
    }

    console.log('\n📌 TO ROLLBACK: Restore from backup file if needed');

  } else {
    console.log(`\n⚠️  DRY RUN - Would fix all ${allStock.length} barcodes`);
    console.log(`\n   Changes:`);
    console.log(`   - Move ALL to: ${CORRECT_HSR_ID} (TEMPLE FABRICS, SILKS & SAREES)`);
    console.log(`   - businessId: ${CORRECT_BUSINESS_ID}`);
    console.log(`   - customFields.hsrStock: true`);
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
