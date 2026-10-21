#!/usr/bin/env node

/* ==============================================================================
   DUPLICATE HSR OPENING STOCK TO BOTH LOCATIONS
   
   Creates duplicate barcode records so stock shows in BOTH places:
   - Original set: stays at HSR (TEMPLE FABRIC JNR)
   - Duplicate set: created at WAREHOUSE (TEMPLE FABRICS WAREHOUSE)
   
   Result: Same stock count at both locations
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/duplicateHsrToBothLocations.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const WAREHOUSE_ID = '6a858ded9d37d436b1fc02dc';  // TEMPLE FABRICS WAREHOUSE
const HSR_ID = '6a858d389d37d436b1fc02b0';        // TEMPLE FABRIC JNR (HSR)
const BUSINESS_ID = '6a853cdefb266c4358beb548';    // TEMPLE FABRICS
const SOURCE = 'HSR_OPENING_19_10';

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('📦 DUPLICATE HSR STOCK TO BOTH LOCATIONS');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  console.log('📍 Target Locations:');
  console.log(`   1. HSR (TEMPLE FABRIC JNR): ${HSR_ID}`);
  console.log(`   2. WAREHOUSE (TEMPLE FABRICS WAREHOUSE): ${WAREHOUSE_ID}`);
  console.log();

  /* Connect */
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  /* Verify locations */
  const warehouse = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(WAREHOUSE_ID) 
  });
  const hsr = await db.collection('companylocation').findOne({ 
    _id: new mongoose.Types.ObjectId(HSR_ID) 
  });

  console.log('📍 Location Verification:');
  console.log(`   Warehouse: ${warehouse ? '✅ ' + warehouse.name : '❌ NOT FOUND'}`);
  console.log(`   HSR: ${hsr ? '✅ ' + hsr.name : '❌ NOT FOUND'}`);
  console.log();

  if (!warehouse || !hsr) {
    console.error('❌ ERROR: Location not found!');
    await mongoose.disconnect();
    process.exit(1);
  }

  /* Find current HSR stock */
  const hsrBarcodes = await db.collection('barcodeLabel').find({
    source: SOURCE,
    locationId: HSR_ID,
    status: 'IN_STOCK'
  }).toArray();

  console.log(`📦 Current HSR Stock: ${hsrBarcodes.length} barcodes\n`);

  /* Check if warehouse copies already exist */
  const warehouseBarcodes = await db.collection('barcodeLabel').find({
    source: SOURCE,
    locationId: WAREHOUSE_ID,
    status: 'IN_STOCK'
  }).toArray();

  console.log(`📦 Current Warehouse Stock: ${warehouseBarcodes.length} barcodes\n`);

  if (warehouseBarcodes.length > 0) {
    console.log('⚠️  Warehouse copies already exist!');
    console.log(`   Do you want to:`);
    console.log(`   A) Keep existing ${warehouseBarcodes.length} warehouse copies (no action)`);
    console.log(`   B) Delete and recreate warehouse copies`);
    console.log(`\n   For safety, this script will NOT delete existing records.`);
    console.log(`   If you need to recreate, delete warehouse copies first.\n`);
    
    if (APPLY) {
      await mongoose.disconnect();
      return;
    }
  }

  if (hsrBarcodes.length === 0) {
    console.log('❌ No HSR barcodes found to duplicate');
    await mongoose.disconnect();
    return;
  }

  /* Create warehouse duplicates */
  const duplicates = hsrBarcodes.map(bc => {
    const { _id, ...rest } = bc;  // Remove original _id
    
    return {
      ...rest,
      _id: new mongoose.Types.ObjectId(),  // New ID
      locationId: WAREHOUSE_ID,  // Change to warehouse (string)
      currentLocationId: new mongoose.Types.ObjectId(WAREHOUSE_ID),  // Change to warehouse (ObjectId)
      currentBusinessId: new mongoose.Types.ObjectId(BUSINESS_ID),
      businessId: BUSINESS_ID,
      customFields: {
        ...bc.customFields,
        hsrStock: true,
        origins: ['Temple Fabrics Warehouse'],
        duplicatedFrom: bc._id.toString(),  // Track original
        duplicatedAt: new Date()
      },
      createdAt: new Date(),
      updatedAt: new Date()
    };
  });

  console.log(`📋 Summary:`);
  console.log(`   HSR location: ${hsrBarcodes.length} barcodes (keep as-is)`);
  console.log(`   Warehouse location: ${duplicates.length} barcodes (will create)`);
  console.log(`   Total after duplication: ${hsrBarcodes.length + duplicates.length}`);
  console.log();

  /* Create backup */
  if (APPLY) {
    const backupDir = './.backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `hsr-duplication-backup-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      operation: 'HSR_STOCK_DUPLICATION',
      original_count: hsrBarcodes.length,
      duplicate_count: duplicates.length,
      new_ids: duplicates.map(d => ({ 
        original_barcode: d.barcodeNo, 
        new_id: d._id,
        original_id: d.customFields.duplicatedFrom 
      }))
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupFile}\n`);
  }

  /* Insert duplicates */
  if (APPLY) {
    console.log('🔄 Creating warehouse duplicates...\n');

    const CHUNK_SIZE = 1000;
    let inserted = 0;

    for (let i = 0; i < duplicates.length; i += CHUNK_SIZE) {
      const chunk = duplicates.slice(i, i + CHUNK_SIZE);
      await db.collection('barcodeLabel').insertMany(chunk, { ordered: false });
      inserted += chunk.length;
      
      const pct = ((inserted / duplicates.length) * 100).toFixed(1);
      console.log(`   ${inserted}/${duplicates.length} (${pct}%)`);
    }

    console.log(`\n✅ Duplication complete!`);
    console.log(`   Created: ${inserted} warehouse copies\n`);

    /* Verify */
    console.log('🔍 Verifying final counts...');
    
    const hsrFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: HSR_ID,
      status: 'IN_STOCK'
    });

    const warehouseFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: WAREHOUSE_ID,
      status: 'IN_STOCK'
    });

    console.log(`\n✅ Final Stock Counts:`);
    console.log(`   📍 HSR (TEMPLE FABRIC JNR): ${hsrFinal} barcodes`);
    console.log(`   📍 WAREHOUSE (TEMPLE FABRICS WAREHOUSE): ${warehouseFinal} barcodes`);
    
    if (hsrFinal === warehouseFinal) {
      console.log(`\n✅ SUCCESS! Same stock count at both locations!`);
    } else {
      console.log(`\n⚠️  Warning: Counts don't match`);
    }

    console.log('\n📌 TO ROLLBACK: Delete warehouse copies using backup file IDs');

  } else {
    console.log(`\n⚠️  DRY RUN - Would create ${duplicates.length} warehouse copies`);
    console.log(`\n   Result after duplication:`);
    console.log(`   - HSR: ${hsrBarcodes.length} barcodes`);
    console.log(`   - WAREHOUSE: ${duplicates.length} barcodes`);
    console.log(`   - Total: ${hsrBarcodes.length + duplicates.length} barcodes`);
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
