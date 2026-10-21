import XLSX from 'xlsx';
import fs from 'fs';
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const g = rows.filter((r) => {
  const c = String(r['Supplier Code'] || '').trim();
  const n = String(r['Supplier Name'] || '').trim();
  return c === 'G741' || /unassigned/i.test(c) || /unassigned/i.test(n);
});
console.log('G741 rows', g.length);
console.log('distinct item codes', new Set(g.map((r) => String(r['Item Code'] || '').trim())).size);
console.log('open qty > 0', g.filter((r) => Number(String(r['Open Qty'] || '0').replace(/,/g, '')) > 0).length);
const withGrc = g.filter((r) => String(r['GRC No'] || '').trim());
const withInv = g.filter((r) => String(r['Supplier Invoice No'] || '').trim());
console.log('with GRC', withGrc.length, 'with invoice', withInv.length);
const grcRows = withGrc.map((r) => ({ item: r['Item Code'], qty: r['Open Qty'], grc: r['GRC No'], inv: r['Supplier Invoice No'], name: r['Supplier Name'] }));
console.log('grc rows', JSON.stringify(grcRows, null, 2));
const files = fs.readdirSync('purchase excels');
console.log('purchase files', files.length);
const grcNums = [...new Set(grcRows.map((r) => String(r.grc).replace(/\D/g, '')))].filter(Boolean);
console.log('grc numbers', JSON.stringify(grcNums));
for (const num of grcNums) {
  const hits = files.filter((f) => f.includes(num));
  console.log('GRC', num, 'file hits', JSON.stringify(hits));
}
