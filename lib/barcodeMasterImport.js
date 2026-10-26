/* ==========================================================================
   BARCODE + MASTER DATA IMPORT - parsing, validation and workbooks.

   Pure: no database, no session, no browser globals. The API service loads
   the masters and existing barcodes, hands them to this module, and stores
   the result. Keeping the rules here means the preview, the conflict report
   and the actual write all judge a row the same way.
   ========================================================================== */

import * as XLSX from 'xlsx';
import { buildXlsx, STYLE } from './xlsxWriter.js';
import { barcodeSpellings, barcodeKey } from './barcodeValue.js';
import {
  IMPORT_SCOPES,
  IMPORT_STRATEGIES,
  STRATEGIES_BY_SCOPE,
  SHEET_NAMES,
  ROW_STATUS,
  ROW_STATUS_LABELS,
  MASTER_TYPES,
  MASTER_TYPE_ALIASES,
  MASTER_REQUIRED,
  BARCODE_FIELDS,
  BARCODE_FIELD_BY_KEY,
  MASTER_FIELDS,
  MASTER_FIELD_BY_KEY,
  IGNORED_SUMMARY_FIELDS,
  MAX_ROWS,
  FILTERS,
  ERROR_REPORT_COLUMNS,
} from './barcodeMasterImportConstants.js';

export class ImportAnalysisError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = 'ImportAnalysisError';
    this.code = code;
    this.status = details.status || 400;
    this.details = details;
  }
}

const MAX_TEXT = 500;
const MAX_BARCODE = 120;
const MAX_CODE = 100;
/* Contact Type is looked up as a dependency but is not itself something this
   import creates. Keeping it out of MASTER_TYPES keeps it off the template's
   Master Type dropdown. */
const CONTACT_TYPE_KEY = 'Contact Type';

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

function headerKey(value) {
  return cleanText(value)
    .toLowerCase()
    .replace(/[^a-z0-9%]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function compactKey(value) {
  return normalizeKey(value).replace(/[^a-z0-9]/g, '');
}

function isBlankValue(value) {
  const text = normalizeKey(value);
  return text === '' || text === '-' || text === '—' || text === 'na' || text === 'n/a';
}

function isoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function displayDate(value) {
  const parsed = normalizeDate(value);
  return parsed || '';
}

function normalizeDate(value) {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    if (Number.isNaN(value.getTime())) return null;
    return isoDate(value);
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    /* SheetJS day zero is 1899-12-30. Build the date in local time so the
       displayed day is the day Excel shows, not the previous UTC day. */
    const ms = Math.round((value - 25569) * 86400000);
    if (!Number.isFinite(ms)) return null;
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return isoDate(new Date(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  const text = cleanText(value);
  if (!text) return null;

  let m = text.match(/^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T].*)?$/);
  if (m) {
    const y = Number(m[1]);
    const mo = Number(m[2]);
    const d = Number(m[3]);
    const date = new Date(y, mo - 1, d);
    return date.getFullYear() === y && date.getMonth() === mo - 1 && date.getDate() === d ? isoDate(date) : null;
  }

  m = text.match(/^(\d{1,2})[-/.](\d{1,2})[-/.](\d{2,4})(?:[ T].*)?$/);
  if (m) {
    let a = Number(m[1]);
    let b = Number(m[2]);
    let y = Number(m[3]);
    if (y < 100) y += y >= 70 ? 1900 : 2000;
    /* Indian workbooks are day first. Only swap when that is the sole way
       the value can be a date (e.g. 10/21/2026). */
    let day = a;
    let month = b;
    if (month > 12 && day <= 12) { day = b; month = a; }
    const date = new Date(y, month - 1, day);
    return date.getFullYear() === y && date.getMonth() === month - 1 && date.getDate() === day ? isoDate(date) : null;
  }

  /* A real date parser for values like "21 Oct 2026" and "Oct 21, 2026". */
  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) return isoDate(parsed);
  return null;
}

export function parseDateValue(value) {
  if (isBlankValue(value)) return { value: null };
  const parsed = normalizeDate(value);
  return parsed
    ? { value: parsed }
    : { value: null, error: 'Enter a valid date, for example 21/10/2026.' };
}

export function parseNumberValue(value) {
  if (value === null || value === undefined) return { value: null };
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value } : { value: null, error: 'Enter a number.' };
  }
  let text = cleanText(value);
  if (isBlankValue(text)) return { value: null };
  let negative = false;
  if (/^\(.*\)$/.test(text)) { negative = true; text = text.slice(1, -1); }
  text = text.replace(/[₹$€£,\s]/g, '').replace(/%$/, '');
  if (!/^[-+]?(?:\d+\.?\d*|\.\d+)(?:e[-+]?\d+)?$/i.test(text)) {
    return { value: null, error: 'Enter a number without letters or units.' };
  }
  let number = Number(text);
  if (negative) number = -number;
  if (!Number.isFinite(number)) return { value: null, error: 'Enter a number.' };
  return { value: number };
}

export function parseIntValue(value) {
  const parsed = parseNumberValue(value);
  if (parsed.error) return parsed;
  if (parsed.value === null) return { value: null };
  if (!Number.isInteger(parsed.value)) return { value: null, error: 'Enter a whole number.' };
  return parsed;
}

/* ------------------------------------------------ workbook cell reading --- */

function readCell(sheet, row, col) {
  const address = XLSX.utils.encode_cell({ r: row, c: col });
  const cell = sheet[address];
  if (!cell) return { type: 'blank', text: '', raw: '' };
  if (cell.t === 'e') {
    return { type: 'error', text: '', raw: '', error: String(cell.w || cell.v || 'Excel cell error') };
  }
  const raw = cell.v;
  if (cell.t === 'd' || raw instanceof Date) {
    return { type: 'date', raw, text: normalizeDate(raw) || '', formatted: cell.w || '' };
  }
  if (cell.t === 'n') {
    const formatted = cleanText(cell.w);
    const text = formatted && /^0\d+$/.test(formatted) ? formatted : String(raw);
    return { type: 'number', raw, text, formatted };
  }
  if (cell.t === 'b') return { type: 'boolean', raw, text: raw ? 'true' : 'false' };
  return { type: 'text', raw, text: cleanText(raw) };
}

function coerceCell(field, cell) {
  if (cell.type === 'error') {
    return { value: null, error: `The cell contains an Excel error (${cell.error}).` };
  }
  if (field.type === 'date') return parseDateValue(cell.type === 'date' ? cell.raw : cell.raw);
  if (field.type === 'integer') return parseIntValue(cell.raw);
  if (field.type === 'decimal') return parseNumberValue(cell.raw);
  const value = cell.type === 'date' ? (normalizeDate(cell.raw) || '') : cell.text;
  return { value };
}

/* ------------------------------------------------------------- headers --- */

const BARCODE_HEADER_LOOKUP = (() => {
  const map = new Map();
  BARCODE_FIELDS.forEach((field) => {
    const names = [field.label, ...(field.aliases || [])];
    names.forEach((name) => {
      const key = headerKey(name);
      if (key && !map.has(key)) map.set(key, field);
    });
  });
  return map;
})();

const MASTER_HEADER_LOOKUP = (() => {
  const map = new Map();
  MASTER_FIELDS.forEach((field) => {
    const names = [field.label, ...(field.aliases || [])];
    names.forEach((name) => {
      const key = headerKey(name);
      if (key && !map.has(key)) map.set(key, field);
    });
  });
  return map;
})();

function sheetRange(sheet) {
  if (!sheet || !sheet['!ref']) return null;
  return XLSX.utils.decode_range(sheet['!ref']);
}

function detectHeaderRow(sheet, lookup, range, requiredKeys) {
  if (!range) return null;
  const lastRow = Math.min(range.e.r, range.s.r + 24);
  let best = null;
  for (let r = range.s.r; r <= lastRow; r += 1) {
    const mapping = new Map();
    const headers = [];
    const seen = new Set();
    for (let c = range.s.c; c <= range.e.c; c += 1) {
      const header = cleanText(readCell(sheet, r, c).text);
      headers.push(header);
      if (!header) continue;
      const field = lookup.get(headerKey(header));
      if (!field || seen.has(field.key)) continue;
      seen.add(field.key);
      mapping.set(c, field);
    }
    const score = mapping.size;
    const hasRequired = requiredKeys.every((key) => seen.has(key));
    const candidate = { rowIndex: r, headers, mapping, score, hasRequired };
    if (!best
      || (candidate.hasRequired && !best.hasRequired)
      || (candidate.hasRequired === best.hasRequired && candidate.score > best.score)) {
      best = candidate;
    }
  }
  return best && best.score >= 2 ? best : null;
}

function findSheetByName(workbook, wanted) {
  const exact = workbook.SheetNames.find((name) => normalizeKey(name) === normalizeKey(wanted));
  if (exact) return exact;
  return workbook.SheetNames.find((name) => normalizeKey(name).includes(normalizeKey(wanted))) || null;
}

/* Required headers differ by operation. A stock update only needs the
   barcode and the new quantity; it never needs an item code. */
function requiredBarcodeKeys(scope) {
  if (scope === IMPORT_SCOPES.BARCODE_STOCK) return ['barcodeNo', 'openingQty'];
  return ['barcodeNo', 'itemCode', 'openingQty'];
}

function parseSheetRows(sheet, range, header, scope) {
  const rows = [];
  let blankRows = 0;
  let exampleRows = 0;
  let ignoredRows = 0;

  for (let r = header.rowIndex + 1; r <= range.e.r; r += 1) {
    const cells = new Map();
    const values = {};
    const parseErrors = [];
    let hasAny = false;

    for (const [col, field] of header.mapping) {
      const cell = readCell(sheet, r, col);
      if (cell.text !== '' || cell.type === 'date' || cell.type === 'number') hasAny = true;
      if (cell.type === 'blank') continue;
      if (IGNORED_SUMMARY_FIELDS.includes(field.key)) continue;
      const parsed = coerceCell(field, cell);
      if (parsed.error) {
        parseErrors.push({ field: field.key, label: field.label, value: cell.text, message: parsed.error });
        continue;
      }
      const value = parsed.value;
      if (value === null || value === undefined || value === '') continue;
      values[field.key] = field.key === 'batchUnique' ? normalizeBatchUnique(value) : value;
    }

    if (!hasAny || Object.keys(values).length === 0) { blankRows += 1; continue; }

    const firstText = cleanText(Object.values(values)[0]);
    const barcode = cleanText(values.barcodeNo);
    const itemCode = cleanText(values.itemCode);
    const isExample = /^example/i.test(barcode) || /^example/i.test(itemCode) || /^e\.g\./i.test(firstText);
    const isNote = !barcode && !itemCode && !values.openingQty
      && /^(note|instruction|sample|example)\b/i.test(firstText);
    if (isNote) { ignoredRows += 1; continue; }
    if (isExample) exampleRows += 1;

    rows.push({
      id: `b${r + 1}`,
      sheet: sheet.__name || SHEET_NAMES.BARCODE,
      rowNumber: r + 1,
      values,
      parseErrors,
      example: isExample,
    });
  }

  return { rows, blankRows, exampleRows, ignoredRows };
}

function normalizeBatchUnique(value) {
  const text = normalizeKey(value);
  if (['unique', 'individual', 'single', 'u', 'yes', 'y'].includes(text)) return 'unique';
  if (['batch', 'lot', 'b', 'no', 'n'].includes(text)) return 'batch';
  return cleanText(value);
}

/* ----------------------------------------------------------- validations --- */

function fieldLabel(key) {
  return BARCODE_FIELD_BY_KEY[key]?.label || key;
}

function addError(errors, field, value, message, suggestion) {
  errors.push({
    field,
    label: fieldLabel(field),
    value: value === null || value === undefined ? '' : String(value),
    message,
    suggestion: suggestion || '',
  });
}

function validateBarcodeRow(row, scope) {
  const values = row.values;
  const errors = [];
  const warnings = [];
  row.parseErrors.forEach((error) => {
    errors.push({
      field: error.field,
      label: error.label,
      value: error.value || '',
      message: error.message,
      suggestion: 'Correct the cell value.',
    });
  });

  const required = requiredBarcodeKeys(scope);
  required.forEach((key) => {
    if (isBlankValue(values[key])) {
      addError(errors, key, '', `${fieldLabel(key)} is required.`, `Enter ${fieldLabel(key)}.`);
    }
  });

  const barcode = cleanText(values.barcodeNo);
  if (barcode) {
    if (barcode.length > MAX_BARCODE) {
      addError(errors, 'barcodeNo', barcode, `Barcode Number is longer than ${MAX_BARCODE} characters.`, 'Use the barcode exactly as printed.');
    }
    if (/[\r\n]/.test(String(values.barcodeNo))) {
      addError(errors, 'barcodeNo', barcode, 'Barcode Number cannot contain a line break.', 'Put each barcode on its own row.');
    }
  }

  const itemCode = cleanText(values.itemCode);
  if (itemCode.length > MAX_CODE) {
    addError(errors, 'itemCode', itemCode, `Item Code is longer than ${MAX_CODE} characters.`, 'Use the item code from the Item master.');
  }

  const openingQty = values.openingQty;
  if (openingQty !== null && openingQty !== undefined) {
    if (openingQty < 0) {
      addError(errors, 'openingQty', openingQty, 'Opening Quantity cannot be negative.', 'Enter zero or a positive quantity.');
    } else if (scope !== IMPORT_SCOPES.BARCODE_STOCK && openingQty <= 0) {
      addError(errors, 'openingQty', openingQty, 'A new barcode needs a quantity greater than zero.', 'Enter the opening quantity for this barcode.');
    }
  }

  ['purRate', 'disc', 'finalNet', 'retailPrice', 'disc2', 'offerPrice', 'wspPrice', 'dpPrice'].forEach((key) => {
    const value = values[key];
    if (value !== null && value !== undefined && value < 0) {
      addError(errors, key, value, `${fieldLabel(key)} cannot be negative.`, 'Enter zero or a positive amount.');
    }
  });

  ['gst', 'disc', 'disc2'].forEach((key) => {
    const value = values[key];
    if (value !== null && value !== undefined && (value < 0 || value > 100)) {
      addError(errors, key, value, `${fieldLabel(key)} must be between 0 and 100.`, 'Enter a percentage between 0 and 100.');
    }
  });

  if (values.age !== null && values.age !== undefined && values.age < 0) {
    addError(errors, 'age', values.age, 'Age cannot be negative.', 'Enter the age in days, or leave it blank.');
  }

  if (barcode && !isBlankValue(values.oldBarcode) && normalizeKey(barcode) === normalizeKey(values.oldBarcode)) {
    warnings.push({ field: 'oldBarcode', label: fieldLabel('oldBarcode'), message: 'Old Barcode is the same as Barcode Number.' });
  }

  if (!isBlankValue(values.batchUnique) && !['batch', 'unique'].includes(normalizeKey(values.batchUnique))) {
    warnings.push({
      field: 'batchUnique',
      label: fieldLabel('batchUnique'),
      message: 'Batch/Unique is not "Batch" or "Unique"; the item master setting will be used.',
    });
  }

  const textFields = ['itemName', 'printDescription', 'itemAttributes', 'supplierName', 'agentName', 'locationName', 'businessName', 'groupName', 'subGroupName', 'uomName'];
  textFields.forEach((key) => {
    const value = cleanText(values[key]);
    if (value.length > MAX_TEXT) {
      addError(errors, key, value, `${fieldLabel(key)} is longer than ${MAX_TEXT} characters.`, 'Shorten the value.');
    }
  });

  row.errors = errors;
  row.warnings = warnings;
}

function validateMasterRow(row) {
  const values = row.values;
  const errors = [];
  const warnings = [];
  row.parseErrors.forEach((error) => {
    errors.push({
      field: error.field,
      label: error.label,
      value: error.value || '',
      message: error.message,
      suggestion: 'Correct the cell value.',
    });
  });

  const typeText = cleanText(values.masterType);
  const type = MASTER_TYPE_ALIASES[normalizeKey(typeText).replace(/\s+/g, '')] || null;
  row.masterType = type;

  if (!typeText) {
    addError(errors, 'masterType', '', 'Master Type is required.', 'Enter Supplier, Item, HSN, Group, Sub Group, UOM, Location or Agent.');
  } else if (!type) {
    addError(errors, 'masterType', typeText, `Master Type "${typeText}" is not recognised.`, 'Use Supplier, Item, HSN, Group, Sub Group, UOM, Location or Agent.');
  }

  if (type) {
    (MASTER_REQUIRED[type] || []).forEach((key) => {
      if (key === 'contactType' && (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT)) {
        if (isBlankValue(values.contactType)) {
          addError(errors, 'contactType', '', `Contact Type is required to create a ${type}.`, 'Enter the Contact Type name, for example Supplier or Agent.');
        }
        return;
      }
      if (isBlankValue(values[key])) {
        addError(errors, key, '', `${MASTER_FIELD_BY_KEY[key]?.label || key} is required for ${type}.`, `Enter ${MASTER_FIELD_BY_KEY[key]?.label || key}.`);
      }
    });
  }

  ['gst'].forEach((key) => {
    if (values[key] !== null && values[key] !== undefined && (values[key] < 0 || values[key] > 100)) {
      addError(errors, key, values[key], 'GST Percentage must be between 0 and 100.', 'Enter a percentage between 0 and 100.');
    }
  });

  if (!isBlankValue(values.email) && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(cleanText(values.email))) {
    addError(errors, 'email', values.email, 'Email is not a valid address.', 'Use a name@example.com address.');
  }
  if (!isBlankValue(values.mobile)) {
    const digits = cleanText(values.mobile).replace(/\D/g, '');
    if (digits.length < 7 || digits.length > 15) {
      addError(errors, 'mobile', values.mobile, 'Mobile must contain 7 to 15 digits.', 'Enter the phone number with its country/STD code.');
    }
  }
  if (!isBlankValue(values.gstNo) && !/^[0-9A-Z]{15}$/i.test(cleanText(values.gstNo))) {
    warnings.push({ field: 'gstNo', label: 'GST No', message: 'GST No is not the usual 15-character GSTIN; it will be saved as entered.' });
  }
  if (!isBlankValue(values.status) && !['active', 'inactive'].includes(normalizeKey(values.status))) {
    addError(errors, 'status', values.status, 'Status must be Active or Inactive.', 'Enter Active or Inactive.');
  }
  if (type === MASTER_TYPES.HSN && !isBlankValue(values.code) && !/^[0-9A-Za-z-]{2,20}$/.test(cleanText(values.code))) {
    warnings.push({ field: 'code', label: 'Code', message: 'HSN codes are usually 2 to 8 digits.' });
  }

  row.errors = errors;
  row.warnings = warnings;
}

/* ----------------------------------------------------------- master index --- */

function emptyLists() {
  return {
    [MASTER_TYPES.SUPPLIER]: [],
    [MASTER_TYPES.AGENT]: [],
    [MASTER_TYPES.ITEM]: [],
    [MASTER_TYPES.HSN]: [],
    [MASTER_TYPES.GROUP]: [],
    [MASTER_TYPES.SUB_GROUP]: [],
    [MASTER_TYPES.UOM]: [],
    [MASTER_TYPES.LOCATION]: [],
    [CONTACT_TYPE_KEY]: [],
  };
}

function pushKey(map, key, entry) {
  const normalized = normalizeKey(key);
  if (!normalized) return;
  if (!map.has(normalized)) map.set(normalized, []);
  map.get(normalized).push(entry);
}

function addMaster(list, byKey, type, entry, keys) {
  const row = { ...entry, type };
  list[type].push(row);
  keys.filter(Boolean).forEach((key) => pushKey(byKey[type], key, row));
}

/* Build the lookup the analysis uses from plain values. The service reads
   the actual documents; tests can pass literals. */
export function buildMasterIndex(data = {}) {
  const lists = emptyLists();
  const byKey = Object.fromEntries([...Object.values(MASTER_TYPES), CONTACT_TYPE_KEY].map((type) => [type, new Map()]));

  (data.suppliers || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.SUPPLIER, {
    id: String(row.id ?? row._id ?? ''),
    code: cleanText(row.contactId ?? row.code),
    name: cleanText(row.businessName ?? row.name),
    contactTypeId: String(row.typeId ?? row.contactTypeId ?? ''),
  }, [row.contactId, row.code, row.businessName, row.name]));

  (data.agents || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.AGENT, {
    id: String(row.id ?? row._id ?? ''),
    code: cleanText(row.contactId ?? row.code),
    name: cleanText(row.businessName ?? row.name),
    contactTypeId: String(row.typeId ?? row.contactTypeId ?? ''),
  }, [row.contactId, row.code, row.businessName, row.name]));

  (data.items || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.ITEM, {
    id: String(row.id ?? row._id ?? ''),
    code: cleanText(row.itemCode ?? row.code),
    name: cleanText(row.name),
    subGroupId: String(row.subGroupId ?? ''),
    uomId: String(row.uomId ?? ''),
    hsnId: String(row.hsnId ?? ''),
    uniqueBarcode: cleanText(row.uniqueBarcode),
    itemType: cleanText(row.itemType),
  }, [row.itemCode, row.code, row.name]));

  (data.hsn || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.HSN, {
    id: String(row.id ?? row._id ?? ''),
    code: cleanText(row.code),
    status: cleanText(row.status),
  }, [row.code]));

  (data.groups || []).forEach((row) => {
    const parentId = String(row.parentId ?? '');
    addMaster(lists, byKey, parentId ? MASTER_TYPES.SUB_GROUP : MASTER_TYPES.GROUP, {
      id: String(row.id ?? row._id ?? ''),
      name: cleanText(row.name),
      parentId,
      prefix: cleanText(row.prefix),
    }, [row.name]);
  });

  (data.uoms || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.UOM, {
    id: String(row.id ?? row._id ?? ''),
    code: cleanText(row.shortName ?? row.code),
    name: cleanText(row.name),
  }, [row.shortName, row.code, row.name]));

  (data.locations || []).forEach((row) => addMaster(lists, byKey, MASTER_TYPES.LOCATION, {
    id: String(row.id ?? row._id ?? ''),
    name: cleanText(row.name),
    city: cleanText(row.city),
    zipCode: cleanText(row.zipCode),
    businessId: String(row.businessId ?? ''),
  }, [row.name]));

  (data.contactTypes || []).forEach((row) => addMaster(lists, byKey, CONTACT_TYPE_KEY, {
    id: String(row.id ?? row._id ?? ''),
    name: cleanText(row.name),
    contactType: cleanText(row.contactType),
    prefix: cleanText(row.prefix),
  }, [row.name, row.contactType]));

  return {
    business: data.business || null,
    defaultContactTypes: data.defaultContactTypes || {},
    lists,
    byKey,
  };
}

export function lookupMaster(index, type, value, { parentId = null, parentName = '' } = {}) {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  const map = index?.byKey?.[type];
  if (!map) return null;
  const list = map.get(normalized);
  if (!list || !list.length) return null;
  let matches = list;
  if (type === MASTER_TYPES.SUB_GROUP && parentId) {
    const underParent = matches.filter((row) => String(row.parentId) === String(parentId));
    if (underParent.length) matches = underParent;
  }
  const unique = [...new Map(matches.map((row) => [row.id, row])).values()];
  return unique[0] || null;
}

/* Every master the workbook value could mean. `lookupMaster` keeps its old
   first-match behaviour for write paths that only need one record; the
   analysis uses this function so a duplicate name/code is reported as
   ambiguous instead of silently picking the first row. */
export function lookupMasterCandidates(index, type, value, { parentId = null, parentName = '' } = {}) {
  const normalized = normalizeKey(value);
  if (!normalized) return [];
  const map = index?.byKey?.[type];
  if (!map) return [];
  let matches = map.get(normalized) || [];
  if (!matches.length) return [];
  if (type === MASTER_TYPES.SUB_GROUP) {
    if (parentId) {
      matches = matches.filter((row) => String(row.parentId) === String(parentId));
    } else if (cleanText(parentName)) {
      const parent = lookupMaster(index, MASTER_TYPES.GROUP, parentName);
      /* A Sub Group only means one thing under the group named in the row.
         If that group does not exist, no Sub Group can be selected safely. */
      if (!parent) return [];
      matches = matches.filter((row) => String(row.parentId) === String(parent.id));
    }
  }
  return [...new Map(matches.map((row) => [String(row.id), row])).values()];
}

/* A mapping answers "when the workbook says X, use this master". Aliases are
   the values the workbook may carry for the same master: a supplier code and
   its name, a UOM short name and its full name, and so on. */
export function masterReferenceAliases(type, fields = {}) {
  const aliases = [];
  const push = (field, value) => {
    const text = cleanText(value);
    if (text) aliases.push({ field, value: text });
  };

  if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) {
    push('code', fields.code || (type === MASTER_TYPES.SUPPLIER ? fields.supplierCode : fields.agentCode));
    push('name', fields.name || (type === MASTER_TYPES.SUPPLIER ? fields.supplierName : fields.agentName));
    push('shortName', fields.shortName);
  } else if (type === MASTER_TYPES.ITEM) {
    push('code', fields.code || fields.itemCode);
    push('name', fields.name || fields.itemName);
  } else if (type === MASTER_TYPES.HSN) {
    push('code', fields.code || fields.hsn);
  } else if (type === MASTER_TYPES.GROUP) {
    push('name', fields.name || fields.groupName);
  } else if (type === MASTER_TYPES.SUB_GROUP) {
    push('name', fields.name || fields.subGroupName);
  } else if (type === MASTER_TYPES.UOM) {
    push('code', fields.code || fields.uomName);
    push('name', fields.name || fields.uomName);
    push('shortName', fields.shortName);
  } else if (type === MASTER_TYPES.LOCATION) {
    push('name', fields.name || fields.locationName);
  }
  return aliases;
}

/* The identity used by the Missing Masters list. It deliberately follows the
   same key the creation planner uses, so a mapping replaces the exact missing
   entry the operator saw. */
export function masterReferenceKey(type, fields = {}) {
  return planKey(type, fields);
}

export function masterMappingAliasKey(type, value, parentName = '') {
  const normalized = compactKey(value);
  if (!normalized) return '';
  const parent = type === MASTER_TYPES.SUB_GROUP ? compactKey(parentName) : '';
  return `${type}|${parent}|${normalized}`;
}

export function buildMasterMappingLookup(masterMappings = []) {
  const lookup = new Map();
  (Array.isArray(masterMappings) ? masterMappings : []).forEach((mapping) => {
    if (!mapping?.type || !mapping?.masterId) return;
    if (!Object.values(MASTER_TYPES).includes(mapping.type)) return;
    const parentName = mapping.type === MASTER_TYPES.SUB_GROUP
      ? cleanText(mapping.parent ?? mapping.fields?.parent)
      : '';
    const aliases = Array.isArray(mapping.aliases) && mapping.aliases.length
      ? mapping.aliases
      : masterReferenceAliases(mapping.type, mapping.fields || { name: mapping.value, code: mapping.value });

    aliases.forEach((alias) => {
      const value = typeof alias === 'string' ? alias : alias?.value;
      if (!cleanText(value)) return;
      const key = masterMappingAliasKey(mapping.type, value, parentName);
      if (!key) return;
      if (!lookup.has(key)) lookup.set(key, []);
      const list = lookup.get(key);
      if (!list.some((row) => String(row.masterId) === String(mapping.masterId))) {
        list.push({ ...mapping, parent: parentName });
      }
    });
  });
  return lookup;
}

function candidateSummary(row) {
  return {
    id: String(row.id || ''),
    code: cleanText(row.code),
    name: cleanText(row.name),
    label: [cleanText(row.code), cleanText(row.name)].filter(Boolean).join(' · ') || cleanText(row.name || row.code),
    city: cleanText(row.city),
    zipCode: cleanText(row.zipCode),
    parentId: String(row.parentId || ''),
    contactTypeId: String(row.contactTypeId || ''),
  };
}

function mappedConflictCandidates(index, type, mappings) {
  return mappings
    .map((mapping) => (index?.lists?.[type] || []).find((row) => String(row.id) === String(mapping.masterId)))
    .filter(Boolean);
}

function resolveMappedReference(index, mappingLookup, type, fields, parentName = '') {
  if (!mappingLookup?.size) return { attempted: false };
  const hits = [];
  masterReferenceAliases(type, fields).forEach((alias) => {
    const key = masterMappingAliasKey(type, alias.value, parentName);
    (mappingLookup.get(key) || []).forEach((mapping) => {
      if (!hits.some((row) => String(row.masterId) === String(mapping.masterId))) hits.push(mapping);
    });
  });
  if (!hits.length) return { attempted: false };
  const ids = [...new Set(hits.map((row) => String(row.masterId)))];
  if (ids.length > 1) return { attempted: true, conflict: hits };
  const master = (index?.lists?.[type] || []).find((row) => String(row.id) === ids[0]) || null;
  if (!master) return { attempted: true, stale: hits[0], masterId: ids[0] };
  return { attempted: true, master, mapping: hits[0] };
}

export function masterKeyFor(type, values) {
  const value = (() => {
    if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) return values.name || values.code;
    if (type === MASTER_TYPES.ITEM) return values.code || values.name;
    if (type === MASTER_TYPES.SUB_GROUP) return `${normalizeKey(values.parent)}|${normalizeKey(values.name)}`;
    return values.code || values.name;
  })();
  return `${type}|${compactKey(value)}`;
}

/* ------------------------------------------------------- existing barcodes --- */

export function buildExistingBarcodeIndex(rows = []) {
  const map = new Map();
  const add = (key, row) => {
    const normalized = barcodeKey(key);
    if (!normalized) return;
    if (!map.has(normalized)) map.set(normalized, row);
  };
  rows.forEach((row) => {
    const record = {
      id: String(row.id ?? row._id ?? ''),
      barcodeNo: cleanText(row.barcodeNo),
      barcodeGenerated: cleanText(row.barcodeGenerated),
      oldBarcode: cleanText(row.oldBarcode),
      itemCode: cleanText(row.itemCode),
      itemId: String(row.itemId ?? ''),
      qtyNum: Number(row.qtyNum ?? row.qty ?? 0) || 0,
      status: cleanText(row.status),
      currentLocationId: String(row.currentLocationId ?? row.locationId ?? ''),
      currentLocationName: cleanText(row.currentLocationName),
    };
    barcodeSpellings(record.barcodeNo).forEach((key) => add(key, record));
    barcodeSpellings(record.barcodeGenerated).forEach((key) => add(key, record));
    barcodeSpellings(record.oldBarcode).forEach((key) => add(key, record));
  });
  return map;
}

function findExistingBarcode(index, barcode) {
  if (!index || !barcode) return null;
  for (const spelling of barcodeSpellings(barcode)) {
    const found = index.get(barcodeKey(spelling));
    if (found) return found;
  }
  return null;
}

/* ------------------------------------------------------------- the plan --- */

function planKey(type, fields = {}) {
  let value = '';
  if (type === MASTER_TYPES.SUB_GROUP) value = `${normalizeKey(fields.parent)}|${normalizeKey(fields.name)}`;
  else if (type === MASTER_TYPES.ITEM) value = fields.code || fields.name;
  else if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) value = fields.name || fields.code;
  else value = fields.code || fields.name;
  return `${type}|${compactKey(value)}`;
}

function planLabel(type, fields) {
  if (type === MASTER_TYPES.SUB_GROUP) return [fields.name, fields.parent ? `under ${fields.parent}` : ''].filter(Boolean).join(' ');
  return cleanText(fields.name || fields.code);
}

function fieldConflict(a, b) {
  return normalizeKey(a) !== normalizeKey(b);
}

function mergePlanEntry(entries, type, fields, meta = {}) {
  const key = planKey(type, fields);
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      key,
      type,
      fields: {},
      sources: [],
      rowNumbers: [],
      masterRowNumbers: [],
      warnings: [],
      conflicts: [],
      explicit: false,
      masterErrors: [],
    };
    entries.set(key, entry);
  }
  entry.explicit = entry.explicit || Boolean(meta.explicit);
  if (meta.masterRowNumber) entry.masterRowNumbers.push(meta.masterRowNumber);
  if (meta.rowNumber) entry.rowNumbers.push(meta.rowNumber);
  if (meta.source && !entry.sources.includes(meta.source)) entry.sources.push(meta.source);
  if (meta.errors?.length) entry.masterErrors.push(...meta.errors);

  Object.entries(fields).forEach(([field, value]) => {
    if (value === null || value === undefined || value === '') return;
    const existing = entry.fields[field];
    if (existing === undefined || existing === '') entry.fields[field] = value;
    else if (fieldConflict(existing, value)) {
      const message = `Conflicting ${field} values: "${existing}" and "${value}".`;
      if (!entry.conflicts.includes(message)) entry.conflicts.push(message);
    }
  });
  return entry;
}

function collectMissing({
  row, masterIndex, entries, defaultLocation, mappingLookup, appliedMappings,
}) {
  const values = row.values;
  const missing = [];

  const add = (type, value, field, extra = {}) => {
    missing.push({
      type,
      value: cleanText(value),
      field,
      label: extra.label || type,
      parent: cleanText(extra.parent || ''),
      resolution: 'missing',
      planKey: '',
      reason: '',
    });
  };

  const addAmbiguous = (type, value, field, candidates, fields = {}, extra = {}) => {
    const unique = [...new Map((candidates || []).map((candidate) => [String(candidate.id), candidate])).values()];
    missing.push({
      type,
      value: cleanText(value),
      field,
      label: extra.label || type,
      parent: cleanText(extra.parent ?? fields.parent),
      resolution: 'ambiguous',
      planKey: '',
      referenceKey: masterReferenceKey(type, fields),
      reason: extra.reason || `Multiple ${type} records match "${cleanText(value) || '(blank)'}". Choose the correct record before importing.`,
      candidates: unique.map(candidateSummary),
      fields: { ...fields },
    });
  };

  const addMappingError = (type, value, field, fields, reason) => {
    missing.push({
      type,
      value: cleanText(value),
      field,
      label: type,
      parent: cleanText(fields.parent),
      resolution: 'mapping_error',
      planKey: '',
      referenceKey: masterReferenceKey(type, fields),
      reason,
      candidates: [],
      fields: { ...fields },
    });
  };

  const recordMapping = (mapping, type, master) => {
    if (!appliedMappings) return;
    const key = mapping.key || `${type}|${mapping.masterId}`;
    let applied = appliedMappings.get(key);
    if (!applied) {
      applied = {
        key,
        type,
        value: cleanText(mapping.value || master.name || master.code),
        field: cleanText(mapping.field),
        parent: cleanText(mapping.parent),
        masterId: String(mapping.masterId),
        masterCode: cleanText(master.code),
        masterName: cleanText(master.name),
        fields: mapping.fields || {},
        rows: [],
        status: 'verified',
      };
      appliedMappings.set(key, applied);
    }
    if (!applied.rows.includes(row.rowNumber)) applied.rows.push(row.rowNumber);
    if (!row.resolvedMappings) row.resolvedMappings = [];
    if (!row.resolvedMappings.some((entry) => entry.type === type && String(entry.masterId) === String(mapping.masterId))) {
      row.resolvedMappings.push({ type, masterId: String(mapping.masterId), value: cleanText(mapping.value) });
    }
  };

  /* Returns 'mapped' when an explicit mapping resolved, 'handled' when the
     mapping was stale or pointed at more than one record, and '' when there
     was no mapping and normal candidate matching should run. */
  const mappingOutcome = (resolved, type, value, field, fields, extra = {}) => {
    if (!resolved.attempted) return '';
    if (resolved.conflict) {
      addAmbiguous(type, value, field, mappedConflictCandidates(masterIndex, type, resolved.conflict), fields, {
        ...extra,
        reason: `This value is mapped to more than one ${type} master. Choose the record that should be used.`,
      });
      return 'handled';
    }
    if (resolved.stale) {
      addMappingError(
        type,
        value,
        field,
        fields,
        `The ${type} this value was mapped to no longer exists. Select an existing ${type} or create it again.`,
      );
      return 'handled';
    }
    if (resolved.master) {
      recordMapping(resolved.mapping, type, resolved.master);
      return 'mapped';
    }
    return '';
  };

  const itemCode = cleanText(values.itemCode);
  const itemName = cleanText(values.itemName);
  const itemFields = {
    code: itemCode,
    name: itemName,
    parent: cleanText(values.subGroupName),
    groupName: cleanText(values.groupName),
    uomName: cleanText(values.uomName),
    hsn: cleanText(values.hsn),
  };
  const itemMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.ITEM, itemFields);
  const itemOutcome = mappingOutcome(itemMapping, MASTER_TYPES.ITEM, itemCode || itemName, 'itemCode', itemFields);
  if (itemOutcome === 'mapped') {
    row.item = itemMapping.master;
  } else if (itemOutcome === '') {
    const byCode = itemCode ? lookupMasterCandidates(masterIndex, MASTER_TYPES.ITEM, itemCode) : [];
    const byName = itemName ? lookupMasterCandidates(masterIndex, MASTER_TYPES.ITEM, itemName) : [];
    const candidates = byCode.length ? byCode : byName;
    if (candidates.length === 1) {
      row.item = candidates[0];
    } else if (candidates.length > 1) {
      addAmbiguous(
        MASTER_TYPES.ITEM,
        byCode.length ? itemCode : itemName,
        byCode.length ? 'itemCode' : 'itemName',
        candidates,
        itemFields,
      );
    } else if (itemCode) {
      add(MASTER_TYPES.ITEM, itemCode, 'itemCode', {
        label: 'Item',
        description: 'Create it from the Barcode Import sheet fields or add it on Master Data.',
      });
      mergePlanEntry(entries, MASTER_TYPES.ITEM, {
        code: itemCode,
        name: itemName,
        parent: cleanText(values.subGroupName),
        groupName: cleanText(values.groupName),
        uomName: cleanText(values.uomName),
        hsn: cleanText(values.hsn),
        itemType: 'Simple',
        uniqueBarcode: 'No',
      }, { rowNumber: row.rowNumber, source: 'barcode' });

      /* The item's own dependencies only matter while it has to be created. */
      const subGroupName = cleanText(values.subGroupName);
      const groupName = cleanText(values.groupName);
      const subFields = { name: subGroupName, parent: groupName };
      const subMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.SUB_GROUP, subFields, groupName);
      const subOutcome = mappingOutcome(subMapping, MASTER_TYPES.SUB_GROUP, subGroupName, 'subGroupName', subFields, { parent: groupName });
      if (subOutcome === '') {
        const subCandidates = subGroupName
          ? lookupMasterCandidates(masterIndex, MASTER_TYPES.SUB_GROUP, subGroupName, { parentName: groupName })
          : [];
        if (subCandidates.length > 1) {
          addAmbiguous(MASTER_TYPES.SUB_GROUP, subGroupName, 'subGroupName', subCandidates, subFields, { parent: groupName });
        } else if (!subCandidates.length) {
          add(MASTER_TYPES.SUB_GROUP, subGroupName, 'subGroupName', {
            label: 'Sub Group',
            parent: groupName,
          });
          if (subGroupName) {
            mergePlanEntry(entries, MASTER_TYPES.SUB_GROUP, {
              name: subGroupName,
              parent: groupName,
            }, { rowNumber: row.rowNumber, source: 'barcode' });
          }
          if (groupName) {
            const groupFields = { name: groupName };
            const groupMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.GROUP, groupFields);
            const groupOutcome = mappingOutcome(groupMapping, MASTER_TYPES.GROUP, groupName, 'groupName', groupFields);
            if (groupOutcome === '') {
              const groupCandidates = lookupMasterCandidates(masterIndex, MASTER_TYPES.GROUP, groupName);
              if (groupCandidates.length > 1) {
                addAmbiguous(MASTER_TYPES.GROUP, groupName, 'groupName', groupCandidates, groupFields);
              } else if (!groupCandidates.length) {
                add(MASTER_TYPES.GROUP, groupName, 'groupName', { label: 'Group' });
                mergePlanEntry(entries, MASTER_TYPES.GROUP, { name: groupName }, { rowNumber: row.rowNumber, source: 'barcode' });
              }
            }
          }
        }
      }

      const uomName = cleanText(values.uomName);
      const uomFields = { name: uomName, code: uomName };
      const uomMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.UOM, uomFields);
      const uomOutcome = mappingOutcome(uomMapping, MASTER_TYPES.UOM, uomName, 'uomName', uomFields);
      if (uomOutcome === '') {
        const uomCandidates = uomName ? lookupMasterCandidates(masterIndex, MASTER_TYPES.UOM, uomName) : [];
        if (uomCandidates.length > 1) {
          addAmbiguous(MASTER_TYPES.UOM, uomName, 'uomName', uomCandidates, uomFields);
        } else if (!uomCandidates.length) {
          add(MASTER_TYPES.UOM, uomName, 'uomName', { label: 'UOM' });
          if (uomName) {
            mergePlanEntry(entries, MASTER_TYPES.UOM, {
              name: uomName,
              code: uomName,
            }, { rowNumber: row.rowNumber, source: 'barcode' });
          }
        }
      }

      const hsnCode = cleanText(values.hsn);
      const hsnFields = { code: hsnCode };
      const hsnMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.HSN, hsnFields);
      const hsnOutcome = mappingOutcome(hsnMapping, MASTER_TYPES.HSN, hsnCode, 'hsn', hsnFields);
      if (hsnOutcome === '') {
        const hsnCandidates = hsnCode ? lookupMasterCandidates(masterIndex, MASTER_TYPES.HSN, hsnCode) : [];
        if (hsnCandidates.length > 1) {
          addAmbiguous(MASTER_TYPES.HSN, hsnCode, 'hsn', hsnCandidates, hsnFields);
        } else if (!hsnCandidates.length) {
          add(MASTER_TYPES.HSN, hsnCode, 'hsn', { label: 'HSN' });
          if (hsnCode) {
            mergePlanEntry(entries, MASTER_TYPES.HSN, { code: hsnCode }, { rowNumber: row.rowNumber, source: 'barcode' });
          }
        }
      }
    }
  }

  const supplierCode = cleanText(values.supplierCode);
  const supplierName = cleanText(values.supplierName);
  if (supplierCode || supplierName) {
    const supplierFields = { code: supplierCode, name: supplierName, contactType: '' };
    const supplierMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.SUPPLIER, supplierFields);
    const supplierOutcome = mappingOutcome(supplierMapping, MASTER_TYPES.SUPPLIER, supplierCode || supplierName, 'supplierCode', supplierFields);
    if (supplierOutcome === 'mapped') {
      row.supplier = supplierMapping.master;
    } else if (supplierOutcome === '') {
      const byCode = supplierCode ? lookupMasterCandidates(masterIndex, MASTER_TYPES.SUPPLIER, supplierCode) : [];
      const byName = supplierName ? lookupMasterCandidates(masterIndex, MASTER_TYPES.SUPPLIER, supplierName) : [];
      if (byCode.length === 1) {
        row.supplier = byCode[0];
        if (supplierCode && supplierName && fieldConflict(byCode[0].name, supplierName)) {
          row.warnings.push({
            field: 'supplierName',
            label: 'Supplier Name',
            message: `Supplier Code ${supplierCode} is ${byCode[0].name}; the sheet says ${supplierName}. The existing supplier will be used.`,
          });
        }
      } else if (byCode.length > 1) {
        addAmbiguous(MASTER_TYPES.SUPPLIER, supplierCode, 'supplierCode', byCode, supplierFields);
      } else if (byName.length === 1) {
        row.supplier = byName[0];
      } else if (byName.length > 1) {
        addAmbiguous(MASTER_TYPES.SUPPLIER, supplierName, 'supplierName', byName, supplierFields);
      } else {
        add(MASTER_TYPES.SUPPLIER, supplierCode || supplierName, 'supplierCode', { label: 'Supplier' });
        mergePlanEntry(entries, MASTER_TYPES.SUPPLIER, {
          code: supplierCode,
          name: supplierName,
          contactType: '',
        }, { rowNumber: row.rowNumber, source: 'barcode' });
      }
    }
  }

  const agentCode = cleanText(values.agentCode);
  const agentName = cleanText(values.agentName);
  if (agentCode || agentName) {
    const agentFields = { code: agentCode, name: agentName, contactType: '' };
    const agentMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.AGENT, agentFields);
    const agentOutcome = mappingOutcome(agentMapping, MASTER_TYPES.AGENT, agentCode || agentName, 'agentCode', agentFields);
    if (agentOutcome === 'mapped') {
      row.agent = agentMapping.master;
    } else if (agentOutcome === '') {
      const byCode = agentCode ? lookupMasterCandidates(masterIndex, MASTER_TYPES.AGENT, agentCode) : [];
      const byName = agentName ? lookupMasterCandidates(masterIndex, MASTER_TYPES.AGENT, agentName) : [];
      if (byCode.length === 1) {
        row.agent = byCode[0];
      } else if (byCode.length > 1) {
        addAmbiguous(MASTER_TYPES.AGENT, agentCode, 'agentCode', byCode, agentFields);
      } else if (byName.length === 1) {
        row.agent = byName[0];
      } else if (byName.length > 1) {
        addAmbiguous(MASTER_TYPES.AGENT, agentName, 'agentName', byName, agentFields);
      } else {
        add(MASTER_TYPES.AGENT, agentCode || agentName, 'agentCode', { label: 'Agent' });
        mergePlanEntry(entries, MASTER_TYPES.AGENT, {
          code: agentCode,
          name: agentName,
          contactType: '',
        }, { rowNumber: row.rowNumber, source: 'barcode' });
      }
    }
  }

  const locationName = cleanText(values.locationName);
  const locationFields = { name: locationName || cleanText(defaultLocation?.name) };
  const locationMapping = resolveMappedReference(masterIndex, mappingLookup, MASTER_TYPES.LOCATION, locationFields);
  const locationOutcome = mappingOutcome(
    locationMapping,
    MASTER_TYPES.LOCATION,
    locationName || cleanText(defaultLocation?.name),
    'locationName',
    locationFields,
  );
  if (locationOutcome === 'mapped') {
    row.location = locationMapping.master;
  } else if (locationOutcome === '') {
    const candidates = locationName ? lookupMasterCandidates(masterIndex, MASTER_TYPES.LOCATION, locationName) : [];
    if (candidates.length === 1) {
      row.location = candidates[0];
    } else if (candidates.length > 1) {
      addAmbiguous(MASTER_TYPES.LOCATION, locationName, 'locationName', candidates, locationFields);
    } else if (!locationName && defaultLocation?.id) {
      row.location = defaultLocation;
    } else {
      add(MASTER_TYPES.LOCATION, locationName || cleanText(defaultLocation?.name), 'locationName', { label: 'Location' });
      if (locationName) {
        mergePlanEntry(entries, MASTER_TYPES.LOCATION, {
          name: locationName,
          city: '',
          zipCode: '',
        }, { rowNumber: row.rowNumber, source: 'barcode' });
      }
    }
  }

  return missing;
}

function evaluatePlan(entries, masterIndex, mappingLookup) {
  const list = [...entries.values()];
  let changed = true;
  let guard = 0;

  const findPlan = (type, value, parentName = '') => list.find((entry) => entry.type === type
    && normalizeKey(entry.fields.name || entry.fields.code) === normalizeKey(value)
    && (type !== MASTER_TYPES.SUB_GROUP || !parentName || normalizeKey(entry.fields.parent) === normalizeKey(parentName)));

  /* Dependencies run through the same rules as the workbook values:
     an explicit mapping wins, then a single exact master, then a planned
     Master Data row. Several matches are never reduced to the first one. */
  const resolve = (type, value, parentName = '') => {
    if (isBlankValue(value)) return { ok: false, reason: 'a value is missing' };

    const mapping = resolveMappedReference(
      masterIndex,
      mappingLookup,
      type,
      { name: value, code: value, parent: parentName },
      parentName,
    );
    if (mapping.attempted) {
      if (mapping.conflict) {
        return { ok: false, reason: `it is mapped to more than one ${type} record` };
      }
      if (mapping.stale) {
        return { ok: false, reason: `the mapped ${type} record no longer exists` };
      }
      if (mapping.master) return { ok: true, existing: mapping.master, mapped: true };
    }

    const candidates = lookupMasterCandidates(masterIndex, type, value, { parentName });
    if (candidates.length === 1) return { ok: true, existing: candidates[0] };
    if (candidates.length > 1) {
      return { ok: false, reason: `more than one ${type} matches "${cleanText(value)}"; choose one in Missing Masters` };
    }

    const planned = findPlan(type, value, parentName);
    if (!planned) return { ok: false, reason: `"${cleanText(value)}" is not in the ${type} master and no Master Data row supplies it` };
    if (planned.status === 'create') return { ok: true, planned };
    if (planned.status === 'blocked') return { ok: false, reason: planned.blockedReason };
    return { ok: false, pending: true };
  };

  while (changed && guard < 20) {
    changed = false;
    guard += 1;
    list.forEach((entry) => {
      if (entry.status) return;
      const fields = entry.fields;
      let blocked = '';
      let dependencies = {};

      if (entry.masterErrors.length) {
        blocked = entry.masterErrors[0].message;
      } else if (entry.conflicts.length) {
        blocked = entry.conflicts[0];
      } else if (entry.type === MASTER_TYPES.GROUP) {
        if (!cleanText(fields.name)) blocked = 'Group name is required.';
      } else if (entry.type === MASTER_TYPES.SUB_GROUP) {
        if (!cleanText(fields.name)) blocked = 'Sub Group name is required.';
        else {
          const parent = resolve(MASTER_TYPES.GROUP, fields.parent);
          dependencies.group = parent;
          if (!parent.ok && !parent.pending) blocked = `Sub Group "${fields.name}" cannot be created: its group ${parent.reason || 'is missing'}.`;
          if (parent.pending) return;
        }
      } else if (entry.type === MASTER_TYPES.UOM) {
        if (!cleanText(fields.name) && !cleanText(fields.code)) blocked = 'UOM name is required.';
      } else if (entry.type === MASTER_TYPES.HSN) {
        if (!cleanText(fields.code)) blocked = 'HSN code is required.';
      } else if (entry.type === MASTER_TYPES.LOCATION) {
        if (!cleanText(fields.name)) blocked = 'Location name is required.';
        else if (!cleanText(fields.city)) blocked = `Location "${fields.name}" cannot be created: City is required. Add it on the Master Data sheet.`;
        else if (!cleanText(fields.zipCode)) blocked = `Location "${fields.name}" cannot be created: Zip Code is required. Add it on the Master Data sheet.`;
      } else if (entry.type === MASTER_TYPES.SUPPLIER || entry.type === MASTER_TYPES.AGENT) {
        if (!cleanText(fields.name)) blocked = `${entry.type} "${cleanText(fields.code)}" cannot be created: its name is missing.`;
        else {
          const typeName = entry.type === MASTER_TYPES.SUPPLIER ? 'Supplier' : 'Agent';
          const contactTypeName = cleanText(fields.contactType) || typeName;
          const contactType = lookupMaster(masterIndex, CONTACT_TYPE_KEY, contactTypeName);
          dependencies.contactType = Boolean(contactType);
          if (!contactType) {
            blocked = `${entry.type} "${fields.name}" cannot be created: Contact Type "${contactTypeName}" does not exist. Create the Contact Type in Masters first.`;
          }
        }
      } else if (entry.type === MASTER_TYPES.ITEM) {
        if (!cleanText(fields.code)) blocked = 'Item Code is required.';
        else if (!cleanText(fields.name)) blocked = `Item "${fields.code}" cannot be created: Item Name is required.`;
        else {
          const subGroup = resolve(MASTER_TYPES.SUB_GROUP, fields.parent, fields.groupName || '');
          const uom = resolve(MASTER_TYPES.UOM, fields.uomName);
          const hsn = resolve(MASTER_TYPES.HSN, fields.hsn);
          dependencies = { subGroup, uom, hsn };
          if (subGroup.pending || uom.pending || hsn.pending) return;
          if (!subGroup.ok) blocked = `Item "${fields.code}" cannot be created: Sub Group ${subGroup.reason || 'is missing'}.`;
          else if (!uom.ok) blocked = `Item "${fields.code}" cannot be created: UOM ${uom.reason || 'is missing'}.`;
          else if (!hsn.ok) blocked = `Item "${fields.code}" cannot be created: HSN ${hsn.reason || 'is missing'}.`;
        }
      } else {
        blocked = `Unknown master type ${entry.type}.`;
      }

      entry.dependencies = dependencies;
      entry.status = blocked ? 'blocked' : 'create';
      entry.blockedReason = blocked;
      changed = true;
    });
  }

  list.forEach((entry) => {
    if (!entry.status) {
      entry.status = 'blocked';
      entry.blockedReason = entry.blockedReason || 'A dependency could not be resolved.';
    }
  });
  return list;
}

/* ------------------------------------------------------------ analysis --- */

function emptyAnalysis(scope, fileName, blocking) {
  return {
    ok: false,
    scope,
    fileName,
    blocking,
    createdAt: new Date().toISOString(),
    workbook: { sheetNames: [] },
    barcode: { present: false, rows: [], headers: [], headerRow: 0, sheetName: '' },
    master: { present: false, rows: [], headers: [], headerRow: 0, sheetName: '' },
    missingMasters: [],
    masterMappings: [],
    business: null,
    summary: {
      barcode: { total: 0, valid: 0, invalid: 0, missingMaster: 0, ambiguous: 0, mappingError: 0, mapped: 0, existing: 0, duplicate: 0, example: 0, ignored: 0, ready: 0 },
      master: { total: 0, valid: 0, invalid: 0, existing: 0, duplicate: 0, ready: 0 },
      missingMasters: 0,
      creatableMasters: 0,
      blockedMasters: 0,
      ambiguousMasters: 0,
      mappingErrors: 0,
      mappedReferences: 0,
    },
    strategies: {},
    warnings: [],
  };
}

export function analyzeImport({
  buffer,
  scope = IMPORT_SCOPES.BARCODE_MASTER,
  fileName = '',
  masterIndex = buildMasterIndex(),
  existingBarcodes = [],
  defaultLocation = null,
  maxRows = MAX_ROWS,
  masterMappings = [],
  business = null,
} = {}) {
  if (!buffer) throw new ImportAnalysisError('NO_FILE', 'Choose an Excel workbook to import.');
  if (!Object.values(IMPORT_SCOPES).includes(scope)) {
    throw new ImportAnalysisError('BAD_SCOPE', 'Choose a valid import type.');
  }

  const mappingLookup = buildMasterMappingLookup(masterMappings);
  const appliedMappings = new Map();

  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: Buffer.isBuffer(buffer) ? 'buffer' : 'array',
      cellDates: true,
      cellNF: true,
      cellText: true,
      raw: true,
      dense: false,
    });
  } catch {
    throw new ImportAnalysisError('INVALID_WORKBOOK', 'This file could not be read as an Excel workbook. Save it as .xlsx and try again.');
  }
  if (!workbook.SheetNames?.length) {
    throw new ImportAnalysisError('EMPTY_WORKBOOK', 'The workbook has no sheets.');
  }

  const barcodeSheetName = findSheetByName(workbook, SHEET_NAMES.BARCODE);
  const masterSheetName = findSheetByName(workbook, SHEET_NAMES.MASTER);
  const names = workbook.SheetNames;

  const masterCandidates = [masterSheetName, ...names.filter((name) => name !== masterSheetName)].filter(Boolean);
  let masterParsed = null;
  for (const name of masterCandidates) {
    const sheet = workbook.Sheets[name];
    sheet.__name = name;
    const range = sheetRange(sheet);
    const header = detectHeaderRow(sheet, MASTER_HEADER_LOOKUP, range, ['masterType']);
    if (!header || header.mapping.size < 2) continue;
    /* "Type" exists in plenty of operational workbooks. A master sheet must
       either say "Master Type" or be named as a master sheet. */
    const explicitMasterHeader = header.headers.some((value) => headerKey(value) === 'master type');
    const namedMaster = /master/i.test(name);
    if (!explicitMasterHeader && !namedMaster) continue;
    masterParsed = { name, sheet, range, header };
    break;
  }

  const barcodeCandidates = [barcodeSheetName, ...names.filter((name) => name !== barcodeSheetName && name !== masterParsed?.name)].filter(Boolean);
  let barcodeParsed = null;
  for (const name of barcodeCandidates) {
    const sheet = workbook.Sheets[name];
    sheet.__name = name;
    const range = sheetRange(sheet);
    const header = detectHeaderRow(sheet, BARCODE_HEADER_LOOKUP, range, ['barcodeNo']);
    if (!header) continue;
    const hasBarcode = [...header.mapping.values()].some((field) => field.key === 'barcodeNo');
    if (hasBarcode) { barcodeParsed = { name, sheet, range, header }; break; }
  }

  const sheetNames = names.slice();
  let blocking = null;

  if (!barcodeParsed && !masterParsed) {
    /* Is this the item-wise HSR summary? Say exactly why it cannot work
       instead of pretending every row is merely invalid. */
    const summaryLike = names.some((name) => {
      const sheet = workbook.Sheets[name];
      const range = sheetRange(sheet);
      if (!range) return false;
      for (let r = range.s.r; r <= Math.min(range.e.r, range.s.r + 20); r += 1) {
        const headers = [];
        for (let c = range.s.c; c <= range.e.c; c += 1) headers.push(headerKey(readCell(sheet, r, c).text));
        if (headers.some((h) => h === 'open qty' || h === 'opening qty' || h === 'closing qty')
          && headers.some((h) => h === 'item code' || h === 'item name')) return true;
      }
      return false;
    });
    if (summaryLike) {
      blocking = {
        code: 'BARCODE_COLUMN_MISSING',
        title: 'This is an item-wise stock summary, not a barcode workbook',
        message: 'No Barcode Number column was found. An item-wise summary cannot tell us which unit each quantity belongs to, so it cannot create barcodes or replace barcode stock.',
        suggestion: 'Use Barcode Import with one row per barcode (download the template above). For item-wise opening quantities, use the HSR opening-stock import instead.',
      };
    } else {
      blocking = {
        code: 'HEADERS_NOT_FOUND',
        title: 'The workbook headers were not recognised',
        message: 'No sheet contains the Barcode Number column (or the Master Type column) this import needs.',
        suggestion: 'Download the template and keep its sheet names and header row. Do not rename the header cells.',
      };
    }
    return emptyAnalysis(scope, fileName, blocking);
  }

  if (scope !== IMPORT_SCOPES.MASTER_DATA && !barcodeParsed) {
    blocking = {
      code: 'BARCODE_SHEET_MISSING',
      title: 'No Barcode Import sheet was found',
      message: 'The workbook has master data but no sheet with a Barcode Number column.',
      suggestion: 'Use the Barcode + Master Data template, or choose Master Data Import if you only want to create masters.',
    };
    return emptyAnalysis(scope, fileName, blocking);
  }
  if (scope === IMPORT_SCOPES.MASTER_DATA && !masterParsed) {
    blocking = {
      code: 'MASTER_SHEET_MISSING',
      title: 'No Master Data sheet was found',
      message: 'Master Data Import reads the Master Data sheet only.',
      suggestion: 'Download the template and add your rows to the Master Data sheet.',
    };
    return emptyAnalysis(scope, fileName, blocking);
  }

  const parsedBarcode = barcodeParsed
    ? parseSheetRows(barcodeParsed.sheet, barcodeParsed.range, barcodeParsed.header, scope)
    : { rows: [], blankRows: 0, exampleRows: 0, ignoredRows: 0 };
  /* A stock update never creates or changes a master. If the template's
     Master Data sheet is still in the upload, it is deliberately ignored. */
  const parsedMaster = (scope !== IMPORT_SCOPES.BARCODE_STOCK && masterParsed)
    ? parseSheetRows(masterParsed.sheet, masterParsed.range, masterParsed.header, scope)
    : { rows: [], blankRows: 0, exampleRows: 0, ignoredRows: 0 };

  if (scope !== IMPORT_SCOPES.MASTER_DATA) {
    const missingHeaders = requiredBarcodeKeys(scope).filter((key) => ![...barcodeParsed.header.mapping.values()].some((field) => field.key === key));
    if (missingHeaders.length) {
      blocking = {
        code: 'REQUIRED_COLUMN_MISSING',
        title: 'A required column is missing',
        message: `The Barcode Import sheet needs ${missingHeaders.map(fieldLabel).join(', ')}.`,
        suggestion: 'Restore the missing header from the template and try again.',
      };
      return emptyAnalysis(scope, fileName, blocking);
    }
  }

  const totalRows = parsedBarcode.rows.length + parsedMaster.rows.length;
  if (totalRows > maxRows) {
    throw new ImportAnalysisError('TOO_MANY_ROWS', `This workbook has ${totalRows.toLocaleString()} data rows. The limit is ${maxRows.toLocaleString()} per import. Split it into smaller workbooks.`, { status: 413 });
  }

  const barcodeRows = parsedBarcode.rows.map((row) => ({
    ...row,
    errors: [],
    warnings: [],
    missing: [],
    actions: {},
    resolvedMappings: [],
    status: ROW_STATUS.VALID,
  }));
  const masterRows = parsedMaster.rows.map((row) => ({
    ...row,
    errors: [],
    warnings: [],
    masterType: null,
    status: ROW_STATUS.VALID,
  }));

  const existingBarcodeIndex = buildExistingBarcodeIndex(existingBarcodes);
  barcodeRows.forEach((row) => {
    validateBarcodeRow(row, scope);
    if (row.example) row.status = ROW_STATUS.EXAMPLE;
    const barcode = cleanText(row.values.barcodeNo);
    row.existingBarcode = findExistingBarcode(existingBarcodeIndex, barcode);
  });

  /* The selected business is the scope of the import. A Company/Business
     column cannot override it, and a workbook filled for another branch is
     called out instead of being silently written into this one. */
  const businessNames = [business?.name, business?.printName]
    .map((value) => normalizeKey(value))
    .filter(Boolean);
  const businessMismatches = new Map();
  if (businessNames.length) {
    barcodeRows.forEach((row) => {
      const value = cleanText(row.values.businessName);
      if (!value) return;
      if (businessNames.includes(normalizeKey(value))) return;
      row.warnings.push({
        field: 'businessName',
        label: 'Company/Business',
        message: `The workbook says "${value}", but this import is scoped to ${cleanText(business?.name) || 'the selected business'}. The selected business is used.`,
      });
      if (!businessMismatches.has(value)) businessMismatches.set(value, []);
      businessMismatches.get(value).push(row.rowNumber);
    });
  }

  /* Duplicate barcodes inside this one workbook. The first occurrence is
     kept; every later one is named against it and never written. */
  const seenBarcodes = new Map();
  barcodeRows.forEach((row) => {
    if (row.example) return;
    const barcode = cleanText(row.values.barcodeNo);
    if (!barcode) return;
    const key = barcodeKey(barcode);
    if (seenBarcodes.has(key)) {
      row.duplicateOf = seenBarcodes.get(key);
      row.duplicateKey = key;
    } else {
      seenBarcodes.set(key, row.rowNumber);
    }
  });

  masterRows.forEach((row) => {
    validateMasterRow(row);
    if (!row.masterType) {
      row.status = ROW_STATUS.INVALID;
      return;
    }
    const key = masterKeyFor(row.masterType, row.values);
    row.masterKey = key;
    const existing = findExistingMaster(masterIndex, row.masterType, row.values);
    if (existing) {
      row.existingMaster = existing;
      row.status = ROW_STATUS.IGNORED;
      row.warnings.push({
        field: 'name',
        label: 'Name',
        message: `${row.masterType} already exists (${existing.code || existing.name}); it is reused and not changed.`,
      });
    } else if (!row.errors.length) {
      row.status = ROW_STATUS.VALID;
    } else {
      row.status = ROW_STATUS.INVALID;
    }
  });

  const seenMasters = new Map();
  masterRows.forEach((row) => {
    if (!row.masterKey || row.example) return;
    if (seenMasters.has(row.masterKey)) {
      row.duplicateOf = seenMasters.get(row.masterKey);
      row.status = ROW_STATUS.DUPLICATE;
    } else {
      seenMasters.set(row.masterKey, row.rowNumber);
    }
  });

  if (scope !== IMPORT_SCOPES.MASTER_DATA) {
    barcodeRows.forEach((row) => {
      if (row.example) return;
      if (!row.errors.length && row.duplicateOf) row.status = ROW_STATUS.DUPLICATE;
      else if (row.errors.length) row.status = ROW_STATUS.INVALID;
      else if (row.existingBarcode && scope === IMPORT_SCOPES.BARCODE_STOCK) {
        if (row.existingBarcode.status && row.existingBarcode.status !== 'IN_STOCK') {
          addError(row.errors, 'barcodeNo', row.values.barcodeNo,
            `Barcode ${row.values.barcodeNo} is ${String(row.existingBarcode.status).replace(/_/g, ' ').toLowerCase()} and cannot have its stock replaced.`,
            'Only barcodes that are in stock can be updated.');
          row.status = ROW_STATUS.INVALID;
        } else {
          row.status = ROW_STATUS.VALID;
        }
      } else if (row.existingBarcode) {
        row.status = ROW_STATUS.EXISTING_BARCODE;
      } else {
        row.status = ROW_STATUS.VALID;
      }

      if (!row.existingBarcode && scope === IMPORT_SCOPES.BARCODE_STOCK && !row.duplicateOf && !row.errors.some((e) => e.field === 'barcodeNo')) {
        addError(row.errors, 'barcodeNo', row.values.barcodeNo,
          `Barcode ${row.values.barcodeNo || '(blank)'} was not found in this business.`,
          'Stock update cannot create barcodes. Check the number, or use Barcode + Master Data Import.');
        row.status = ROW_STATUS.INVALID;
      }

      if (scope === IMPORT_SCOPES.BARCODE_STOCK && row.existingBarcode && !row.errors.length) {
        const workbookLocation = cleanText(row.values.locationName);
        const existingLocation = cleanText(row.existingBarcode.currentLocationName);
        if (workbookLocation && existingLocation && normalizeKey(workbookLocation) !== normalizeKey(existingLocation)) {
          addError(row.errors, 'locationName', workbookLocation,
            `Barcode ${row.values.barcodeNo} is at ${existingLocation}; a stock update cannot move it.`,
            'Use Stock Transfer for a move, or remove the location from this workbook.');
          row.status = ROW_STATUS.INVALID;
        }
        if (!row.errors.length && cleanText(row.values.itemCode) && row.existingBarcode.itemCode
          && normalizeKey(row.values.itemCode) !== normalizeKey(row.existingBarcode.itemCode)) {
          row.warnings.push({
            field: 'itemCode',
            label: 'Item Code',
            message: `The existing barcode belongs to item ${row.existingBarcode.itemCode}; stock is updated on that item, not on ${row.values.itemCode}.`,
          });
        }
      }
    });
  }

  /* Only rows that are actually candidates contribute inferred masters. An
     invalid row must not leave half-created masters behind. */
  const entries = new Map();
  if (scope === IMPORT_SCOPES.BARCODE_MASTER || scope === IMPORT_SCOPES.MASTER_DATA) {
    masterRows.forEach((row) => {
      if (!row.masterType || row.example || row.duplicateOf || row.existingMaster || row.errors.length) return;
      mergePlanEntry(entries, row.masterType, row.values, {
        masterRowNumber: row.rowNumber,
        explicit: true,
        source: 'master',
        errors: row.errors,
      });
    });
  }
  if (scope === IMPORT_SCOPES.BARCODE_MASTER) {
    barcodeRows.forEach((row) => {
      if (row.example || row.duplicateOf || row.existingBarcode || row.errors.length) return;
      row.missing = collectMissing({
        row,
        masterIndex,
        entries,
        defaultLocation,
        mappingLookup,
        appliedMappings,
      });
    });
  }

  evaluatePlan(entries, masterIndex, mappingLookup);

  const planList = [...entries.values()];
  barcodeRows.forEach((row) => {
    row.missing.forEach((missing) => {
      if (missing.resolution === 'ambiguous' || missing.resolution === 'mapping_error') return;
      const entry = findPlanEntry(planList, missing);
      if (entry) {
        missing.planKey = entry.key;
        missing.resolution = entry.status === 'create' ? 'create' : 'blocked';
        missing.reason = entry.blockedReason || '';
      } else {
        missing.resolution = 'blocked';
        missing.reason = missing.reason || `${missing.type} does not exist and no Master Data row creates it.`;
      }
    });
    if (row.missing.length && !row.errors.length && row.status !== ROW_STATUS.DUPLICATE && row.status !== ROW_STATUS.EXISTING_BARCODE) {
      row.status = ROW_STATUS.MISSING_MASTER;
    }
  });

  annotateActions(barcodeRows, scope);
  masterRows.forEach((row) => {
    if (row.duplicateOf || row.existingMaster || row.errors.length) return;
    const entry = entries.get(row.masterKey);
    row.creatable = entry ? entry.status === 'create' : false;
    row.blockedReason = entry?.blockedReason || '';
    if (!row.creatable) row.status = row.status === ROW_STATUS.VALID ? ROW_STATUS.INVALID : row.status;
  });

  const missingMasters = buildMissingMasters(entries, barcodeRows);
  const summary = summarize({ barcodeRows, masterRows, missingMasters, parsedBarcode, parsedMaster });
  const strategies = buildStrategySummaries({ barcodeRows, masterRows, entries, scope });
  const warnings = [];
  if (parsedBarcode.blankRows) warnings.push({ code: 'BLANK_ROWS', message: `${parsedBarcode.blankRows} blank row(s) were ignored.` });
  if (parsedMaster.blankRows) warnings.push({ code: 'BLANK_ROWS', message: `${parsedMaster.blankRows} blank Master Data row(s) were ignored.` });
  if (parsedBarcode.exampleRows) warnings.push({ code: 'EXAMPLE_ROWS', message: `${parsedBarcode.exampleRows} example row(s) were ignored.` });
  businessMismatches.forEach((rows, value) => {
    warnings.push({
      code: 'BUSINESS_MISMATCH',
      message: `Company/Business "${value}" appears on ${rows.length} row(s), but this import is scoped to ${cleanText(business?.name) || 'the selected business'}. The selected business is used.`,
      rows,
    });
  });

  const applied = [...appliedMappings.values()];
  const mappingStatuses = (Array.isArray(masterMappings) ? masterMappings : [])
    .filter((mapping) => mapping && mapping.type && mapping.masterId)
    .map((mapping) => {
      const master = (masterIndex?.lists?.[mapping.type] || [])
        .find((row) => String(row.id) === String(mapping.masterId)) || null;
      const used = applied.filter((entry) => (
        entry.type === mapping.type && String(entry.masterId) === String(mapping.masterId)
      ));
      const rows = [...new Set(used.flatMap((entry) => entry.rows || []))].sort((a, b) => a - b);
      return {
        key: mapping.key || `${mapping.type}|${mapping.masterId}`,
        type: mapping.type,
        field: mapping.field || '',
        value: cleanText(mapping.value),
        parent: cleanText(mapping.parent ?? mapping.fields?.parent),
        fields: mapping.fields || {},
        aliases: mapping.aliases || [],
        masterId: String(mapping.masterId),
        masterCode: cleanText(master?.code || mapping.masterCode),
        masterName: cleanText(master?.name || mapping.masterName),
        mappedAt: mapping.mappedAt || '',
        mappedBy: mapping.mappedBy || '',
        rows,
        rowCount: rows.length,
        status: master ? (rows.length ? 'verified' : 'unused') : 'error',
        reason: master ? '' : `The ${mapping.type} this value was mapped to no longer exists. Select another record.`,
      };
    });

  mappingStatuses
    .filter((mapping) => mapping.status === 'error')
    .forEach((mapping) => {
      warnings.push({
        code: 'STALE_MAPPING',
        message: `${mapping.type} "${mapping.value || mapping.masterCode || mapping.masterId}" is mapped to a record that no longer exists.`,
        rows: mapping.rows,
      });
    });

  const analysis = {
    ok: true,
    scope,
    fileName,
    createdAt: new Date().toISOString(),
    workbook: {
      sheetNames,
      barcodeSheetName: barcodeParsed?.name || '',
      masterSheetName: masterParsed?.name || '',
    },
    barcode: {
      present: Boolean(barcodeParsed),
      sheetName: barcodeParsed?.name || '',
      headerRow: barcodeParsed ? barcodeParsed.header.rowIndex + 1 : 0,
      headers: barcodeParsed ? barcodeParsed.header.headers : [],
      rows: barcodeRows,
      blankRows: parsedBarcode.blankRows,
      exampleRows: parsedBarcode.exampleRows,
      ignoredRows: parsedBarcode.ignoredRows,
    },
    master: {
      present: Boolean(masterParsed),
      sheetName: masterParsed?.name || '',
      headerRow: masterParsed ? masterParsed.header.rowIndex + 1 : 0,
      headers: masterParsed ? masterParsed.header.headers : [],
      rows: masterRows,
      blankRows: parsedMaster.blankRows,
      exampleRows: parsedMaster.exampleRows,
    },
    missingMasters,
    masterMappings: mappingStatuses,
    business: business ? {
      id: String(business.id || ''),
      name: cleanText(business.name),
      printName: cleanText(business.printName),
      mismatchedValues: [...businessMismatches.keys()],
    } : null,
    summary,
    strategies,
    warnings,
  };

  /* Free the workbook before the caller persists the analysis. */
  workbook = null;
  return analysis;
}

/* Read just enough of the workbook to know which barcodes to look up in the
   database. analyzeImport() is then run with those existing records, so it
   never has to load a business's whole barcode history into memory. */
export function extractBarcodeValues({ buffer, scope = IMPORT_SCOPES.BARCODE_MASTER } = {}) {
  if (!buffer) return { values: [], sheetName: '', headerRow: 0 };
  let workbook;
  try {
    workbook = XLSX.read(buffer, {
      type: Buffer.isBuffer(buffer) ? 'buffer' : 'array',
      cellDates: true,
      cellNF: true,
      cellText: true,
      raw: true,
      dense: false,
    });
  } catch {
    return { values: [], sheetName: '', headerRow: 0 };
  }
  const barcodeSheetName = findSheetByName(workbook, SHEET_NAMES.BARCODE);
  const candidates = [barcodeSheetName, ...workbook.SheetNames.filter((name) => name !== barcodeSheetName)].filter(Boolean);
  for (const name of candidates) {
    const sheet = workbook.Sheets[name];
    sheet.__name = name;
    const range = sheetRange(sheet);
    if (!range) continue;
    const header = detectHeaderRow(sheet, BARCODE_HEADER_LOOKUP, range, ['barcodeNo']);
    if (!header) continue;
    if (![...header.mapping.values()].some((field) => field.key === 'barcodeNo')) continue;
    const parsed = parseSheetRows(sheet, range, header, scope);
    const values = [];
    parsed.rows.forEach((row) => {
      if (row.example) return;
      [row.values.barcodeNo, row.values.oldBarcode].forEach((value) => {
        const text = cleanText(value);
        if (text) values.push(text);
      });
    });
    return {
      values: [...new Set(values)],
      sheetName: name,
      headerRow: header.rowIndex + 1,
    };
  }
  return { values: [], sheetName: '', headerRow: 0 };
}

/* Validate one master the same way a Master Data row is validated. The
   in-page "Create master" dialog posts fields, not a workbook; without this
   it would be the one write path with weaker rules than the importer. */
export function validateMasterValues(type, values = {}) {
  const row = {
    values: { ...values, masterType: type },
    parseErrors: [],
    errors: [],
    warnings: [],
    masterType: null,
  };
  validateMasterRow(row);
  return {
    type: row.masterType,
    errors: row.errors,
    warnings: row.warnings,
  };
}

function findExistingMaster(index, type, values) {
  if (type === MASTER_TYPES.SUPPLIER || type === MASTER_TYPES.AGENT) {
    return lookupMaster(index, type, values.code) || lookupMaster(index, type, values.name);
  }
  if (type === MASTER_TYPES.ITEM) return lookupMaster(index, type, values.code) || lookupMaster(index, type, values.name);
  if (type === MASTER_TYPES.UOM) return lookupMaster(index, type, values.code) || lookupMaster(index, type, values.name);
  if (type === MASTER_TYPES.SUB_GROUP) return lookupMaster(index, type, values.name);
  return lookupMaster(index, type, values.code || values.name);
}

function findPlanEntry(planList, missing) {
  const wanted = normalizeKey(missing.value);
  return planList.find((entry) => {
    if (entry.type !== missing.type) return false;
    if (entry.type === MASTER_TYPES.SUB_GROUP && missing.parent
      && normalizeKey(entry.fields.parent) !== normalizeKey(missing.parent)) return false;
    return [entry.fields.name, entry.fields.code, entry.fields.parent]
      .filter(Boolean)
      .some((value) => normalizeKey(value) === wanted);
  });
}

function annotateActions(rows, scope) {
  rows.forEach((row) => {
    row.actions = {};
    if (row.example) {
      Object.values(IMPORT_STRATEGIES).forEach((strategy) => { row.actions[strategy] = 'skip'; });
      return;
    }
    if (row.errors.length) {
      Object.values(IMPORT_STRATEGIES).forEach((strategy) => { row.actions[strategy] = 'blocked'; });
      return;
    }
    if (row.duplicateOf) {
      Object.values(IMPORT_STRATEGIES).forEach((strategy) => { row.actions[strategy] = 'skip'; });
      return;
    }

    if (scope === IMPORT_SCOPES.BARCODE_STOCK) {
      if (row.existingBarcode) row.actions[IMPORT_STRATEGIES.UPDATE_STOCK] = 'update';
      else row.actions[IMPORT_STRATEGIES.UPDATE_STOCK] = 'skip';
      return;
    }

    if (row.existingBarcode) {
      row.actions[IMPORT_STRATEGIES.CREATE_AND_IMPORT] = 'skip';
      row.actions[IMPORT_STRATEGIES.EXISTING_ONLY] = 'skip';
      return;
    }

    const blockedMasters = row.missing.filter((missing) => missing.resolution !== 'create');
    row.actions[IMPORT_STRATEGIES.CREATE_AND_IMPORT] = blockedMasters.length ? 'blocked' : 'import';
    row.actions[IMPORT_STRATEGIES.EXISTING_ONLY] = row.missing.length ? 'skip' : 'import';
  });
}

function buildMissingMasters(entries, barcodeRows) {
  const rowNumbersByKey = new Map();
  const specialByKey = new Map();

  barcodeRows.forEach((row) => {
    row.missing.forEach((missing) => {
      if (missing.resolution === 'ambiguous' || missing.resolution === 'mapping_error') {
        const key = missing.referenceKey
          || `${missing.type}|${normalizeKey(missing.parent)}|${normalizeKey(missing.value)}`;
        let reference = specialByKey.get(key);
        if (!reference) {
          reference = {
            key,
            type: missing.type,
            value: cleanText(missing.value),
            field: missing.field || '',
            fields: { ...(missing.fields || {}) },
            parent: cleanText(missing.parent),
            rows: [],
            masterRows: [],
            rowCount: 0,
            sources: ['barcode'],
            creatable: false,
            resolution: missing.resolution,
            blockedReason: missing.reason,
            reason: missing.reason,
            conflicts: [],
            candidates: [],
          };
          specialByKey.set(key, reference);
        }
        if (!reference.rows.includes(row.rowNumber)) reference.rows.push(row.rowNumber);
        (missing.candidates || []).forEach((candidate) => {
          if (!reference.candidates.some((entry) => String(entry.id) === String(candidate.id))) {
            reference.candidates.push(candidate);
          }
        });
        return;
      }
      if (!missing.planKey) return;
      if (!rowNumbersByKey.has(missing.planKey)) rowNumbersByKey.set(missing.planKey, []);
      rowNumbersByKey.get(missing.planKey).push(row.rowNumber);
    });
  });

  const planned = [...entries.values()].map((entry) => {
    const rows = [...new Set(rowNumbersByKey.get(entry.key) || [])].sort((a, b) => a - b);
    const sourceMasterRows = [...new Set(entry.masterRowNumbers)].sort((a, b) => a - b);
    return {
      key: entry.key,
      type: entry.type,
      value: cleanText(entry.fields.name || entry.fields.code),
      field: '',
      fields: entry.fields,
      parent: cleanText(entry.fields.parent),
      rows,
      masterRows: sourceMasterRows,
      rowCount: rows.length,
      sources: entry.sources,
      creatable: entry.status === 'create',
      resolution: entry.status === 'create' ? 'missing' : 'blocked',
      blockedReason: entry.status === 'create' ? '' : entry.blockedReason,
      reason: entry.status === 'create' ? '' : entry.blockedReason,
      candidates: [],
      conflicts: entry.conflicts,
    };
  });

  const special = [...specialByKey.values()].map((reference) => ({
    ...reference,
    rows: reference.rows.sort((a, b) => a - b),
    rowCount: reference.rows.length,
  }));

  return [...special, ...planned].sort((a, b) => (
    a.type.localeCompare(b.type)
    || String(a.value || '').localeCompare(String(b.value || ''))
  ));
}

function summarize({ barcodeRows, masterRows, missingMasters, parsedBarcode, parsedMaster }) {
  const barcode = {
    total: barcodeRows.length,
    valid: 0,
    invalid: 0,
    missingMaster: 0,
    ambiguous: 0,
    mappingError: 0,
    mapped: 0,
    existing: 0,
    duplicate: 0,
    example: 0,
    ignored: parsedBarcode.ignoredRows || 0,
    ready: 0,
  };
  barcodeRows.forEach((row) => {
    if (row.example) barcode.example += 1;
    else if (row.errors.length) barcode.invalid += 1;
    else if (row.duplicateOf) barcode.duplicate += 1;
    else if (row.existingBarcode) barcode.existing += 1;
    else if (row.missing.length) barcode.missingMaster += 1;
    else barcode.valid += 1;
    if ((row.resolvedMappings || []).length) barcode.mapped += 1;
    if (row.missing?.some((missing) => missing.resolution === 'ambiguous')) barcode.ambiguous += 1;
    if (row.missing?.some((missing) => missing.resolution === 'mapping_error')) barcode.mappingError += 1;
    if (row.actions?.[IMPORT_STRATEGIES.CREATE_AND_IMPORT] === 'import'
      || row.actions?.[IMPORT_STRATEGIES.UPDATE_STOCK] === 'update') barcode.ready += 1;
  });

  const master = {
    total: masterRows.length,
    valid: 0,
    invalid: 0,
    existing: 0,
    duplicate: 0,
    example: 0,
    ignored: parsedMaster.ignoredRows || 0,
    ready: 0,
  };
  masterRows.forEach((row) => {
    if (row.example) master.example += 1;
    else if (row.duplicateOf) master.duplicate += 1;
    else if (row.existingMaster) master.existing += 1;
    else if (row.errors.length || row.creatable === false) master.invalid += 1;
    else if (row.creatable) { master.valid += 1; master.ready += 1; }
    else master.valid += 1;
  });

  return {
    barcode,
    master,
    missingMasters: missingMasters.length,
    creatableMasters: missingMasters.filter((entry) => entry.creatable).length,
    blockedMasters: missingMasters.filter((entry) => !entry.creatable && entry.resolution !== 'ambiguous' && entry.resolution !== 'mapping_error').length,
    ambiguousMasters: missingMasters.filter((entry) => entry.resolution === 'ambiguous').length,
    mappingErrors: missingMasters.filter((entry) => entry.resolution === 'mapping_error').length,
    mappedReferences: barcodeRows.reduce((total, row) => total + (row.resolvedMappings || []).length, 0),
  };
}

function buildStrategySummaries({ barcodeRows, masterRows, entries, scope }) {
  const strategies = {};
  (STRATEGIES_BY_SCOPE[scope] || []).forEach((strategy) => {
    const actionable = barcodeRows.filter((row) => {
      const action = row.actions?.[strategy];
      return action === 'import' || action === 'update';
    });
    const blocked = barcodeRows.filter((row) => row.actions?.[strategy] === 'blocked');
    const skipped = barcodeRows.filter((row) => row.actions?.[strategy] === 'skip');
    const creates = [...entries.values()].filter((entry) => entry.status === 'create').length;
    strategies[strategy] = {
      strategy,
      importable: actionable.length,
      blocked: blocked.length,
      skipped: skipped.length,
      masterCreates: strategy === IMPORT_STRATEGIES.CREATE_AND_IMPORT ? creates : 0,
      total: barcodeRows.length,
    };
  });
  if (scope === IMPORT_SCOPES.MASTER_DATA) {
    strategies[IMPORT_STRATEGIES.CREATE_AND_IMPORT] = {
      strategy: IMPORT_STRATEGIES.CREATE_AND_IMPORT,
      importable: 0,
      blocked: 0,
      skipped: 0,
      masterCreates: masterRows.filter((row) => row.creatable).length,
      total: 0,
    };
  }
  return strategies;
}

/* Row filtering is shared by the API and the screen's counters. */
export function rowMatchesFilter(row, filter, strategy = IMPORT_STRATEGIES.CREATE_AND_IMPORT) {
  if (!row || row.example) return filter === 'all';
  switch (filter) {
    case 'valid': return Boolean(row.masterType) ? !row.errors.length : !row.errors.length && !row.duplicateOf;
    case 'invalid': return Boolean(row.errors.length);
    case 'missing_master': return Boolean(row.missing?.length);
    case 'ambiguous': return Boolean(row.missing?.some((missing) => missing.resolution === 'ambiguous'));
    case 'mapping_error': return Boolean(row.missing?.some((missing) => missing.resolution === 'mapping_error'));
    case 'existing_barcode': return Boolean(row.existingBarcode);
    case 'duplicate': return Boolean(row.duplicateOf);
    case 'ready': return row.actions?.[strategy] === 'import' || row.actions?.[strategy] === 'update';
    case 'all':
    default: return true;
  }
}

export function filterCounts(rows, strategy) {
  return Object.fromEntries(FILTERS.map((filter) => [
    filter.key,
    (rows || []).filter((row) => rowMatchesFilter(row, filter.key, strategy)).length,
  ]));
}

/* ----------------------------------------------------------- workbooks --- */

function requiredBarcodeLabels(scope) {
  return requiredBarcodeKeys(scope);
}

function headerRow(fields, scope, { requiredKeys = [] } = {}) {
  return fields.map((field) => ({
    v: field.label + (requiredKeys.includes(field.key) ? ' *' : ''),
    s: requiredKeys.includes(field.key) ? STYLE.HEADER_REQUIRED : STYLE.HEADER,
  }));
}

function fieldStyle(field) {
  if (!field.style) return STYLE.DEFAULT;
  return STYLE[field.style] || STYLE.DEFAULT;
}

function referenceColumns(reference = {}) {
  return [
    { key: 'supplierCodes', header: 'Supplier Codes', values: (reference.suppliers || []).map((row) => row.code).filter(Boolean) },
    { key: 'supplierNames', header: 'Supplier Names', values: (reference.suppliers || []).map((row) => row.name).filter(Boolean) },
    { key: 'itemCodes', header: 'Item Codes', values: (reference.items || []).map((row) => row.code).filter(Boolean) },
    { key: 'hsnCodes', header: 'HSN Codes', values: (reference.hsn || []).map((row) => row.code).filter(Boolean) },
    { key: 'groupNames', header: 'Group Names', values: (reference.groups || []).map((row) => row.name).filter(Boolean) },
    { key: 'subGroupNames', header: 'Sub Group Names', values: (reference.subGroups || []).map((row) => row.name).filter(Boolean) },
    { key: 'uomNames', header: 'UOM', values: (reference.uoms || []).map((row) => row.name || row.shortName).filter(Boolean) },
    { key: 'locationNames', header: 'Location Names', values: (reference.locations || []).map((row) => row.name).filter(Boolean) },
    { key: 'agentCodes', header: 'Agent Codes', values: (reference.agents || []).map((row) => row.code).filter(Boolean) },
    { key: 'contactTypes', header: 'Contact Types', values: (reference.contactTypes || []).map((row) => row.name).filter(Boolean) },
  ];
}

export function buildTemplateWorkbook({ reference = {}, scope = IMPORT_SCOPES.BARCODE_MASTER } = {}) {
  const barcodeFields = BARCODE_FIELDS;
  const masterFields = MASTER_FIELDS;
  const required = requiredBarcodeLabels(scope);
  const refCols = referenceColumns(reference).map((col) => ({ ...col, values: [...new Set(col.values)].slice(0, 500) }));

  const instructions = [];
  const push = (...cells) => instructions.push(cells);
  push({ v: 'Barcode + Master Data Import', s: STYLE.TITLE });
  push({ v: 'Read this before filling the sheets. The importer never invents barcode numbers, item codes or master IDs, and it never changes an existing barcode or master.', s: STYLE.NOTE });
  push();
  push({ v: 'How to use this workbook', s: STYLE.HEADER });
  push({ v: '1. Fill one row per barcode on the Barcode Import sheet. Do not merge cells or add totals.' });
  push({ v: '2. Use the Master Data sheet only for masters that do not exist yet. Existing masters are reused by code or name and are never overwritten.' });
  push({ v: '3. Save as .xlsx. Then upload on Admin > Reports > Data Import > Add Import.' });
  push({ v: '4. Review the preview. Missing masters, invalid rows and existing barcodes are shown before anything is written.' });
  push({ v: '5. Choose a strategy. Stock is replaced only when "Replace existing stock" is ticked; otherwise existing stock is left alone.' });
  push();
  push({ v: 'Rules that prevent bad data', s: STYLE.HEADER });
  push({ v: '• Barcode Number must be the real number of the unit, one row per unit. Leading zeros must stay as text (the column is already formatted as Text).' });
  push({ v: '• An item-wise stock summary (for example the HSR "Open Qty" report) has no barcode numbers. It cannot be imported here - use the HSR opening-stock import for that.' });
  push({ v: '• A barcode that already exists is never created again. In Barcode + Master Data it is skipped and reported; in Barcode / Stock Update its quantity changes only after you confirm replacement.' });
  push({ v: '• Excel can lose leading zeros or long digits if a barcode cell is General. Keep the Text format and do not let Excel convert the column to numbers.' });
  push({ v: '• Item Code, Supplier, HSN, Group, Sub Group, UOM and Location are matched to the masters. If you choose "create missing masters", only the values below are used - no sample or guessed values.' });
  push();
  push({ v: 'Barcode Import columns', s: STYLE.HEADER });
  push({ v: 'Column', s: STYLE.HEADER }, { v: 'Required', s: STYLE.HEADER }, { v: 'What to enter', s: STYLE.HEADER });
  barcodeFields.forEach((field) => {
    push(
      { v: field.label, s: field.style ? fieldStyle(field) : STYLE.DEFAULT },
      { v: required.includes(field.key) ? 'Yes' : 'Optional', s: STYLE.DEFAULT },
      { v: instructionForField(field), s: STYLE.DEFAULT },
    );
  });
  push();
  push({ v: 'Sample rows (copy the format; do not import these sample values)', s: STYLE.HEADER });
  const sampleFields = ['barcodeNo', 'itemCode', 'itemName', 'supplierCode', 'supplierName', 'hsn', 'groupName', 'subGroupName', 'uomName', 'locationName', 'openingQty', 'purRate', 'retailPrice'];
  push(...sampleFields.map((key) => ({ v: BARCODE_FIELD_BY_KEY[key]?.label || key, s: STYLE.HEADER })));
  const sample1 = { barcodeNo: 'EXAMPLE0001', itemCode: 'EXAMPLE-ITM', itemName: 'Sample Silk Saree', supplierCode: 'SUP001', supplierName: 'Sample Supplier', hsn: '5007', groupName: 'Sarees', subGroupName: 'Silk Sarees', uomName: 'PC', locationName: 'Main Store', openingQty: 1, purRate: 1250, retailPrice: 1799 };
  const sample2 = { ...sample1, barcodeNo: 'EXAMPLE0002', itemCode: 'EXAMPLE-ITM-2', itemName: 'Sample Cotton Fabric', uomName: 'MTR', openingQty: 5.5 };
  [sample1, sample2].forEach((sample) => push(...sampleFields.map((key) => ({ v: sample[key], s: key === 'barcodeNo' || key === 'itemCode' || key === 'supplierCode' || key === 'hsn' ? STYLE.TEXT : STYLE.DEFAULT }))));
  push();
  push({ v: 'Master Data columns', s: STYLE.HEADER });
  push({ v: 'Master Type', s: STYLE.HEADER }, { v: 'Required for that type', s: STYLE.HEADER }, { v: 'Notes', s: STYLE.HEADER });
  Object.values(MASTER_TYPES).forEach((type) => {
    push({ v: type }, { v: (MASTER_REQUIRED[type] || []).map((key) => MASTER_FIELD_BY_KEY[key]?.label || key).join(', ') }, { v: masterInstruction(type) });
  });
  push();
  push({ v: 'Where to get help', s: STYLE.HEADER });
  push({ v: 'The Existing Master Reference sheet lists the masters that are already present. It is a reference only; editing it does not change the masters.' });

  const barcodeSheet = {
    name: SHEET_NAMES.BARCODE,
    selected: true,
    rows: [
      [{ v: 'Barcode Import - one row per barcode', s: STYLE.TITLE }],
      [{ v: 'Required columns are marked *. Keep this header row. Existing barcodes are never overwritten by this sheet.', s: STYLE.NOTE }],
      headerRow(barcodeFields, scope, { requiredKeys: required }),
      ...([sample1, sample2].map((sample) => barcodeFields.map((field) => {
        const value = sample[field.key];
        if (value === undefined || value === null || value === '') return null;
        return { v: value, s: field.style ? fieldStyle(field) : STYLE.DEFAULT };
      }))),
    ],
    cols: barcodeFields.map((field) => ({ width: field.width || 16, style: field.style ? fieldStyle(field) : undefined })),
    freeze: { row: 3 },
    autoFilter: `A3:${XLSX.utils.encode_col(barcodeFields.length - 1)}3`,
    validations: barcodeValidations(barcodeFields, refCols),
  };

  const masterCol = (key) => XLSX.utils.encode_col(masterFields.findIndex((field) => field.key === key));
  const masterSheet = {
    name: SHEET_NAMES.MASTER,
    rows: [
      [{ v: 'Master Data - only the masters that do not exist yet', s: STYLE.TITLE }],
      [{ v: 'Existing masters are reused and never changed. Required fields depend on Master Type - see Instructions.', s: STYLE.NOTE }],
      headerRow(masterFields, scope, { requiredKeys: ['masterType'] }),
      masterFields.map((field) => {
        const example = {
          masterType: 'Example - delete this row',
          code: 'EXAMPLE-SUP',
          name: 'Example Supplier',
          contactType: 'Supplier',
          city: 'Surat',
          zipCode: '395003',
        };
        const value = example[field.key];
        if (value === undefined || value === null || value === '') return null;
        return { v: value, s: field.style ? fieldStyle(field) : STYLE.DEFAULT };
      }),
    ],
    cols: masterFields.map((field) => ({ width: field.width || 16, style: field.style ? fieldStyle(field) : undefined })),
    freeze: { row: 3 },
    autoFilter: `A3:${XLSX.utils.encode_col(masterFields.length - 1)}3`,
    validations: [
      {
        sqref: 'A4:A5000',
        formula1: `"${Object.values(MASTER_TYPES).join(',')}"`,
        promptTitle: 'Master Type',
        prompt: 'Supplier, Item, HSN, Group, Sub Group, UOM, Location or Agent',
        errorTitle: 'Unknown Master Type',
        error: 'Choose a Master Type from the list.',
        errorStyle: 'stop',
      },
      {
        sqref: `${masterCol('status')}4:${masterCol('status')}5000`,
        formula1: '"Active,Inactive"',
        promptTitle: 'Status',
        prompt: 'Active or Inactive',
        errorTitle: 'Unknown status',
        error: 'Choose Active or Inactive.',
        errorStyle: 'stop',
      },
      ...(refCols[9]?.values.length ? [{
        sqref: `${masterCol('contactType')}4:${masterCol('contactType')}5000`,
        formula1: `'${SHEET_NAMES.REFERENCE}'!$J$4:$J$503`,
        promptTitle: 'Contact Type',
        prompt: 'An existing Contact Type is required to create a Supplier or Agent.',
        errorTitle: 'Contact Type not in the list',
        error: 'Create the Contact Type in Masters first, or pick an existing one.',
        errorStyle: 'warning',
      }] : []),
    ],
  };

  const maxReference = Math.max(1, ...refCols.map((col) => col.values.length));
  const referenceRows = [
    [{ v: 'Existing Master Reference', s: STYLE.TITLE }],
    [{ v: 'Current masters in this business. This sheet is for reference and dropdowns only; editing it does not change any master.', s: STYLE.NOTE }],
    refCols.map((col) => ({ v: col.header, s: STYLE.HEADER })),
  ];
  for (let i = 0; i < maxReference; i += 1) {
    referenceRows.push(refCols.map((col) => {
      const value = col.values[i];
      return value === undefined || value === null || value === ''
        ? null
        : { v: value, s: col.key.endsWith('Codes') || col.key === 'hsnCodes' ? STYLE.TEXT : STYLE.DEFAULT };
    }));
  }
  const referenceSheet = {
    name: SHEET_NAMES.REFERENCE,
    rows: referenceRows,
    cols: refCols.map((col) => ({ width: Math.min(42, Math.max(16, col.header.length + 6)) })),
    freeze: { row: 3 },
    autoFilter: `A3:${XLSX.utils.encode_col(refCols.length - 1)}3`,
  };

  return buildXlsx({
    title: 'Barcode + Master Data Import Template',
    sheets: [instructionsSheet(instructions), barcodeSheet, masterSheet, referenceSheet],
  });
}

function instructionForField(field) {
  const notes = {
    barcodeNo: 'The real barcode number of this unit. Keep leading zeros as text. One row per unit.',
    oldBarcode: 'The previous/vendor barcode, if any. Used for lookup, not changed.',
    itemCode: 'The Item master item code. The item must exist or be created from Master Data.',
    itemName: 'Item name as printed. Used only when the item has to be created.',
    printDescription: 'Text printed on the label.',
    itemAttributes: 'Optional attributes from the source label.',
    hsn: 'HSN code. Must exist or be created from Master Data when the item is new.',
    supplierCode: 'Supplier contact ID/code. A name is needed to create a missing supplier.',
    supplierName: 'Supplier business name, used for matching and for creating a missing supplier.',
    agentCode: 'Agent contact ID/code, if any.',
    agentName: 'Agent business name, used for matching and for creating a missing agent.',
    grcNo: 'Source GRC number. Informational only.',
    supplierInvoiceNo: 'Supplier invoice number. Informational only.',
    batchUnique: 'Batch or Unique. Leave blank to use the item master setting.',
    batchNo: 'Batch number, for a batch barcode.',
    serialNo: 'Serial number, if the source uses one.',
    purchaseDate: 'Date of purchase, DD/MM/YYYY.',
    stockDate: 'Stock date, DD/MM/YYYY. Used for ageing.',
    age: 'Age in days. Leave blank to calculate from the stock date.',
    purRate: 'Purchase rate per UOM.',
    disc: 'Discount amount/percentage, as in your source.',
    finalNet: 'Final net rate.',
    gst: 'GST percentage, 0 to 100.',
    retailPrice: 'RSP / retail price.',
    disc2: 'RSP discount percentage, 0 to 100.',
    offerPrice: 'RSP offer price.',
    wspPrice: 'WSP / wholesale price.',
    dpPrice: 'DP / dealer price.',
    locationName: 'Location name. Must exist or be created on Master Data (city and zip code are required).',
    businessName: 'Company/business name. The import always uses the business selected on the page.',
    groupName: 'Product group name. Needed only when the item must be created.',
    subGroupName: 'Product sub group name. Needed only when the item must be created.',
    openingQty: 'Quantity in this barcode. New barcodes need a quantity greater than zero.',
    uomName: 'UOM short name (PC, MTR, KG...). Needed when the item must be created.',
    openingValue: 'Calculated summary column - ignored by the import.',
    inwardQty: 'Calculated summary column - ignored by the import.',
    inwardValue: 'Calculated summary column - ignored by the import.',
    outwardQty: 'Calculated summary column - ignored by the import.',
    outwardValue: 'Calculated summary column - ignored by the import.',
    closingQty: 'Calculated summary column - ignored by the import.',
    closingValue: 'Calculated summary column - ignored by the import.',
  };
  return notes[field.key] || '';
}

function masterInstruction(type) {
  switch (type) {
    case MASTER_TYPES.SUPPLIER: return 'Name and Contact Type. Code is ignored for creation; the ERP generates the supplier contact ID.';
    case MASTER_TYPES.AGENT: return 'Name and Contact Type. Code is ignored for creation; the ERP generates the agent contact ID.';
    case MASTER_TYPES.ITEM: return 'Code, Name, Parent (Sub Group name), UOM and HSN. The sub group must exist or be created first.';
    case MASTER_TYPES.HSN: return 'Code. Status defaults to Active and Effective Date defaults to today.';
    case MASTER_TYPES.GROUP: return 'Name. Prefix is optional.';
    case MASTER_TYPES.SUB_GROUP: return 'Name and Parent (Group name). The group must exist or be created first.';
    case MASTER_TYPES.UOM: return 'Code (short name) and Name.';
    case MASTER_TYPES.LOCATION: return 'Name, City and Zip Code. Address fields are optional.';
    default: return '';
  }
}

function barcodeValidations(fields, refCols) {
  const validations = [];
  const col = (key) => XLSX.utils.encode_col(fields.findIndex((field) => field.key === key));
  const list = (key, refIndex, promptTitle, prompt) => {
    const values = refCols[refIndex]?.values || [];
    if (!values.length) return;
    const letter = XLSX.utils.encode_col(refIndex);
    validations.push({
      sqref: `${col(key)}4:${col(key)}5000`,
      formula1: `'${SHEET_NAMES.REFERENCE}'!$${letter}$4:$${letter}$503`,
      promptTitle,
      prompt,
      errorTitle: `${promptTitle} not in the current list`,
      error: 'This value is not in the current master list. You can still type it, but it must exist or be created on the Master Data sheet.',
      errorStyle: 'warning',
    });
  };
  list('itemCode', 2, 'Item Code', 'Pick an existing item code, or add the item on Master Data.');
  list('hsn', 3, 'HSN', 'Pick an existing HSN, or add it on Master Data.');
  list('groupName', 4, 'Group', 'Pick an existing group, or add it on Master Data.');
  list('subGroupName', 5, 'Sub Group', 'Pick an existing sub group, or add it on Master Data.');
  list('uomName', 6, 'UOM', 'Pick an existing UOM, or add it on Master Data.');
  list('locationName', 7, 'Location', 'Pick an existing location, or add it on Master Data.');
  list('supplierCode', 0, 'Supplier Code', 'Pick an existing supplier code, or add the supplier on Master Data.');
  list('agentCode', 8, 'Agent Code', 'Pick an existing agent code, or add the agent on Master Data.');
  return validations;
}

function instructionsSheet(rows) {
  return {
    name: SHEET_NAMES.INSTRUCTIONS,
    rows,
    cols: [{ width: 34 }, { width: 14 }, { width: 78 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 18 }],
    freeze: { row: 1 },
    merges: ['A1:H1', 'A2:H2'],
  };
}

/* ------------------------------------------------------- error workbook --- */

function errorLine({ row, error, status, sheet }) {
  return [
    row?.rowNumber ?? '',
    row?.values?.barcodeNo || '',
    row?.values?.itemCode || '',
    row?.values?.supplierCode || row?.values?.supplierName || '',
    sheet || row?.sheet || '',
    error?.label || error?.field || '',
    error?.value ?? '',
    error?.message || '',
    error?.suggestion || '',
    status,
  ];
}

export function buildErrorWorkbook({ analysis, extraRows = [], generatedAt = new Date() } = {}) {
  if (!analysis) throw new ImportAnalysisError('NO_ANALYSIS', 'Nothing to report.');

  const errors = [];
  if (analysis.blocking) {
    errors.push([
      '', '', '', '', analysis.workbook?.barcodeSheetName || '',
      analysis.blocking.title || 'Workbook', '',
      analysis.blocking.message || '',
      analysis.blocking.suggestion || '',
      'Blocked',
    ]);
  }

  (analysis.barcode?.rows || []).forEach((row) => {
    if (row.example) return;
    if (row.duplicateOf) {
      errors.push(errorLine({
        row,
        error: {
          label: 'Barcode Number',
          value: row.values.barcodeNo,
          message: `Duplicate of row ${row.duplicateOf} in this workbook.`,
          suggestion: 'Keep one row per barcode; merge the quantities deliberately before importing.',
        },
        status: 'Duplicate',
      }));
    }
    row.errors.forEach((error) => errors.push(errorLine({
      row,
      error,
      status: ROW_STATUS_LABELS[ROW_STATUS.INVALID],
    })));
    row.missing.forEach((missing) => {
      errors.push(errorLine({
        row,
        error: {
          label: missing.label,
          value: missing.value,
          message: missing.blockedReason || missing.reason || `${missing.type} does not exist in this business.`,
          suggestion: missing.resolution === 'create'
            ? 'Create it on the Master Data sheet, or choose "Create missing masters + import barcodes".'
            : missing.resolution === 'ambiguous'
              ? 'More than one master matches. Choose the correct record in Review → Select existing master.'
              : missing.resolution === 'mapping_error'
                ? 'The saved choice is no longer valid. Choose another master (or create one) and recheck.'
                : 'Create it in Masters or add a valid Master Data row, then validate again.',
        },
        status: missing.resolution === 'create'
          ? 'Missing master (creatable)'
          : missing.resolution === 'ambiguous'
            ? 'Ambiguous match'
            : missing.resolution === 'mapping_error'
              ? 'Mapping error'
              : 'Missing master (blocked)',
      }));
    });
    /* An existing barcode is not an error, but the validation report must say
       why its row was not imported. It is added last so a genuine error on the
       same row is never hidden behind it. */
    if (row.existingBarcode && !row.errors.length && !row.duplicateOf) {
      errors.push(errorLine({
        row,
        error: {
          label: 'Barcode Number',
          value: row.values.barcodeNo,
          message: `Barcode ${row.values.barcodeNo} already exists in this business; it is never duplicated or overwritten by an import.`,
          suggestion: 'Use "Barcode / Stock Update" to change an existing barcode, or remove this row from the workbook.',
        },
        status: 'Existing barcode - skipped',
      }));
    }
  });

  (analysis.master?.rows || []).forEach((row) => {
    if (row.example) return;
    if (row.duplicateOf) {
      errors.push(errorLine({
        row,
        sheet: analysis.master?.sheetName,
        error: {
          label: 'Master Type / Key',
          value: `${row.masterType || ''} ${row.values.code || row.values.name || ''}`.trim(),
          message: `Duplicate of Master Data row ${row.duplicateOf}.`,
          suggestion: 'Keep one Master Data row for each master.',
        },
        status: 'Duplicate',
      }));
    }
    row.errors.forEach((error) => errors.push(errorLine({
      row,
      sheet: analysis.master?.sheetName,
      error,
      status: ROW_STATUS_LABELS[ROW_STATUS.INVALID],
    })));
    if (row.creatable === false && !row.errors.length && !row.existingMaster) {
      errors.push(errorLine({
        row,
        sheet: analysis.master?.sheetName,
        error: {
          label: row.masterType || 'Master',
          value: row.values.code || row.values.name || '',
          message: row.blockedReason || 'This master cannot be created until its dependencies exist.',
          suggestion: 'Create the missing dependency first, then validate again.',
        },
        status: 'Blocked',
      }));
    }
  });

  extraRows.forEach((line) => errors.push([
    line.rowNumber ?? line.row ?? '',
    line.barcodeNo || '',
    line.itemCode || '',
    line.supplierCode || '',
    line.sheet || '',
    line.field || '',
    line.value || '',
    line.message || '',
    line.suggestion || '',
    line.status || 'Failed',
  ]));

  const errorRows = [
    [{ v: 'Barcode + Master Data Import - Validation Report', s: STYLE.TITLE }],
    [{ v: `Generated ${displayDate(generatedAt)}. Rows listed here were not imported. Correct them and upload the workbook again.`, s: STYLE.NOTE }],
    ERROR_REPORT_COLUMNS.map((label) => ({ v: label, s: STYLE.HEADER })),
    ...errors.map((cells) => cells.map((cell) => ({ v: cell, s: STYLE.DEFAULT }))),
  ];

  const summaryRows = [
    [{ v: 'Import summary', s: STYLE.TITLE }],
    [{ v: 'Metric', s: STYLE.HEADER }, { v: 'Count', s: STYLE.HEADER }],
    [{ v: 'Barcode rows read' }, { v: analysis.summary?.barcode?.total ?? 0 }],
    [{ v: 'Valid barcode rows' }, { v: analysis.summary?.barcode?.valid ?? 0 }],
    [{ v: 'Invalid barcode rows' }, { v: analysis.summary?.barcode?.invalid ?? 0 }],
    [{ v: 'Missing master rows' }, { v: analysis.summary?.barcode?.missingMaster ?? 0 }],
    [{ v: 'Existing barcode rows' }, { v: analysis.summary?.barcode?.existing ?? 0 }],
    [{ v: 'Duplicate rows' }, { v: analysis.summary?.barcode?.duplicate ?? 0 }],
    [{ v: 'Master rows read' }, { v: analysis.summary?.master?.total ?? 0 }],
    [{ v: 'Missing masters' }, { v: analysis.summary?.missingMasters ?? 0 }],
    [{ v: 'Missing masters creatable' }, { v: analysis.summary?.creatableMasters ?? 0 }],
    [{ v: 'Missing masters blocked' }, { v: analysis.summary?.blockedMasters ?? 0 }],
    [{ v: 'Ambiguous master references' }, { v: analysis.summary?.ambiguousMasters ?? 0 }],
    [{ v: 'Master mapping errors' }, { v: analysis.summary?.mappingErrors ?? 0 }],
    ...(analysis.blocking ? [
      [{ v: 'Blocked' }, { v: analysis.blocking.title }],
      [{ v: 'Why' }, { v: analysis.blocking.message }],
      [{ v: 'What to do' }, { v: analysis.blocking.suggestion }],
    ] : []),
  ];

  const missingRows = [
    [{ v: 'Missing masters', s: STYLE.TITLE }],
    [{ v: 'Master Type', s: STYLE.HEADER }, { v: 'Value', s: STYLE.HEADER }, { v: 'Rows', s: STYLE.HEADER }, { v: 'Resolution', s: STYLE.HEADER }, { v: 'Reason', s: STYLE.HEADER }],
    ...(analysis.missingMasters || []).map((entry) => [
      { v: entry.type },
      { v: entry.value },
      { v: entry.rows.join(', ') || (entry.masterRows?.length ? `Master Data row ${entry.masterRows.join(', ')}` : '') },
      { v: entry.creatable
        ? 'Create master'
        : entry.resolution === 'ambiguous'
          ? 'Choose existing master'
          : entry.resolution === 'mapping_error'
            ? 'Fix mapping'
            : 'Blocked' },
      { v: entry.blockedReason || entry.reason || '' },
    ]),
  ];

  return buildXlsx({
    title: 'Barcode Import Validation Report',
    sheets: [
      {
        name: 'Validation Report',
        selected: true,
        rows: errorRows,
        cols: [{ width: 12 }, { width: 22 }, { width: 18 }, { width: 18 }, { width: 20 }, { width: 22 }, { width: 24 }, { width: 52 }, { width: 48 }, { width: 26 }],
        freeze: { row: 3 },
        autoFilter: `A3:J3`,
      },
      {
        name: 'Summary',
        rows: summaryRows,
        cols: [{ width: 34 }, { width: 90 }],
        freeze: { row: 2 },
      },
      {
        name: 'Missing Masters',
        rows: missingRows,
        cols: [{ width: 16 }, { width: 34 }, { width: 24 }, { width: 18 }, { width: 80 }],
        freeze: { row: 2 },
        autoFilter: 'A2:E2',
      },
    ],
  });
}

export default {
  analyzeImport,
  buildTemplateWorkbook,
  buildErrorWorkbook,
  buildMasterIndex,
  buildExistingBarcodeIndex,
  filterCounts,
  rowMatchesFilter,
  masterKeyFor,
  ImportAnalysisError,
  parseDateValue,
  parseNumberValue,
  parseIntValue,
  cleanText,
  normalizeKey,
};
