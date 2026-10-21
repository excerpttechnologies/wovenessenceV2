// /* Form fields for Barcode Settings.
//    Lives beside the pages that use it - not in a global registry. */

// export const FIELDS = [
//     { k: "type", label: "Barcode Type", type: "radio", req: true, def: "Periodic", opts: [{"v":"Periodic","l":"Periodic"},{"v":"Item Wise","l":"Item Wise"}] },
//     { k: "subType", label: "Barcode Sub Type", type: "radio", req: true, def: "Monthly", opts: [{"v":"Monthly","l":"Monthly"},{"v":"Quarterly","l":"Quarterly"},{"v":"Yearly","l":"Yearly"}] },
//   ];

// export const PERIOD_FIELDS = [
//     { k: "prefix", label: "Prefix", type: "text" },
//     { k: "suffix", label: "Suffix", type: "text" },
//     { k: "startNumber", label: "Start Number", type: "number", req: true },
//     { k: "numberLenght", label: "Number Lenght", type: "number", req: true },
//     { k: "sampleBarcode", label: "Sample Barcode", type: "text", req: true },
//     { k: "effectiveDate", label: "Effective Date", type: "date", req: true },
//     { k: "expiryDate", label: "Expiry Date", type: "date", req: true },
//   ];

// export const NOTE = ["Copy & Clear buttons helps you avoid repetitive data entry.","* Copy Button to copy barcode settings from the first period to all remaining periods. (Prefix, Suffix, Length, Start Number, Sample Barcode)","* Clear Button to clear these settings for all periods.","* This option is available only for Monthly and Quarterly barcode configurations."];







/* Barcode Settings - field specs and period maths.

   Shared by the page, the add/edit forms and the API routes, so the client
   and the server agree on what a period is and which fields are required.
   Plain module (no 'use client'), so a route handler can import it too. */

export const TYPE_OPTS = [
  { v: 'Periodic', l: 'Periodic' },
  { v: 'Item Wise', l: 'Item Wise' },
];

export const SUBTYPE_OPTS = [
  { v: 'Monthly', l: 'Monthly' },
  { v: 'Quarterly', l: 'Quarterly' },
  { v: 'Yearly', l: 'Yearly' },
];

/* The header pair that applies to every period in one submission. */
export const HEADER_FIELDS = [
  { k: 'type', label: 'Barcode Type', type: 'select', req: true, def: 'Periodic', opts: TYPE_OPTS },
  { k: 'subType', label: 'Barcode Sub Type', type: 'select', req: true, def: 'Monthly', opts: SUBTYPE_OPTS },
];

/* One period row. Prefix and Suffix are optional; the rest are required, and
   Sample Barcode is derived rather than typed (readonly on screen). */
export const PERIOD_FIELDS = [
  { k: 'prefix', label: 'Prefix', type: 'text' },
  { k: 'suffix', label: 'Suffix', type: 'text' },
  { k: 'startNumber', label: 'Start Number', type: 'number', req: true },
  { k: 'numberLenght', label: 'Number Lenght', type: 'number', req: true },
  { k: 'sampleBarcode', label: 'Sample Barcode', type: 'text', req: true, readOnly: true },
  { k: 'effectiveDate', label: 'Effective Date', type: 'date', req: true },
  { k: 'expiryDate', label: 'Expiry Date', type: 'date', req: true },
];

/* Fields the API validates and stores per row - the period plus the header
   pair, since every stored row carries its own type/subType. */
export const ROW_FIELDS = [
  ...HEADER_FIELDS.map((f) => ({ ...f, type: 'text' })),
  { k: 'periodLabel', label: 'Period', type: 'text' },
  { k: 'periodIndex', label: 'Period No', type: 'number' },
  ...PERIOD_FIELDS,
];

export const NOTE = [
  'Copy Button to copy barcode settings from the first period to all remaining periods. (Prefix, Suffix, Length, Start Number, Sample Barcode)',
  'Clear Button to clear these settings for all periods.',
  'This option is available only for Monthly and Quarterly barcode configurations.',
];

/* Copy / Clear only apply where there is more than one period to fill. */
export const canCopy = (subType) => subType === 'Monthly' || subType === 'Quarterly';

/* Which period fields Copy propagates and Clear empties. Dates are excluded:
   they are derived from the financial year and differ per period. */
export const COPY_KEYS = ['prefix', 'suffix', 'startNumber', 'numberLenght', 'sampleBarcode'];

const iso = (d) => {
  const p = (n) => String(n).padStart(2, '0');
  return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
};

/* Indian financial year: 1 April -> 31 March. '2026-2027' -> starts 2026. */
export function fyStartYear(finYear) {
  const [a] = String(finYear || '').split('-');
  return Number(a) || new Date().getFullYear();
}

export function periodCount(subType) {
  if (subType === 'Monthly') return 12;
  if (subType === 'Quarterly') return 4;
  return 1;
}

/* Builds the blank period rows for a sub type, pre-filled with the date range
   each one covers. Monthly gives 12 blocks starting at April, Quarterly 4,
   Yearly a single 01-04 -> 31-03 block. */
export function buildPeriods(subType, finYear) {
  const y = fyStartYear(finYear);
  const n = periodCount(subType);
  const step = subType === 'Monthly' ? 1 : subType === 'Quarterly' ? 3 : 12;

  return Array.from({ length: n }, (_, i) => {
    const from = new Date(y, 3 + i * step, 1);
    /* day 0 of the following month is the last day of this period */
    const to = new Date(y, 3 + i * step + step, 0);
    return {
      periodIndex: i + 1,
      periodLabel: String(subType).toUpperCase() + ' ' + (i + 1),
      prefix: '',
      suffix: '',
      startNumber: '',
      numberLenght: '',
      sampleBarcode: '',
      effectiveDate: iso(from),
      expiryDate: iso(to),
    };
  });
}

/* Sample Barcode is never typed - it is prefix + the start number padded to
   Number Lenght + suffix, which is what the deployed list shows (prefix 4A,
   start 1000, length 4 -> 4A1000). */
export function sampleBarcode(p) {
  const start = String(p?.startNumber ?? '').trim();
  if (!start) return '';
  const len = Number(p?.numberLenght) || 0;
  const body = start.length >= len ? start : start.padStart(len, '0');
  return String(p?.prefix ?? '').trim() + body + String(p?.suffix ?? '').trim();
}

/* Label used wherever a barcode setting appears in a dropdown. */
export function rowName(row) {
  const label = row?.periodLabel || row?.subType || 'BARCODE';
  const sample = row?.sampleBarcode ? ' (' + row.sampleBarcode + ')' : '';
  return label + sample;
}