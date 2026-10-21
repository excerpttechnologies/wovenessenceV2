#!/usr/bin/env node
import mongoose from 'mongoose';
import XLSX from 'xlsx';
import path from 'path';

await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;

console.log('\n' + '='.repeat(80));
console.log('🔍 INVESTIGATING DATE/AGE ISSUE');
console.log('='.repeat(80) + '\n');

// Check database values
const sample = await db.collection('barcodeLabel').findOne({
  source: 'HSR_OPENING_19_10',
  barcodeNo: 'OM1169'
});

console.log('📋 Database Sample (OM1169):');
console.log(JSON.stringify({
  barcodeNo: sample?.barcodeNo,
  stockDate: sample?.stockDate,
  stockAge: sample?.stockAge,
  createdAt: sample?.createdAt,
  updatedAt: sample?.updatedAt
}, null, 2));

// Check Excel values
console.log('\n📂 Excel Sample:');
const file = path.resolve(process.cwd(), 'hsr_opening_19_10_dated.xlsx');
const wb = XLSX.readFile(file);
const data = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { raw: false, defval: '' });

const excelRow = data.find(r => r['Item Code'] === 'OM1169');
if (excelRow) {
  console.log(JSON.stringify({
    'Item Code': excelRow['Item Code'],
    'Date': excelRow['Date'],
    'Age': excelRow['Age'],
    'Purchase Date': excelRow['Purchase Date']
  }, null, 2));
}

console.log('\n💡 DIAGNOSIS:');
console.log('   Issue: Excel has date "2025-10-18" which is in the FUTURE!');
console.log('   Today: 2026-10-19');
console.log('   Excel date: 2025-10-18 (1 year ago!)');
console.log('   The dates should be: 2025-10-18 (purchase date from 1 year ago)');
console.log('\n   Age should be calculated from purchase date to TODAY (2026-10-19)');
console.log('   Expected age: ~366 days');

await mongoose.disconnect();
