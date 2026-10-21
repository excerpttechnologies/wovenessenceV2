import XLSX from 'xlsx';
import fs from 'fs';
const txt = (v) => String(v ?? '').trim();
const isP = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const readSheet = (file) => {
  const wb = XLSX.readFile(file, { raw: false });
  return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
};
const oldRows = readSheet('hsr_opening_19_10_dated.xlsx');
const newRows = readSheet('C:/Users/Admin/AppData/Local/Temp/opencode/hsr-new-snapshot.xlsx');
console.log('old rows', oldRows.length, 'new rows', newRows.length);
const codeKey = 'Supplier Code';
const nameKey = 'Supplier Name';
const bcKey = (() => {
  const h = Object.keys(newRows[0] || {});
  return h.find((k) => /^item code$/i.test(txt(k))) || 'Item Code';
})();
const keyOf = (r) => `${txt(r[bcKey])}|${txt(r['Item Name'])}`;
const oldMap = new Map();
for (const r of oldRows) oldMap.set(keyOf(r), `${txt(r[codeKey])}|${txt(r[nameKey])}`);
let newlyNamed = 0;
let changedName = 0;
let stillUnassigned = 0;
const bySupplier = new Map();
const samples = [];
for (const r of newRows) {
  const cur = `${txt(r[codeKey])}|${txt(r[nameKey])}`;
  const prev = oldMap.get(keyOf(r)) || '(no-old-row)';
  if (isP(r[codeKey])) { stillUnassigned++; continue; }
  if (isP(prev.split('|')[0])) {
    newlyNamed++;
    bySupplier.set(cur, (bySupplier.get(cur) || 0) + 1);
    if (samples.length < 8) samples.push({ key: keyOf(r), before: prev, after: cur });
  } else if (prev !== cur) {
    changedName++;
    if (samples.length < 12) samples.push({ key: keyOf(r), before: prev, after: cur });
  }
}
console.log(JSON.stringify({ newlyNamed, changedName, stillUnassigned }, null, 2));
console.log('newly named by supplier:');
for (const [k, n] of [...bySupplier.entries()].sort((a, b) => b[1] - a[1])) console.log(JSON.stringify({ supplier: k, rows: n }));
console.log('samples', JSON.stringify(samples, null, 1));
