import fs from 'fs';
const raw = fs.readFileSync('hsr_opening_19_10_dated.csv', 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
console.log('lines', lines.length);
const parseLine = (line) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') {
        if (line[i + 1] === '"') { cur += '"'; i++; }
        else q = false;
      } else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const header = parseLine(lines[0]).map((h) => h.trim());
console.log('headers', JSON.stringify(header));
const wanted = ['OM1098', 'OM1099', 'OM1100', 'OM1109'];
const bcKey = header.findIndex((h) => /barcode/i.test(h));
const itemKey = header.findIndex((h) => /^item code$/i.test(h));
const supCodeKey = header.findIndex((h) => /supplier code/i.test(h));
const supNameKey = header.findIndex((h) => /supplier name/i.test(h));
console.log('cols', JSON.stringify({ bcKey, itemKey, supCodeKey, supNameKey }));
for (let i = 1; i < lines.length; i++) {
  const f = parseLine(lines[i]);
  const bc = (f[bcKey] || '').trim();
  const item = (f[itemKey] || '').trim();
  if (!wanted.includes(bc) && !wanted.includes(item)) continue;
  console.log(JSON.stringify({ row: i, barcode: bc, item, supCode: (f[supCodeKey] || '').trim(), supName: (f[supNameKey] || '').trim() }));
}
