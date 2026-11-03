/* ==========================================================================
   FULL-DATABASE EXPORT FIELDS.

   The lists in this project export their CONFIGURED COLUMNS. That is right for
   "Export Current View", but a MongoDB document usually carries more than the
   six or eight columns a screen shows: GST metadata, ledger mappings, bank
   details, legacy fields written by an older form, and fields added after the
   column list was written.

   This module turns whatever a list endpoint actually returned into a table
   without knowing the schema in advance:

     - every key on every document is discovered, not just the visible ones
     - a consistent column set is built across the whole batch (a field that
       only one legacy row has still gets a column, blank on the others)
     - nested objects become readable columns
         billingDetails: { city: 'Salem' }  ->  Billing Details City
     - arrays of primitives are joined, arrays of objects are kept as JSON in
       the main sheet and can also be written to their own worksheet by the
       workbook builder (see lib/export/workbook.js)
     - ObjectIds are preserved as their original id string, and a companion
       column with the readable label is added when the list endpoint supplied
       one (the existing resolveRefLabels map)
     - dates, booleans and numbers keep their type; null/absent values are
       blank rather than the string "null"

   It is deliberately isomorphic: the browser uses the same flattening for the
   GCR barcode workbook and for the client-side fallback, while the server uses
   it to build the real .xlsx. No Node-only imports belong in this file.

   SECURITY. A supplier document can carry a password (the contact schema
   does), a user document can carry a token, and an integration record can
   carry an API key. Those are never columns in an export, whatever the
   document happens to contain. See isSecretKey below.
   ========================================================================== */

export const EXPORT_MODES = Object.freeze({
  VIEW: 'view',          // configured columns, the existing behaviour
  FILTERED: 'filtered',  // every matching row, every field
  ALL: 'all',            // every accessible row, every field
  SELECTED: 'selected',  // chosen rows, every field
});

export const EXPORT_MODE_LABELS = Object.freeze({
  view: 'Export Current View',
  filtered: 'Export Filtered Data - All Fields',
  all: 'Export All Accessible Records - All Fields',
  selected: 'Export Selected Records - All Fields',
});

const MAX_DEPTH = 8;
const MAX_COLUMNS = 4096;

/* Keys that are credentials, not business data. */
const SECRET_KEYS = new Set([
  'password', 'passwd', 'pwd', 'passwordhash', 'password_hash',
  'secret', 'clientsecret', 'client_secret',
  'token', 'accesstoken', 'access_token', 'refreshtoken', 'refresh_token',
  'authtoken', 'auth_token', 'bearer', 'authorization',
  'apikey', 'api_key', 'privatekey', 'private_key',
  'sessionid', 'session_id', 'sessionsecret', 'session_secret',
  'cookie', 'cookies', 'otp', 'cvv', 'pin', 'salt',
  'creditcard', 'credit_card', 'cardnumber', 'card_number',
]);

/* Compound keys that are credentials even though the exact key is not listed
   above. Deliberately narrow: a POS "token No" is a queue token, not a
   credential, so `token` on its own is caught by SECRET_KEYS but `tokenNo` is
   not matched by this expression. */
const SECRET_PATTERN = /(password|passwd|client[_-]?secret|access[_-]?token|refresh[_-]?token|api[_-]?key|private[_-]?key|auth[_-]?token|session[_-]?secret|credit[_-]?card|cvv)/i;

/* Mongoose bookkeeping and anything a query operator left behind. */
const INTERNAL_KEYS = new Set(['__v', '__t', '__schema', '__dirname', '__filename']);

export function isSecretKey(key) {
  if (key === null || key === undefined) return false;
  const raw = String(key);
  const segment = raw.split('.').pop() || raw;
  const lower = segment.toLowerCase().replace(/[\s-]/g, '');
  if (SECRET_KEYS.has(lower)) return true;
  if (SECRET_PATTERN.test(segment)) return true;
  return false;
}

function isInternalKey(key) {
  const raw = String(key ?? '');
  if (INTERNAL_KEYS.has(raw)) return true;
  if (raw.startsWith('$')) return true;
  /* __proto__, constructor and prototype are not document fields */
  return raw === '__proto__' || raw === 'constructor' || raw === 'prototype';
}

export function isObjectIdLike(value) {
  if (value === null || value === undefined) return false;
  if (typeof value === 'string') return /^[0-9a-f]{24}$/i.test(value);
  if (typeof value === 'object') {
    if (value._bsontype === 'ObjectId' || value._bsontype === 'ObjectID') return true;
    if (value.constructor && /^ObjectID?$/i.test(value.constructor.name)) {
      return /^[0-9a-f]{24}$/i.test(String(value));
    }
  }
  return false;
}

export function isPlainObject(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || value instanceof Date) return false;
  if (value._bsontype || BufferLike(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === null || proto === Object.prototype || proto?.constructor?.name === 'Object';
}

function BufferLike(value) {
  return typeof Buffer !== 'undefined' && Buffer.isBuffer && Buffer.isBuffer(value);
}

function idToString(value) {
  try {
    return String(value);
  } catch {
    return '';
  }
}

/* Convert a value that flattenRecord must not recurse into (ObjectId,
   Decimal128, Buffer, BigInt) into something printable without losing the
   identifying value. */
function scalarObject(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) return value;
  if (isObjectIdLike(value)) return idToString(value);
  if (typeof value === 'object') {
    if (value._bsontype === 'Decimal128') return idToString(value);
    if (value._bsontype === 'Long') return idToString(value);
    if (BufferLike(value)) return '[binary data]';
    if (typeof value.toHexString === 'function') return value.toHexString();
  }
  return '';
}

function safeJson(value) {
  try {
    const text = JSON.stringify(value, (key, item) => {
      if (typeof item === 'bigint') return String(item);
      if (isObjectIdLike(item)) return idToString(item);
      if (item && item._bsontype === 'Decimal128') return idToString(item);
      if (item && item._bsontype === 'Long') return idToString(item);
      if (item && typeof item === 'object' && typeof item.toHexString === 'function') return item.toHexString();
      return item;
    });
    return text === undefined ? '' : text;
  } catch {
    try {
      return String(value);
    } catch {
      return '[unserialisable]';
    }
  }
}

function normalizeArray(value) {
  if (!Array.isArray(value) || value.length === 0) return '';
  if (value.every((item) => item === null || item === undefined || typeof item !== 'object')) {
    return value.map((item) => (item === null || item === undefined ? '' : String(item))).join(', ');
  }
  return safeJson(value);
}

/* Flatten one document to dot-paths. Date instances are kept as Date so the
   workbook can write a real date cell; everything else is a primitive. */
export function flattenRecord(record, options = {}, out = {}, depth = 0, ancestors = new Set()) {
  const { prefix = '', maxDepth = MAX_DEPTH } = options;
  if (!record || typeof record !== 'object') return out;
  if (ancestors.has(record)) {
    if (prefix) out[prefix] = '[circular]';
    return out;
  }
  if (depth > maxDepth) {
    if (prefix) out[prefix] = safeJson(record);
    return out;
  }
  ancestors.add(record);

  Object.keys(record).forEach((key) => {
    if (isInternalKey(key) || isSecretKey(key)) return;
    const value = record[key];
    const path = prefix ? `${prefix}.${key}` : key;

    if (value === null || value === undefined) {
      out[path] = '';
      return;
    }
    if (value instanceof Date) {
      out[path] = value;
      return;
    }
    if (Array.isArray(value)) {
      out[path] = normalizeArray(value);
      return;
    }
    if (typeof value === 'object') {
      if (!isPlainObject(value)) {
        out[path] = scalarObject(value);
        return;
      }
      if (Object.keys(value).length === 0) {
        out[path] = '';
        return;
      }
      if (depth >= maxDepth) {
        out[path] = safeJson(value);
        return;
      }
      flattenRecord(value, { prefix: path, maxDepth }, out, depth + 1, ancestors);
      return;
    }
    if (typeof value === 'bigint') {
      out[path] = String(value);
      return;
    }
    out[path] = value;
  });

  ancestors.delete(record);
  return out;
}

/* Words that should not be title-cased as if they were names. */
const ACRONYMS = new Map(Object.entries({
  id: 'ID', url: 'URL', uri: 'URI', api: 'API', sku: 'SKU', ean: 'EAN', upc: 'UPC',
  gst: 'GST', gstin: 'GSTIN', pan: 'PAN', cin: 'CIN', ifsc: 'IFSC', swift: 'SWIFT',
  hsn: 'HSN', uom: 'UOM', rsp: 'RSP', wsp: 'WSP', dp: 'DP', tds: 'TDS', tcs: 'TCS',
  msme: 'MSME', ssi: 'SSI', cgst: 'CGST', sgst: 'SGST', igst: 'IGST', ekyc: 'e-KYC',
  kyc: 'KYC', aadhaar: 'Aadhaar', aadhar: 'Aadhaar', po: 'PO', grc: 'GRC', grt: 'GRT',
  lr: 'LR', ecom: 'E-commerce', eccom: 'E-commerce', pdf: 'PDF', csv: 'CSV', xls: 'XLS',
  xlsx: 'XLSX', qty: 'Qty', amt: 'Amount', no: 'No', nos: 'Nos', sr: 'Sr',
}));

function words(segment) {
  return String(segment)
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/([a-zA-Z])([0-9])/g, '$1 $2')
    .replace(/([0-9])([a-zA-Z])/g, '$1 $2')
    .split(/[\s_\-.]+/)
    .filter(Boolean);
}

export function humanizeKey(path) {
  if (path === '_id') return 'Record ID';
  return String(path)
    .split('.')
    .flatMap((segment) => words(segment))
    .map((word) => {
      const lower = word.toLowerCase();
      if (ACRONYMS.has(lower)) return ACRONYMS.get(lower);
      /* A source label already written as a heading keeps its capitals. */
      if (word.length > 1 && word === word.toUpperCase() && /[A-Z]/.test(word)) return word;
      return lower.charAt(0).toUpperCase() + lower.slice(1);
    })
    .join(' ');
}

/* Identifier-shaped headers keep their value as text even if MongoDB stored a
   number. This is what stops a GST number, PAN, barcode, account number or
   mobile from turning into 9.88E+10 in Excel. */
const FORCE_TEXT_HEADER = /(gst|gstin|\bpan\b|\bcin\b|ifsc|swift|hsn|barcode|mobile|phone|landline|fax|account|aadhaar|pincode|zip|postal|code|\bno\b|number|\bid\b|reference|ref\b)/i;

export function headerShouldStayText(header) {
  return FORCE_TEXT_HEADER.test(String(header || ''));
}

function valueType(values) {
  let sawNumber = false;
  let sawDate = false;
  let sawBoolean = false;
  let sawOther = false;
  const ISO_DATE = /^\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/;
  values.forEach((value) => {
    if (value === '' || value === null || value === undefined) return;
    if (value instanceof Date) { sawDate = true; return; }
    if (typeof value === 'number' && Number.isFinite(value)) { sawNumber = true; return; }
    if (typeof value === 'boolean') { sawBoolean = true; return; }
    if (typeof value === 'string' && ISO_DATE.test(value) && !Number.isNaN(new Date(value).getTime())) {
      sawDate = true;
      return;
    }
    sawOther = true;
  });
  if (sawDate && !sawNumber && !sawBoolean && !sawOther) return 'date';
  if (sawBoolean && !sawNumber && !sawDate && !sawOther) return 'boolean';
  if (sawNumber && !sawDate && !sawBoolean && !sawOther) return 'number';
  if (!sawOther && sawNumber) return 'number';
  if (!sawOther && sawDate) return 'date';
  if (!sawOther && sawBoolean) return 'boolean';
  return 'text';
}

function labelFor(header) {
  return /\bID$/i.test(header)
    ? header.replace(/\s+ID$/i, '') + ' Name'
    : header + ' Label';
}

function uniqueHeader(base, used) {
  if (!used.has(base)) { used.add(base); return base; }
  let index = 2;
  while (used.has(`${base} (${index})`)) index += 1;
  const header = `${base} (${index})`;
  used.add(header);
  return header;
}

/* Build the union table.

   records  the full documents exactly as the API returned them
   labels   { objectIdString: readableLabel } from the list endpoint
   returns  { columns, rows } where columns[i] = { path, header, type }
            rows[r][i] is the cell value (Date/number/boolean/string/'')
*/
export function buildExportTable(records, options = {}) {
  const { labels = {}, includeLabels = true, maxColumns = MAX_COLUMNS } = options;
  const source = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  const flat = source.map((record) => flattenRecord(record));

  const seen = new Set();
  const paths = [];
  flat.forEach((row) => {
    Object.keys(row).forEach((path) => {
      if (seen.has(path) || paths.length >= maxColumns) return;
      seen.add(path);
      paths.push(path);
    });
  });

  /* Keep the record identity at the front, then preserve document order. */
  const rank = (path) => (path === '_id' ? 0 : path === 'businessId' ? 1 : path === 'contactId' ? 2 : 3);
  paths.sort((a, b) => rank(a) - rank(b));

  /* Find ObjectId columns that have a readable label. One companion column
     follows the id it belongs to; it never replaces the id. */
  const labelPaths = new Map();
  if (includeLabels && Object.keys(labels).length) {
    flat.forEach((row) => {
      paths.forEach((path) => {
        if (labelPaths.has(path)) return;
        const value = row[path];
        if (value && labels[String(value)]) labelPaths.set(path, labelFor(humanizeKey(path)));
      });
    });
  }

  const usedHeaders = new Set();
  const columns = [];
  paths.forEach((path) => {
    const header = uniqueHeader(humanizeKey(path), usedHeaders);
    columns.push({ path, header, type: 'text', isLabel: false });
    if (labelPaths.has(path)) {
      columns.push({
        path: `${path}__label`,
        header: uniqueHeader(labelPaths.get(path), usedHeaders),
        type: 'text',
        isLabel: true,
        labelFor: path,
      });
    }
  });

  /* Every column is classified over the whole batch, so a number is a number
     on every row and a date is a date even when most rows are blank. */
  columns.forEach((column) => {
    if (column.isLabel) { column.type = 'text'; return; }
    const values = flat.map((row) => row[column.path]);
    column.type = valueType(values);
    if (headerShouldStayText(column.header)) column.type = 'text';
  });

  const rows = flat.map((row) => columns.map((column) => {
    if (column.isLabel) return labels[String(row[column.labelFor])] || '';
    const value = row[column.path];
    if (value === null || value === undefined) return '';
    if (column.type === 'text') {
      if (value instanceof Date) return value;
      return typeof value === 'string' ? value : String(value);
    }
    return value;
  }));

  return { columns, rows, flat };
}

function sheetName(base, used) {
  let name = String(base || 'Sheet').replace(/[\\/?*[\]:]/g, ' ').trim().slice(0, 31) || 'Sheet';
  let candidate = name;
  let index = 2;
  while (used.has(candidate.toLowerCase())) {
    const suffix = ` ${index}`;
    candidate = name.slice(0, 31 - suffix.length) + suffix;
    index += 1;
  }
  used.add(candidate.toLowerCase());
  return candidate;
}

const RECORD_NAME_KEYS = ['businessName', 'name', 'title', 'itemName', 'printDescription', 'voucherNo', 'invoiceNo', 'contactId', 'code'];

function recordDisplayName(record, labels) {
  if (!record) return '';
  for (const key of RECORD_NAME_KEYS) {
    const value = record[key];
    if (value !== undefined && value !== null && value !== '') return String(value);
  }
  const id = record._id ? String(record._id) : '';
  return labels[id] || '';
}

/* Arrays of objects become their own worksheets: a purchase invoice's `items`
   are easier to read as rows than as one long JSON cell, and the parent's
   record id keeps every line tied to its document.

   Only top-level arrays are expanded. Nested arrays stay in the JSON cell of
   the parent sheet, which is the safe reading - expanding them would need a
   naming convention nobody could predict. */
export function extractArraySheets(records, options = {}) {
  const { labels = {}, maxItemsPerSheet = 20000, maxSheets = 12 } = options;
  const source = Array.isArray(records) ? records.filter((r) => r && typeof r === 'object') : [];
  const groups = new Map();

  source.forEach((record) => {
    Object.keys(record).forEach((key) => {
      if (isInternalKey(key) || isSecretKey(key)) return;
      const value = record[key];
      if (!Array.isArray(value) || value.length === 0) return;
      if (!value.some((item) => isPlainObject(item))) return;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push({ record, items: value });
    });
  });

  const usedNames = new Set();
  const sheets = [];
  for (const [key, entries] of groups) {
    if (sheets.length >= maxSheets) break;
    const flatItems = [];
    let truncated = false;
    entries.forEach(({ record, items }) => {
      const parentId = record._id ? String(record._id) : '';
      const parentName = recordDisplayName(record, labels);
      items.forEach((item) => {
        if (flatItems.length >= maxItemsPerSheet) { truncated = true; return; }
        flatItems.push({
          __parentId: parentId,
          __parentName: parentName,
          __value: isPlainObject(item) ? flattenRecord(item) : { value: typeof item === 'object' ? safeJson(item) : item },
        });
      });
    });
    if (!flatItems.length) continue;

    const seen = new Set();
    flatItems.forEach(({ __value }) => Object.keys(__value).forEach((path) => seen.add(path)));
    const itemPaths = [...seen];
    const usedHeaders = new Set();
    const columns = [
      { path: '__parentId', header: uniqueHeader('Record ID', usedHeaders), type: 'text' },
      { path: '__parentName', header: uniqueHeader('Record Name', usedHeaders), type: 'text' },
      ...itemPaths.map((path) => {
        const header = uniqueHeader(humanizeKey(path), usedHeaders);
        return { path, header, type: headerShouldStayText(header) ? 'text' : valueType(flatItems.map((entry) => entry.__value[path])) };
      }),
    ];
    const rows = flatItems.map(({ __parentId, __parentName, __value }) => columns.map((column) => {
      if (column.path === '__parentId') return __parentId;
      if (column.path === '__parentName') return __parentName;
      const value = __value[column.path];
      if (value === null || value === undefined) return '';
      if (column.type === 'text') return value instanceof Date ? value : String(value);
      return value;
    }));

    sheets.push({
      name: sheetName(humanizeKey(key), usedNames),
      sourceKey: key,
      columns,
      rows,
      truncated,
    });
  }
  return sheets;
}

export function toFileBase(title) {
  return String(title || 'Export')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/[\s-]+/g, '_')
    .slice(0, 80) || 'Export';
}

export function fullExportFilename(title) {
  return `${toFileBase(title)}_Full_Export.xlsx`;
}
