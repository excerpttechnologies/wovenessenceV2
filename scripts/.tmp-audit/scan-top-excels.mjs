import XLSX from 'xlsx';
import fs from 'fs';
const files = ['hsr_opening_19_10_dated.xlsx', 'HSR MASTER AS ON 1510 7 40.xlsx', 'newData.xlsx'];
const sampleBarcodes = new Set(['142015', '7A2068S01', '10A1631']);
for (const file of files) {
  if (!fs.existsSync(file)) { console.log('\nMISSING', file); continue; }
  const wb = XLSX.readFile(file, { raw: false });
  console.log('\nFILE', file, 'mtime', fs.statSync(file).mtime.toISOString(), 'sheets', JSON.stringify(wb.SheetNames));
  for (const name of wb.SheetNames) {
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false });
    console.log(' sheet', name, 'rows', rows.length, 'headers', JSON.stringify(Object.keys(rows[0] || {})));
    const hits = rows.filter((r) => Object.values(r).some((v) => {
      const t = String(v ?? '').trim();
      return t === 'G741' || /unassigned/i.test(t) || sampleBarcodes.has(t);
    }));
    console.log(' hits', hits.length);
    hits.slice(0, 5).forEach((r) => {
      const picked = {};
      for (const [k, v] of Object.entries(r)) {
        if (/supplier|party|vendor|item code|barcode|grc|invoice|name/i.test(k) || sampleBarcodes.has(String(v ?? '').trim()) || String(v ?? '').trim() === 'G741') picked[k] = v;
      }
      console.log('  ', JSON.stringify(picked));
    });
  }
}
