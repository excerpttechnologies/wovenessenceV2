import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';

const dir = 'purchase excels';
const files = fs.readdirSync(dir).filter((f) => /\.xlsx?$/i.test(f));
const itemToFiles = new Map();
let scanned = 0;
for (const f of files) {
  const full = path.join(dir, f);
  try {
    const wb = XLSX.readFile(full, { raw: false });
    const values = new Set();
    for (const name of wb.SheetNames) {
      const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, header: 1 });
      for (const row of rows) {
        for (const v of row) {
          const t = String(v ?? '').trim();
          if (t && /^[A-Za-z0-9][A-Za-z0-9._/-]{2,}$/.test(t)) values.add(t);
        }
      }
    }
    for (const v of values) {
      if (!itemToFiles.has(v)) itemToFiles.set(v, new Set());
      itemToFiles.get(v).add(f);
    }
    scanned++;
  } catch (e) {
    console.log('ERR', f, e.message);
  }
}
console.log('scanned files', scanned, 'distinct tokens', itemToFiles.size);

const wb = XLSX.readFile('hsr_opening_19_10_dated.xlsx', { raw: false });
const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
const g = rows.filter((r) => {
  const c = String(r['Supplier Code'] || '').trim();
  const n = String(r['Supplier Name'] || '').trim();
  return c === 'G741' || /unassigned/i.test(c) || /unassigned/i.test(n);
});
const codes = new Map();
for (const r of g) {
  const code = String(r['Item Code'] || '').trim();
  const qty = Number(String(r['Open Qty'] || '0').replace(/,/g, '')) || 0;
  if (!codes.has(code)) codes.set(code, { rows: 0, qty: 0 });
  const x = codes.get(code);
  x.rows++;
  x.qty += qty;
}
console.log('G741 distinct item codes', codes.size, 'rows', g.length);

const stats = { exactUnique: 0, exactMulti: 0, exactNone: 0, stripUnique: 0, stripMulti: 0, stripNone: 0 };
const uniqueExamples = [];
const multiExamples = [];
const noneExamples = [];
for (const [code, info] of codes) {
  const exact = itemToFiles.get(code);
  if (exact && exact.size === 1) { stats.exactUnique++; if (uniqueExamples.length < 10) uniqueExamples.push({ code, file: [...exact][0], info }); }
  else if (exact && exact.size > 1) { stats.exactMulti++; if (multiExamples.length < 10) multiExamples.push({ code, files: [...exact].slice(0, 4), info }); }
  else stats.exactNone++;
  const stripped = code.replace(/S\d+$/i, '');
  const alt = stripped !== code ? itemToFiles.get(stripped) : null;
  if (alt && alt.size === 1) stats.stripUnique++;
  else if (alt && alt.size > 1) stats.stripMulti++;
  else { stats.stripNone++; if (noneExamples.length < 10) noneExamples.push({ code, stripped, info }); }
}
console.log('stats', JSON.stringify(stats));
console.log('exact unique examples', JSON.stringify(uniqueExamples, null, 2));
console.log('exact multi examples', JSON.stringify(multiExamples, null, 2));
console.log('none examples', JSON.stringify(noneExamples, null, 2));
