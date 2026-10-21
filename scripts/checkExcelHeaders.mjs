import XLSX from 'xlsx';

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx');
const sheet = wb.Sheets[wb.SheetNames[0]];
const data = XLSX.utils.sheet_to_json(sheet);

console.log('\n📋 All Column Headers:');
console.log('='.repeat(60));
const headers = Object.keys(data[0]);
headers.forEach((h, i) => console.log(`${String(i + 1).padStart(2)}. [${h}]`));

console.log('\n🔍 Searching for location-related columns...');
const locHeaders = headers.filter(h => /location|loc/i.test(h));
if (locHeaders.length > 0) {
  console.log('✅ Found:', locHeaders.join(', '));
} else {
  console.log('❌ No location-related columns found');
}

console.log('\n📊 Sample data from first 3 rows:');
data.slice(0, 3).forEach((row, i) => {
  console.log(`\nRow ${i + 1}:`);
  console.log('  Item Code:', row['Item Code']);
  console.log('  Item Name:', row['Item Name']);
  console.log('  Group Name:', row['Group Name']);
  console.log('  Open Qty:', row['Open Qty']);
});
