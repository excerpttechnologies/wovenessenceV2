import XLSX from 'xlsx';

const file = process.argv[2] || 'hsr_opening_19_10_dated.xlsx';
const wb = XLSX.readFile(file, { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
console.log('rows:', rows.length);

const norm = (v) => String(v ?? '').trim();
const pairs = new Map();
for (const r of rows) {
  const code = norm(r['Supplier Code']);
  const name = norm(r['Supplier Name']);
  const k = code + '|' + name;
  pairs.set(k, (pairs.get(k) || 0) + 1);
}
const list = [...pairs.entries()].sort((a, b) => b[1] - a[1]);
console.log('\ndistinct supplier code/name pairs:', list.length);
list.forEach(([k, n]) => console.log(String(n).padStart(6), k));

console.log('\nrows with G741 / G589:');
for (const r of rows) {
  const code = norm(r['Supplier Code']);
  if (!/^G0*(741|589)$/i.test(code)) continue;
  console.log(JSON.stringify({
    sl: r['sl no.'], group: r['Group Name'], itemCode: r['Item Code'], itemCode1: r['Item Code_1'],
    supplierCode: code, supplierName: r['Supplier Name'], grc: r['GRC No'], qty: r['Open Qty'],
    itemName: r['Item Name'], printDescription: r['Print Description'], hsn: r['HSN'],
  }));
}

const unassigned = rows.filter((r) => /^\(unassigned\)$/i.test(norm(r['Supplier Code'])) || /^\(unassigned\)$/i.test(norm(r['Supplier Name'])));
console.log('\nunassigned rows:', unassigned.length);
const uniq = new Set(rows.map((r) => norm(r['Supplier Code'])));
console.log('distinct supplier codes:', uniq.size);
console.log('distinct item codes:', new Set(rows.map((r) => norm(r['Item Code']))).size);
console.log('distinct sl no:', new Set(rows.map((r) => norm(r['sl no.']))).size);
console.log('duplicate item codes total extra:', rows.length - new Set(rows.map((r) => norm(r['Item Code']))).size);
