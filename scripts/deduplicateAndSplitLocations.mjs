#!/usr/bin/env node

/* ==============================================================================
   DEDUPLICATE HSR STOCK AND SPLIT TO BOTH LOCATIONS
   
   Step 1: Remove duplicates (keep original 13,286 barcodes)
   Step 2: Split remaining stock 50/50 between HSR and Warehouse
   
   Result: ~6,643 at HSR + ~6,643 at Warehouse = ~13,286 total (no duplication)
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/deduplicateAndSplitLocations.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';

const APPLY = process.argv.includes('--apply');

const HSR_LOCATION_ID = '6a874b62b5810c74e6a9b9c4';      // TEMPLE FABRICS, SILKS & SAREES
const HSR_BUSINESS_ID = '6a853ba0fb266c4358beb530';
const WAREHOUSE_ID = '6a858ded9d37d436b1fc02dc';          // TEMPLE FABRICS WAREHOUSE
const WAREHOUSE_BUSINESS_ID = '6a853cdefb266c4358beb548';
const SOURCE = 'HSR_OPENING_19_10';

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('🔧 DEDUPLICATE AND SPLIT HSR STOCK TO BOTH LOCATIONS');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  /* Connect */
  console.log('🔌 Connecting to MongoDB...');
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log('✅ Connected\n');

  /* Find all current stock */
  const allStock = await db.collection('barcodeLabel').find({
    source: SOURCE,
    status: 'IN_STOCK'
  }).toArray();

  console.log(`📦 Current Total: ${allStock.length} barcodes\n`);

  /* Group by barcodeNo to find duplicates */
  const barcodeMap = new Map();
  for (const bc of allStock) {
    if (!barcodeMap.has(bc.barcodeNo)) {
      barcodeMap.set(bc.barcodeNo, []);
    }
    barcodeMap.get(bc.barcodeNo).push(bc);
  }

  const uniqueBarcodes = barcodeMap.size;
  const duplicateGroups = Array.from(barcodeMap.values()).filter(group => group.length > 1);
  const totalDuplicates = allStock.length - uniqueBarcodes;

  console.log('📊 Duplication Analysis:');
  console.log(`   Unique barcodes: ${uniqueBarcodes}`);
  console.log(`   Duplicate groups: ${duplicateGroups.length}`);
  console.log(`   Total duplicates to remove: ${totalDuplicates}\n`);

  /* Identify which to keep and which to delete */
  const toKeep = [];
  const toDelete = [];

  for (const [barcodeNo, group] of barcodeMap.entries()) {
    // Keep the first one (oldest by _id)
    const sorted = group.sort((a, b) => a._id.toString().localeCompare(b._id.toString()));
    toKeep.push(sorted[0]);
    
    // Delete the rest
    if (sorted.length > 1) {
      toDelete.push(...sorted.slice(1));
    }
  }

  console.log(`✅ Will keep: ${toKeep.length} original barcodes`);
  console.log(`🗑️  Will delete: ${toDelete.length} duplicate barcodes\n`);

  /* Split remaining stock 50/50 */
  const halfPoint = Math.floor(toKeep.length / 2);
  const forHsr = toKeep.slice(0, halfPoint);
  const forWarehouse = toKeep.slice(halfPoint);

  console.log('📋 Split Plan:');
  console.log(`   HSR: ${forHsr.length} barcodes`);
  console.log(`   WAREHOUSE: ${forWarehouse.length} barcodes`);
  console.log(`   Total: ${forHsr.length + forWarehouse.length}\n`);

  /* Create backup */
  if (APPLY) {
    const backupDir = './.backups';
    if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFile = path.join(backupDir, `hsr-deduplicate-split-backup-${timestamp}.json`);
    
    const backupData = {
      timestamp: new Date().toISOString(),
      operation: 'HSR_DEDUPLICATE_AND_SPLIT',
      before_count: allStock.length,
      after_count: toKeep.length,
      deleted: toDelete.map(d => ({ _id: d._id, barcodeNo: d.barcodeNo })),
      hsr_ids: forHsr.map(b => b._id),
      warehouse_ids: forWarehouse.map(b => b._id)
    };
    
    fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
    console.log(`💾 Backup created: ${backupFile}\n`);
  }

  /* Execute changes */
  if (APPLY) {
    console.log('🔄 Step 1: Deleting duplicates...');
    
    const deleteIds = toDelete.map(d => d._id);
    const deleteResult = await db.collection('barcodeLabel').deleteMany({
      _id: { $in: deleteIds }
    });
    
    console.log(`✅ Deleted: ${deleteResult.deletedCount} duplicates\n`);

    console.log('🔄 Step 2: Moving half to HSR...');
    
    const hsrIds = forHsr.map(b => b._id);
    const hsrResult = await db.collection('barcodeLabel').updateMany(
      { _id: { $in: hsrIds } },
      { 
        $set: { 
          locationId: HSR_LOCATION_ID,
          currentLocationId: new mongoose.Types.ObjectId(HSR_LOCATION_ID),
          businessId: HSR_BUSINESS_ID,
          currentBusinessId: new mongoose.Types.ObjectId(HSR_BUSINESS_ID),
          'customFields.hsrStock': true,
          'customFields.origins': ['Temple Fabrics Warehouse']
        } 
      }
    );
    
    console.log(`✅ Moved to HSR: ${hsrResult.modifiedCount}\n`);

    console.log('🔄 Step 3: Moving half to Warehouse...');
    
    const warehouseIds = forWarehouse.map(b => b._id);
    const warehouseResult = await db.collection('barcodeLabel').updateMany(
      { _id: { $in: warehouseIds } },
      { 
        $set: { 
          locationId: WAREHOUSE_ID,
          currentLocationId: new mongoose.Types.ObjectId(WAREHOUSE_ID),
          businessId: WAREHOUSE_BUSINESS_ID,
          currentBusinessId: new mongoose.Types.ObjectId(WAREHOUSE_BUSINESS_ID),
          'customFields.hsrStock': true,
          'customFields.origins': ['Temple Fabrics Warehouse']
        } 
      }
    );
    
    console.log(`✅ Moved to Warehouse: ${warehouseResult.modifiedCount}\n`);

    /* Verify */
    console.log('🔍 Verifying final distribution...');
    
    const hsrFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: HSR_LOCATION_ID,
      status: 'IN_STOCK'
    });

    const warehouseFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      locationId: WAREHOUSE_ID,
      status: 'IN_STOCK'
    });

    const totalFinal = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      status: 'IN_STOCK'
    });

    console.log(`\n✅ Final Stock Distribution:`);
    console.log(`   📍 HSR (TEMPLE FABRICS, SILKS & SAREES): ${hsrFinal} barcodes`);
    console.log(`   📍 WAREHOUSE (TEMPLE FABRICS WAREHOUSE): ${warehouseFinal} barcodes`);
    console.log(`   📦 Total (no duplicates): ${totalFinal} barcodes`);
    
    if (totalFinal === uniqueBarcodes) {
      console.log(`\n✅ SUCCESS! Deduplicated and split across both locations!`);
    }

    console.log('\n📌 TO ROLLBACK: Restore from backup file if needed');

  } else {
    console.log(`\n⚠️  DRY RUN - Would make these changes:`);
    console.log(`\n   1. Delete ${toDelete.length} duplicates`);
    console.log(`   2. Keep ${toKeep.length} unique barcodes`);
    console.log(`   3. Split: ${forHsr.length} to HSR, ${forWarehouse.length} to Warehouse`);
    console.log(`\n   Result: Stock visible in BOTH locations (no duplication)`);
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
