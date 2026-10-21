import { readFileSync } from 'fs';
import xlsx from 'xlsx';

const filePath = 'C:\\Users\\Admin\\Desktop\\deploy\\wovenessenceV2\\hsr_opening_19_10_dated.xlsx';

console.log('Reading HSR workbook...');

try {
  const workbook = xlsx.read(readFileSync(filePath));
  console.log('\n=== WORKBOOK STRUCTURE ===');
  console.log('Sheet names:', workbook.SheetNames);

  const sheetName = workbook.SheetNames[0];
  console.log('\nAnalyzing sheet:', sheetName);

  const sheet = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);

  console.log('\nData range:', sheet['!ref']);
  console.log('Rows:', range.e.r + 1);
  console.log('Columns:', range.e.c + 1);

  // Read headers (row 1)
  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
    const cell = sheet[cellAddress];
    headers.push(cell ? cell.v : '');
  }

  console.log('\n=== HEADERS ===');
  headers.forEach((h, i) => {
    console.log(`Column ${i + 1}: "${h}"`);
  });

  // Check for duplicate headers
  const headerCounts = {};
  headers.forEach(h => {
    const key = h || '(blank)';
    headerCounts[key] = (headerCounts[key] || 0) + 1;
  });

  console.log('\n=== DUPLICATE HEADERS ===');
  Object.entries(headerCounts).forEach(([h, count]) => {
    if (count > 1) {
      console.log(`"${h}" appears ${count} times`);
    }
  });

  // Read first few data rows to understand data types
  console.log('\n=== SAMPLE DATA ROWS (first 5) ===');
  const sampleRows = 5;
  for (let r = range.s.r + 1; r <= Math.min(range.s.r + sampleRows, range.e.r); r++) {
    console.log(`\nRow ${r + 1}:`);
    for (let c = range.s.c; c <= range.e.c; c++) {
      const cellAddress = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      const value = cell ? cell.v : '';
      const type = cell ? cell.t : 'blank';
      console.log(`  ${headers[c]}: "${value}" (${type})`);
    }
  }

  // Count total data rows (excluding header)
  const totalRows = range.e.r - range.s.r;
  console.log(`\nTotal data rows: ${totalRows}`);

  // Analyze data types per column
  console.log('\n=== COLUMN DATA TYPE ANALYSIS ===');
  const columnTypes = {};
  for (let c = range.s.c; c <= range.e.c; c++) {
    const colKey = headers[c] || `Column_${c}`;
    columnTypes[colKey] = { string: 0, number: 0, date: 0, blank: 0, boolean: 0 };

    for (let r = range.s.r + 1; r <= range.e.r; r++) {
      const cellAddress = xlsx.utils.encode_cell({ r, c });
      const cell = sheet[cellAddress];
      if (!cell) {
        columnTypes[colKey].blank++;
        continue;
      }
      switch (cell.t) {
        case 's': columnTypes[colKey].string++; break;
        case 'n': columnTypes[colKey].number++; break;
        case 'd': columnTypes[colKey].date++; break;
        case 'b': columnTypes[colKey].boolean++; break;
        default: columnTypes[colKey].blank++;
      }
    }
  }

  Object.entries(columnTypes).forEach(([col, types]) => {
    const total = types.string + types.number + types.date + types.boolean + types.blank;
    const dominant = Object.entries(types).reduce((a, [k, v]) => v > a[1] ? [k, v] : a, ['blank', 0]);
    console.log(`${col}: ${dominant[0]} dominant (${dominant[1]}/${total} - ${((dominant[1]/total)*100).toFixed(1)}%)`);
  });

} catch (error) {
  console.error('Error reading workbook:', error.message);
  console.error(error.stack);
}
