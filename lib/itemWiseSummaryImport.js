/* ==========================================================================
   ITEM WISE SUMMARY IMPORT - parsing, validation and workbooks.

   Pure module: no database, no session, no browser globals. The API service
   loads the masters and existing barcode rows, hands them here, and stores the
   result. Preview, error report and the actual write therefore judge a row
   with the same rules.

   The workbook is the ERP's own "Item Wise Summary" report. Its 33 template
   columns are matched in order; the exported report (34 columns, which adds
   Sub Group Name and Item Name and has no Barcode column) is accepted as a
   compatible shape. Nothing is renamed and no column is added to the
   operator's upload.

   Stock semantics: Open / Inward / Outward / Close are four views of the same
   stock position, not four quantities to add. Close Qty is the on-hand figure
   imported as the opening balance (the ERP's existing opening-stock
   convention); Open, Inward, Outward and Close are preserved on the barcode
   row as summary data. No purchase or sale transaction is invented.
   ========================================================================== */

import * as XLSX from 'xlsx';
import { buildXlsx, STYLE } from './xlsxWriter.js';
import {
  ITEM_WISE_SHEET,
  MAX_IMPORT_ROWS,
  LAYOUTS,
  LAYOUT_LABELS,
  FIELDS_BY_LAYOUT,
  FIELD_BY_KEY,
  ROW_STATUS,
  STRATEGIES,
  MASTER_TYPES,
  MASTER_SLUGS,
  CREATABLE_MASTERS,
  ERROR_REPORT_COLUMNS,
} from './itemWiseSummaryConstants.js';

export class ImportWorkbookError extends Error {
  constructor(message, details = {}) {
    super(message);
    this.name = 'ImportWorkbookError';
    this.code = details.code || 'IMPORT_WORKBOOK_INVALID';
    this.status = details.status || 422;
    this.details = details;
  }
}

/* --------------------------------------------------------------- text ---- */

export function cleanText(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? '' : isoDate(value);
  return String(value)
    .replace(/\u00a0/g, ' ')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

export function normalizeKey(value) {
  return cleanText(value).toLowerCase().replace(/\s+/g, ' ').trim();
}

export function compactKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function isBlank(value) {
  const text = normalizeKey(value);
  return text === '' || text === '-' || text === '—' || text === 'na' || text === 'n/a';
}

function isoDate(date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function padNumber(value, decimals = 2) {
  if (value === null || value === undefined || value === '') return '';
  const number = Number(value);
  if (!Number.isFinite(number)) return cleanText(value);
  return String(Number(number.toFixed(decimals)));
}

/* ------------------------------------------------------------- numbers --- */

export function parseNumberCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  let text = cleanText(value)
    .replace(/[₹$€£]/g, '')
    .replace(/,/g, '')
    .replace(/%$/, '')
    .trim();
  if (!text) return null;
  if (text === '-') return null;
  if (/^\(.*\)$/.test(text)) text = `-${text.slice(1, -1)}`;
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

export function parseIntegerCell(value) {
  const number = parseNumberCell(value);
  if (number === null) return null;
  return Number.isInteger(number) ? number : Math.trunc(number);
}

/* --------------------------------------------------------------- dates --- */

const MONTHS = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6,
  jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function dateFromParts(year, month, day) {
  const y = Number(year);
  const m = Number(month);
  const d = Number(day);
  if (!y || !m || !d) return null;
  const date = new Date(y < 100 ? y + (y >= 70 ? 1900 : 2000) : y, m - 1, d);
  if (date.getFullYear() !== (y < 100 ? (y >= 70 ? y + 1900 : y + 2000) : y)) return null;
  if (date.getMonth() !== m - 1 || date.getDate() !== d) return null;
  return date;
}

/* Returns { iso, date } so a caller can store a Date and show the same day. */
export function parseDateCell(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return { iso: isoDate(value), date: value };
  }

  if (typeof value === 'number' && Number.isFinite(value)) {
    /* Excel serial, day zero 1899-12-30. */
    if (value < 1 || value > 2958465) return null;
    const ms = Math.round((value - 25569) * 86400000);
    const utc = new Date(ms);
    if (Number.isNaN(utc.getTime())) return null;
    const date = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
    return { iso: isoDate(date), date };
  }

  const text = cleanText(value);
  if (!text || text === '-') return null;

  let match = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (match) {
    const date = dateFromParts(match[1], match[2], match[3]);
    return date ? { iso: isoDate(date), date } : null;
  }

  match = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
  if (match) {
    let day = Number(match[1]);
    let month = Number(match[2]);
    /* Indian workbooks are day first. Only swap when that is the sole way the
       value can be a date (10/21/2026). */
    if (month > 12 && day <= 12) {
      const swap = day;
      day = month;
      month = swap;
    }
    const date = dateFromParts(match[3], month, day);
    return date ? { iso: isoDate(date), date } : null;
  }

  match = text.match(/^(\d{8})$/);
  if (match) {
    const date = dateFromParts(text.slice(0, 4), text.slice(4, 6), text.slice(6, 8));
    return date ? { iso: isoDate(date), date } : null;
  }

  /* A numeric cell read raw arrives here as "46303". Excel's day zero is
     1899-12-30; only accept a plausible modern serial to avoid mistaking a
     year or a code for a date. */
  if (/^\d{5}(\.\d+)?$/.test(text)) {
    const serial = Number(text);
    if (serial >= 20000 && serial <= 80000) {
      const ms = Math.round((serial - 25569) * 86400000);
      const utc = new Date(ms);
      if (!Number.isNaN(utc.getTime())) {
        const date = new Date(utc.getUTCFullYear(), utc.getUTCMonth(), utc.getUTCDate());
        return { iso: isoDate(date), date };
      }
    }
  }

  match = text.match(/^(\d{1,2})[\s-]([A-Za-z]{3,9})[\s-](\d{2,4})$/);
  if (match) {
    const month = MONTHS[match[2].toLowerCase().slice(0, match[2].toLowerCase().startsWith('sept') ? 4 : 3)];
    if (month) {
      const date = dateFromParts(match[3], month, match[1]);
      if (date) return { iso: isoDate(date), date };
    }
  }

  match = text.match(/^([A-Za-z]{3,9})[\s-](\d{1,2}),?[\s-](\d{2,4})$/);
  if (match) {
    const month = MONTHS[match[1].toLowerCase().slice(0, 3)];
    if (month) {
      const date = dateFromParts(match[3], month, match[2]);
      if (date) return { iso: isoDate(date), date };
    }
  }

  return null;
}

/* ----------------------------------------------------------------- UOM --- */

const UOM_ALIASES = {
  pc: 'PC', pcs: 'PC', pcs: 'PC', piece: 'PC', pieces: 'PC', no: 'PC', nos: 'PC', number: 'PC',
  mtr: 'MTR', mtrs: 'MTR', meter: 'MTR', meters: 'MTR', metre: 'MTR', metres: 'MTR',
  kg: 'KG', kgs: 'KG', kilogram: 'KG', kilograms: 'KG',
  g: 'G', gm: 'G', gms: 'G', gram: 'G', grams: 'G',
  l: 'L', ltr: 'L', litre: 'L', litres: 'L', liter: 'L', liters: 'L',
  set: 'SET', sets: 'SET', pair: 'PR', pr: 'PR', box: 'BOX', roll: 'ROLL',
};

export function normalizeUom(value) {
  const text = cleanText(value).replace(/\(s\)$/i, '').replace(/[.\s]+$/g, '');
  if (!text) return '';
  const key = text.toLowerCase().replace(/[^a-z]/g, '');
  return UOM_ALIASES[key] || text.toUpperCase();
}

export function uomTypeOf(value) {
  const text = cleanText(value).toLowerCase();
  return /mtr|metre|meter|yard|yd/.test(text) ? 'MTR' : 'PC';
}

export function normalizeBatchType(value) {
  const text = cleanText(value).toLowerCase();
  if (text === 'batch' || text === 'unique') return text;
  return null;
}

/* ------------------------------------------------------------ workbook --- */

function findSheet(workbook) {
  if (!workbook?.SheetNames?.length) {
    throw new ImportWorkbookError('The workbook has no worksheets. Download the template and fill in the "Item Wise Summary" sheet.');
  }
  const exact = workbook.SheetNames.find((name) => name === ITEM_WISE_SHEET);
  if (exact) return exact;
  const loose = workbook.SheetNames.find((name) => normalizeKey(name) === normalizeKey(ITEM_WISE_SHEET));
  if (loose) return loose;
  throw new ImportWorkbookError(
    `Worksheet "${ITEM_WISE_SHEET}" was not found. Sheets in this workbook: ${workbook.SheetNames.join(', ')}.`,
    { code: 'SHEET_NOT_FOUND', sheets: workbook.SheetNames },
  );
}

function headerKey(value) {
  return normalizeKey(value).replace(/\s+/g, ' ');
}

function detectLayout(headers) {
  const uploaded = headers.map(headerKey);
  const shapes = [
    { layout: LAYOUTS.TEMPLATE, expected: FIELDS_BY_LAYOUT[LAYOUTS.TEMPLATE].map((f) => headerKey(f.label)) },
    { layout: LAYOUTS.REFERENCE, expected: FIELDS_BY_LAYOUT[LAYOUTS.REFERENCE].map((f) => headerKey(f.label)) },
  ];

  for (const shape of shapes) {
    if (uploaded.length === shape.expected.length && uploaded.every((h, i) => h === shape.expected[i])) {
      return { layout: shape.layout, fields: FIELDS_BY_LAYOUT[shape.layout], missing: [], unexpected: [], order: [] };
    }
  }

  const expected = shapes[0].expected;
  const missing = expected.filter((h) => !uploaded.includes(h));
  const unexpected = uploaded.filter((h) => !expected.includes(h));
  const order = [];
  expected.forEach((h, index) => {
    const at = uploaded.indexOf(h);
    if (at >= 0 && at !== index) order.push({ column: index + 1, expected: headers[index] || h, foundAt: at + 1 });
  });

  const reference = shapes[1];
  const referenceMissing = reference.expected.filter((h) => !uploaded.includes(h));
  const referenceUnexpected = uploaded.filter((h) => !reference.expected.includes(h));

  const detail = [];
  if (referenceMissing.length === 0 && referenceUnexpected.length === 0) {
    detail.push('The columns are all present but their order differs.');
  }
  if (missing.length) detail.push(`Missing: ${missing.join(', ')}.`);
  if (unexpected.length) detail.push(`Unexpected: ${unexpected.join(', ')}.`);
  if (order.length) {
    detail.push(`Out of order: ${order.slice(0, 6).map((o) => o.expected).join(', ')}.`);
  }

  throw new ImportWorkbookError(
    `The worksheet does not match the Item Wise Summary template. ${detail.join(' ')} Download the template and keep row 1 unchanged.`,
    {
      code: 'HEADER_MISMATCH',
      missing,
      unexpected,
      order,
      uploadedHeaders: headers,
      expectedTemplateHeaders: FIELDS_BY_LAYOUT[LAYOUTS.TEMPLATE].map((f) => f.label),
      expectedReferenceHeaders: FIELDS_BY_LAYOUT[LAYOUTS.REFERENCE].map((f) => f.label),
      referenceMissing,
      referenceUnexpected,
    },
  );
}

function findHeaderRow(matrix) {
  const last = Math.min(matrix.length - 1, 30);
  for (let i = 0; i <= last; i += 1) {
    const headers = (matrix[i] || []).map(cleanText).filter(Boolean);
    const keys = headers.map(headerKey);
    if (keys.includes(headerKey('Item Code')) && keys.includes(headerKey('Location Name'))) return i;
  }
  throw new ImportWorkbookError(
    'Header row not found. The first sheet row must contain the Item Wise Summary column headings.',
    { code: 'HEADER_ROW_NOT_FOUND' },
  );
}

function isTotalRow(values, firstCell) {
  const key = compactKey(firstCell);
  if (key === 'total' || key === 'grandtotal' || key === 'subtotal') return true;
  const firstThree = [values.locationName, values.groupName, values.subGroupName, values.itemCode]
    .filter(Boolean)
    .map(compactKey);
  return firstThree.some((value) => value === 'total' || value === 'grandtotal');
}

/* Reads the sheet into field-keyed text values, keeping the Excel row number.
   The formatted cell text is used on purpose: a barcode or code column with
   leading zeros keeps them, and a date keeps the day the operator sees. */
export function readWorkbook(buffer) {
  let workbook;
  try {
    /* Dense + raw keeps a 33,000-row report at a fraction of a formatted
       read. A text-formatted barcode stays a string, so leading zeros survive;
       a numeric date cell is still read as its Excel serial and parsed below. */
    workbook = XLSX.read(buffer, {
      type: 'buffer', dense: true, cellDates: false, cellNF: false, cellText: false,
    });
  } catch (error) {
    throw new ImportWorkbookError(`This file could not be read as an Excel workbook: ${error.message}`, {
      code: 'WORKBOOK_UNREADABLE',
    });
  }

  const sheetName = findSheet(workbook);
  const sheet = workbook.Sheets[sheetName];
  if (!sheet || !sheet['!ref']) {
    throw new ImportWorkbookError(`Worksheet "${sheetName}" is empty.`);
  }

  const range = XLSX.utils.decode_range(sheet['!ref']);
  if (range.e.r - range.s.r > MAX_IMPORT_ROWS) {
    throw new ImportWorkbookError(
      `This worksheet has ${range.e.r - range.s.r + 1} rows; the import accepts at most ${MAX_IMPORT_ROWS}. Split the workbook and import it in parts.`,
      { code: 'TOO_MANY_ROWS' },
    );
  }

  const matrix = XLSX.utils.sheet_to_json(sheet, {
    header: 1,
    raw: true,
    defval: '',
    blankrows: true,
  });

  const matrixHeaderRow = findHeaderRow(matrix);
  const headers = (matrix[matrixHeaderRow] || []).map(cleanText);
  while (headers.length && headers[headers.length - 1] === '') headers.pop();
  const { layout, fields } = detectLayout(headers);

  const rows = [];
  const ignored = { blank: 0, total: 0, extra: 0 };
  for (let i = matrixHeaderRow + 1; i < matrix.length; i += 1) {
    const line = matrix[i] || [];
    const values = {};
    fields.forEach((field, col) => {
      values[field.key] = cleanText(line[range.s.c + col]);
    });

    const hasAny = fields.some((field) => !isBlank(values[field.key]));
    if (!hasAny) {
      ignored.blank += 1;
      continue;
    }
    if (isTotalRow(values, line[range.s.c])) {
      ignored.total += 1;
      continue;
    }

    rows.push({ row: range.s.r + i + 1, values });
  }

  if (!rows.length) {
    throw new ImportWorkbookError(
      `No data rows were found below the header in "${sheetName}". Fill in at least one item row and upload again.`,
      { code: 'NO_DATA_ROWS' },
    );
  }

  return {
    sheetName,
    layout,
    layoutLabel: LAYOUT_LABELS[layout],
    fields,
    headers,
    headerRowIndex: range.s.r + matrixHeaderRow + 1,
    rows,
    ignored,
    totalRows: rows.length + ignored.blank + ignored.total,
  };
}

/* -------------------------------------------------------------- masters -- */

function pushArray(map, key, value) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(value);
}

export function buildMasterLookup({ locations = [], groups = [], suppliers = [], items = [], uoms = [], hsns = [] } = {}) {
  const lookup = {
    locationByName: new Map(),
    groupByName: new Map(),
    groupById: new Map(),
    supplierByCode: new Map(),
    supplierByName: new Map(),
    itemByCode: new Map(),
    itemByName: new Map(),
    itemById: new Map(),
    uomByKey: new Map(),
    uomById: new Map(),
    hsnByCode: new Map(),
    hsnById: new Map(),
  };

  locations.forEach((row) => {
    lookup.locationByName.set(normalizeKey(row.name), row);
  });
  groups.forEach((row) => {
    lookup.groupById.set(String(row._id), row);
    /*
     * Two Product masters can carry the same group name. First one wins, which
     * matches the rest of the ERP's name lookups; an existing barcode keeps the
     * id it already has.
     */
    if (!lookup.groupByName.has(normalizeKey(row.name))) lookup.groupByName.set(normalizeKey(row.name), row);
  });
  suppliers.forEach((row) => {
    if (row.contactId) lookup.supplierByCode.set(compactKey(row.contactId), row);
    if (row.businessName) lookup.supplierByName.set(normalizeKey(row.businessName), row);
    if (row.shortName && !lookup.supplierByName.has(normalizeKey(row.shortName))) {
      lookup.supplierByName.set(normalizeKey(row.shortName), row);
    }
  });
  items.forEach((row) => {
    lookup.itemById.set(String(row._id), row);
    if (row.itemCode) {
      if (!lookup.itemByCode.has(compactKey(row.itemCode))) lookup.itemByCode.set(compactKey(row.itemCode), row);
    }
    if (row.name) pushArray(lookup.itemByName, normalizeKey(row.name), row);
  });
  uoms.forEach((row) => {
    lookup.uomById.set(String(row._id), row);
    [row.name, row.shortName].filter(Boolean).forEach((value) => {
      const key = compactKey(normalizeUom(value));
      if (key && !lookup.uomByKey.has(key)) lookup.uomByKey.set(key, row);
    });
  });
  hsns.forEach((row) => {
    lookup.hsnById.set(String(row._id), row);
    if (row.code) {
      lookup.hsnByCode.set(cleanText(row.code), row);
      const numeric = String(Number(row.code));
      if (numeric !== cleanText(row.code)) lookup.hsnByCode.set(numeric, row);
    }
  });

  return lookup;
}

function groupParentOf(group, lookup) {
  if (!group?.parentId) return null;
  return lookup.groupById.get(String(group.parentId)) || null;
}

function uomFromItem(item, lookup) {
  if (!item?.uomId) return null;
  return lookup.uomById.get(String(item.uomId)) || null;
}

function hsnFromItem(item, lookup) {
  if (!item?.hsnId) return null;
  return lookup.hsnById.get(String(item.hsnId)) || null;
}

/* Resolves the row's masters using the same precedence the rest of the ERP
   uses: an existing Item master owns its group/sub group/UOM/HSN, while the
   workbook's own values are kept on the stock row and reported when they
   disagree. Nothing is overwritten on a master. */
export function resolveRowMasters(values, lookup) {
  const resolved = {
    location: null, supplier: null, item: null, group: null, subGroup: null, uom: null, hsn: null,
  };
  const missing = [];
  const warnings = [];

  const locationName = cleanText(values.locationName);
  if (locationName) resolved.location = lookup.locationByName.get(normalizeKey(locationName)) || null;

  const itemCode = cleanText(values.itemCode);
  if (itemCode) resolved.item = lookup.itemByCode.get(compactKey(itemCode)) || null;

  const item = resolved.item;
  const itemSubGroup = item?.subGroupId ? lookup.groupById.get(String(item.subGroupId)) || null : null;
  const itemGroup = groupParentOf(itemSubGroup, lookup);

  const supplierCode = cleanText(values.supplierCode);
  const supplierName = cleanText(values.supplierName);
  if (supplierCode) resolved.supplier = lookup.supplierByCode.get(compactKey(supplierCode)) || null;
  if (!resolved.supplier && supplierName) resolved.supplier = lookup.supplierByName.get(normalizeKey(supplierName)) || null;
  if (!resolved.supplier && !supplierCode && supplierName) {
    resolved.supplier = lookup.supplierByName.get(normalizeKey(supplierName)) || null;
  }
  if (resolved.supplier && supplierCode && resolved.supplier.contactId
    && compactKey(resolved.supplier.contactId) !== compactKey(supplierCode)) {
    warnings.push(`Supplier matched by name; the master's code is ${resolved.supplier.contactId}, the workbook says ${supplierCode}. The master was not changed.`);
  }

  const groupName = cleanText(values.groupName);
  const subGroupName = cleanText(values.subGroupName);
  if (groupName) resolved.group = lookup.groupByName.get(normalizeKey(groupName)) || null;
  if (subGroupName) {
    resolved.subGroup = lookup.groupByName.get(normalizeKey(subGroupName)) || null;
    if (resolved.subGroup && resolved.group && resolved.subGroup.parentId
      && String(resolved.subGroup.parentId) !== String(resolved.group._id)) {
      warnings.push(`Sub group "${subGroupName}" does not belong to group "${groupName}" in the masters.`);
    }
  }
  if (!resolved.group && itemGroup) resolved.group = itemGroup;
  if (!resolved.subGroup && itemSubGroup) resolved.subGroup = itemSubGroup;

  const uomName = cleanText(values.uom);
  if (uomName) resolved.uom = lookup.uomByKey.get(compactKey(normalizeUom(uomName))) || null;
  const itemUom = uomFromItem(item, lookup);
  if (!resolved.uom && itemUom) resolved.uom = itemUom;
  if (uomName && itemUom && compactKey(normalizeUom(uomName)) !== compactKey(normalizeUom(itemUom.name || itemUom.shortName))) {
    warnings.push(`The Item master uses UOM ${itemUom.shortName || itemUom.name}; the workbook says ${uomName}. The master's UOM is used.`);
  }

  const hsnCode = cleanText(values.hsn);
  if (hsnCode) {
    resolved.hsn = lookup.hsnByCode.get(hsnCode) || lookup.hsnByCode.get(String(Number(hsnCode))) || null;
  }
  const itemHsn = hsnFromItem(item, lookup);
  if (!resolved.hsn && itemHsn) resolved.hsn = itemHsn;
  if (hsnCode && itemHsn && cleanText(itemHsn.code) !== hsnCode) {
    warnings.push(`The Item master uses HSN ${itemHsn.code}; the workbook says ${hsnCode}. The workbook value is stored on the stock row.`);
  }

  const itemNameGiven = cleanText(values.itemName);
  const printDescription = cleanText(values.printDescription);
  if (item && itemNameGiven && normalizeKey(item.name) !== normalizeKey(itemNameGiven)
    && compactKey(item.itemCode) !== compactKey(itemNameGiven)) {
    warnings.push(`Item master name "${item.name}" differs from the workbook's "${itemNameGiven}". The master was not changed.`);
  }

  const add = (type, value, message, extra = {}) => {
    if (!cleanText(value)) return;
    missing.push({ type, value: cleanText(value), message, ...extra });
  };

  if (locationName && !resolved.location) add(MASTER_TYPES.LOCATION, locationName, 'Location not found in this business');
  if (groupName && !resolved.group) add(MASTER_TYPES.GROUP, groupName, 'Group not found');
  if (subGroupName && !resolved.subGroup) add(MASTER_TYPES.SUB_GROUP, subGroupName, 'Sub group not found', { parent: groupName });
  if ((supplierCode || supplierName) && !resolved.supplier) {
    add(MASTER_TYPES.SUPPLIER, supplierCode || supplierName, 'Supplier master not found', {
      name: supplierName, code: supplierCode,
    });
  }
  if (itemCode && !item) {
    add(MASTER_TYPES.ITEM, itemCode, 'Item master not found', {
      name: itemNameGiven || printDescription || itemCode,
      group: groupName, subGroup: subGroupName, uom: uomName, hsn: hsnCode,
    });
  }
  if (hsnCode && !resolved.hsn) add(MASTER_TYPES.HSN, hsnCode, 'HSN master not found');
  if (uomName && !resolved.uom) add(MASTER_TYPES.UOM, uomName, 'UOM master not found');

  return { resolved, missing, warnings };
}

/* ---------------------------------------------------------- approvals ---- */

export function normalizeApprovals(input = {}) {
  const out = {};
  Object.entries(input || {}).forEach(([slug, values]) => {
    /* Idempotent on purpose: the analysis is re-run after masters are created
       and the server hands the same approvals back. Without this, the second
       pass would read a Set as one opaque value and silently lose every
       approval. */
    const list = values instanceof Set ? [...values] : (Array.isArray(values) ? values : [values]);
    out[slug] = new Set(list.map((value) => compactKey(value)).filter(Boolean));
  });
  return out;
}

export function isApproved(approvals, type, value) {
  const slug = MASTER_SLUGS[type];
  if (!slug || !approvals?.[slug]) return false;
  return approvals[slug].has(compactKey(value));
}

export function missingKey(type, value) {
  return `${type}|${compactKey(value)}`;
}

/* ------------------------------------------------------------- analysis -- */

function issue(field, value, message, suggestion = '') {
  return { field, value: cleanText(value), message, suggestion };
}

/* One row's judgement. Exported so tests can exercise a single row. */
export function analyzeRow({ line, values, lookup, existing, strategy, approvals, asOfDate, locationAllowed = null }) {
  const problems = [];
  const warnings = [];
  const { resolved, missing, warnings: masterWarnings } = resolveRowMasters(values, lookup);
  warnings.push(...masterWarnings);

  if (resolved.location && typeof locationAllowed === 'function' && !locationAllowed(String(resolved.location._id))) {
    problems.push(issue('Location Name', values.locationName,
      'Your account is not assigned to this location.',
      'Ask an administrator for access, or import only your own location.'));
  }

  const itemCode = cleanText(values.itemCode);
  const locationName = cleanText(values.locationName);
  const itemName = cleanText(values.itemName) || cleanText(values.printDescription) || itemCode;
  const barcodeGiven = cleanText(values.barcode);
  const effectiveBarcode = barcodeGiven || itemCode;

  if (!locationName) problems.push(issue('Location Name', '', 'Location Name is required', 'Enter a location that exists in this business.'));
  if (!itemCode) problems.push(issue('Item Code', '', 'Item Code is required', 'Enter the item master code.'));

  const numberFields = [
    ['purRate', 'Purchase Rate'], ['discount', 'Discount'], ['finalNet', 'Final Net Rate'],
    ['gst', 'GST %'], ['rsp', 'RSP'], ['discountPercent', 'Discount %'],
    ['offerPrice', 'RSP Offer Price'], ['wsp', 'WSP'], ['dp', 'DP'],
    ['openQty', 'Open Qty'], ['openValue', 'Open Value'],
    ['inwardQty', 'Inward Qty'], ['inwardValue', 'Inward Value'],
    ['outwardQty', 'Outward Qty'], ['outwardValue', 'Outward Value'],
    ['closeQty', 'Close Qty'], ['closeValue', 'Close Value'],
  ];
  const numbers = {};
  numberFields.forEach(([key, label]) => {
    const text = cleanText(values[key]);
    if (!text) {
      numbers[key] = null;
      return;
    }
    const parsed = parseNumberCell(text);
    if (parsed === null) {
      problems.push(issue(label, text, `${label} is not a number`, 'Leave it blank or enter a number.'));
      numbers[key] = null;
    } else {
      numbers[key] = parsed;
    }
  });

  if (numbers.purRate !== null && numbers.purRate < 0) {
    problems.push(issue('Purchase Rate', values.purRate, 'Purchase Rate cannot be negative', 'Enter the purchase rate.'));
  }
  if (numbers.gst !== null && (numbers.gst < 0 || numbers.gst > 40)) {
    problems.push(issue('GST %', values.gst, 'GST % must be between 0 and 40', 'Use the GST slab from the tax master.'));
  }
  if (numbers.openQty !== null && numbers.openQty < 0) {
    problems.push(issue('Open Qty', values.openQty, 'Open Qty cannot be negative', 'Enter the opening quantity as a positive number.'));
  }
  if (numbers.inwardQty !== null && numbers.inwardQty < 0) {
    problems.push(issue('Inward Qty', values.inwardQty, 'Inward Qty cannot be negative', 'Enter the quantity as a positive number.'));
  }

  /* The ERP's own Item Wise Summary prints an outward move as a negative
     quantity and value (open 2, outward -2, close 0). That sign is the
     report's convention for "away from this location", not a bad number, and
     the Close Qty arithmetic below is open + inward - outward. Normalise it
     once here so the preview, the error report and the stored summary all
     carry the same positive outward figure. */
  if (numbers.outwardQty !== null && numbers.outwardQty < 0) {
    warnings.push(`Outward Qty was negative (${cleanText(values.outwardQty)}); it is read as ${padNumber(Math.abs(numbers.outwardQty), 3)} outward, which is how this report prints an outward movement.`);
    numbers.outwardQty = Math.abs(numbers.outwardQty);
  }
  if (numbers.outwardValue !== null && numbers.outwardValue < 0) {
    numbers.outwardValue = Math.abs(numbers.outwardValue);
  }

  if (cleanText(values.age)) {
    const age = parseIntegerCell(values.age);
    if (age === null || age < 0) {
      warnings.push(`Age "${cleanText(values.age)}" is not a valid stock age; it was left blank.`);
    } else {
      numbers.age = age;
    }
  }
  if (numbers.age === undefined) numbers.age = null;

  const stockDate = parseDateCell(values.date);
  if (cleanText(values.date) && !stockDate) {
    problems.push(issue('Date', values.date, 'Date is not a valid date', 'Use dd/mm/yyyy.'));
  }
  const purchaseDate = parseDateCell(values.purchaseDate);
  if (cleanText(values.purchaseDate) && !purchaseDate) {
    problems.push(issue('Purchase Date', values.purchaseDate, 'Purchase Date is not a valid date', 'Use dd/mm/yyyy.'));
  }

  if (cleanText(values.hsn) && !/^\d{2,8}$/.test(cleanText(values.hsn))) {
    problems.push(issue('HSN', values.hsn, 'HSN must be 2 to 8 digits', 'Use the HSN code from the HSN master.'));
  }

  let batchType = normalizeBatchType(values.batchUnique);
  if (cleanText(values.batchUnique) && !batchType) {
    warnings.push(`Batch/Unique "${cleanText(values.batchUnique)}" is not Batch or Unique; the Item master or quantity decides.`);
  }

  /* The on-hand figure: Close Qty when the report carries it, otherwise the
     report's own arithmetic. Open Qty is never added to Close Qty. */
  let qty = numbers.closeQty;
  if (qty === null) {
    const open = numbers.openQty || 0;
    const inward = numbers.inwardQty || 0;
    const outward = numbers.outwardQty || 0;
    if (numbers.openQty !== null || numbers.inwardQty !== null || numbers.outwardQty !== null) {
      qty = open + inward - outward;
      warnings.push('Close Qty is blank; the quantity was derived from Open + Inward - Outward.');
    }
  }
  if (numbers.closeQty !== null) {
    const open = numbers.openQty || 0;
    const inward = numbers.inwardQty || 0;
    const outward = numbers.outwardQty || 0;
    const derived = open + inward - outward;
    const tolerance = Math.max(1, Math.abs(numbers.closeQty) * 0.005);
    if ((numbers.openQty !== null || numbers.inwardQty !== null || numbers.outwardQty !== null)
      && Math.abs(derived - numbers.closeQty) > tolerance) {
      warnings.push(`Open + Inward - Outward = ${padNumber(derived, 3)} but Close Qty is ${padNumber(numbers.closeQty, 3)}. Close Qty is imported as the on-hand balance.`);
    }
  }

  if (qty === null) {
    problems.push(issue('Close Qty', values.closeQty, 'A quantity is required (Close Qty, or Open Qty)', 'Enter the item\'s closing/opening quantity.'));
    qty = 0;
  } else if (qty < 0) {
    problems.push(issue('Close Qty', values.closeQty || qty, 'Quantity cannot be negative', 'Correct the stock quantities.'));
  }

  const uomText = cleanText(values.uom) || cleanText(resolved.uom?.shortName) || cleanText(resolved.uom?.name);
  const uom = resolved.uom;
  if (!cleanText(values.uom) && !uom) {
    problems.push(issue('UOM', '', 'UOM is required when the Item master has no unit', 'Enter the item unit (PC, MTR, ...).'));
  }

  if (batchType === 'unique' && qty > 1) {
    warnings.push(`Batch/Unique says Unique but the quantity is ${padNumber(qty, 3)}; the row is imported as a batch of ${padNumber(qty, 3)} unless you correct it.`);
  }

  if (numbers.discount !== null && numbers.discount < 0) {
    warnings.push('Discount is negative in the workbook. It is stored as uploaded; it is not treated as a surcharge.');
  }

  /* Existing barcode: the ERP keeps one row per barcode, so a second row with
     the same number is either an update or a duplicate. */
  let existingRow = null;
  if (existing && effectiveBarcode) {
    const sameLocation = (hit) => String(hit.locationId) === String(resolved.location?._id);
    const hits = existing.byBarcode.get(normalizeKey(effectiveBarcode)) || [];
    /* A barcode the operator typed is a business-wide identity: a copy at
       another location is a real conflict. The Item Code fallback is only the
       key this location holds its stock under, and this ERP legitimately keeps
       the same item code at several warehouses - so it matches at its own
       location only. */
    existingRow = barcodeGiven ? (hits.find(sameLocation) || hits[0] || null) : (hits.find(sameLocation) || null);
    /* The Item Code is only a barcode fallback when the operator did not give
       one. A provided, new barcode must not inherit another barcode of the
       same item. */
    if (!existingRow && !barcodeGiven) {
      const itemHits = existing.byItemCode.get(compactKey(itemCode)) || [];
      existingRow = itemHits.find(sameLocation) || null;
    }
  }

  /* A missing master blocks the row unless this is an update of a barcode
     that already carries the reference, or the master is creatable and
     approved. Location is never creatable from a stock summary. */
  const creatableForRow = (entry) => {
    if (!CREATABLE_MASTERS.has(entry.type)) return false;
    if (entry.type === MASTER_TYPES.ITEM) return Boolean(entry.name);
    if (entry.type === MASTER_TYPES.SUPPLIER) return Boolean(entry.name || cleanText(values.supplierName));
    return true;
  };

  const relevantMissing = missing.filter((entry) => {
    if (strategy === STRATEGIES.UPDATE && existingRow) {
      return entry.type === MASTER_TYPES.LOCATION;
    }
    return true;
  });

  const blockingMissing = [];
  const approvedMissing = [];
  relevantMissing.forEach((entry) => {
    const approved = strategy === STRATEGIES.CREATE && creatableForRow(entry) && isApproved(approvals, entry.type, entry.value);
    if (approved) {
      approvedMissing.push(entry);
      return;
    }
    blockingMissing.push({ ...entry, creatable: creatableForRow(entry) });
  });

  blockingMissing.forEach((entry) => {
    const label = entry.type === MASTER_TYPES.ITEM ? 'Item Code' : entry.type;
    problems.push(issue(label, entry.value, entry.message, entry.creatable && strategy === STRATEGIES.CREATE
      ? 'Tick this master for creation, or create it in the master screen and validate again.'
      : 'Create the master first, or correct the value.'));
  });

  if (!batchType) {
    const masterFlag = cleanText(resolved.item?.uniqueBarcode).toLowerCase();
    if (['yes', 'y', 'true', '1'].includes(masterFlag)) batchType = 'unique';
    else if (['no', 'n', 'false', '0'].includes(masterFlag)) batchType = 'batch';
    else batchType = qty > 1 ? 'batch' : 'unique';
  }

  let status = ROW_STATUS.READY;
  let action = 'create';

  if (problems.length) {
    status = ROW_STATUS.INVALID;
    action = 'blocked';
  } else if (blockingMissing.length) {
    status = ROW_STATUS.MISSING_MASTER;
    action = 'blocked';
  } else if (qty <= 0) {
    status = ROW_STATUS.ZERO_QTY;
    action = 'skip';
  } else if (existingRow) {
    if (strategy === STRATEGIES.UPDATE) {
      if (String(existingRow.locationId) !== String(resolved.location?._id)) {
        status = ROW_STATUS.OTHER_LOCATION;
        action = 'blocked';
        problems.push(issue('Barcode', effectiveBarcode,
          `This barcode already exists at another location (${existingRow.locationName || existingRow.locationId}). A barcode number cannot be created twice.`,
          'Update it at its own location, or use a different barcode.'));
      } else if (existingRow.status && existingRow.status !== 'IN_STOCK') {
        status = ROW_STATUS.INVALID;
        action = 'blocked';
        problems.push(issue('Barcode', effectiveBarcode,
          `This barcode is ${existingRow.status} and cannot be restated from an opening-stock summary.`,
          'Use the stock adjustment screen for a sold or void unit.'));
      } else {
        status = ROW_STATUS.READY;
        action = 'update';
      }
    } else {
      status = ROW_STATUS.EXISTING;
      action = 'skip';
      warnings.push(`Barcode ${effectiveBarcode} already exists at ${existingRow.locationName || 'this location'} with quantity ${padNumber(existingRow.qtyNum, 3)}. It is not created again.`);
    }
  } else if (strategy === STRATEGIES.UPDATE) {
    status = ROW_STATUS.NOT_EXISTING;
    action = 'skip';
    warnings.push(`Barcode ${effectiveBarcode} does not exist. This mode updates existing barcodes only.`);
  }

  if (status === ROW_STATUS.INVALID && blockingMissing.length) status = ROW_STATUS.MISSING_MASTER;
  if (status === ROW_STATUS.MISSING_MASTER && problems.some((p) => !blockingMissing.some((m) => p.message === m.message))) {
    status = ROW_STATUS.INVALID;
  }

  const openValue = numbers.openValue !== null
    ? numbers.openValue
    : (numbers.openQty !== null ? numbers.openQty * (numbers.purRate || 0) : null);
  const closeValue = numbers.closeValue !== null
    ? numbers.closeValue
    : (qty * (numbers.purRate || 0));

  return {
    row: line,
    status,
    action,
    barcode: effectiveBarcode,
    barcodeProvided: Boolean(barcodeGiven),
    itemCode,
    itemName,
    supplierCode: cleanText(values.supplierCode),
    supplierName: cleanText(values.supplierName),
    locationName: cleanText(values.locationName) || resolved.location?.name || '',
    locationId: resolved.location ? String(resolved.location._id) : '',
    qty,
    uom: uom ? (uom.shortName || uom.name) : uomText,
    batchType,
    stockAge: numbers.age === undefined ? null : numbers.age,
    stockDate: stockDate ? stockDate.iso : '',
    stockDateValue: stockDate ? stockDate.date : null,
    purchaseDate: purchaseDate ? purchaseDate.iso : '',
    openQty: numbers.openQty,
    openValue,
    inwardQty: numbers.inwardQty,
    inwardValue: numbers.inwardValue,
    outwardQty: numbers.outwardQty,
    outwardValue: numbers.outwardValue,
    closeQty: qty,
    closeValue,
    existingQty: existingRow ? Number(existingRow.qtyNum) || 0 : null,
    existingId: existingRow ? String(existingRow.id || existingRow._id) : '',
    resolved: {
      locationId: resolved.location ? String(resolved.location._id) : '',
      supplierId: resolved.supplier ? String(resolved.supplier._id) : '',
      itemId: resolved.item ? String(resolved.item._id) : '',
      groupId: resolved.group ? String(resolved.group._id) : '',
      subGroupId: resolved.subGroup ? String(resolved.subGroup._id) : '',
      uomId: resolved.uom ? String(resolved.uom._id) : '',
      hsnId: resolved.hsn ? String(resolved.hsn._id) : '',
      itemCode: cleanText(resolved.item?.itemCode) || itemCode,
      itemName: cleanText(resolved.item?.name) || itemName,
      uom: uom ? (uom.shortName || uom.name) : uomText,
      uomType: uomTypeOf(uom ? `${uom.name} ${uom.shortName}` : uomText),
      hsn: cleanText(resolved.hsn?.code) || cleanText(values.hsn),
    },
    values,
    problems,
    warnings,
    missing: blockingMissing,
    approvedMissing,
    asOfDate: asOfDate ? isoDate(asOfDate) : null,
  };
}

export function analyzeParsedWorkbook({
  parsed,
  lookup,
  existing = null,
  strategy = STRATEGIES.CREATE,
  approvals = {},
  asOfDate = null,
  locationAllowed = null,
}) {
  const analyzed = [];
  const duplicates = new Map();
  const missingIndex = new Map();
  const locationStats = new Map();
  const approvalSets = normalizeApprovals(approvals);

  const rows = parsed.rows.map(({ row, values }) => {
    const result = analyzeRow({ line: row, values, lookup, existing, strategy, approvals: approvalSets, asOfDate, locationAllowed });
    analyzed.push(result);
    return result;
  });

  /* Duplicate effective barcodes inside the workbook. A row that already has a
     data problem keeps that problem; the duplicate is an additional reason. */
  const seen = new Map();
  rows.forEach((row) => {
    /* A typed barcode is business-wide unique. The Item Code fallback is only
       the key a location holds its stock under, so the same code in two
       warehouses is two rows, not a duplicate. */
    const key = row.barcodeProvided
      ? normalizeKey(row.barcode)
      : `${compactKey(row.locationId || row.locationName)}|${normalizeKey(row.barcode)}`;
    if (!normalizeKey(row.barcode)) return;
    if (seen.has(key)) {
      const first = seen.get(key);
      row.status = ROW_STATUS.DUPLICATE;
      row.action = 'blocked';
      row.problems.push(issue('Barcode', row.barcode,
        `Duplicate barcode/item code in this workbook; it also appears on Excel row ${first.row}.`,
        'Keep one row per barcode, or give each unit a different barcode.'));
      duplicates.set(key, { value: row.barcode, rows: [first.row, row.row] });
    } else {
      seen.set(key, row);
    }
  });

  rows.forEach((row) => {
    const locationKey = normalizeKey(row.locationName) || '(blank)';
    if (!locationStats.has(locationKey)) {
      locationStats.set(locationKey, {
        name: row.locationName || '(blank)', rows: 0, qty: 0, value: 0,
        locationId: row.locationId, inBusiness: Boolean(row.locationId),
      });
    }
    const stat = locationStats.get(locationKey);
    stat.rows += 1;
    stat.qty += Number(row.qty) || 0;
    stat.value += Number(row.closeValue) || 0;
  });

  rows.forEach((row) => {
    [...row.missing, ...row.approvedMissing].forEach((entry) => {
      const key = missingKey(entry.type, entry.value);
      if (!missingIndex.has(key)) {
        missingIndex.set(key, {
          key,
          type: entry.type,
          slug: MASTER_SLUGS[entry.type],
          value: entry.value,
          name: entry.name || '',
          message: entry.message,
          creatable: CREATABLE_MASTERS.has(entry.type),
          count: 0,
          qty: 0,
          firstRow: row.row,
          lastRow: row.row,
        });
      }
      const item = missingIndex.get(key);
      item.count += 1;
      item.qty += Number(row.qty) || 0;
      item.lastRow = row.row;
    });
  });

  const count = (status) => rows.filter((row) => row.status === status).length;
  const readyRows = rows.filter((row) => row.action === 'create');
  const updateRows = rows.filter((row) => row.action === 'update');
  const importable = readyRows.length + updateRows.length;
  const ignored = parsed.ignored;

  const summary = {
    totalRows: parsed.totalRows,
    dataRows: parsed.rows.length,
    blankRows: ignored.blank,
    totalRowsIgnored: ignored.total,
    importable,
    ready: count(ROW_STATUS.READY),
    create: readyRows.length,
    update: updateRows.length,
    existing: count(ROW_STATUS.EXISTING),
    invalid: count(ROW_STATUS.INVALID),
    missingMaster: count(ROW_STATUS.MISSING_MASTER),
    duplicate: count(ROW_STATUS.DUPLICATE),
    zeroQty: count(ROW_STATUS.ZERO_QTY),
    otherLocation: count(ROW_STATUS.OTHER_LOCATION),
    notExisting: count(ROW_STATUS.NOT_EXISTING),
    newBarcodeRows: readyRows.length,
    existingBarcodeRows: count(ROW_STATUS.EXISTING),
    totalQty: Number(readyRows.concat(updateRows).reduce((n, row) => n + (Number(row.qty) || 0), 0).toFixed(3)),
    totalValue: Number(readyRows.concat(updateRows).reduce((n, row) => n + (Number(row.closeValue) || 0), 0).toFixed(2)),
    openValue: Number(readyRows.concat(updateRows).reduce((n, row) => n + (Number(row.openValue) || 0), 0).toFixed(2)),
  };

  const filters = {
    all: rows.length,
    ready: summary.ready,
    missing_master: summary.missingMaster,
    invalid: summary.invalid,
    duplicate: summary.duplicate,
    existing: summary.existing,
    zero_qty: summary.zeroQty,
    other_location: summary.otherLocation,
    not_existing: summary.notExisting,
  };

  const missingMasters = [...missingIndex.values()]
    .map((entry) => ({
      ...entry,
      approved: isApproved(approvalSets, entry.type, entry.value),
    }))
    .sort((a, b) => b.count - a.count || a.type.localeCompare(b.type));

  const warnings = [];
  rows.forEach((row) => {
    row.warnings.slice(0, 1).forEach((text) => {
      if (warnings.length < 100 && !warnings.some((w) => w.message === text)) {
        warnings.push({ row: row.row, message: text });
      }
    });
  });

  return {
    layout: parsed.layout,
    layoutLabel: parsed.layoutLabel,
    sheetName: parsed.sheetName,
    headerRow: parsed.headerRowIndex,
    fields: parsed.fields,
    summary,
    filters,
    rows: rows.map((row) => ({
      row: row.row,
      status: row.status,
      action: row.action,
      barcode: row.barcode,
      barcodeProvided: row.barcodeProvided,
      itemCode: row.itemCode,
      itemName: row.itemName,
      supplierCode: row.supplierCode,
      locationName: row.locationName,
      qty: row.qty,
      uom: row.uom,
      existingQty: row.existingQty,
      problems: row.problems,
      warnings: row.warnings.slice(0, 3),
    })),
    detail: rows,
    locations: [...locationStats.values()].sort((a, b) => b.rows - a.rows),
    missingMasters,
    duplicates: [...duplicates.values()],
    warnings,
    strategy,
  };
}

/* ------------------------------------------------------------- template -- */

function fieldStyleKey(field) {
  if (field.format === 'TEXT') return STYLE.TEXT;
  if (field.format === 'DATE') return STYLE.DATE;
  if (field.format === 'INTEGER') return STYLE.INTEGER;
  if (field.format === 'DECIMAL') return STYLE.DECIMAL;
  return STYLE.DEFAULT;
}

function instructionLine(text, style = STYLE.DEFAULT) {
  return [{ v: text, s: style }];
}

function instructionRows(fields) {
  const rows = [
    instructionLine('Item Wise Summary Import Template', STYLE.TITLE),
    instructionLine('Fill one row per item/barcode. Row 1 on the "Item Wise Summary" sheet is the header and must not be renamed, reordered, or have columns added.', STYLE.NOTE),
    [],
    instructionLine('Required columns', STYLE.HEADER),
    instructionLine('Location Name - an existing location in the selected business.'),
    instructionLine('Item Code - the Item master code. The item is matched; it is never guessed.'),
    instructionLine('UOM - the item unit (PC, MTR, ...). It is checked against the Item master.'),
    instructionLine('Close Qty - the on-hand quantity to import for this row.'),
    instructionLine('Barcode - optional. When blank the Item Code is used as the barcode key, which is what the existing opening-stock import does. Keep leading zeros as text.'),
    [],
    instructionLine('Stock columns', STYLE.HEADER),
    instructionLine('Open Qty, Inward Qty, Outward Qty and Close Qty are four views of the same stock position, not four quantities to add.'),
    instructionLine('Close Qty is imported as the opening balance. Open Qty, Inward Qty, Outward Qty and their values are kept on the barcode row as summary information.'),
    instructionLine('No purchase or sales transaction is created from this workbook. If you need the movement history, enter the GRCs/invoices in the ERP instead.'),
    [],
    instructionLine('Masters', STYLE.HEADER),
    instructionLine('Location Name, Group Name, Sub Group Name, Supplier Code/Name, Item Code, HSN and UOM are matched by the values the ERP already stores.'),
    instructionLine('If a master is missing the import shows it before writing. You can tick creatable masters (Group, Sub Group, Supplier, Item, HSN, UOM) for creation, or create them in their own master screens.'),
    instructionLine('Locations are never created from this workbook.'),
    [],
    instructionLine('Pricing', STYLE.HEADER),
    instructionLine('Purchase Rate, Discount, Final Net Rate, GST %, RSP, Discount %, RSP Offer Price, WSP and DP are stored on the barcode row exactly as uploaded.'),
    instructionLine('Discount is stored as the workbook lists it; it is not silently treated as a percentage when it is an amount. Check the preview.'),
    [],
    instructionLine('Example row (illustration only - do not import these values)', STYLE.HEADER),
    fields.map((field) => ({ v: field.label, s: STYLE.HEADER })),
  ];

  const example = {
    locationName: 'Main Store', groupName: 'Sarees', supplierCode: 'SUP001', supplierName: 'Sample Supplier',
    date: '19/10/2026', age: 5, purchaseDate: '01/10/2026', grcNo: '', supplierInvoiceNo: '',
    batchUnique: 'Unique', itemCode: 'EXAMPLE-ITM', printDescription: 'Sample Silk Saree',
    barcode: 'EXAMPLE0001', itemAttributes: '', hsn: '5007', purRate: 1250, discount: 0,
    finalNet: 1250, gst: 5, rsp: 1799, discountPercent: 10, offerPrice: 1619, wsp: 1450,
    dp: 1350, openQty: 10, uom: 'PC', openValue: 12500, inwardQty: 0, inwardValue: 0,
    outwardQty: 0, outwardValue: 0, closeQty: 10, closeValue: 12500,
  };
  rows.push(fields.map((field) => ({
    v: example[field.key] === undefined ? '' : example[field.key],
    s: field.format === 'TEXT' ? STYLE.TEXT : STYLE.DEFAULT,
  })));
  return rows;
}

export function buildTemplateWorkbook() {
  const fields = FIELDS_BY_LAYOUT[LAYOUTS.TEMPLATE];
  const header = fields.map((field) => ({
    v: field.label,
    s: field.required ? STYLE.HEADER_REQUIRED : STYLE.HEADER,
  }));
  const batchCol = XLSX.utils.encode_col(fields.findIndex((field) => field.key === 'batchUnique'));

  const dataSheet = {
    name: ITEM_WISE_SHEET,
    rows: [header],
    cols: fields.map((field) => ({ width: field.width || 16, style: fieldStyleKey(field) })),
    freeze: { row: 1 },
    autoFilter: `A1:${XLSX.utils.encode_col(fields.length - 1)}1`,
    validations: [
      {
        sqref: `${batchCol}2:${batchCol}5000`,
        formula1: '"Batch,Unique"',
        promptTitle: 'Batch/Unique',
        prompt: 'Batch: one barcode holds the whole quantity. Unique: one barcode per unit.',
        errorTitle: 'Unknown value',
        error: 'Choose Batch or Unique.',
        errorStyle: 'warning',
      },
    ],
  };

  const instructionSheet = {
    name: 'Instructions',
    rows: instructionRows(fields),
    cols: fields.map((field, index) => ({ width: index === 0 ? 34 : (field.width || 16) })),
  };

  return buildXlsx({
    title: 'Item Wise Summary Import Template',
    sheets: [dataSheet, instructionSheet],
  });
}

/* --------------------------------------------------------- error report -- */

export function buildErrorWorkbook({ rows = [], summary = {}, generatedAt = new Date() } = {}) {
  const header = ERROR_REPORT_COLUMNS.map((label) => ({ v: label, s: STYLE.HEADER }));
  const body = [];

  rows.forEach((row) => {
    if (row.problems?.length) {
      row.problems.forEach((problem) => {
        body.push([
          row.row,
          row.barcode,
          row.itemCode,
          row.supplierCode,
          problem.field,
          problem.value,
          problem.message,
          problem.suggestion,
          ROW_STATUS_LABELS_SAFE(row.status),
        ]);
      });
      return;
    }
    if (row.status !== ROW_STATUS.READY) {
      body.push([
        row.row,
        row.barcode,
        row.itemCode,
        row.supplierCode,
        '',
        '',
        row.warnings?.[0] || ROW_STATUS_LABELS_SAFE(row.status),
        row.status === ROW_STATUS.EXISTING ? 'This barcode already exists; nothing is created.' : '',
        ROW_STATUS_LABELS_SAFE(row.status),
      ]);
    }
  });

  const sheet = {
    name: 'Import Errors',
    rows: [
      [{ v: `Item Wise Summary import - row report (${generatedAt.toISOString().slice(0, 10)})`, s: STYLE.TITLE }],
      [{ v: `Rows: ${summary.totalRows ?? rows.length}, ready: ${summary.ready ?? ''}, invalid: ${summary.invalid ?? ''}, missing master: ${summary.missingMaster ?? ''}, duplicates: ${summary.duplicate ?? ''}, existing: ${summary.existing ?? ''}`, s: STYLE.NOTE }],
      header,
      ...body.map((cells) => cells.map((value, index) => ({
        v: value === null || value === undefined ? '' : value,
        s: index === 1 || index === 2 || index === 3 ? STYLE.TEXT : STYLE.DEFAULT,
      }))),
    ],
    cols: [
      { width: 12 }, { width: 22 }, { width: 18 }, { width: 16 }, { width: 20 },
      { width: 26 }, { width: 52 }, { width: 52 }, { width: 22 },
    ],
    freeze: { row: 3 },
    autoFilter: `A3:${XLSX.utils.encode_col(ERROR_REPORT_COLUMNS.length - 1)}3`,
  };

  return buildXlsx({ title: 'Item Wise Summary Import Errors', sheets: [sheet] });
}

const ROW_STATUS_LABELS_SAFE = (status) => ({
  ready: 'Ready',
  existing: 'Existing barcode',
  missing_master: 'Missing master',
  invalid: 'Invalid',
  duplicate: 'Duplicate',
  zero_qty: 'No stock (0 qty)',
  other_location: 'Exists at another location',
  not_existing: 'Barcode not found',
}[status] || status || '');

export default {
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
};
