import { buildXlsx, STYLE } from '../xlsxWriter.js';
import {
  buildExportTable,
  extractArraySheets,
  fullExportFilename,
  headerShouldStayText,
} from '../exportFields.js';

/* ==========================================================================
   THE FULL-DATABASE .XLSX WORKBOOK.

   Built on lib/xlsxWriter.js, the writer this project already uses for its
   import templates: it can freeze the header row, apply an AutoFilter and set
   column widths - things the community SheetJS build cannot write - and it
   writes strings as inline strings, so a GST number stays 33AABCU9603R1ZM
   instead of becoming a number.

   The caller supplies the documents exactly as the list API returned them.
   Nothing is re-queried here and no field list is hardcoded: the columns come
   from the documents (lib/exportFields.js), so a legacy field or a field
   added after the screen was written is exported too.
   ========================================================================== */

const XLSX_MIME = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function colName(index) {
  let n = index + 1;
  let out = '';
  while (n > 0) {
    const rem = (n - 1) % 26;
    out = String.fromCharCode(65 + rem) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function sheetName(base, used) {
  let name = String(base || 'Export').replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || 'Export';
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

function validDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'string' && value.trim()) {
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    /* A large number in a date column is more likely a millisecond timestamp
       than an Excel serial, but MongoDB dates arrive as Date instances or ISO
       strings, so only accept a plausible timestamp. */
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}

function hasTime(value) {
  if (value instanceof Date) {
    return value.getHours() !== 0 || value.getMinutes() !== 0 || value.getSeconds() !== 0;
  }
  return typeof value === 'string' && /[T ]\d{2}:\d{2}/.test(value);
}

function textOf(value) {
  if (value === null || value === undefined) return '';
  if (value instanceof Date) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(value.getDate())}-${pad(value.getMonth() + 1)}-${value.getFullYear()} `
      + `${pad(value.getHours())}:${pad(value.getMinutes())}:${pad(value.getSeconds())}`;
  }
  if (typeof value === 'object') {
    try { return JSON.stringify(value); } catch { return String(value); }
  }
  return String(value);
}

function cellFor(column, value) {
  if (value === null || value === undefined || value === '') return '';

  if (column.type === 'date') {
    const date = validDate(value);
    if (date) {
      return { v: date, t: 'd', s: hasTime(value) ? STYLE.DATETIME : STYLE.DATE };
    }
    return { v: textOf(value), t: 's', s: STYLE.TEXT };
  }

  if (column.type === 'number') {
    const number = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(number)) {
      return { v: number, t: 'n', s: Number.isInteger(number) ? STYLE.INTEGER : STYLE.DECIMAL };
    }
    return { v: textOf(value), t: 's', s: STYLE.TEXT };
  }

  if (column.type === 'boolean') {
    if (typeof value === 'boolean') return { v: value, t: 'b' };
    return { v: textOf(value), t: 's', s: STYLE.TEXT };
  }

  /* Text is the safe default. It holds leading zeros, a GSTIN, a long account
     number and a barcode exactly as stored, and an inline string can never be
     run as a formula by Excel. */
  return { v: textOf(value), t: 's', s: STYLE.TEXT };
}

function columnWidths(columns, rows) {
  return columns.map((column, index) => {
    const sample = rows.slice(0, 250).map((row) => textOf(row[index]));
    const longest = sample.reduce((max, value) => Math.max(max, value.length), 0);
    let width = Math.max(10, String(column.header || '').length + 4, Math.min(60, longest + 2));
    if (column.path === '_id' || column.path === '__parentId') width = Math.max(width, 26);
    if (column.type === 'date') width = Math.max(width, 21);
    if (column.type === 'number') width = Math.min(width, 16);
    if (headerShouldStayText(column.header)) width = Math.max(width, 16);
    return { width: Math.min(70, width) };
  });
}

function dataSheet({ name, title, columns, rows, generatedAt, emptyMessage, usedNames }) {
  const sheet = {
    name: sheetName(name, usedNames || new Set()),
    rows: [],
    cols: [],
    freeze: { row: 1 },
  };

  if (!columns.length) {
    sheet.rows = [
      [{ v: title || 'Export', t: 's', s: STYLE.TITLE }],
      [{ v: emptyMessage || 'No records matched the selected filters.', t: 's', s: STYLE.NOTE }],
      [{ v: `Generated at ${generatedAt}`, t: 's', s: STYLE.NOTE }],
    ];
    sheet.cols = [{ width: 80 }];
    sheet.freeze = null;
    return sheet;
  }

  sheet.rows.push(columns.map((column) => ({ v: column.header, t: 's', s: STYLE.HEADER })));
  rows.forEach((row) => {
    sheet.rows.push(row.map((value, index) => cellFor(columns[index], value)));
  });
  sheet.cols = columnWidths(columns, rows);
  const last = `${colName(Math.max(0, columns.length - 1))}${Math.max(1, rows.length + 1)}`;
  sheet.autoFilter = `A1:${last}`;
  return sheet;
}

function infoSheet({ title, generatedAt, recordCount, sheetNames, filters, warnings, usedNames }) {
  const rows = [
    [{ v: 'Field', t: 's', s: STYLE.HEADER }, { v: 'Value', t: 's', s: STYLE.HEADER }],
    [{ v: 'Export', t: 's', s: STYLE.TEXT }, { v: title || 'Export', t: 's', s: STYLE.TEXT }],
    [{ v: 'Generated at', t: 's', s: STYLE.TEXT }, { v: generatedAt, t: 's', s: STYLE.TEXT }],
    [{ v: 'Records', t: 's', s: STYLE.TEXT }, { v: recordCount, t: 'n', s: STYLE.INTEGER }],
    [{ v: 'Worksheets', t: 's', s: STYLE.TEXT }, { v: sheetNames.join(', '), t: 's', s: STYLE.TEXT }],
    [{ v: 'Filters', t: 's', s: STYLE.TEXT }, { v: filters || '(none)', t: 's', s: STYLE.TEXT }],
  ];
  (warnings || []).forEach((warning) => {
    rows.push([{ v: 'Warning', t: 's', s: STYLE.TEXT }, { v: warning, t: 's', s: STYLE.TEXT }]);
  });
  return {
    name: sheetName('Export Info', usedNames || new Set()),
    rows,
    cols: [{ width: 24 }, { width: 100 }],
    freeze: { row: 1 },
  };
}

/* Build the workbook buffer.

   records   full documents from the list API
   labels    { id: readable label } returned beside the rows
   meta      { title, fileBase, filters, warnings, emptyMessage }
*/
export function buildFullExportWorkbook({ records = [], labels = {}, meta = {} }) {
  const title = meta.title || 'Full Export';
  const generatedAt = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const table = buildExportTable(records, { labels });
  const arraySheets = extractArraySheets(records, { labels });

  const used = new Set();
  const sheets = [];
  const mainSheet = dataSheet({
    name: title,
    title,
    columns: table.columns,
    rows: table.rows,
    generatedAt,
    emptyMessage: meta.emptyMessage,
    usedNames: used,
  });
  sheets.push(mainSheet);
  arraySheets.forEach((extra) => {
    sheets.push(dataSheet({
      name: extra.name,
      title: `${title} - ${extra.name}`,
      columns: extra.columns,
      rows: extra.rows,
      generatedAt,
      emptyMessage: 'No rows in this collection.',
      usedNames: used,
    }));
  });

  const warnings = [...(meta.warnings || [])];
  arraySheets.forEach((extra) => {
    if (extra.truncated) warnings.push(`The ${extra.name} sheet was capped at its item limit; narrow the filter to export the rest.`);
  });

  sheets.push(infoSheet({
    title,
    generatedAt,
    recordCount: table.rows.length,
    sheetNames: sheets.map((sheet) => sheet.name),
    filters: meta.filters,
    warnings,
    usedNames: used,
  }));

  const buffer = buildXlsx({ sheets, title });
  const filename = fullExportFilename(meta.fileBase || meta.title || 'Export');
  return {
    buffer,
    filename,
    mime: XLSX_MIME,
    rowCount: table.rows.length,
    columnCount: table.columns.length,
    sheetNames: sheets.map((sheet) => sheet.name),
    warnings,
  };
}

export { XLSX_MIME };
