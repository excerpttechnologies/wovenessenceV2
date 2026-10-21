import { parseHSRWorkbook } from './lib/hsrWorkbookImport.js';

const filePath = 'C:\\Users\\Admin\\Desktop\\deploy\\wovenessenceV2\\hsr_opening_19_10_dated.xlsx';

console.log('Testing HSR Workbook Parser...\n');

try {
  const result = parseHSRWorkbook(filePath);

  console.log('=== WORKBOOK ANALYSIS ===');
  console.log('Sheet:', result.analysis.sheetName);
  console.log('Range:', result.analysis.range);
  console.log('Total Rows:', result.analysis.rowCount);
  console.log('Total Columns:', result.analysis.columnCount);
  console.log('Duplicate Headers:', result.analysis.duplicates.map(d => `${d.header} (${d.count}x)`).join(', ') || 'None');

  console.log('\n=== HEADER MAPPING ===');
  console.log('Mapped columns:', result.mapping.size);
  console.log('Missing Required:', result.summary.missingRequired.join(', ') || 'None');
  console.log('Duplicate Item Code Columns:', result.summary.duplicateItemCode.join(', ') || 'None');

  console.log('\n=== DATA SUMMARY ===');
  console.log('Total Data Rows:', result.summary.totalRows);
  console.log('Valid Rows:', result.summary.validRows);
  console.log('Invalid Rows:', result.summary.invalidRows);
  console.log('Ignored Rows:', result.summary.ignored);
  console.log('Duplicate Barcodes:', result.summary.duplicates);

  console.log('\n=== PROBLEM COUNTS ===');
  Object.entries(result.summary.problemCounts).forEach(([field, count]) => {
    console.log(`${field}: ${count}`);
  });

  console.log('\n=== SAMPLE RECORDS (first 3) ===');
  result.records.slice(0, 3).forEach((record, i) => {
    console.log(`\nRow ${record.line}:`);
    console.log('  Item Code:', record.values.itemCode);
    console.log('  Item Name:', record.values.itemName);
    console.log('  Group:', record.values.groupName);
    console.log('  Sub Group:', record.values.subGroupName);
    console.log('  HSN:', record.values.hsn);
    console.log('  UOM:', record.values.uom);
    console.log('  Open Qty:', record.values.openQty);
    console.log('  HSR Pur Price:', record.values.hsrPurPrice);
    console.log('  GST %:', record.values.gst);
    console.log('  RSP:', record.values.rsp);
    console.log('  WSP:', record.values.wsp);
    console.log('  DP:', record.values.dp);
    console.log('  Has Problems:', record.hasProblems);
    if (record.hasProblems) {
      console.log('  Problems:');
      record.problems.forEach(p => {
        console.log(`    - ${p.field}: ${p.message}`);
      });
    }
  });

  console.log('\n=== SAMPLE PROBLEMATIC ROWS (first 3) ===');
  const problematic = result.records.filter(r => r.hasProblems).slice(0, 3);
  if (problematic.length === 0) {
    console.log('No problematic rows found in first 3 records');
  } else {
    problematic.forEach((record) => {
      console.log(`\nRow ${record.line}:`);
      console.log('  Item Code:', record.values.itemCode);
      console.log('  Problems:');
      record.problems.forEach(p => {
        console.log(`    - ${p.field}: ${p.message}`);
      });
    });
  }

  console.log('\n=== LEFT OUT ROWS (first 5) ===');
  if (result.left && result.left.length > 0) {
    result.left.slice(0, 5).forEach((l) => {
      console.log(`Line ${l.line}: ${l.reason}`);
      console.log(`  Text: ${l.text.substring(0, 100)}...`);
    });
  } else {
    console.log('No rows were left out');
  }

  console.log('\n=== TEST COMPLETE ===');
  console.log('Parser is ready for integration!');

} catch (error) {
  console.error('Error testing HSR parser:', error.message);
  console.error(error.stack);
  process.exit(1);
}
