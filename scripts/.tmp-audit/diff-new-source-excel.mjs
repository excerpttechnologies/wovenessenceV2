import XLSX from 'xlsx';
const txt = (v) => String(v ?? '').trim();
const read = (file) => {
  const wb = XLSX.readFile(file, { raw: false });
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '', raw: false });
  return rows;
};
const oldRows = read(process.argv[2] || 'hsr_opening_19_10_dated.xlsx');
const newRows = read(process.argv[3] || 'C:/Users/Admin/Downloads/hsr opening 19 10 (1).xlsx');
console.log('old', oldRows.length, 'new', newRows.length);
const headers = Object.keys(newRows[0] || {});
const diffFields = headers.filter((h) => !/^sl no/i.test(h));
const byKey = (rows) => {
  const m = new Map();
  for (const r of rows) {
    const key = `${txt(r['Item Code'])}|${txt(r['Item Name'])}|${txt(r['Open Qty'])}`;
    const arr = m.get(key) || [];
    arr.push(r);
    m.set(key, arr);
  }
  return m;
};
const om = byKey(oldRows);
const nm = byKey(newRows);
let matched = 0;
const diffsByField = new Map();
const samples = [];
for (const [key, nArr] of nm) {
  const oArr = om.get(key);
  if (!oArr || oArr.length === 0) { diffsByField.set('(key-not-in-old)', (diffsByField.get('(key-not-in-old)') || 0) + nArr.length); continue; }
  const o = oArr.shift();
  matched++;
  for (const f of diffFields) {
    if (txt(o[f]) !== txt(nArr[0][f])) {
      diffsByField.set(f, (diffsByField.get(f) || 0) + 1);
      if (samples.length < 15) samples.push({ key, field: f, old: txt(o[f]), new: txt(nArr[0][f]) });
    }
  }
}
console.log('matched rows', matched);
console.log('diffs by field:');
for (const [f, n] of [...diffsByField.entries()].sort((a, b) => b[1] - a[1])) console.log(JSON.stringify({ field: f, changed: n }));
console.log('samples', JSON.stringify(samples, null, 1));
