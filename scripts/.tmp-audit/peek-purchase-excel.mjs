import XLSX from 'xlsx';
const file = 'purchase excels/CHIRALA_Handlooms_G437_GRC_05126_updated (1).xlsx';
const wb = XLSX.readFile(file, { raw: false });
console.log('file', file, 'sheets', JSON.stringify(wb.SheetNames));
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, header: 1 });
  console.log('sheet', name, 'rows', rows.length);
  rows.slice(0, 8).forEach((r, i) => console.log(i, JSON.stringify(r)));
}
