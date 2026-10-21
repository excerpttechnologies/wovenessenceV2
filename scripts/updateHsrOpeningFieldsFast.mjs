#!/usr/bin/env node

/* ==============================================================================
   FAST UPDATE: Existing HSR barcodes with openingQty & hsrPurPrice
   
   Uses bulkWrite for maximum speed - completes 20k+ records in ~1-2 minutes
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/updateHsrOpeningFieldsFast.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const FILE = 'hsr_opening_19_10_dated.xlsx';
const SOURCE = 'HSR_OPENING_19_10';
const APPLY = process.argv.includes('--apply');
const CHUNK = 1000; // Bulk operations per batch

/* Helpers */
const txt = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function getColumnValue(row, variations) {
  for (const variant of variations) {
    if (row[variant] !== undefined) return row[variant];
  }
  return '';
}

/* Main */
async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('⚡ FAST UPDATE: HSR OPENING FIELDS (BULK MODE)');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  /* Read Excel */
  const file = path.resolve(process.cwd(), FILE);
  console.log(`📂 Reading ${FILE}...`);
  const wb = XLSX.readFile(file);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
  console.log(`✅ Loaded ${all.length} rows\n`);

  /* Build lookup map: barcode -> { openingQty, hsrPurPrice } */
  console.log(`🗂️  Building lookup map...`);
  const excelData = new Map();
  
  for (const r of all) {
    const barcode = txt(getColumnValue(r, ['Item Code', 'Barcode', 'Barcode No', 'ItemCode'])).toUpperCase();
    if (!barcode) continue;
    
    const openingQty = num(getColumnValue(r, ['Open Qty', 'Opening Qty', 'Qty']));
    const hsrPurPrice = num(getColumnValue(r, ['hsr pur price', 'HSR Pur Price', 'HSR Purchase Price', 'Pur Price', 'Purchase Price']));
    
    excelData.set(barcode, { openingQty, hsrPurPrice });
  }
  console.log(`✅ Built map for ${excelData.size} barcodes\n`);

  /* Connect */
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000
  });
  console.log(`✅ Connected\n`);

  const db = mongoose.connection.db;

  /* Fetch all existing HSR barcodes */
  console.log(`📦 Fetching existing barcodes...`);
  const existing = await db.collection('barcodeLabel').find(
    { source: SOURCE },
    { projection: { _id: 1, barcodeNo: 1, oldBarcode: 1, openingQty: 1, hsrPurPrice: 1 } }
  ).toArray();
  console.log(`✅ Found ${existing.length} existing barcodes\n`);

  /* Build bulk operations */
  console.log(`⚡ Preparing bulk updates...`);
  const bulkOps = [];
  let skipped = 0;
  let notInExcel = 0;

  for (const doc of existing) {
    const barcode = (doc.barcodeNo || doc.oldBarcode || '').toUpperCase();
    const excelValues = excelData.get(barcode);
    
    if (!excelValues) {
      notInExcel++;
      continue;
    }

    // Skip if already has both values
    if (doc.openingQty > 0 && doc.hsrPurPrice > 0) {
      skipped++;
      continue;
    }

    bulkOps.push({
      updateOne: {
        filter: { _id: doc._id },
        update: { 
          $set: { 
            openingQty: excelValues.openingQty,
            hsrPurPrice: excelValues.hsrPurPrice
          } 
        }
      }
    });
  }

  console.log(`✅ Prepared ${bulkOps.length} updates`);
  console.log(`   Skipped (already has values): ${skipped}`);
  console.log(`   Not in Excel: ${notInExcel}\n`);

  if (bulkOps.length === 0) {
    console.log('✅ Nothing to update!\n');
    await mongoose.disconnect();
    return;
  }

  /* Execute bulk updates in chunks */
  if (APPLY) {
    console.log(`🚀 Executing bulk updates (${CHUNK} per batch)...\n`);
    let completed = 0;
    
    for (let i = 0; i < bulkOps.length; i += CHUNK) {
      const chunk = bulkOps.slice(i, i + CHUNK);
      const result = await db.collection('barcodeLabel').bulkWrite(chunk, { ordered: false });
      completed += chunk.length;
      
      const pct = ((completed / bulkOps.length) * 100).toFixed(1);
      console.log(`   ${completed}/${bulkOps.length} (${pct}%) - modified: ${result.modifiedCount}`);
    }

    console.log(`\n✅ BULK UPDATE COMPLETED!`);
    console.log(`   Total operations: ${bulkOps.length}`);
    console.log(`   Batches: ${Math.ceil(bulkOps.length / CHUNK)}\n`);

    /* Verify */
    console.log(`🔍 Verifying...`);
    const withFields = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      openingQty: { $exists: true, $ne: 0 }
    });
    console.log(`✅ ${withFields} barcodes now have openingQty field`);

    const withPrice = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      hsrPurPrice: { $exists: true, $ne: 0 }
    });
    console.log(`✅ ${withPrice} barcodes now have hsrPurPrice field\n`);

  } else {
    console.log(`\n⚠️  DRY RUN - would update ${bulkOps.length} barcodes`);
    console.log(`   Add --apply to execute\n`);
  }

  await mongoose.disconnect();
  console.timeEnd('total');
  console.log();
}

main().catch(async (err) => {
  console.error('\n❌ ERROR:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
