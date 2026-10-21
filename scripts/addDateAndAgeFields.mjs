#!/usr/bin/env node

/* ==============================================================================
   ADD DATE AND AGE FIELDS FROM EXCEL TO EXISTING BARCODES
   
   Reads Excel and updates all HSR_OPENING_19_10 barcodes with:
   - stockDate (from "Date" or "Purchase Date" column)
   - stockAge (from "Age" column)
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/addDateAndAgeFields.mjs [--apply]
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const APPLY = process.argv.includes('--apply');
const FILE = 'hsr_opening_19_10_dated.xlsx';
const SOURCE = 'HSR_OPENING_19_10';
const CHUNK = 1000;

/* Helpers */
const txt = (v) => String(v ?? '').trim();
const num = (v) => {
  const n = Number(String(v ?? '').replace(/,/g, ''));
  return Number.isFinite(n) ? n : 0;
};

function getColumnValue(row, variations) {
  for (const variant of variations) {
    if (row[variant] !== undefined && row[variant] !== '') return row[variant];
  }
  return '';
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  try {
    // Handle Excel date formats: 2025-10-18 or other formats
    const d = new Date(dateStr);
    return isNaN(d.getTime()) ? null : d;
  } catch {
    return null;
  }
}

async function main() {
  console.time('total');
  console.log('\n' + '='.repeat(80));
  console.log('📅 ADD DATE AND AGE FIELDS FROM EXCEL');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY' : '🟡 DRY RUN'}`);
  console.log('='.repeat(80) + '\n');

  /* Read Excel */
  const file = path.resolve(process.cwd(), FILE);
  console.log(`📂 Reading ${FILE}...`);
  const wb = XLSX.readFile(file);
  const all = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });
  console.log(`✅ Loaded ${all.length} rows\n`);

  /* Build lookup map: barcode -> { stockDate, stockAge } */
  console.log(`🗂️  Building date/age lookup map...`);
  const excelData = new Map();
  
  for (const r of all) {
    const barcode = txt(getColumnValue(r, ['Item Code', 'Barcode', 'Barcode No', 'ItemCode'])).toUpperCase();
    if (!barcode) continue;
    
    const dateValue = getColumnValue(r, ['Date', 'Purchase Date', 'date', 'purchaseDate']);
    const ageValue = getColumnValue(r, ['Age', 'age']);
    
    const stockDate = parseDate(dateValue);
    const stockAge = num(ageValue);
    
    excelData.set(barcode, { stockDate, stockAge });
  }
  console.log(`✅ Built map for ${excelData.size} barcodes\n`);

  /* Connect */
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  console.log(`✅ Connected\n`);

  /* Fetch all existing barcodes */
  console.log(`📦 Fetching existing barcodes...`);
  const existing = await db.collection('barcodeLabel').find(
    { source: SOURCE, status: 'IN_STOCK' },
    { projection: { _id: 1, barcodeNo: 1, oldBarcode: 1, stockDate: 1, stockAge: 1 } }
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
    if (doc.stockDate && doc.stockAge > 0) {
      skipped++;
      continue;
    }

    const updateFields = {};
    if (excelValues.stockDate) {
      updateFields.stockDate = excelValues.stockDate;
    }
    if (excelValues.stockAge > 0) {
      updateFields.stockAge = excelValues.stockAge;
    }

    if (Object.keys(updateFields).length > 0) {
      bulkOps.push({
        updateOne: {
          filter: { _id: doc._id },
          update: { $set: updateFields }
        }
      });
    }
  }

  console.log(`✅ Prepared ${bulkOps.length} updates`);
  console.log(`   Skipped (already has values): ${skipped}`);
  console.log(`   Not in Excel: ${notInExcel}\n`);

  if (bulkOps.length === 0) {
    console.log('✅ Nothing to update!\n');
    await mongoose.disconnect();
    return;
  }

  /* Execute bulk updates */
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
    const withDate = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      stockDate: { $exists: true, $ne: null }
    });
    console.log(`✅ ${withDate} barcodes now have stockDate field`);

    const withAge = await db.collection('barcodeLabel').countDocuments({
      source: SOURCE,
      stockAge: { $exists: true, $ne: 0 }
    });
    console.log(`✅ ${withAge} barcodes now have stockAge field\n`);

  } else {
    console.log(`\n⚠️  DRY RUN - would update ${bulkOps.length} barcodes`);
    console.log(`   Sample updates (first 5):`);
    
    for (let i = 0; i < Math.min(5, bulkOps.length); i++) {
      const op = bulkOps[i];
      const barcode = existing.find(e => e._id.equals(op.updateOne.filter._id));
      const excelValues = excelData.get(barcode.barcodeNo.toUpperCase());
      console.log(`     ${barcode.barcodeNo}: stockDate=${excelValues.stockDate?.toISOString().split('T')[0]}, stockAge=${excelValues.stockAge}`);
    }
    
    console.log(`\n   Add --apply to execute\n`);
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
