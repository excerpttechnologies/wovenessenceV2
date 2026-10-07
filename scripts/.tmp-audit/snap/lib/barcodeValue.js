/* THE barcode value of a GRC barcode - one string, made one way, used
   everywhere: what the bars encode, the line printed under them, the stored
   barcodeNo, what the Barcode Generation grid shows and what the till scans.

     SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY          e.g. "G1318 * 05178 * 1 * 16"

     SUPPLIER_CODE  the GRC supplier's code (Contact.contactId), e.g. G1318
     GRC_NUMBER     the GRC number without its "GRC " display prefix: 05178
     SEQ            the barcode's own running number within its GRC - 1, 2,
                    3 ... - given when the barcode is created, never reused
     QTY            the quantity of that same barcode's line, never the GRC's
                    total

   Pure and client-safe. The save route (app/api/barcode-generation) makes the
   stored value with it; the grid shows a row's value with it before the row is
   saved; printing reads the stored value and nothing else. */

export const BARCODE_SEPARATOR = ' * ';

/* "GRC 05178" -> "05178" */
export function grcNumberForBarcode(grcNumber) {
  return String(grcNumber ?? '').trim().replace(/^GRC\s*/i, '').trim();
}

/* A quantity as its plain number - "16.00" and "16" are one value, "12.5"
   stays "12.5". Text that is not a number is kept as it is. */
export function qtyForBarcode(qty) {
  const text = String(qty ?? '').trim();
  return text !== '' && Number.isFinite(Number(text)) ? String(Number(text)) : text;
}

/* The value - or '' when any part is missing, never a shorter string that
   looks like a value. */
export function composeBarcodeValue({ supplierCode, grcNumber, seq, qty } = {}) {
  const parts = [
    String(supplierCode ?? '').trim(),
    grcNumberForBarcode(grcNumber),
    String(seq ?? '').trim(),
    qtyForBarcode(qty),
  ];
  return parts.every((part) => part !== '') ? parts.join(BARCODE_SEPARATOR) : '';
}

/* Why a GRC cannot give its barcodes a value, or '' when it can. */
export function barcodeValueProblem({ supplierCode, grcNumber } = {}) {
  if (!String(supplierCode ?? '').trim()) {
    return "This GRC's supplier has no supplier code, so its barcodes (SUPPLIER CODE * GRC NUMBER * SEQ * QTY) cannot be generated. "
      + 'Give the supplier a code in the contact master, or choose the supplier on the GRC, and submit again.';
  }
  if (!grcNumberForBarcode(grcNumber)) {
    return 'This GRC has no GRC number, so its barcodes (SUPPLIER CODE * GRC NUMBER * SEQ * QTY) cannot be generated.';
  }
  return '';
}

const seqOf = (value) => (/^\d+$/.test(String(value ?? '').trim()) ? Number(value) : 0);

/* The highest SEQ among some barcodes (0 for none). */
export function highestSeq(units) {
  return (Array.isArray(units) ? units : []).reduce((max, unit) => Math.max(max, seqOf(unit?.seq)), 0);
}

/* The SEQ the next new barcode of a GRC takes: after the highest SEQ its
   barcodes carry; after the highest it ever gave (`floor` - the GRC keeps it
   as lastBarcodeSeq, so the value of a deleted barcode, whose label may still
   exist, is never given out again); and never below the number of barcodes it
   holds - barcodes made before SEQ was stored carry none, and 1 up to that
   count is left for them. */
export function nextSeqStart(units, floor = 0) {
  const list = Array.isArray(units) ? units : [];
  return Math.max(highestSeq(list), list.length, Number(floor) || 0) + 1;
}

/* Whether a stored barcode's value was composed by this rule - it carries a
   SEQ and its value starts "SUPPLIER_CODE * GRC_NUMBER * SEQ * ". A barcode
   made before (a number from the old Barcode Setting counter, "9A1135") does
   not, and keeps the number printed on it. */
export function hasComposedBarcode(row, { supplierCode, grcNumber } = {}) {
  const seq = seqOf(row?.seq);
  if (!seq) return false;
  const stem = [String(supplierCode ?? '').trim(), grcNumberForBarcode(grcNumber), String(seq)].join(BARCODE_SEPARATOR) + BARCODE_SEPARATOR;
  return String(row?.barcodeNo || row?.barcodeGenerated || '').startsWith(stem);
}
