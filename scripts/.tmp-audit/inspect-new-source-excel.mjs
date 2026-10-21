import XLSX from 'xlsx';
const txt = (v) => String(v ?? '').trim();
const isP = (v) => !txt(v) || txt(v) === '0' || /^\(?unassigned\)?$/i.test(txt(v));
const wb = XLSX.readFile('C:/Users/Admin/Downloads/hsr opening 19 10 (1).xlsx', { raw: false });
console.log('sheets', JSON.stringify(wb.SheetNames));
for (const name of wb.SheetNames) {
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[name], { defval: '', raw: false, header: 1 });
  console.log(`\nsheet ${name} rows ${rows.length}`);
  if (!rows.length) continue;
  const header = rows[0].map((v) => txt(v));
  console.log('header', JSON.stringify(header));
  const data = rows.slice(1).filter((r) => r.some((v) => txt(v) !== ''));
  console.log('data rows', data.length);
  const hi = (n) => header.findIndex((h) => h.toLowerCase() === n.toLowerCase());
  const iCode = hi('Supplier Code');
  const iName = hi('Supplier Name');
  const iItem = hi('Item Code');
  const iItem2 = header.reduce((acc, h, i) => (txt(h).toLowerCase() === 'item code' && acc === -1 ? i : acc), -1);
  let named = 0;
  let un = 0;
  const groups = new Map();
  for (const r of data) {
    const code = txt(r[iCode]);
    if (isP(code)) { un++; continue; }
    named++;
    const k = `${code}|${txt(r[iName])}`;
    groups.set(k, (groups.get(k) || 0) + 1);
  }
  console.log({ named, unassigned: un, itemCodeCol: iItem, sampleItemCode: txt(data[0]?.[iItem]), sampleItemCode2: txt(data[0]?.[iItem2]) });
  console.log('supplier groups (top 25):');
  for (const [k, n] of [...groups.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)) console.log(JSON.stringify({ supplier: k, rows: n }));
}
