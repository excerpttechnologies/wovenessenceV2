import XLSX from 'xlsx';
const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const txt = (v) => String(v ?? '').trim();
const isP = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const unassigned = rows.filter((r) => isP(r['Supplier Code']));
const named = rows.filter((r) => !isP(r['Supplier Code']));
const byItem = new Map();
for (const r of named) {
  const k = txt(r['Item Name']);
  if (!byItem.has(k)) byItem.set(k, new Map());
  const m = byItem.get(k);
  const s = `${txt(r['Supplier Code'])}|${txt(r['Supplier Name'])}`;
  m.set(s, (m.get(s) || 0) + 1);
}
const uByItem = new Map();
for (const r of unassigned) {
  const k = txt(r['Item Name']);
  uByItem.set(k, (uByItem.get(k) || 0) + 1);
}
let singleCovered = 0;
let multiCount = 0;
let noneCount = 0;
const singles = [];
for (const [item, n] of uByItem) {
  const sups = byItem.get(item);
  if (!sups || sups.size === 0) { noneCount += n; continue; }
  if (sups.size === 1) {
    singleCovered += n;
    const [sup, c] = [...sups.entries()][0];
    singles.push({ item, unassigned: n, supplier: sup, namedRows: c });
  } else multiCount += n;
}
console.log(JSON.stringify({ totalUnassigned: unassigned.length, singleSupplierItemCovered: singleCovered, multiSupplierItems: multiCount, noSupplierItems: noneCount, distinctItems: uByItem.size }, null, 2));
console.log('\ntop single-supplier items:');
for (const s of singles.sort((a, b) => b.unassigned - a.unassigned).slice(0, 15)) console.log(JSON.stringify(s));
console.log('\nCTNSLK:', JSON.stringify(singles.find((s) => /CTNSLK/i.test(s.item))));
