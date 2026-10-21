// import xlsx from 'xlsx';

import * as xlsx from "xlsx";
import { readFileSync } from 'fs';

/* ==========================================================================
   HSR WORKBOOK IMPORT - Opening stock from HSR Excel workbook

   This module extends the existing barcodeReportImport.js pattern to handle
   the HSR opening stock workbook with 27 columns and specific requirements:
   - Duplicate "Item Code" header (columns 4 and 15)
   - HSR-specific purchase price field
   - Date and Age fields for stock audit
   - Opening quantity and value fields

   The workbook structure:
   - Worksheet: "hsr opening stk 19 10"
   - Rows: ~20,548 data rows
   - Columns: 27 columns
   ========================================================================== */

export const HSR_IMPORT_SOURCE = 'HSR_OPENING_STOCK';
export const HSR_IMPORT_LIMIT = 25000; // Large workbook support

/* HSR-specific field definitions matching the Excel columns */
export const HSR_IMPORT_FIELDS = [
  { key: 'slNo', label: 'sl no.', type: 'number', ignore: true },
  { key: 'groupName', label: 'Group Name', type: 'string', target: 'ProductGroup', targetField: 'name', resolveAs: 'parentGroup' },
  { key: 'subGroupName', label: 'Sub Group Name', type: 'string', target: 'ProductGroup', targetField: 'name', resolveAs: 'subGroup' },
  { key: 'itemCode', label: 'Item Code', type: 'string', target: 'Item', targetField: 'itemCode', isPrimary: true, column: 4 },
  { key: 'supplierCode', label: 'Supplier Code', type: 'string', target: 'Supplier', targetField: 'contactId' },
  { key: 'supplierName', label: 'Supplier Name', type: 'string', target: 'Supplier', targetField: 'businessName' },
  { key: 'date', label: 'Date', type: 'date', target: 'BarcodeLabel', targetField: 'stockDate' },
  { key: 'age', label: 'Age', type: 'number', target: 'BarcodeLabel', targetField: 'stockAge' },
  { key: 'purchaseDate', label: 'Purchase Date', type: 'date', target: 'BarcodeLabel', targetField: 'customFields.purchaseDate' },
  { key: 'grcNo', label: 'GRC No', type: 'string', target: 'BarcodeLabel', targetField: 'grcNo' },
  { key: 'supplierInvoiceNo', label: 'Supplier Invoice No', type: 'string', target: 'BarcodeLabel', targetField: 'customFields.supplierInvoiceNo' },
  { key: 'batchUnique', label: 'Batch/Unique', type: 'string', target: 'BarcodeLabel', targetField: 'batchUnique' },
  { key: 'itemName', label: 'Item Name', type: 'string', target: 'Item', targetField: 'name' },
  { key: 'printDescription', label: 'Print Description', type: 'string', target: 'BarcodeLabel', targetField: 'printDescription' },
  { key: 'itemCode2', label: 'Item Code', type: 'string', isDuplicate: true, column: 15 }, // Duplicate - validate against itemCode
  { key: 'itemAttributes', label: 'Item Attributes', type: 'string', target: 'BarcodeLabel', targetField: 'customFields.itemAttributes' },
  { key: 'hsn', label: 'HSN', type: 'string', target: 'Hsn', targetField: 'code' },
  { key: 'hsrPurPrice', label: 'hsr pur price', type: 'number', target: 'BarcodeLabel', targetField: 'hsrPurPrice' },
  { key: 'gst', label: 'GST %', type: 'number', target: 'Tax', targetField: 'igst' },
  { key: 'rsp', label: 'RSP', type: 'number', target: 'Item', targetField: 'rsp' },
  { key: 'discount', label: 'Discount %', type: 'number', target: 'Item', targetField: 'rspOfferPercent' },
  { key: 'offerPrice', label: 'RSP Offer Price', type: 'number', target: 'BarcodeLabel', targetField: 'offerPrice' },
  { key: 'wsp', label: 'WSP', type: 'number', target: 'Item', targetField: 'wsp' },
  { key: 'dp', label: 'DP', type: 'number', target: 'BarcodeLabel', targetField: 'dpPrice' },
  { key: 'openQty', label: 'Open Qty', type: 'number', target: 'BarcodeLabel', targetField: 'openingQty' },
  { key: 'uom', label: 'UOM', type: 'string', target: 'Uom', targetField: 'shortName' },
  { key: 'openValue', label: 'Open Value', type: 'number', calculated: true },
];

/* Field label map for error messages */
export const HSR_FIELD_LABELS = Object.fromEntries(
  HSR_IMPORT_FIELDS.filter(f => !f.ignore).map(f => [f.key, f.label])
);

/* Required fields for a valid HSR row */
const HSR_REQUIRED = ['itemCode', 'openQty', 'uom'];

/* Fields that must be numeric and >= 0 */
const HSR_NUMERIC_POSITIVE = ['openQty', 'hsrPurPrice', 'rsp', 'wsp', 'dp', 'offerPrice'];

/* Fields that must be numeric (can be 0) */
const HSR_NUMERIC = ['gst', 'discount', 'age'];

/* HSN validation pattern */
const HSN_PATTERN = /^\d{2,8}$/;

/* UOM patterns to normalize */
const UOM_NORMALIZE = {
  'pc': 'PC', 'pcs': 'PC', 'piece': 'PC', 'pieces': 'PC',
  'mtr': 'MTR', 'meter': 'MTR', 'metre': 'MTR', 'meters': 'MTR', 'metres': 'MTR',
  'kg': 'KG', 'kilogram': 'KG', 'kilograms': 'KG',
  'g': 'G', 'gram': 'G', 'grams': 'G',
  'l': 'L', 'litre': 'L', 'liter': 'L', 'litres': 'L', 'liters': 'L',
};

/* Normalise header names for matching (case-insensitive, trim, remove special chars) */
export const squashHSR = (text) => String(text ?? '').toLowerCase().replace(/[^a-z0-9%]/g, '');

/* Normalise cell values */
const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

/* Handle empty cells marked as "-" or blank */
const cell = (value) => {
  const v = clean(value);
  return v === '-' || v === '—' || v === 'n/a' || v === 'na' ? '' : v;
};

/* Parse numeric value from Excel cell (remove currency symbols, commas) */
const parseNumber = (value) => {
  const v = cell(value).replace(/[₹,\s]/g, '').replace(/%$/, '');
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

/* Parse date from Excel cell */
const parseDate = (value) => {
  const v = cell(value);
  if (!v) return null;
  const d = new Date(v);
  return !isNaN(d.getTime()) ? d : null;
};

/* Normalise UOM value */
const normaliseUOM = (value) => {
  const v = cell(value).toLowerCase();
  return UOM_NORMALIZE[v] || v.toUpperCase();
};

/* Read HSR workbook from file path or buffer */
export function readHSRWorkbook(filePathOrBuffer) {
  try {
    const buffer = typeof filePathOrBuffer === 'string'
      ? readFileSync(filePathOrBuffer)
      : filePathOrBuffer;
    const workbook = xlsx.read(buffer);
    return workbook;
  } catch (error) {
    throw new Error(`Failed to read workbook: ${error.message}`);
  }
}

/* Analyse workbook structure */
export function analyseHSRWorkbook(workbook) {
  if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
    throw new Error('Workbook has no sheets');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);

  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
    const cell = sheet[cellAddress];
    headers.push(cell ? cell.v : '');
  }

  // Check for duplicate headers
  const headerCounts = {};
  headers.forEach(h => {
    const key = h || '(blank)';
    headerCounts[key] = (headerCounts[key] || 0) + 1;
  });

  const duplicates = Object.entries(headerCounts)
    .filter(([_, count]) => count > 1)
    .map(([h, count]) => ({ header: h, count }));

  return {
    sheetName,
    rowCount: range.e.r,
    columnCount: range.e.c + 1,
    headers,
    duplicates,
    range: sheet['!ref'],
  };
}

/* Map Excel headers to HSR field definitions */
export function mapHSRHeaders(headers) {
  const mapping = new Map(); // column index -> field definition
  const duplicateItemCode = [];

  headers.forEach((header, colIndex) => {
    const squashed = squashHSR(header);
    const field = HSR_IMPORT_FIELDS.find(f => squashHSR(f.label) === squashed);

    if (field) {
      // Handle duplicate "Item Code" header
      if (field.key === 'itemCode' && mapping.has(colIndex)) {
        // This is the second occurrence (column 15)
        mapping.set(colIndex, { ...field, key: 'itemCode2', isDuplicate: true });
        duplicateItemCode.push(colIndex);
      } else {
        mapping.set(colIndex, field);
      }
    }
  });

  // Check for missing required fields
  const missingRequired = HSR_REQUIRED.filter(reqKey => {
    const field = HSR_IMPORT_FIELDS.find(f => f.key === reqKey);
    return field && ![...mapping.values()].some(m => m.key === reqKey);
  });

  return {
    mapping,
    missingRequired,
    duplicateItemCode,
  };
}

/* Read data rows from sheet */
export function readHSRDataRows(sheet, range, mapping) {
  const records = [];
  const left = [];
  let ignored = 0;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const values = {};
    const problems = [];
    let hasRequired = true;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const field = mapping.get(c);
      if (!field || field.ignore) continue;

      const cellAddress = xlsx.utils.encode_cell({ r, c });
      const sheetCell = sheet[cellAddress];
      const rawValue = sheetCell ? sheetCell.v : '';

      // Parse based on field type
      let parsedValue;
      switch (field.type) {
        case 'number':
          parsedValue = parseNumber(rawValue);
          if (parsedValue === null && rawValue !== '') {
            problems.push({ field: field.key, message: `Invalid number: "${rawValue}"` });
          }
          break;
        case 'date':
          parsedValue = parseDate(rawValue);
          if (parsedValue === null && rawValue !== '') {
            problems.push({ field: field.key, message: `Invalid date: "${rawValue}"` });
          }
          break;
        default:
          parsedValue = cell(rawValue);
      }

      values[field.key] = parsedValue;
    }

    // Check required fields
    HSR_REQUIRED.forEach(reqKey => {
      if (!values[reqKey] || values[reqKey] === '') {
        hasRequired = false;
        problems.push({ field: reqKey, message: 'Required field is missing' });
      }
    });

    // Skip rows without required fields
    if (!hasRequired) {
      ignored++;
      if (left.length < 50) {
        left.push({
          line: r + 1,
          text: Object.entries(values).map(([k, v]) => `${k}: ${v}`).join(' | '),
          reason: 'Missing required fields',
        });
      }
      continue;
    }

    // Validate numeric positive fields
    HSR_NUMERIC_POSITIVE.forEach(fieldKey => {
      const val = values[fieldKey];
      if (val !== null && val !== undefined && val !== '' && val < 0) {
        problems.push({ field: fieldKey, message: `${HSR_FIELD_LABELS[fieldKey]} must be >= 0` });
      }
    });

    // Validate HSN format
    if (values.hsn && !HSN_PATTERN.test(values.hsn)) {
      problems.push({ field: 'hsn', message: 'HSN must be 2-8 digits' });
    }

    // Validate duplicate Item Code values
    if (values.itemCode && values.itemCode2 && values.itemCode !== values.itemCode2) {
      problems.push({
        field: 'itemCode',
        message: `Item Code mismatch: column 4 ("${values.itemCode}") vs column 15 ("${values.itemCode2}")`,
      });
    }

    // Validate price/quantity consistency
    if (values.openQty && values.hsrPurPrice && values.openValue) {
      const calculated = values.openQty * values.hsrPurPrice;
      const tolerance = 0.01; // 1% tolerance
      const diff = Math.abs(calculated - values.openValue);
      if (diff > tolerance * Math.max(calculated, values.openValue)) {
        problems.push({
          field: 'openValue',
          message: `Value mismatch: Open Value (${values.openValue}) != Qty (${values.openQty}) × Price (${values.hsrPurPrice}) = ${calculated.toFixed(2)}`,
        });
      }
    }

    records.push({
      line: r + 1,
      values,
      problems,
      hasProblems: problems.length > 0,
    });
  }

  return {
    records,
    ignored,
    left,
    total: range.e.r - range.s.r,
  };
}

/* Main function to parse HSR workbook */
export function parseHSRWorkbook(filePathOrBuffer) {
  const workbook = readHSRWorkbook(filePathOrBuffer);
  const analysis = analyseHSRWorkbook(workbook);
  const { mapping, missingRequired, duplicateItemCode } = mapHSRHeaders(analysis.headers);

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required columns: ${missingRequired.map(k => HSR_FIELD_LABELS[k]).join(', ')}`
    );
  }

  const sheet = workbook.Sheets[analysis.sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const { records, ignored, left, total } = readHSRDataRows(sheet, range, mapping);

  // Check for duplicate barcodes within the workbook
  const barcodeMap = new Map();
  const duplicates = [];
  records.forEach((record) => {
    const key = record.values.itemCode;
    if (key) {
      if (barcodeMap.has(key)) {
        duplicates.push({
          barcode: key,
          line1: barcodeMap.get(key),
          line2: record.line,
        });
        record.problems.push({
          field: 'itemCode',
          message: `Duplicate Item Code "${key}" also appears on line ${barcodeMap.get(key)}`,
        });
        record.hasProblems = true;
      } else {
        barcodeMap.set(key, record.line);
      }
    }
  });

  // Count by problem type
  const problemCounts = {};
  records.forEach(r => {
    r.problems.forEach(p => {
      problemCounts[p.field] = (problemCounts[p.field] || 0) + 1;
    });
  });

  return {
    analysis,
    mapping,
    records,
    left,
    summary: {
      totalRows: total,
      validRows: records.filter(r => !r.hasProblems).length,
      invalidRows: records.filter(r => r.hasProblems).length,
      ignored,
      duplicates: duplicates.length,
      problemCounts,
      missingRequired,
      duplicateItemCode,
    },
  };
}

/* Normalise a single record for database operations */
export function normaliseHSRRecord(record) {
  const values = { ...record.values };

  // Normalise UOM
  if (values.uom) {
    values.uom = normaliseUOM(values.uom);
  }

  // Convert numeric fields to Number type
  HSR_NUMERIC_POSITIVE.forEach(key => {
    if (values[key] !== null && values[key] !== undefined && values[key] !== '') {
      values[key] = Number(values[key]);
    }
  });

  HSR_NUMERIC.forEach(key => {
    if (values[key] !== null && values[key] !== undefined && values[key] !== '') {
      values[key] = Number(values[key]);
    }
  });

  // Ensure required fields are strings where appropriate
  if (values.itemCode) values.itemCode = String(values.itemCode).trim();
  if (values.itemName) values.itemName = String(values.itemName).trim();
  if (values.hsn) values.hsn = String(values.hsn).trim().replace(/\s/g, '');

  return values;
}

/* Validate a single HSR record */
export function validateHSRRecord(values) {
  const problems = [];

  // Required fields
  HSR_REQUIRED.forEach(key => {
    if (!values[key] || values[key] === '' || values[key] === null) {
      problems.push({ field: key, message: `${HSR_FIELD_LABELS[key]} is required` });
    }
  });

  // Numeric positive fields
  HSR_NUMERIC_POSITIVE.forEach(key => {
    if (values[key] !== null && values[key] !== undefined && values[key] !== '') {
      const num = Number(values[key]);
      if (!Number.isFinite(num) || num < 0) {
        problems.push({ field: key, message: `${HSR_FIELD_LABELS[key]} must be a number >= 0` });
      }
    }
  });

  // HSN format
  if (values.hsn && !HSN_PATTERN.test(values.hsn)) {
    problems.push({ field: 'hsn', message: 'HSN must be 2-8 digits' });
  }

  // GST percentage range
  if (values.gst !== null && values.gst !== undefined && values.gst !== '') {
    const gst = Number(values.gst);
    if (gst < 0 || gst > 40) {
      problems.push({ field: 'gst', message: 'GST % must be between 0 and 40' });
    }
  }

  // Quantity > 0
  if (values.openQty !== null && values.openQty !== undefined && values.openQty !== '') {
    const qty = Number(values.openQty);
    if (qty <= 0) {
      problems.push({ field: 'openQty', message: 'Open Qty must be greater than 0' });
    }
  }

  return problems;
}

export default {
  parseHSRWorkbook,
  normaliseHSRRecord,
  validateHSRRecord,
  HSR_IMPORT_FIELDS,
  HSR_FIELD_LABELS,
  HSR_IMPORT_SOURCE,
  HSR_IMPORT_LIMIT,
};
