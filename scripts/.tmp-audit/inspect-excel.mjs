import XLSX from 'xlsx';

const file = process.argv[2] || 'hsr_opening_19_10_dated.xlsx';
const wb = XLSX.readFile(file, { raw: false });
console.log('workbook:', file);
console.log('sheets:', wb.SheetNames.join(' | '));
for (const name of wb.SheetNames) {
  const ws = wb.Sheets[name];
  const rows = XLSX.utils.sheet_to_json(ws, { defval: '', raw: false });
  console.log('\n=== SHEET:', name, ' rows:', rows.length, '===');
  if (!rows.length) continue;
  const headers = Object.keys(rows[0]);
  console.log('headers:', JSON.stringify(headers));
  console.log('sample row 1:', JSON.stringify(rows[0]));
  if (rows.length > 1) console.log('sample row 2:', JSON.stringify(rows[1]));
}
