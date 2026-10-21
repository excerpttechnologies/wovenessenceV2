import fs from 'fs';
const raw = fs.readFileSync('hsr_opening_19_10_dated.csv', 'utf8');
const lines = raw.split(/\r?\n/).filter(Boolean);
const parseLine = (line) => {
  const out = [];
  let cur = '';
  let q = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (q) {
      if (ch === '"') { if (line[i + 1] === '"') { cur += '"'; i++; } else q = false; }
      else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ',') { out.push(cur); cur = ''; }
    else cur += ch;
  }
  out.push(cur);
  return out;
};
const header = parseLine(lines[0]).map((h) => h.trim());
const idx = (n) => header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
const iItem = idx('Item Name');
const iCode = idx('Supplier Code');
const iName = idx('Supplier Name');
const iItc = idx('Item Code');
const rows = [];
for (let i = 1; i < lines.length; i++) {
  const f = parseLine(lines[i]);
  rows.push(f);
}
console.log('rows', rows.length, 'cols', header.length);
console.log('header', JSON.stringify(header));
let unassigned = 0; let named = 0; let other = 0;
const namedBySupplier = new Map();
for (const f of rows) {
  const code = (f[iCode] || '').trim();
  if (/^\(?unassigned\)?$/i.test(code) || code === '' || code === '0') unassigned++;
  else if (/^G\d+$/i.test(code) || /\w/.test(code)) {
    named++;
    const k = `${code}|${(f[iName] || '').trim()}`;
    namedBySupplier.set(k, (namedBySupplier.get(k) || 0) + 1);
  } else other++;
}
console.log({ unassigned, named, other });
console.log('top named suppliers', JSON.stringify([...namedBySupplier.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)));
const ctn = rows.filter((f) => /CTNSLK/i.test(f[iItem] || ''));
console.log('\nCTNSLK rows in CSV:', ctn.length);
const ctnGroups = new Map();
for (const f of ctn) {
  const k = `${(f[iCode] || '').trim()}|${(f[iName] || '').trim()}`;
  ctnGroups.set(k, (ctnGroups.get(k) || 0) + 1);
}
console.log('CTNSLK supplier groups:', JSON.stringify([...ctnGroups.entries()]));
const ctnNamed = ctn.filter((f) => !/unassigned/i.test(f[iCode] || ''));
console.log('CTNSLK named rows:', ctnNamed.length);
for (const f of ctnNamed.slice(0, 10)) console.log(JSON.stringify({ itemCode: (f[iItc] || '').trim(), item: (f[iItem] || '').trim(), sup: `${(f[iCode] || '').trim()}|${(f[iName] || '').trim()}`, qty: (f[idx('Open Qty')] || '').trim() }));
