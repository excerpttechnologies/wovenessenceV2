import XLSXpkg from 'xlsx';
const XLSX = XLSXpkg.default || XLSXpkg;
const files = [
  'purchase excels/KANHAIYA_Sarees_VARANASI_with_Item_Summary.xlsx',
  'purchase excels/SHA_LALCHAND_MADANRAJ_Co_BANGALORE_with_Item_Summary.xlsx',
  'purchase excels/Shree_VASTHRA_Creation_SALEM_with_Item_Summary.xlsx',
  'purchase excels/M_B_Sarees_Pvt_Ltd_VARANASI_with_Item_Summary.xlsx',
];
for (const file of files) {
  const wb = XLSX.readFile(file);
  const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: '', raw: false });
  const start = rows.findIndex((r) => String(r[0]).trim() === 'Item Summary');
  console.log('\n=====', file, 'summary starts', start + 1);
  if (start >= 0) rows.slice(start, start + 25).forEach((r, i) => console.log(start + i + 1, JSON.stringify(r.slice(0, 7))));
}
