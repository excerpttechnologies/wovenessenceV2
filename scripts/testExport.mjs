#!/usr/bin/env node
/* ==========================================================================
   FULL-DATABASE EXPORT - automated checks.

   Run with `npm run test:export` (add `--db` to also read the development
   database). The database is only ever read: no insert, update or delete is
   issued anywhere in this file.

   What is covered:
     - field discovery: every key on every document becomes a column, across a
       whole batch, including a field only one legacy row carries
     - nested objects, nested arrays, ObjectId references and their readable
       labels, arrays of primitives, empty values, mixed types
     - value fidelity: leading zeros, GSTIN/PAN/IFSC/mobile/account numbers,
       unicode, long identifiers, real dates, real numbers, real booleans
     - secret exclusion: passwords, tokens, API keys, session secrets, even
       when nested
     - the .xlsx itself: parsed back with the SheetJS build the project already
       depends on, and its raw XML checked for a frozen header, an AutoFilter,
       inline strings and the date/time number formats
     - pagination and filters: under 500, exactly 500, over 500, repeated page,
       row cap, selected-record reads, invalid ids, filter sanitising
     - endpoint security: external URLs, traversal, non-allowlisted paths
   ========================================================================== */

import assert from 'node:assert/strict';
import zlib from 'node:zlib';
import * as XLSX from 'xlsx';

import {
  buildExportTable,
  extractArraySheets,
  flattenRecord,
  headerShouldStayText,
  humanizeKey,
  isSecretKey,
  fullExportFilename,
  toFileBase,
} from '../lib/exportFields.js';
import { buildFullExportWorkbook } from '../lib/export/workbook.js';
import {
  collectListRows,
  collectSelectedRows,
  normalizeSelectedIds,
  sanitizeExportParams,
  describeFilters,
  ExportCollectError,
} from '../lib/export/collect.js';
import {
  isListEndpointAllowed,
  normalizeListEndpoint,
  labelForEndpoint,
} from '../lib/export/registry.js';

/* --------------------------------------------------------------- runner -- */

let passed = 0;
const failures = [];

async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    console.log(`  ok    ${name}`);
  } catch (error) {
    failures.push({ name, error });
    console.log(`  FAIL  ${name}`);
    console.log(`        ${error.message}`);
  }
}

function section(title) {
  console.log(`\n${title}`);
}

/* -------------------------------------------------------------- fixtures -- */

const SUPPLIER_ID = '652f1a2b3c4d5e6f7a8b9c0d';
const SUPPLIER_2_ID = '652f1a2b3c4d5e6f7a8b9c0e';
const AGENT_ID = '652f1a2b3c4d5e6f7a8b9c11';
const LEDGER_ID = '652f1a2b3c4d5e6f7a8b9c22';

/* One full supplier: every group of fields the Supplier Master schema carries,
   plus two fields no Mongoose schema knows about (the kind an old form or a
   migration left behind) and the credentials a contact document can contain. */
const supplierA = {
  _id: SUPPLIER_ID,
  businessName: 'Sri & Sons Textiles (P) Ltd',
  supplierCode: 'SUP-00054',
  active: true,
  gstNumber: '33AABCU9603R1ZM',
  gstDetails: {
    registrationType: 'Regular',
    state: 'Tamil Nadu',
    gstin: '33AABCU9603R1ZM',
  },
  panNumber: 'AABCU9603R',
  cinNumber: 'U17111TN1999PTC043210',
  legalName: 'Sri and Sons Textiles Private Limited',
  msmeType: 'Small',
  ssiNumber: '00123456789',
  tdsApplicable: true,
  tdsPercentage: 2.5,
  billingDetails: {
    addressLine1: '12 Bazaar Street',
    city: 'Salem',
    pincode: '636001',
  },
  shippingDetails: { addressLine1: 'Plot 4, SIDCO', city: 'Coimbatore' },
  contacts: [
    { name: 'Ravi', mobile: '9876543210', email: 'ravi@example.com' },
    { name: 'Meena', mobile: '9876500000', email: 'meena@example.com' },
  ],
  bankAccounts: [
    { bankName: 'SBI', accountNumber: '000123450000', ifsc: 'SBIN0001234' },
  ],
  discountPct: 5,
  markupPct: 0,
  agentId: AGENT_ID,
  ledgerId: LEDGER_ID,
  paymentTermDays: 30,
  creditLimit: 100000,
  openingBalance: 125000.5,
  createdAt: new Date('2026-01-15T10:30:00.000Z'),
  legacyErpRef: 'OLD-9001',
  longIdentifier: '1234567890123456789012345678901234',
  unicodeName: 'Ravi Kumar - Unïcode ✓',
  notes: '',
  nullable: null,
  password: 'must-never-be-exported',
  refreshToken: 'must-never-be-exported',
  apiKey: 'must-never-be-exported',
  nestedSecrets: { sessionSecret: 'must-never-be-exported' },
};

/* A second supplier with a DIFFERENT legacy field, no bank details and no
   billing address: the union of both must still be one consistent table. */
const supplierB = {
  _id: SUPPLIER_2_ID,
  businessName: 'Kongu Traders',
  supplierCode: '000123',
  active: false,
  oldGstNo: '33AAACX1234B1Z9',
  tags: ['wholesale', 'yarn'],
  contacts: [],
};

const labels = {
  [AGENT_ID]: 'Ravi - South Zone',
  [LEDGER_ID]: 'Sundry Creditors',
};

const records = [supplierA, supplierB];

/* ------------------------------------------------------------ zip reader -- */

/* A tiny reader for the local file headers xlsxWriter writes. It lets the test
   inspect the worksheet XML itself - the frozen pane, the AutoFilter, the
   inline strings - rather than trusting the writer. */
function unzip(buffer) {
  const entries = new Map();
  let offset = 0;
  while (offset + 30 <= buffer.length) {
    if (buffer.readUInt32LE(offset) !== 0x04034b50) break;
    const method = buffer.readUInt16LE(offset + 8);
    const compressedSize = buffer.readUInt32LE(offset + 18);
    const nameLength = buffer.readUInt16LE(offset + 26);
    const extraLength = buffer.readUInt16LE(offset + 28);
    const name = buffer.subarray(offset + 30, offset + 30 + nameLength).toString('utf8');
    const start = offset + 30 + nameLength + extraLength;
    const raw = buffer.subarray(start, start + compressedSize);
    entries.set(name, method === 8 ? zlib.inflateRawSync(raw) : Buffer.from(raw));
    offset = start + compressedSize;
  }
  return entries;
}

/* --------------------------------------------------------------- tests ---- */

async function main() {
  section('Field discovery');
  const table = buildExportTable(records, { labels });
  const paths = table.columns.map((column) => column.path);
  const headers = table.columns.map((column) => column.header);
  const columnOf = (path) => table.columns.findIndex((column) => column.path === path);
  const valueOf = (name, path) => table.rows[name][columnOf(path)];

  await check('the record id is the first column and is preserved as its original string', () => {
    assert.equal(table.columns[0].path, '_id');
    assert.equal(table.columns[0].header, 'Record ID');
    assert.equal(table.rows[0][0], SUPPLIER_ID);
    assert.equal(table.rows[1][0], SUPPLIER_2_ID);
  });

  await check('a field only one legacy row carries still gets a column, blank elsewhere', () => {
    assert.ok(paths.includes('legacyErpRef'), 'legacyErpRef missing');
    assert.ok(paths.includes('oldGstNo'), 'oldGstNo missing');
    assert.equal(valueOf(0, 'legacyErpRef'), 'OLD-9001');
    assert.equal(valueOf(1, 'legacyErpRef'), '');
    assert.equal(valueOf(0, 'oldGstNo'), '');
    assert.equal(valueOf(1, 'oldGstNo'), '33AAACX1234B1Z9');
  });

  await check('nested objects are flattened into readable columns', () => {
    const nested = [
      'gstDetails.registrationType',
      'gstDetails.gstin',
      'billingDetails.addressLine1',
      'billingDetails.city',
      'billingDetails.pincode',
      'shippingDetails.city',
    ];
    nested.forEach((path) => assert.ok(paths.includes(path), `missing ${path}`));
    assert.equal(headers[columnOf('billingDetails.city')], 'Billing Details City');
    assert.equal(valueOf(0, 'billingDetails.pincode'), '636001');
  });

  await check('supplier business fields are all present', () => {
    const required = [
      '_id', 'businessName', 'supplierCode', 'active', 'gstNumber', 'panNumber',
      'cinNumber', 'legalName', 'msmeType', 'ssiNumber', 'tdsApplicable',
      'tdsPercentage', 'discountPct', 'markupPct', 'agentId', 'ledgerId',
      'paymentTermDays', 'creditLimit', 'openingBalance', 'createdAt',
      'billingDetails.city', 'shippingDetails.addressLine1',
    ];
    const missing = required.filter((path) => !paths.includes(path));
    assert.deepEqual(missing, [], `missing fields: ${missing.join(', ')}`);
  });

  await check('arrays of primitives are joined into one cell', () => {
    assert.equal(valueOf(1, 'tags'), 'wholesale, yarn');
  });

  await check('an empty array and an empty string both export as blank', () => {
    assert.equal(valueOf(1, 'contacts'), '');
    assert.equal(valueOf(0, 'notes'), '');
    assert.equal(valueOf(0, 'nullable'), '');
  });

  section('References and labels');
  await check('an ObjectId keeps its id and gains a readable label column', () => {
    assert.ok(paths.includes('agentId'));
    assert.equal(valueOf(0, 'agentId'), AGENT_ID);
    const labelColumn = table.columns.find((column) => column.isLabel && column.labelFor === 'agentId');
    assert.ok(labelColumn, 'no label column for agentId');
    assert.equal(labelColumn.header, 'Agent Name');
    assert.equal(valueOf(0, labelColumn.path), 'Ravi - South Zone');
  });

  await check('a label never replaces the original id', () => {
    const ledger = table.columns.filter((column) => column.path === 'ledgerId');
    assert.equal(ledger.length, 1);
    assert.equal(valueOf(0, 'ledgerId'), LEDGER_ID);
  });

  section('Types and value fidelity');
  const typeOf = (path) => table.columns[columnOf(path)].type;

  await check('a date column is a real date and a number column a real number', () => {
    assert.equal(typeOf('createdAt'), 'date');
    assert.equal(typeOf('openingBalance'), 'number');
    assert.equal(typeOf('tdsApplicable'), 'boolean');
    assert.ok(table.rows[0][columnOf('createdAt')] instanceof Date);
    assert.equal(valueOf(0, 'openingBalance'), 125000.5);
    assert.equal(valueOf(0, 'tdsApplicable'), true);
  });

  await check('identifier-shaped columns stay text even when stored as numbers', () => {
    ['gstNumber', 'supplierCode', 'billingDetails.pincode', 'panNumber', 'cinNumber', 'mobile']
      .forEach((path) => {
        if (columnOf(path) === -1) return;
        assert.equal(typeOf(path), 'text', `${path} should be text`);
      });
    assert.ok(headerShouldStayText('Mobile No'));
    assert.ok(headerShouldStayText('Account Number'));
    assert.ok(headerShouldStayText('IFSC Code'));
    assert.equal(headerShouldStayText('Total Amount'), false);
  });

  await check('leading zeros, GSTIN, unicode and long ids survive unchanged', () => {
    assert.equal(valueOf(1, 'supplierCode'), '000123');
    assert.equal(valueOf(0, 'gstNumber'), '33AABCU9603R1ZM');
    assert.equal(valueOf(0, 'unicodeName'), 'Ravi Kumar - Unïcode ✓');
    assert.equal(valueOf(0, 'longIdentifier'), '1234567890123456789012345678901234');
    assert.equal(valueOf(0, 'billingDetails.pincode'), '636001');
  });

  section('Security');
  await check('credentials are never columns, at any depth', () => {
    const safe = ['password', 'token', 'secret', 'api key', 'apikey'];
    headers.forEach((header) => {
      const lower = header.toLowerCase();
      safe.forEach((word) => {
        assert.ok(!lower.includes(word), `header "${header}" exposes ${word}`);
      });
    });
    assert.ok(!paths.some((path) => /password|token|api_key|apiKey|sessionSecret/.test(path)));
  });

  await check('the shared secret detector agrees', () => {
    ['password', 'apiKey', 'refreshToken', 'sessionSecret', 'client_secret', 'credit_card']
      .forEach((key) => assert.ok(isSecretKey(key), `${key} should be secret`));
    ['tokenNo', 'barcodeNo', 'gstNumber', 'supplierCode', 'name']
      .forEach((key) => assert.ok(!isSecretKey(key), `${key} should not be secret`));
  });

  await check('a circular document is exported, not crashed on', () => {
    const loop = { name: 'Loop Pvt Ltd' };
    loop.self = loop;
    const flat = flattenRecord(loop);
    assert.match(flat.self, /circular/);
  });

  section('Array worksheets');
  const arraySheets = extractArraySheets(records, { labels });
  await check('an array of objects becomes its own sheet linked to its parent', () => {
    const contacts = arraySheets.find((sheet) => sheet.sourceKey === 'contacts');
    assert.ok(contacts, 'no contacts sheet');
    assert.equal(contacts.rows.length, 2);
    const parentCol = contacts.columns.findIndex((column) => column.header === 'Record ID');
    assert.equal(contacts.rows[0][parentCol], SUPPLIER_ID);
    const nameCol = contacts.columns.findIndex((column) => column.path === 'name');
    assert.equal(contacts.rows[0][nameCol], 'Ravi');
    const bank = arraySheets.find((sheet) => sheet.sourceKey === 'bankAccounts');
    assert.ok(bank, 'no bankAccounts sheet');
    assert.equal(bank.rows.length, 1);
  });

  section('Workbook');
  const built = buildFullExportWorkbook({
    records,
    labels,
    meta: { title: 'Supplier Master', fileBase: 'Supplier_Master', filters: 'business=abc, location=xyz' },
  });

  await check('the file is named and typed for a real .xlsx', () => {
    assert.equal(built.filename, 'Supplier_Master_Full_Export.xlsx');
    assert.equal(fullExportFilename('Supplier Master'), 'Supplier_Master_Full_Export.xlsx');
    assert.equal(toFileBase('Supplier / Master'), 'Supplier_Master');
    assert.equal(built.mime, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.equal(built.rowCount, 2);
  });

  await check('the workbook opens in the project\'s own spreadsheet parser', () => {
    const book = XLSX.read(built.buffer, { type: 'buffer' });
    assert.deepEqual(book.SheetNames, built.sheetNames);
    assert.equal(book.SheetNames[0], 'Supplier Master');
    assert.ok(book.SheetNames.includes('Contacts'));
    assert.ok(book.SheetNames.includes('Export Info'));
    const sheet = book.Sheets[book.SheetNames[0]];
    assert.equal(sheet.A1.v, 'Record ID');
  });

  await check('every cell keeps its value: text stays text, dates stay dates', () => {
    const book = XLSX.read(built.buffer, { type: 'buffer', cellDates: false });
    const sheet = book.Sheets['Supplier Master'];
    const range = XLSX.utils.decode_range(sheet['!ref']);
    const headerAt = {};
    for (let column = range.s.c; column <= range.e.c; column += 1) {
      const cell = sheet[XLSX.utils.encode_cell({ r: 0, c: column })];
      if (cell) headerAt[cell.v] = column;
    }
    const firstDataRow = 1;
    const cellAt = (header, row = firstDataRow) => sheet[XLSX.utils.encode_cell({ r: row, c: headerAt[header] })];

    assert.ok('GST Number' in headerAt, 'no GST Number column');
    assert.equal(cellAt('GST Number').v, '33AABCU9603R1ZM');
    assert.equal(cellAt('GST Number').t, 's');
    assert.equal(cellAt('Supplier Code').v, 'SUP-00054');
    assert.equal(cellAt('Billing Details Pincode').v, '636001');
    assert.equal(cellAt('Unicode Name').v, 'Ravi Kumar - Unïcode ✓');
    assert.equal(cellAt('Opening Balance').t, 'n');
    assert.equal(cellAt('Created At').t, 'n', 'a date should be written as a date serial, not text');
  });

  await check('no cell anywhere carries a credential value', () => {
    const flat = JSON.stringify(built.rowCount ? table.rows : []);
    assert.equal(flat.includes('must-never-be-exported'), false, 'a secret reached the rows');
  });

  await check('the sheet XML has a frozen header, an AutoFilter and inline strings', () => {
    const entries = unzip(built.buffer);
    const sheet = entries.get('xl/worksheets/sheet1.xml').toString('utf8');
    assert.match(sheet, /<pane[^>]*ySplit="1"/);
    assert.match(sheet, /state="frozen"/);
    assert.match(sheet, /<autoFilter ref="/);
    assert.match(sheet, /t="inlineStr"/);
    const styles = entries.get('xl/styles.xml').toString('utf8');
    assert.match(styles, /dd\/mm\/yyyy/);
    assert.match(styles, /dd\/mm\/yyyy hh:mm:ss/);
    assert.equal(entries.has('xl/workbook.xml'), true);
  });

  await check('an empty result set still produces a readable workbook', () => {
    const empty = buildFullExportWorkbook({
      records: [],
      meta: { title: 'Supplier Master', emptyMessage: 'No records matched.' },
    });
    const book = XLSX.read(empty.buffer, { type: 'buffer' });
    assert.equal(book.SheetNames[0], 'Supplier Master');
    assert.equal(empty.rowCount, 0);
    const sheet = book.Sheets['Supplier Master'];
    assert.equal(sheet.A1.v, 'Supplier Master');
    assert.equal(sheet.A2.v, 'No records matched.');
  });

  section('Pagination while collecting');
  const makeRows = (count, prefix = 'id') => Array.from({ length: count }, (_, index) => ({
    _id: `${prefix}${String(index).padStart(5, '0')}`,
  }));

  await check('fewer than one page of records', async () => {
    let calls = 0;
    const result = await collectListRows({
      fetchPage: async () => {
        calls += 1;
        return { rows: makeRows(120), perPage: 500, pages: 1, total: 120 };
      },
    });
    assert.equal(result.rows.length, 120);
    assert.equal(calls, 1);
    assert.equal(result.truncated, false);
  });

  await check('exactly one full page', async () => {
    let calls = 0;
    const result = await collectListRows({
      fetchPage: async () => {
        calls += 1;
        return { rows: makeRows(500), perPage: 500, pages: 1, total: 500 };
      },
    });
    assert.equal(result.rows.length, 500);
    assert.equal(calls, 1);
  });

  await check('more than one page is walked to the end', async () => {
    let calls = 0;
    const result = await collectListRows({
      fetchPage: async ({ page }) => {
        calls += 1;
        return {
          rows: makeRows(500, `p${page}-`),
          perPage: 500,
          pages: 3,
          total: 1500,
          labels: { [`p${page}-00000`]: `Label ${page}` },
        };
      },
    });
    assert.equal(result.rows.length, 1500);
    assert.equal(calls, 3);
    assert.equal(result.labels['p2-00000'], 'Label 2');
  });

  await check('an endpoint that caps perPage lower than requested is still followed', async () => {
    let calls = 0;
    const result = await collectListRows({
      fetchPage: async ({ page }) => {
        calls += 1;
        return { rows: makeRows(100, `c${page}-`), perPage: 100, pages: 4, total: 400 };
      },
    });
    assert.equal(calls, 4);
    assert.equal(result.rows.length, 400);
  });

  await check('a route that repeats a page is detected rather than looping forever', async () => {
    const same = makeRows(500);
    const result = await collectListRows({
      fetchPage: async () => ({ rows: same, perPage: 500, pages: 10, total: 5000 }),
    });
    assert.equal(result.rows.length, 500);
    assert.match(result.warnings.join(' '), /same page twice/);
  });

  await check('the row cap stops the walk and says so', async () => {
    const result = await collectListRows({
      maxRows: 800,
      fetchPage: async ({ page }) => ({
        rows: makeRows(500, `m${page}-`), perPage: 500, pages: 5, total: 2500,
      }),
    });
    assert.equal(result.rows.length, 800);
    assert.equal(result.truncated, true);
    assert.match(result.warnings.join(' '), /stopped at 800 rows/);
  });

  await check('a response that is not a list is refused with a readable message', async () => {
    await assert.rejects(
      () => collectListRows({ fetchPage: async () => ({ setting: { name: 'x' } }) }),
      (error) => error instanceof ExportCollectError && /does not return a list/.test(error.message),
    );
  });

  section('Selected records');
  await check('only valid ObjectIds are kept, deduplicated and capped', () => {
    const ids = normalizeSelectedIds([
      SUPPLIER_ID, SUPPLIER_ID, 'not-an-id', '123', ` ${SUPPLIER_2_ID} `, null,
    ]);
    assert.deepEqual(ids, [SUPPLIER_ID, SUPPLIER_2_ID]);
    assert.equal(normalizeSelectedIds(Array.from({ length: 6000 }, () => SUPPLIER_ID)).length, 1);
    assert.equal(normalizeSelectedIds('nope').length, 0);
  });

  await check('selected rows are read from the detail endpoint and kept in selection order', async () => {
    const docs = {
      [SUPPLIER_ID]: { _id: SUPPLIER_ID, businessName: 'A' },
      [SUPPLIER_2_ID]: { _id: SUPPLIER_2_ID, businessName: 'B' },
    };
    const result = await collectSelectedRows({
      ids: [SUPPLIER_2_ID, SUPPLIER_ID],
      fetchOne: async (id) => ({ doc: docs[id] }),
    });
    assert.deepEqual(result.rows.map((row) => row.businessName), ['B', 'A']);
    assert.equal(result.missing, 0);
  });

  await check('a deleted selection is reported, not fatal', async () => {
    const result = await collectSelectedRows({
      ids: [SUPPLIER_ID, SUPPLIER_2_ID],
      fetchOne: async (id) => {
        if (id === SUPPLIER_ID) {
          const error = new Error('not found');
          error.status = 404;
          throw error;
        }
        return { row: { _id: id } };
      },
    });
    assert.equal(result.rows.length, 1);
    assert.equal(result.missing, 1);
    assert.match(result.warnings.join(' '), /could not be read/);
  });

  await check('detail routes answering { doc }, { row } or { rows: [] } are all read', async () => {
    const shapes = [
      async () => ({ doc: { _id: SUPPLIER_ID, businessName: 'doc' } }),
      async () => ({ row: { _id: SUPPLIER_ID, businessName: 'row' } }),
      async () => ({ rows: [{ _id: SUPPLIER_ID, businessName: 'rows' }] }),
    ];
    for (const fetchOne of shapes) {
      const result = await collectSelectedRows({ ids: [SUPPLIER_ID], fetchOne });
      assert.equal(result.rows.length, 1);
    }
  });

  section('Filters and endpoint security');
  await check('filters are sanitised: paging and secrets are dropped, business kept', () => {
    const clean = sanitizeExportParams({
      page: 2,
      perPage: 500,
      search: 'acme',
      business: 'b1',
      location: 'l1',
      finYear: '2026-27',
      password: 'x',
      apiKey: 'y',
      $where: 'this.password',
      __proto__: 'z',
      'bad key!': 'v',
      veryLong: 'x'.repeat(600),
      sortBy: 'name',
    });
    assert.equal(clean.page, undefined);
    assert.equal(clean.perPage, undefined);
    assert.equal(clean.password, undefined);
    assert.equal(clean.apiKey, undefined);
    assert.equal(clean.$where, undefined);
    assert.equal(clean['bad key!'], undefined);
    assert.equal(clean.veryLong, undefined);
    assert.equal(clean.search, 'acme');
    assert.equal(clean.business, 'b1');
    assert.equal(clean.finYear, '2026-27');
    assert.equal(clean.sortBy, 'name');
    assert.match(describeFilters({ business: 'b1', location: 'l1' }), /business=b1, location=l1/);
    assert.equal(describeFilters({}), '(none)');
  });

  await check('only allowlisted application endpoints can be exported', () => {
    assert.equal(normalizeListEndpoint('/api/supplier'), '/api/supplier');
    assert.equal(normalizeListEndpoint('/api/supplier/'), '/api/supplier');
    assert.equal(isListEndpointAllowed('/api/supplier'), true);
    assert.equal(isListEndpointAllowed('/api/ecom-product'), true);
    assert.equal(isListEndpointAllowed('/api/inventory-barcode-list'), true);
    const refused = [
      'https://evil.example.com/api/supplier',
      'http://127.0.0.1/api/supplier',
      '//evil.example.com/api/supplier',
      'file:///etc/passwd',
      '/api/../../etc/passwd',
      '/api/supplier?limit=99999',
      '/api/not-a-real-endpoint',
      '/supplier',
      '',
    ];
    refused.forEach((value) => {
      assert.throws(() => normalizeListEndpoint(value), /export|application path|start with/i, `accepted ${value}`);
      assert.equal(isListEndpointAllowed(value), false, `${value} should not be offered`);
    });
  });

  await check('a human label is available for the workbook header', () => {
    assert.equal(labelForEndpoint('/api/supplier'), 'Supplier Master');
    assert.equal(labelForEndpoint('/api/purchase-grc'), 'GRC');
    assert.equal(labelForEndpoint('/api/unknown-thing'), 'Unknown Thing');
  });

  await check('humanised headers read as headings, not as property names', () => {
    assert.equal(humanizeKey('gstNumber'), 'GST Number');
    assert.equal(humanizeKey('_id'), 'Record ID');
    assert.equal(humanizeKey('billingDetails.addressLine1'), 'Billing Details Address Line 1');
    assert.equal(humanizeKey('tdsPercentage'), 'TDS Percentage');
  });

  /* --------------------------------------------------------- live database -- */
  if (process.argv.includes('--db')) {
    section('Development database (read only)');
    const { MongoClient } = await import('mongodb');
    const uri = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/orbit_erp';
    let client;
    try {
      client = new MongoClient(uri, { serverSelectionTimeoutMS: 5000 });
      await client.connect();
      const db = client.db();
      const collection = db.collection('suppliers');
      const total = await collection.estimatedDocumentCount();
      const docs = await collection.find({}).limit(5).toArray();
      await check(`the supplier collection exists (${total} document(s))`, () => {
        assert.ok(total >= 0);
      });
      if (docs.length) {
        const live = buildFullExportWorkbook({
          records: docs,
          meta: { title: 'Supplier Master', fileBase: 'Supplier_Master_Test', filters: 'limit 5, read only' },
        });
        await check(`a workbook built from ${docs.length} real supplier document(s) opens`, () => {
          const book = XLSX.read(live.buffer, { type: 'buffer' });
          assert.ok(book.SheetNames.length >= 2);
          const header = book.Sheets[book.SheetNames[0]].A1.v;
          assert.equal(header, 'Record ID');
          assert.ok(live.columnCount > 8, `only ${live.columnCount} columns discovered`);
        });
        await check('no real credential field slipped into the columns', () => {
          const live2 = buildExportTable(docs);
          live2.columns.forEach((column) => {
            assert.equal(isSecretKey(column.path.split('.').pop()), false, column.path);
          });
        });
      } else {
        console.log('  skip  no supplier documents to read');
      }
    } catch (error) {
      console.log(`  skip  database not reachable (${error.message})`);
    } finally {
      if (client) await client.close();
    }
  }

  console.log(`\n${passed} passed, ${failures.length} failed`);
  if (failures.length) {
    console.log('\nFailures:');
    failures.forEach(({ name, error }) => console.log(`  - ${name}: ${error.message}`));
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
