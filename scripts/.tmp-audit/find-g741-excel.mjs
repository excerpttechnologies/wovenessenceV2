import XLSX from 'xlsx';
import fs from 'fs';

const files = fs.readdirSync('.').filter((f) => /\.xlsx$/i.test(f) && !f.startsWith('~$'));
const needle = /^G0*741$/i;

for (const file of files) {
  let wb;
  try { wb = XLSX.readFile(file, { raw: false }); } catch (e) { continue; }
  for (const name of wb.SheetNames) {
    let rows;
    try { rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false }); } catch { continue; }
    if (!rows.length) continue;
    const headers = Object.keys(rows[0]);
    const codeCols = headers.filter((h) => /supplier.*code|code.*supplier/i.test(h));
    const nameCols = headers.filter((h) => /supplier.*name|name.*supplier/i.test(h));
    if (!codeCols.length) continue;
    const hits = rows.filter((r) => codeCols.some((c) => needle.test(String(r[c] ?? '').trim())));
    if (!hits.length) continue;
    console.log('\nFILE', file, 'SHEET', name, 'rows', rows.length, 'headers', JSON.stringify(headers));
    console.log('supplier code cols', codeCols, 'name cols', nameCols);
    hits.slice(0, 20).forEach((r) => console.log('  ', JSON.stringify(r)));
  }
}
