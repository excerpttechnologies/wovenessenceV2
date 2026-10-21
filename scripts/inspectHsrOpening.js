const XLSX = require('xlsx');
const fs = require('fs');

const file = 'hsr_opening_19_10_dated.xlsx';

if (!fs.existsSync(file)) {
  console.error('❌ File not found:', file);
  process.exit(1);
}

console.log('📂 Reading:', file, '\n');

try {
  const wb = XLSX.readFile(file);
  
  console.log('📋 Worksheets:', wb.SheetNames.join(', '));
  console.log('   Total sheets:', wb.SheetNames.length, '\n');
  
  wb.SheetNames.forEach((sheetName, idx) => {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`📊 Sheet ${idx + 1}: "${sheetName}"`);
    console.log('='.repeat(80));
    
    const sheet = wb.Sheets[sheetName];
    const data = XLSX.utils.sheet_to_json(sheet, { raw: false, defval: '' });
    
    console.log(`   Total rows: ${data.length}`);
    
    if (data.length > 0) {
      const headers = Object.keys(data[0]);
      console.log(`\n📝 Headers (${headers.length} columns):`);
      headers.forEach((h, i) => console.log(`   ${String(i + 1).padStart(2)}.${h}`));
      
      console.log(`\n🔍 Sample Data (first 3 rows):`);
      data.slice(0, 3).forEach((row, i) => {
        console.log(`\n   Row ${i + 2}:`);
        Object.entries(row).slice(0, 20).forEach(([k, v]) => {
          if (v && String(v).trim()) {
            console.log(`      ${k}: ${v}`);
          }
        });
      });
      
      // Check for key columns
      console.log(`\n🔑 Key Column Detection:`);
      const keyColumns = ['Item Code', 'Barcode', 'Item Name', 'Location', 'Qty', 'Quantity', 'Date', 'Age'];
      keyColumns.forEach(col => {
        const found = headers.find(h => h.toLowerCase().includes(col.toLowerCase()));
        if (found) {
          console.log(`   ✅ ${col}: Found as "${found}"`);
          // Show sample value
          const sample = data[0][found];
          if (sample) console.log(`      Sample: ${sample}`);
        } else {
          console.log(`   ❌ ${col}: Not found`);
        }
      });
    }
  });
  
  console.log(`\n${'='.repeat(80)}\n`);
  console.log('✅ Inspection complete!\n');
  
} catch (error) {
  console.error('❌ Error reading Excel file:', error.message);
  process.exit(1);
}
