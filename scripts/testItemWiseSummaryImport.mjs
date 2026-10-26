/* Tests for the Item Wise Summary import (pure layer).

   Run: node scripts/testItemWiseSummaryImport.mjs
   The real exported workbook is exercised when it is present; nothing here
   needs a database. */

import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import * as XLSX from 'xlsx';
import {
  readWorkbook,
  buildMasterLookup,
  analyzeParsedWorkbook,
  analyzeRow,
  buildTemplateWorkbook,
  buildErrorWorkbook,
  parseNumberCell,
  parseDateCell,
  normalizeUom,
  normalizeApprovals,
} from '../lib/itemWiseSummaryImport.js';
import {
  LAYOUTS,
  LAYOUT_LABELS,
  TEMPLATE_FIELDS,
  REFERENCE_FIELDS,
  STRATEGIES,
  ROW_STATUS,
  ERROR_REPORT_COLUMNS,
  ITEM_WISE_SHEET,
} from '../lib/itemWiseSummaryConstants.js';

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`ok ${passed} - ${name}`);
  } catch (error) {
    console.error(`FAIL - ${name}`);
    console.error(error);
    process.exitCode = 1;
  }
}

function sheetFromRows(rows) {
  const ws = XLSX.utils.aoa_to_sheet(rows);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, ITEM_WISE_SHEET);
  return XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' });
}

function rowFor(overrides = {}) {
  const base = {
    locationName: 'Main Store', groupName: 'Sarees', supplierCode: 'SUP001', supplierName: 'Supplier One',
    date: '19/10/2026', age: 5, purchaseDate: '01/10/2026', grcNo: 'GRC1',
    supplierInvoiceNo: 'INV1', batchUnique: 'Unique', itemCode: 'ITM001',
    printDescription: 'Silk Saree', barcode: '000123', itemAttributes: '',
    hsn: '5007', purRate: 100, discount: 0, finalNet: 100, gst: 5, rsp: 150,
    discountPercent: 10, offerPrice: 135, wsp: 120, dp: 110, openQty: 5, uom: 'PC',
    openValue: 500, inwardQty: 0, inwardValue: 0, outwardQty: 0, outwardValue: 0,
    closeQty: 5, closeValue: 500,
  };
  return { ...base, ...overrides };
}

function canonicalWorkbook(rows) {
  const fields = TEMPLATE_FIELDS.map((field) => field.label);
  const data = rows.map((row) => TEMPLATE_FIELDS.map((field) => row[field.key] ?? ''));
  return sheetFromRows([fields, ...data]);
}

const lookup = buildMasterLookup({
  locations: [{ _id: 'loc1', name: 'Main Store' }],
  groups: [{ _id: 'g1', name: 'Sarees', parentId: null }],
  suppliers: [{ _id: 'sup1', contactId: 'SUP001', businessName: 'Supplier One' }],
  items: [{ _id: 'item1', itemCode: 'ITM001', name: 'Silk Saree', uomId: 'uom1', hsnId: 'hsn1', subGroupId: 'g1' }],
  uoms: [{ _id: 'uom1', name: 'Pieces', shortName: 'PC' }],
  hsns: [{ _id: 'hsn1', code: '5007' }],
});

test('template has the exact 33 columns, in order, on the Item Wise Summary sheet', () => {
  const buffer = buildTemplateWorkbook();
  const workbook = XLSX.read(buffer);
  assert.deepEqual(workbook.SheetNames, [ITEM_WISE_SHEET, 'Instructions']);
  const header = XLSX.utils.sheet_to_json(workbook.Sheets[ITEM_WISE_SHEET], { header: 1 })[0];
  assert.equal(header.length, 33);
  assert.deepEqual(header, TEMPLATE_FIELDS.map((field) => field.label));
  assert.equal(header[12], 'Barcode');
  assert.equal(header[11], 'Print Description');
  assert.equal(header[25], 'UOM');
});

test('reference layout is 34 columns with Sub Group Name and Item Name, no Barcode', () => {
  assert.equal(REFERENCE_FIELDS.length, 34);
  assert.equal(REFERENCE_FIELDS[2].label, 'Sub Group Name');
  assert.equal(REFERENCE_FIELDS[11].label, 'Item Name');
  assert.ok(!REFERENCE_FIELDS.some((field) => field.label === 'Barcode'));
  assert.equal(LAYOUT_LABELS[LAYOUTS.REFERENCE].includes('34'), true);
});

test('generated template round-trips through the upload parser', () => {
  const buffer = canonicalWorkbook([rowFor()]);
  const parsed = readWorkbook(buffer);
  assert.equal(parsed.layout, LAYOUTS.TEMPLATE);
  assert.equal(parsed.sheetName, ITEM_WISE_SHEET);
  assert.equal(parsed.rows.length, 1);
  assert.equal(parsed.rows[0].values.barcode, '000123');
  assert.equal(parsed.rows[0].values.itemCode, 'ITM001');
});

test('the real exported workbook is accepted in its own 34-column order', () => {
  if (!existsSync('omshreefabric.xlsx')) {
    console.log('   (omshreefabric.xlsx not present - skipped)');
    return;
  }
  const parsed = readWorkbook(readFileSync('omshreefabric.xlsx'));
  assert.equal(parsed.layout, LAYOUTS.REFERENCE);
  assert.equal(parsed.fields.length, 34);
  assert.equal(parsed.rows.length, 33357);
  assert.equal(parsed.ignored.total, 1);
  assert.equal(parsed.rows[0].values.itemCode, '144411');
  assert.equal(parsed.rows[0].values.subGroupName, '3PC-SUIT');
  assert.equal(parsed.rows[0].values.barcode, undefined);
});

test('a renamed or missing column is rejected with the mismatch named', () => {
  const fields = TEMPLATE_FIELDS.map((field) => field.label);
  fields[11] = 'Barcode Number';
  const buffer = sheetFromRows([fields, TEMPLATE_FIELDS.map(() => '')]);
  assert.throws(() => readWorkbook(buffer), (error) => {
    assert.equal(error.code, 'HEADER_MISMATCH');
    assert.match(error.message, /Barcode Number|does not match/i);
    return true;
  });
});

test('a valid row is ready and keeps the provided barcode', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor()]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.importable, 1);
  assert.equal(analysis.rows[0].status, ROW_STATUS.READY);
  assert.equal(analysis.rows[0].barcode, '000123');
  assert.equal(analysis.detail[0].resolved.itemId, 'item1');
  assert.equal(analysis.detail[0].resolved.locationId, 'loc1');
  assert.equal(analysis.summary.totalQty, 5);
});

test('a blank barcode falls back to the Item Code (opening-stock convention)', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ barcode: '' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.rows[0].barcode, 'ITM001');
  assert.equal(analysis.rows[0].barcodeProvided, false);
});

test('duplicate barcodes in one workbook are detected, not imported twice', () => {
  const parsed = readWorkbook(canonicalWorkbook([
    rowFor({ barcode: 'DUP1' }),
    rowFor({ barcode: 'DUP1' }),
  ]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.duplicate, 1);
  assert.equal(analysis.detail[1].action, 'blocked');
  assert.match(analysis.detail[1].problems[0].message, /Duplicate/);
});

test('missing masters are listed and block until approved', () => {
  const parsed = readWorkbook(canonicalWorkbook([
    rowFor({ itemCode: 'NEWITEM', barcode: 'NEW1' }),
  ]));
  const blocked = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(blocked.summary.missingMaster, 1);
  assert.equal(blocked.missingMasters[0].type, 'Item');
  assert.equal(blocked.missingMasters[0].value, 'NEWITEM');
  assert.equal(blocked.missingMasters[0].creatable, true);

  const approved = analyzeParsedWorkbook({
    parsed, lookup, existing: null, strategy: STRATEGIES.CREATE,
    approvals: { item: ['NEWITEM'] },
  });
  assert.equal(approved.summary.importable, 1);
  assert.equal(approved.missingMasters[0].approved, true);
  assert.equal(approved.rows[0].status, ROW_STATUS.READY);
});

test('EXISTING_ONLY mode excludes rows with a missing master', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ itemCode: 'NEWITEM', barcode: 'NEW1' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.EXISTING });
  assert.equal(analysis.summary.importable, 0);
  assert.equal(analysis.detail[0].action, 'blocked');
});

test('an existing barcode is skipped in create mode and updateable in update mode', () => {
  const existing = {
    byBarcode: new Map([['000123', [{
      id: 'bc1', barcodeNo: '000123', itemCode: 'ITM001', locationId: 'loc1',
      locationName: 'Main Store', qtyNum: 2, status: 'IN_STOCK', customFields: {}, openingQty: 2,
    }]]]),
    byItemCode: new Map(),
  };
  const parsed = readWorkbook(canonicalWorkbook([rowFor()]));
  const createMode = analyzeParsedWorkbook({ parsed, lookup, existing, strategy: STRATEGIES.CREATE });
  assert.equal(createMode.detail[0].status, ROW_STATUS.EXISTING);
  assert.equal(createMode.summary.importable, 0);

  const updateMode = analyzeParsedWorkbook({ parsed, lookup, existing, strategy: STRATEGIES.UPDATE });
  assert.equal(updateMode.detail[0].action, 'update');
  assert.equal(updateMode.summary.update, 1);
  assert.equal(updateMode.detail[0].existingQty, 2);
});

test('UPDATE mode never creates a barcode that does not exist', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ barcode: 'NOPE1' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.UPDATE });
  assert.equal(analysis.detail[0].status, ROW_STATUS.NOT_EXISTING);
  assert.equal(analysis.summary.importable, 0);
});

test('zero close quantity is skipped, not imported as stock', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ openQty: 0, closeQty: 0, closeValue: 0, openValue: 0 })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.zeroQty, 1);
  assert.equal(analysis.summary.importable, 0);
  assert.equal(analysis.detail[0].action, 'skip');
});

test('Close Qty is the on-hand balance; Open is never added to it', () => {
  const row = rowFor({ openQty: 3, inwardQty: 1, outwardQty: 1, closeQty: 6 });
  const parsed = readWorkbook(canonicalWorkbook([row]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.detail[0].qty, 6);
  assert.equal(analysis.detail[0].openQty, 3);
  assert.equal(analysis.detail[0].inwardQty, 1);
  assert.equal(analysis.detail[0].outwardQty, 1);
  assert.ok(analysis.detail[0].warnings.some((warning) => /Close Qty/.test(warning)));
});

test('invalid GST is rejected before writing', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ gst: 55 })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.invalid, 1);
  assert.match(analysis.detail[0].problems[0].message, /GST/);
});

test('master mismatches are warnings, not silent overwrites', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ hsn: '9999', uom: 'MTR' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.importable, 1);
  assert.ok(analysis.detail[0].warnings.some((warning) => /HSN/.test(warning)));
  assert.ok(analysis.detail[0].warnings.some((warning) => /UOM/.test(warning)));
});

test('error workbook carries the original row and required columns', () => {
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ itemCode: 'NEWITEM', barcode: 'NEW1' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  const buffer = buildErrorWorkbook({ rows: analysis.rows, summary: analysis.summary });
  const workbook = XLSX.read(buffer);
  const rows = XLSX.utils.sheet_to_json(workbook.Sheets['Import Errors'], { header: 1 });
  assert.deepEqual(rows[2], ERROR_REPORT_COLUMNS);
  assert.equal(rows[3][0], 2);
  assert.equal(rows[3][2], 'NEWITEM');
});

test('the ERP report\'s negative outward qty is read as an outward movement', () => {
  /* The real Item Wise Summary prints open 5, outward -2, close 3. This used to
     be rejected as a negative quantity, which marked 17,000 rows of the live
     export invalid. */
  const parsed = readWorkbook(canonicalWorkbook([
    rowFor({ openQty: 5, outwardQty: -2, outwardValue: -200, closeQty: 3, closeValue: 300 }),
  ]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.invalid, 0);
  assert.equal(analysis.summary.ready, 1);
  assert.equal(analysis.detail[0].outwardQty, 2);
  assert.equal(analysis.detail[0].outwardValue, 200);
  assert.equal(analysis.detail[0].qty, 3);
  assert.ok(analysis.detail[0].warnings.some((warning) => /Outward Qty was negative/.test(warning)));
  assert.ok(!analysis.detail[0].warnings.some((warning) => /Close Qty is/.test(warning)));
});

test('the same Item Code at two warehouses is two rows, not a duplicate', () => {
  const twoLocations = buildMasterLookup({
    locations: [{ _id: 'loc1', name: 'Main Store' }, { _id: 'loc2', name: 'Warehouse' }],
    groups: [{ _id: 'g1', name: 'Sarees', parentId: null }],
    suppliers: [{ _id: 'sup1', contactId: 'SUP001', businessName: 'Supplier One' }],
    items: [{ _id: 'item1', itemCode: 'ITM001', name: 'Silk Saree', uomId: 'uom1', hsnId: 'hsn1', subGroupId: 'g1' }],
    uoms: [{ _id: 'uom1', name: 'Pieces', shortName: 'PC' }],
    hsns: [{ _id: 'hsn1', code: '5007' }],
  });
  const parsed = readWorkbook(canonicalWorkbook([
    rowFor({ barcode: '', locationName: 'Main Store' }),
    rowFor({ barcode: '', locationName: 'Warehouse' }),
  ]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup: twoLocations, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.duplicate, 0);
  assert.equal(analysis.summary.create, 2);
  assert.equal(analysis.detail[0].barcode, 'ITM001');
  assert.equal(analysis.detail[1].barcode, 'ITM001');
});

test('a typed barcode repeated at another location is still a duplicate', () => {
  const twoLocations = buildMasterLookup({
    locations: [{ _id: 'loc1', name: 'Main Store' }, { _id: 'loc2', name: 'Warehouse' }],
    groups: [{ _id: 'g1', name: 'Sarees', parentId: null }],
    suppliers: [{ _id: 'sup1', contactId: 'SUP001', businessName: 'Supplier One' }],
    items: [{ _id: 'item1', itemCode: 'ITM001', name: 'Silk Saree', uomId: 'uom1', hsnId: 'hsn1', subGroupId: 'g1' }],
    uoms: [{ _id: 'uom1', name: 'Pieces', shortName: 'PC' }],
    hsns: [{ _id: 'hsn1', code: '5007' }],
  });
  const parsed = readWorkbook(canonicalWorkbook([
    rowFor({ barcode: '000123', locationName: 'Main Store' }),
    rowFor({ barcode: '000123', locationName: 'Warehouse' }),
  ]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup: twoLocations, existing: null, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.summary.duplicate, 1);
  assert.equal(analysis.detail[1].action, 'blocked');
});

test('the same Item Code in another warehouse does not mask this warehouse\'s stock', () => {
  const existing = {
    byBarcode: new Map([['itm001', [{
      id: 'bc2', barcodeNo: 'ITM001', itemCode: 'ITM001', locationId: 'loc2',
      locationName: 'Warehouse', qtyNum: 4, status: 'IN_STOCK', customFields: {}, openingQty: 4,
    }]]]),
    byItemCode: new Map([['itm001', [{
      id: 'bc2', barcodeNo: 'ITM001', itemCode: 'ITM001', locationId: 'loc2',
      locationName: 'Warehouse', qtyNum: 4, status: 'IN_STOCK', customFields: {}, openingQty: 4,
    }]]]),
  };
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ barcode: '' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing, strategy: STRATEGIES.CREATE });
  assert.equal(analysis.detail[0].action, 'create');
  assert.equal(analysis.detail[0].status, ROW_STATUS.READY);
});

test('approvals survive the server re-running the analysis', () => {
  /* executeApprovedImport analyses once before creating masters and once
     after, handing the SAME approvals back. Re-normalising an already
     normalised Set used to drop every approval, so no master was ever created
     from the UI. */
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ itemCode: 'NEWITEM', barcode: 'NEW1' })]));
  const once = normalizeApprovals({ item: ['NEWITEM'] });
  const twice = normalizeApprovals(once);
  const analysis = analyzeParsedWorkbook({
    parsed, lookup, existing: null, strategy: STRATEGIES.CREATE, approvals: twice,
  });
  assert.equal(analysis.missingMasters[0].approved, true);
  assert.equal(analysis.rows[0].status, ROW_STATUS.READY);
});

test('a hyphenated barcode finds its own existing row', () => {
  const existing = {
    byBarcode: new Map([['a-1', [{
      id: 'bc9', barcodeNo: 'A-1', itemCode: 'ITM001', locationId: 'loc1',
      locationName: 'Main Store', qtyNum: 3, status: 'IN_STOCK', customFields: {}, openingQty: 3,
    }]]]),
    byItemCode: new Map(),
  };
  const parsed = readWorkbook(canonicalWorkbook([rowFor({ barcode: 'A-1' })]));
  const analysis = analyzeParsedWorkbook({ parsed, lookup, existing, strategy: STRATEGIES.UPDATE });
  assert.equal(analysis.detail[0].action, 'update');
  assert.equal(analysis.detail[0].existingId, 'bc9');
});

test('number, date and UOM helpers accept the report formats', () => {
  assert.equal(parseNumberCell('1,150.00'), 1150);
  assert.equal(parseNumberCell('(25.5)'), -25.5);
  assert.equal(parseDateCell('19/10/2026').iso, '2026-10-19');
  assert.equal(parseDateCell(46303).iso, '2026-10-08');
  assert.equal(normalizeUom('Pc(s)'), 'PC');
  assert.equal(normalizeUom('Mtr(s)'), 'MTR');
});

console.log(`\n${passed} tests passed${process.exitCode ? ' (with failures above)' : ''}.`);
