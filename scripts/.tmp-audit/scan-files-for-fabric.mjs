import XLSX from 'xlsx';
import fs from 'fs';
import path from 'path';
const needles = ['10.CTNSLK', 'OM1098', 'OM1109'];
const checkWb = (file) => {
  const hits = [];
  let wb;
  try { wb = XLSX.readFile(file, { raw: false }); } catch (e) { return hits; }
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, header: 1 });
    for (const row of rows) {
      const flat = row.map((v) => String(v));
      if (flat.some((v) => needles.some((n) => v.includes(n)))) hits.push({ file: path.basename(file), sheet: name, row: flat.filter((v) => v !== '').slice(0, 12) });
    }
  }
  return hits;
};
const master = 'HSR MASTER AS ON 1510 7 40.xlsx';
const masterHits = checkWb(master);
console.log('master hits', masterHits.length);
for (const h of masterHits.slice(0, 10)) console.log(JSON.stringify(h));
const dir = 'purchase excels';
const files = fs.readdirSync(dir).filter((f) => f.toLowerCase().endsWith('.xlsx'));
let scanned = 0;
let found = 0;
for (const f of files) {
  const hits = checkWb(path.join(dir, f));
  scanned++;
  if (hits.length) {
    found += hits.length;
    console.log('PURCHASE HIT', JSON.stringify(hits.slice(0, 3)));
  }
}
console.log('purchase scanned', scanned, 'hits', found);
