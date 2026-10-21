const fs = require('fs');
const XLSX = require('xlsx');

const file = 'hsr_opening_19_10_dated.csv';

console.log('📂 Reading CSV:', file, '\n');

try {
  const wb = XLSX.readFile(file, { type: 'file' });
  
  console.log('📋 Sheets:', wb.SheetNames.join(', '));
  
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  console.log('📊 Total rows:', data.length);
  
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    console.log(`\n📝 Detected ${headers.length} columns:`);
    headers.forEach((h, i) => console.log(`   ${String(i + 1).padStart(2)}. "${h}"`));
    
    console.log(`\n🔍 First 3 rows sample:`);
    data.slice(0, 3).forEach((row, i) => {
      console.log(`\n   Row ${i + 2}:`);
      Object.entries(row).slice(0, 15).forEach(([k, v]) => {
        if (v && String(v).trim()) console.log(`      ${k}: ${v}`);
      });
    });
    
    // Check for key columns
    console.log(`\n🔑 Key Column Detection:`);
    const keyColumns = {
      'Barcode': ['Item Code', 'Barcode', 'Barcode No', 'ItemCode', 'Item_Code'],
      'Location': ['Location Name', 'Location', 'Loc Name', 'Branch', 'Location_Name'],
      'Quantity': ['Close Qty', 'Quantity', 'Qty', 'Stock Qty', 'Close_Qty'],
      'Item Name': ['Item Name', 'Item', 'ItemName', 'Item_Name'],
      'Supplier': ['Supplier Code', 'Supplier Name', 'Supplier'],
      'Date': ['Stock Date', 'Date', 'As On Date'],
      'Age': ['Age', 'Stock Age', 'Age (Days)'],
    };
    
    Object.entries(keyColumns).forEach(([label, variations]) => {
      const found = headers.find(h => 
        variations.some(v => h.toLowerCase() === v.toLowerCase())
      );
      if (found) {
        console.log(`   ✅ ${label}: Found as "${found}"`);
        const sample = data[0][found];
        if (sample) console.log(`      Sample: ${sample}`);
      } else {
        console.log(`   ❌ ${label}: Not found (tried: ${variations.join(', ')})`);
      }
    });
  }
  
  console.log('\n✅ CSV file readable!\n');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  process.exit(1);
}
