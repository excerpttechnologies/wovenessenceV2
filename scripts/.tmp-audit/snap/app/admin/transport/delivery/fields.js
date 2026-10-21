/* Delivery / LR Transaction - field spec and freight maths.

   Plain module so the API routes can import the same rules the dialog uses:
   the totals shown while typing and the totals actually stored must agree. */

/* Goods transport is 5% GST by default. The rate can be changed per delivery
  when GST is applicable. */
export const GST_RATE = 5;

export const FIELDS = [
  /* TRANSACTION INFO */
  { k: 'transactionNo', label: 'Transaction No', type: 'text' },
  { k: 'document', label: 'Upload Document / Image', type: 'file', accept: 'image/*,.pdf,.doc,.docx' },
  /* Native pickers, so both carry the browser's calendar. The masked
     DD/MM/YYYY text boxes they replaced had to be typed by hand.

     Transaction Date is a datetime: it opens on the current date AND time -
     the moment the dialog was opened, which is what the old read-only
     "Opened At" box used to show - and both halves stay editable. */
  { k: 'transactionDate', label: 'Transaction Date', type: 'datetime', def: 'now', req: true },
  { k: 'transporterId', label: 'Transporter', type: 'ref', ref: 'transporter', req: true },
  { k: 'lrNumber', label: 'LR Number', type: 'text', req: true },
  { k: 'bookingDate', label: 'Booking Date', type: 'date', req: true },

  /* SUPPLIER / PARCEL INFO */
  /* The supplier dropdown already appends (G-code) to every option label via
     /api/options codeField:'contactId', so the G Code is visible in the
     picker itself — no separate field needed. */
  { k: 'supplierId', label: 'Supplier Name', type: 'ref', ref: 'supplier', req: true },
  { k: 'invPmNumber', label: 'Inv / PM Number', type: 'text', req: true },
  { k: 'parcelQty', label: 'Parcel Qty', type: 'number', req: true },
  { k: 'value', label: 'Value', type: 'number' },

  /* FREIGHT DETAILS */
  { k: 'freightAmount', label: 'Freight Amount', type: 'number', req: true },
  { k: 'gstApplicable', label: 'GST Applicable?', type: 'radio', def: 'No', opts: [{ v: 'Yes', l: 'Yes' }, { v: 'No', l: 'No' }] },
  { k: 'gstRate', label: 'Input GST (%)', type: 'number', def: GST_RATE },
  { k: 'autoCharges', label: 'Auto Charges', type: 'number' },
  { k: 'tips', label: 'Tips', type: 'number' },
];

/* These values are derived on save, so they are not part of FIELDS above. */
export const DERIVED_FIELDS = [
  { k: 'inputCgst', label: 'Input CGST', type: 'number' },
  { k: 'inputSgst', label: 'Input SGST', type: 'number' },
  { k: 'totalFreight', label: 'Total Freight', type: 'number' },
];

export function freightBreakdown(data) {
  const freight = Number(data?.freightAmount) || 0;
  const applicable = String(data?.gstApplicable || 'No') === 'Yes';
  const rate = applicable ? Math.max(0, Number(data?.gstRate) || 0) : 0;

  const half = round2((freight * rate) / 200);

  return {
    gstRate: rate,
    inputCgst: half,
    inputSgst: half,
    totalFreight: round2(freight + half * 2),
  };
}

function round2(n) {
  return Math.round((Number(n) || 0) * 100) / 100;
}

/* Days between booking and the transaction being raised. The deployed list
   shows this as a small coloured bar; anything beyond a few days is worth
   flagging. */
export function bookingDelayDays(row) {
  if (!row?.bookingDate || !row?.transactionDate) return null;
  const from = new Date(row.bookingDate);
  const to = new Date(row.transactionDate);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  /* Whole CALENDAR days, not elapsed milliseconds. Transaction Date carries a
     clock time and Booking Date does not, so a same-day booking would
     otherwise measure ~0.9 days and round up to "1 day". */
  const day = (d) => Date.UTC(d.getFullYear(), d.getMonth(), d.getDate());
  return Math.max(0, Math.round((day(to) - day(from)) / 86400000));
}

export function delayTone(days) {
  if (days === null) return 'grey';
  if (days <= 2) return 'green';
  if (days <= 5) return 'blue';
  return 'red';
}
