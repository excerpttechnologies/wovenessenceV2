import * as xlsx from 'xlsx';
import { readFileSync } from 'fs';

/* ==========================================================================
   STOCK ADJUSTMENT EXCEL IMPORT

   This module handles Excel/CSV import for stock adjustments.
   Users can upload a file with item codes and quantities to create
   stock adjustment entries automatically.
   ========================================================================== */

export const STOCK_ADJUSTMENT_IMPORT_SOURCE = 'STOCK_ADJUSTMENT_EXCEL';
export const STOCK_ADJUSTMENT_IMPORT_LIMIT = 10000;

/* Stock adjustment field definitions */
export const STOCK_ADJUSTMENT_FIELDS = [
  { key: 'itemCode', label: 'Item Code', type: 'string', target: 'Item', targetField: 'itemCode', isPrimary: true },
  { key: 'barcodeNo', label: 'Barcode Number', type: 'string', target: 'BarcodeLabel', targetField: 'barcodeNo' },
  { key: 'qty', label: 'Quantity', type: 'number', required: true },
  { key: 'uom', label: 'UOM', type: 'string', target: 'Uom', targetField: 'shortName' },
  { key: 'adjustmentType', label: 'Adjustment Type', type: 'string', required: true }, // 'ADD' or 'REMOVE'
  { key: 'reason', label: 'Reason', type: 'string' },
  { key: 'location', label: 'Location', type: 'string', target: 'CompanyLocation', targetField: 'name' },
  { key: 'warehouse', label: 'Warehouse', type: 'string', target: 'StockPoint', targetField: 'stockPoint' },
];

export const STOCK_ADJUSTMENT_FIELD_LABELS = Object.fromEntries(
  STOCK_ADJUSTMENT_FIELDS.filter(f => !f.ignore).map(f => [f.key, f.label])
);

const normName = (text) => String(text ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

const exactName = (value) => new RegExp('^\\s*' + normName(value).split(' ').map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('\\s+') + '\\s*$', 'i');

const clean = (value) => String(value ?? '').replace(/\s+/g, ' ').trim();

const cell = (value) => {
  const v = clean(value);
  return v === '-' || v === '—' || v === 'n/a' || v === 'na' || v === '' ? '' : v;
};

const parseNumber = (value) => {
  const v = cell(value).replace(/[₹,\s]/g, '');
  const num = Number(v);
  return Number.isFinite(num) ? num : null;
};

/* Read workbook from file path or buffer */
export function readStockAdjustmentWorkbook(filePathOrBuffer) {
  try {
    const buffer = typeof filePathOrBuffer === 'string'
      ? readFileSync(filePathOrBuffer)
      : filePathOrBuffer;
    
    const isCSV = typeof filePathOrBuffer === 'string' 
      ? filePathOrBuffer.toLowerCase().endsWith('.csv')
      : false;
    
    const options = isCSV ? { type: 'string' } : {};
    
    const workbook = xlsx.read(buffer, options);
    return workbook;
  } catch (error) {
    throw new Error(`Failed to read workbook: ${error.message}`);
  }
}

/* Analyse workbook structure */
export function analyseStockAdjustmentWorkbook(workbook) {
  if (!workbook || !workbook.SheetNames || !workbook.SheetNames.length) {
    throw new Error('Workbook has no sheets');
  }

  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);

  const headers = [];
  for (let c = range.s.c; c <= range.e.c; c++) {
    const cellAddress = xlsx.utils.encode_cell({ r: range.s.r, c });
    const sheetCell = sheet[cellAddress];
    headers.push(sheetCell ? sheetCell.v : '');
  }

  return {
    sheetName,
    rowCount: range.e.r,
    columnCount: range.e.c + 1,
    headers,
    range: sheet['!ref'],
  };
}

/* Map headers to field definitions */
export function mapStockAdjustmentHeaders(headers) {
  const mapping = new Map();
  const missingRequired = [];

  headers.forEach((header, colIndex) => {
    const squashed = normName(header);
    const field = STOCK_ADJUSTMENT_FIELDS.find(f => normName(f.label) === squashed);

    if (field) {
      mapping.set(colIndex, field);
    }
  });

  // Check for required fields
  const requiredFields = STOCK_ADJUSTMENT_FIELDS.filter(f => f.required);
  requiredFields.forEach(reqField => {
    if (![...mapping.values()].some(m => m.key === reqField.key)) {
      missingRequired.push(reqField.label);
    }
  });

  return {
    mapping,
    missingRequired,
  };
}

/* Read data rows */
export function readStockAdjustmentDataRows(sheet, range, mapping) {
  const records = [];
  const left = [];
  let ignored = 0;

  for (let r = range.s.r + 1; r <= range.e.r; r++) {
    const values = {};
    const problems = [];
    let hasRequired = true;

    for (let c = range.s.c; c <= range.e.c; c++) {
      const field = mapping.get(c);
      if (!field) continue;

      const cellAddress = xlsx.utils.encode_cell({ r, c });
      const sheetCell = sheet[cellAddress];
      const rawValue = sheetCell ? sheetCell.v : '';

      let parsedValue;
      switch (field.type) {
        case 'number':
          parsedValue = parseNumber(rawValue);
          if (parsedValue === null && rawValue !== '' && rawValue !== undefined && rawValue !== null) {
            problems.push({ field: field.key, message: `Invalid number: "${rawValue}"` });
          }
          break;
        default:
          parsedValue = cell(rawValue);
      }

      values[field.key] = parsedValue;
    }

    // Check required fields
    STOCK_ADJUSTMENT_FIELDS.filter(f => f.required).forEach(reqField => {
      if (!values[reqField.key] || values[reqField.key] === '') {
        hasRequired = false;
        problems.push({ field: reqField.key, message: `${reqField.label} is required` });
      }
    });

    // Validate adjustment type
    if (values.adjustmentType) {
      const adjType = values.adjustmentType.toUpperCase();
      if (adjType !== 'ADD' && adjType !== 'REMOVE' && adjType !== 'INCREASE' && adjType !== 'DECREASE') {
        problems.push({ field: 'adjustmentType', message: 'Adjustment Type must be ADD, REMOVE, INCREASE, or DECREASE' });
      }
    }

    // Validate quantity
    if (values.qty !== null && values.qty !== undefined && values.qty !== '') {
      const qty = Number(values.qty);
      if (qty <= 0) {
        problems.push({ field: 'qty', message: 'Quantity must be greater than 0' });
      }
    }

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

/* Main parsing function */
export function parseStockAdjustmentWorkbook(filePathOrBuffer) {
  const workbook = readStockAdjustmentWorkbook(filePathOrBuffer);
  const analysis = analyseStockAdjustmentWorkbook(workbook);
  const { mapping, missingRequired } = mapStockAdjustmentHeaders(analysis.headers);

  if (missingRequired.length > 0) {
    throw new Error(
      `Missing required columns: ${missingRequired.join(', ')}`
    );
  }

  const sheet = workbook.Sheets[analysis.sheetName];
  const range = xlsx.utils.decode_range(sheet['!ref']);
  const { records, ignored, left, total } = readStockAdjustmentDataRows(sheet, range, mapping);

  // Check for duplicates
  const keyMap = new Map();
  const duplicates = [];
  records.forEach((record) => {
    const key = record.values.itemCode || record.values.barcodeNo;
    if (key) {
      if (keyMap.has(key)) {
        duplicates.push({
          key,
          line1: keyMap.get(key),
          line2: record.line,
        });
        record.problems.push({
          field: 'itemCode',
          message: `Duplicate "${key}" also appears on line ${keyMap.get(key)}`,
        });
        record.hasProblems = true;
      } else {
        keyMap.set(key, record.line);
      }
    }
  });

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
    },
  };
}

export default {
  parseStockAdjustmentWorkbook,
  STOCK_ADJUSTMENT_FIELDS,
  STOCK_ADJUSTMENT_FIELD_LABELS,
  STOCK_ADJUSTMENT_IMPORT_SOURCE,
  STOCK_ADJUSTMENT_IMPORT_LIMIT,
};
