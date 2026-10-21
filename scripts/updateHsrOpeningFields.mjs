#!/usr/bin/env node

/* ==============================================================================
   UPDATE EXISTING HSR BARCODES WITH openingQty AND hsrPurPrice
   
   Reads hsr_opening_19_10_dated.xlsx and updates existing barcodes with:
   - openingQty (from "Open Qty" column)
   - hsrPurPrice (from "hsr pur price" column)
   
   Usage:
     node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/updateHsrOpeningFields.mjs [--limit=10] [--apply]
   
   Flags:
     --apply    Actually update database (default is DRY RUN)
     --limit=N  Process first N rows (default 10; --limit=0 = all)
============================================================================== */

import fs from 'fs';
import path from 'path';
import mongoose from 'mongoose';
import XLSX from 'xlsx';

const FILE = 'hsr_opening_19_10_dated.xlsx';
const SOURCE = 'HSR_OPENING_19_10';

/* Arguments */
const arg = (name, def) => {
  const hit = process.argv.find((a) => a.startsWith('--' + name + '='));
  return hit ? hit.slice(name.length + 3) : def;
};
const APPLY = process.argv.includes('--apply');
const LIMIT = Number(arg('limit', '10'));

/* Helpers */
const { ObjectId } = mongoose.Types;
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
  console.log('\n' + '='.repeat(80));
  console.log('UPDATE EXISTING HSR BARCODES WITH NEW FIELDS');
  console.log('='.repeat(80));
  console.log(`Mode: ${APPLY ? '🔴 APPLY (UPDATE)' : '🟡 DRY RUN (READ ONLY)'}`);
  console.log(`File: ${FILE}`);
  console.log(`Limit: ${LIMIT === 0 ? 'ALL ROWS' : LIMIT + ' rows'}`);
  console.log('='.repeat(80) + '\n');

  const file = path.resolve(process.cwd(), FILE);
  if (!fs.existsSync(file)) throw new Error(`File not found: ${file}`);

  /* Read Excel */
  console.log(`📂 Reading file...`);
  const wb = XLSX.readFile(file);
  const sheetName = wb.SheetNames[0];
  const sheet = wb.Sheets[sheetName];
  const all = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
  const rows = LIMIT > 0 ? all.slice(0, LIMIT) : all;
  console.log(`✅ Loaded ${all.length} rows from Excel, processing ${rows.length}\n`);

  /* Connect */
  console.log(`🔌 Connecting to MongoDB...`);
  await mongoose.connect(process.env.MONGODB_URI, {
    serverSelectionTimeoutMS: 25000,
    connectTimeoutMS: 25000
  });
  console.log(`✅ Connected\n`);

  const db = mongoose.connection.db;
  const report = [];
  let updated = 0;
  let notFound = 0;
  let skipped = 0;

  console.log(`🔄 Processing rows...\n`);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const excelRow = i + 2;

    const barcode = txt(getColumnValue(r, ['Item Code', 'Barcode', 'Barcode No', 'ItemCode']));
    const openingQty = num(getColumnValue(r, ['Open Qty', 'Opening Qty', 'Qty']));
    const hsrPurPrice = num(getColumnValue(r, ['hsr pur price', 'HSR Pur Price', 'HSR Purchase Price', 'Pur Price', 'Purchase Price']));

    if (!barcode) {
      report.push({ row: excelRow, barcode: 'MISSING', status: 'error', note: 'No barcode' });
      continue;
    }

    // Find existing barcode with source
    const existing = await db.collection('barcodeLabel').findOne({
      source: SOURCE,
      $or: [
        { barcodeNo: barcode },
        { barcodeNo: barcode.toUpperCase() },
        { oldBarcode: barcode },
        { oldBarcode: barcode.toUpperCase() }
      ]
    });

    if (!existing) {
      report.push({ row: excelRow, barcode, status: 'not-found', openingQty, hsrPurPrice, note: 'Not in DB' });
      notFound++;
      continue;
    }

    // Check if already has values
    if (existing.openingQty > 0 && existing.hsrPurPrice > 0) {
      report.push({ 
        row: excelRow, 
        barcode, 
        status: 'skipped', 
        openingQty: existing.openingQty, 
        hsrPurPrice: existing.hsrPurPrice,
        note: 'Already has values' 
      });
      skipped++;
      continue;
    }

    // Update
    if (APPLY) {
      await db.collection('barcodeLabel').updateOne(
        { _id: existing._id },
        { $set: { openingQty, hsrPurPrice } }
      );
      report.push({ row: excelRow, barcode, status: 'updated', openingQty, hsrPurPrice, note: '' });
      updated++;
    } else {
      report.push({ row: excelRow, barcode, status: 'would-update', openingQty, hsrPurPrice, note: '' });
      updated++;
    }

    if ((i + 1) % 100 === 0) console.log(`   Processed ${i + 1}...`);
  }

  console.log(`\n✅ Processing complete\n`);

  /* Summary */
  console.log('='.repeat(80));
  console.log('📊 SUMMARY');
  console.log('='.repeat(80));
  console.table(report.slice(0, 20));
  if (report.length > 20) console.log(`\n... and ${report.length - 20} more rows\n`);

  console.log(`\n📈 Stats:`);
  console.log(`   ${APPLY ? 'Updated' : 'Would update'}: ${updated}`);
  console.log(`   Not found: ${notFound}`);
  console.log(`   Skipped (already has values): ${skipped}`);

  /* Save report */
  const dir = path.join(process.cwd(), 'scripts', 'reports');
  fs.mkdirSync(dir, { recursive: true });
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const outFile = path.join(dir, `hsr-update-fields-${APPLY ? 'applied' : 'dryrun'}-${timestamp}.csv`);
  const csv = (v) => '"' + String(v ?? '').replace(/"/g, '""') + '"';
  fs.writeFileSync(outFile, [
    'row,barcode,status,openingQty,hsrPurPrice,note',
    ...report.map((x) => [x.row, x.barcode, x.status, x.openingQty || '', x.hsrPurPrice || '', x.note].map(csv).join(',')),
  ].join('\n'));
  console.log(`\n📄 Report: ${path.relative(process.cwd(), outFile)}`);

  if (!APPLY) {
    console.log('\n⚠️  DRY RUN - NO CHANGES MADE. Add --apply to update.');
  } else {
    console.log('\n✅ UPDATE COMPLETED!');
  }

  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error('\n❌ FAILED:', err.message);
  console.error(err.stack);
  await mongoose.disconnect().catch(() => {});
  process.exit(1);
});
