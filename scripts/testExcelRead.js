const XLSX = require('xlsx');

console.log('Testing Excel file read...\n');

try {
  const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx');
  console.log('✅ File read successfully!');
  console.log('📋 Sheets:', wb.SheetNames.join(', '));
  
  const sheet = wb.Sheets[wb.SheetNames[0]];
  const data = XLSX.utils.sheet_to_json(sheet, { defval: '' });
  
  console.log('📊 Rows:', data.length);
  
  if (data.length > 0) {
    const headers = Object.keys(data[0]);
    console.log('📝 Headers:', headers.length);
    headers.forEach((h, i) => console.log(`   ${i + 1}. ${h}`));
    
    console.log('\n🔍 First row sample:');
    Object.entries(data[0]).slice(0, 10).forEach(([k, v]) => {
      if (v) console.log(`   ${k}: ${v}`);
    });
  }
  
  console.log('\n✅ Excel file is readable!');
  
} catch (error) {
  console.error('❌ Error:', error.message);
  console.error(error.stack);
  process.exit(1);
}
