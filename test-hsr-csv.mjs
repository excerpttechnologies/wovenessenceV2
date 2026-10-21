import { parseHSRWorkbook } from './lib/hsrWorkbookImport.js';
import { readFileSync } from 'fs';

const filePath = 'C:\\Users\\Admin\\Desktop\\deploy\\wovenessenceV2\\hsr_opening_19_10_dated.csv';

console.log('Testing HSR CSV Parser...\n');

try {
  const buffer = readFileSync(filePath);
  const result = parseHSRWorkbook(buffer);

  console.log('=== CSV ANALYSIS ===');
  console.log('Sheet:', result.analysis.sheetName);
  console.log('Range:', result.analysis.range);
  console.log('Total Rows:', result.analysis.rowCount);
  console.log('Total Columns:', result.analysis.columnCount);
  console.log('Headers:', result.analysis.headers.slice(0, 10).join(', ') + '...');
  console.log('Duplicate Headers:', result.analysis.duplicates.map(d => `${d.header} (${d.count}x)`).join(', ') || 'None');

  console.log('\n=== DATA SUMMARY ===');
  console.log('Total Data Rows:', result.summary.totalRows);
  console.log('Valid Rows:', result.summary.validRows);
  console.log('Invalid Rows:', result.summary.invalidRows);
  console.log('Ignored Rows:', result.summary.ignored);
  console.log('Duplicate Barcodes:', result.summary.duplicates);

  console.log('\n=== SAMPLE RECORDS (first 3) ===');
  result.records.slice(0, 3).forEach((record, i) => {
    console.log(`\nRow ${record.line}:`);
    console.log('  Item Code:', record.values.itemCode);
    console.log('  Item Name:', record.values.itemName);
    console.log('  Group:', record.values.groupName);
    console.log('  HSN:', record.values.hsn);
    console.log('  UOM:', record.values.uom);
    console.log('  Open Qty:', record.values.openQty);
    console.log('  HSR Pur Price:', record.values.hsrPurPrice);
    console.log('  Has Problems:', record.hasProblems);
    if (record.hasProblems) {
      console.log('  Problems:');
      record.problems.forEach(p => {
        console.log(`    - ${p.field}: ${p.message}`);
      });
    }
  });

  console.log('\n=== TEST COMPLETE ===');
  console.log('CSV parser is working!');

} catch (error) {
  console.error('Error testing CSV parser:', error.message);
  console.error(error.stack);
  process.exit(1);
}
