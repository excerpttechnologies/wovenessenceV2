import XLSX from 'xlsx';
import fs from 'fs';

const file = 'hsr_opening_19_10_dated.xlsx';
console.log('Reading:', file);

const wb = XLSX.readFile(file);
console.log('\n📋 Worksheets:', wb.SheetNames.join(', '));

const sheetName = wb.SheetNames[0];
const sheet = wb.Sheets[sheetName];
const all = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });

console.log(`\n📊 Sheet: "${sheetName}"`);
console.log(`   Total rows: ${all.length}`);

if (all.length > 0) {
  const headers = Object.keys(all[0]);
  console.log(`\n📝 Headers (${headers.length}):`);
  headers.forEach((h, i) => console.log(`   ${i + 1}. ${h}`));
  
  console.log('\n🔍 Sample rows (first 3):');
  all.slice(0, 3).forEach((row, i) => {
    console.log(`\n   Row ${i + 2}:`);
    Object.entries(row).slice(0, 15).forEach(([k, v]) => {
      if (v) console.log(`      ${k}: ${v}`);
    });
  });
}
