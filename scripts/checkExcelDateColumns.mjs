#!/usr/bin/env node
import XLSX from 'xlsx';
import path from 'path';

const FILE = 'hsr_opening_19_10_dated.xlsx';
const file = path.resolve(process.cwd(), FILE);

console.log('\n📂 Reading Excel file...');
const wb = XLSX.readFile(file);
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });

console.log(`✅ Loaded ${data.length} rows\n`);

// Check first few rows for Date and Age columns
console.log('📋 Sample Data (first 5 rows):\n');
for (let i = 0; i < Math.min(5, data.length); i++) {
  const row = data[i];
  console.log(`Row ${i + 2}:`);
  console.log(`  Item Code: ${row['Item Code'] || row['Barcode'] || row['ItemCode']}`);
  console.log(`  Date: ${row['Date'] || row['date'] || row['Purchase Date']}`);
  console.log(`  Age: ${row['Age'] || row['age']}`);
  console.log(`  Purchase Date: ${row['Purchase Date'] || row['purchaseDate']}`);
  console.log();
}

// Show all column names
console.log('📊 All Column Names:');
if (data.length > 0) {
  const columns = Object.keys(data[0]);
  columns.forEach((col, i) => {
    console.log(`  ${i + 1}. ${col}`);
  });
}
