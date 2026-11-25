/* THE barcode value of a GRC barcode - one string, made one way, used
   everywhere: what the bars encode, the line printed beside them, the stored
   barcodeGenerated, what the Barcode Generation grid shows and what the till
   scans. barcodeNo is NOT this value: it is the unit's own counter number
   ("9A1135"), printed on the left of the label.

      SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * QUANTITY   e.g. "G512 * 05173 * 5 * 14"

      SUPPLIER_CODE  the GRC supplier's code (Contact.contactId), e.g. G512
      GRC_NUMBER     the GRC number without its "GRC " display prefix: 05173
      BILL_SL_NO     the bill line this item was received on: barcodeLabel.billSlNo
      QUANTITY       the quantity of the barcode (or serial number if quantity is missing)

   A barcode made before this change keeps the value it was printed with. */

export const BARCODE_SEPARATOR = ' * ';

/* "GRC 05178" -> "05178" */
export function grcNumberForBarcode(grcNumber) {
  return String(grcNumber ?? '').trim().replace(/^GRC\s*/i, '').trim();
}

/* A Bill Sl No. as the value writes it: the operator's own text, trimmed.

   Kept verbatim rather than put through Number(), so a bill line entered
   "007" is carried as "007". The value has to read back as the number the
   Item Summary shows against that item, not as this module's idea of it. */
export function billSlNoForBarcode(billSlNo) {
  return String(billSlNo ?? '').trim();
}

/* A Serial No. as the value writes it: the operator's own text, trimmed.

   Kept verbatim rather than put through Number(), so a serial entered
   "007" is carried as "007". */
export function serialNoForBarcode(serialNo) {
  return String(serialNo ?? '').trim();
}

/* Quantity for the barcode: formatted cleanly without extraneous decimals if integer. */
export function qtyForBarcode(qty) {
  if (qty === null || qty === undefined) return '';
  const s = String(qty).trim();
  if (s === '') return '';
  const n = Number(s);
  return !Number.isNaN(n) ? String(n) : s;
}

/* The value AS STORED - or '' when any part is missing, never a shorter
   string that looks like a value. The fourth part is the barcode's quantity
   (or serial number if quantity is not available).

   SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * QUANTITY */
export function composeBarcodeValue({ supplierCode, grcNumber, referenceCode, billSlNo, serialNo, seq, qty, quantity } = {}) {
  const qtyPart = qtyForBarcode(qty ?? quantity);
  const fourthPart = qtyPart !== '' ? qtyPart : (serialNoForBarcode(serialNo) || serialNoForBarcode(seq));
  const parts = [
    String(supplierCode ?? '').trim(),
    grcNumberForBarcode(grcNumber) || grcNumberForBarcode(referenceCode),
    billSlNoForBarcode(billSlNo),
    fourthPart,
  ];
  return parts.every((part) => part !== '') ? parts.join(BARCODE_SEPARATOR) : '';
}

/* ==========================================================================
   THE CANONICAL BARCODE VALUE - one string for the bars AND the text.

      stored      "G1319 * 05182 * 1 * 6"   (barcodeGenerated, spaces and all)
      canonical   "G1319*05182*1*6"         what the bars encode, what the
                                            label prints beside them, what the
                                            preview, the picker and the print
                                            page show, and what a scanner
                                            reads back

   The two are one value in two spellings. The stored spelling is left alone
   (1,300 printed values and every script read it that way); everything that
   is DRAWN goes through canonicalBarcodeValue, and everything that LOOKS A
   SCAN UP goes through barcodeSpellings, which accepts either. So a label
   can never encode one string while printing another, and a label printed
   today scans back to the record it was printed from.
   ========================================================================== */

const SEPARATOR_RX = /\s*\*\s*/g;

/* "G1319 * 05182 * 1 * 6" -> "G1319*05182*1*6". A value with no separator
   (a counter number such as "9A1135") comes back trimmed and otherwise as it
   was. */
export function canonicalBarcodeValue(value) {
  return String(value ?? '').trim().replace(SEPARATOR_RX, '*');
}

/* The four parts of a composed value, or null when the string is not one.
   Either spelling is accepted. */
export function parseBarcodeValue(value) {
  const text = canonicalBarcodeValue(value);
  if (!text.includes('*')) return null;
  const parts = text.split('*');
  if (parts.length !== 4 || parts.some((part) => part === '' || /\s/.test(part))) return null;
  const [supplierCode, grcNumber, billSlNo, serialNo] = parts;
  return { supplierCode, grcNumber, billSlNo, serialNo, qty: serialNo };
}

/* Whether a string is a composed SUPPLIER*GRC*BILL*SERIAL value. */
export function isComposedBarcodeValue(value) {
  return parseBarcodeValue(value) !== null;
}

/* THE generator: the canonical value for these four parts, or '' when any
   is missing. Same parts, same rule as composeBarcodeValue - only the
   spelling differs - so the stored value and the drawn value cannot drift. */
export function generateBarcodeValue(parts = {}) {
  return canonicalBarcodeValue(composeBarcodeValue(parts));
}

/* The composed value a barcode record carries, canonical, or ''.

   barcodeGenerated first - that is where a composed value lives. barcodeNo
   only when IT holds a composed value: some rows written before the two
   fields were split carry the composed value there and a copy of it in
   barcodeGenerated, or only there. A counter number is never returned. */
export function composedValueOf(row) {
  const generated = row?.barcodeGenerated;
  if (isComposedBarcodeValue(generated)) return canonicalBarcodeValue(generated);
  const number = row?.barcodeNo;
  if (isComposedBarcodeValue(number)) return canonicalBarcodeValue(number);
  return '';
}

/* The unit's own number ("9A1135") a barcode record carries, or ''.
   Never a composed value - a row that has only a composed value has no
   number of its own, and nothing is invented for it. */
export function unitNumberOf(row) {
  for (const candidate of [row?.barcodeNo, row?.barcodeGenerated]) {
    const text = String(candidate ?? '').trim();
    if (text && !isComposedBarcodeValue(text)) return text;
  }
  return '';
}

/* What the bars of a record encode: the unit's own generated barcode number
   (barcodeNo, e.g. "11A1833"), so scanning returns barcodeNo. The internal
   generated reference (e.g. "G1333*05393*3*1") is preserved for human-readable
   reference line 3, never encoded into the barcode graphic. */
export function encodedBarcodeValue(row) {
  return unitNumberOf(row) || composedValueOf(row) || String(row?.barcodeNo || row?.barcode || '');
}

/* The exact strings a scanned or typed code may be stored as - for an
   indexed `$in`, never a regex. A counter number is only itself; a composed
   value is looked for in its typed, canonical and stored spellings.

   A label payload may carry MORE than the bare value - the 90x68 ZPL label
   encodes PRODUCT_ID * COST_CODE * RSP after the unit number or composed
   reference. For a code with three or more '*' parts - but never exactly
   four, which IS a composed value - the prefixes are added too (each with
   its spaced spelling), so scanning the full payload still finds the unit
   by its own number or composed value. A four-part code's lookup is
   unchanged. */
export function barcodeSpellings(code) {
  const raw = String(code ?? '').trim();
  if (!raw) return [];
  if (!raw.includes('*')) return [raw];
  const canonical = canonicalBarcodeValue(raw);
  const spaced = (s) => s.split('*').join(BARCODE_SEPARATOR);
  const out = new Set([raw, canonical, spaced(canonical)]);
  const parts = canonical.split('*').filter((part) => part !== '');
  if (parts.length >= 3 && parts.length !== 4) {
    for (let i = 1; i < parts.length; i += 1) {
      const prefix = parts.slice(0, i).join('*');
      out.add(prefix);
      out.add(spaced(prefix));
    }
  }
  return [...out];
}

/* The one key two spellings of a value compare equal under. */
export function barcodeKey(value) {
  return canonicalBarcodeValue(value);
}

/* Whether two strings are the same barcode in either spelling. */
export function sameBarcode(a, b) {
  const key = barcodeKey(a);
  return key !== '' && key === barcodeKey(b);
}

/* Whether a barcode record answers to a scanned code - its own number, its
   composed value (either spelling) or its old barcode. */
export function unitAnswersTo(unit, code) {
  return [unit?.barcodeNo, unit?.barcodeGenerated, unit?.oldBarcode].some((value) => sameBarcode(value, code));
}

/* A regex SOURCE for the free-text barcode searches: the typed text,
   escaped, with every "*" allowed to carry spaces either side - so
   "G1319*05182" finds "G1319 * 05182 * 1 * 6" and the other way round. */
export function barcodeSearchPattern(text) {
  const escape = (part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return String(text ?? '').trim().split(SEPARATOR_RX).map(escape).join('\\s*\\*\\s*');
}

/* Why a GRC cannot give its barcodes a value, or '' when it can. */
export function barcodeValueProblem({ supplierCode, grcNumber } = {}) {
  if (!String(supplierCode ?? '').trim()) {
    return "This GRC's supplier has no supplier code, so its barcodes (SUPPLIER CODE * GRC NUMBER * BILL SL NO * SERIAL NO) cannot be generated. "
      + 'Give the supplier a code in the contact master, or choose the supplier on the GRC, and submit again.';
  }
  if (!grcNumberForBarcode(grcNumber)) {
    return 'This GRC has no GRC number, so its barcodes (SUPPLIER CODE * GRC NUMBER * BILL SL NO * SERIAL NO) cannot be generated.';
  }
  return '';
}

/* Why ONE row cannot have a value, or '' when it can.

   The Bill Sl No. is the one part of the value the operator enters
   themselves, so a missing one is said in their terms: which item, and which
   column to fill in. Nothing is guessed in its place - not the quantity, not
   the row's position in the grid, not the barcode's own serial. A guess would
   put a wrong bill line on the goods, and the sticker outlives the screen. */
export function billSlNoProblem(row) {
  if (billSlNoForBarcode(row && row.billSlNo)) return '';
  const item = String((row && (row.itemCode || row.itemName)) || '').trim() || 'A row';
  return item + ' has no Bill Sl No., so its barcode value '
    + '(SUPPLIER CODE * GRC NUMBER * BILL SL NO * SERIAL NO) cannot be made. Enter the Bill Sl No. '
    + "this item is received on - the GRC's Item Summary shows it - and submit again. "
    + 'Nothing was saved.';
}

/* Why ONE row cannot have a Serial No., or '' when it can. */
export function serialNoProblem(row) {
  if (serialNoForBarcode(row && row.serialNo)) return '';
  const item = String((row && (row.itemCode || row.itemName)) || '').trim() || 'A row';
  return item + ' has no Serial No., so its barcode value '
    + '(SUPPLIER CODE * GRC NUMBER * BILL SL NO * SERIAL NO) cannot be made. '
    + 'Nothing was saved.';
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

/* The Serial No. a stored barcode's VALUE carries - the fourth part of its
   composed value - or '' when it has none that belongs to its Bill Sl No.

   Read off the value, not off the serialNo field. Every barcode saved before
   2026-09-17 has serialNo = its Bill Sl No. (an old fallback copied one into
   the other), and every value composed before then carries the GRC-wide SEQ
   in its fourth place. The value is what is printed on the goods, so it is
   the only answer to "which serials are taken on this bill line". */
export function serialNoOfUnit(unit) {
  const parts = parseBarcodeValue(unit?.barcodeGenerated) || parseBarcodeValue(unit?.barcodeNo);
  if (!parts) return '';
  if (parts.billSlNo !== billSlNoForBarcode(unit?.billSlNo)) return '';
  return parts.serialNo;
}

/* The highest SERIAL_NO taken on a Bill Sl No. among some barcodes (0 for none). */
export function highestSerialNo(units, billSlNo) {
  const targetBillSlNo = billSlNoForBarcode(billSlNo);
  if (!targetBillSlNo) return 0;
  return (Array.isArray(units) ? units : [])
    .filter((unit) => billSlNoForBarcode(unit?.billSlNo) === targetBillSlNo)
    .reduce((max, unit) => Math.max(max, seqOf(serialNoOfUnit(unit))), 0);
}

/* The next Serial No. for a Bill Sl No.: after every serial its barcodes
   carry, and after `floor` - the highest the GRC ever gave on that line
   (serialFloorOf), so the value of a deleted barcode, whose label may still
   be on the goods, is never given out again. */
export function nextSerialNo(units, billSlNo, floor = 0) {
  return Math.max(highestSerialNo(units, billSlNo), Number(floor) || 0) + 1;
}

/* The key a Bill Sl No. is stored under in grc.lastSerialByBill. A MongoDB
   field name may not contain "." or start with "$". */
export function serialFloorKey(billSlNo) {
  return 'b' + billSlNoForBarcode(billSlNo).replace(/[.$]/g, '_');
}

/* The highest Serial No. a GRC has ever given on a Bill Sl No.

   grc.lastSerialByBill remembers every line's highest, from the first save
   that numbered serials per line. A GRC saved before that has no map; its
   values were numbered by one GRC-wide SEQ, and lastBarcodeSeq is the
   highest of those. If every SEQ from 1 to lastBarcodeSeq is still on a
   live barcode nothing was ever deleted and there is nothing to protect;
   otherwise some value up to lastBarcodeSeq is on a label whose record is
   gone, so no line may reuse a number below it. */
export function serialFloorOf(grc, billSlNo, units = []) {
  const map = grc?.lastSerialByBill;
  if (map && typeof map === 'object') {
    const own = Number(map[serialFloorKey(billSlNo)]) || 0;
    return Math.max(own, Number(grc?.serialFloorBase) || 0);
  }
  return legacySerialFloor(units, grc?.lastBarcodeSeq);
}

/* See serialFloorOf. 0 when no SEQ up to lastBarcodeSeq can be missing.

   A barcode saved before SEQ was stored carries none, and the save route
   left the lowest SEQs for exactly those (nextSeqStart) - so each of them
   accounts for one gap. Only gaps beyond that count mean a deleted value. */
export function legacySerialFloor(units, lastBarcodeSeq) {
  const last = Number(lastBarcodeSeq) || 0;
  if (!last) return 0;
  const list = Array.isArray(units) ? units : [];
  const live = new Set(list.map((unit) => seqOf(unit?.seq)).filter(Boolean));
  const unnumbered = list.filter((unit) => !seqOf(unit?.seq)).length;
  let gaps = 0;
  for (let seq = 1; seq <= last; seq += 1) {
    if (!live.has(seq)) gaps += 1;
  }
  return gaps > unnumbered ? last : 0;
}

/* Whether a stored barcode's value was composed from THIS GRC's supplier
   code and number and the row's own Bill Sl No. - i.e. whether it is a value
   this system made and may restate when the Bill Sl No. is corrected.

   Decided on the value alone. It used to also demand a numeric serialNo (or
   seq), which every row carried - as a copy of its Bill Sl No. - so the test
   said nothing, and a corrected Bill Sl No. then rebuilt the value with that
   copy in the fourth place. A counter number ("9A1135") answers false and is
   left exactly as it was printed. */
export function hasComposedBarcode(row, { supplierCode, grcNumber } = {}) {
  const parts = parseBarcodeValue(row?.barcodeGenerated) || parseBarcodeValue(row?.barcodeNo);
  if (!parts || (!/^\d+(\.\d+)?$/.test(parts.serialNo) && !Number.isFinite(Number(parts.serialNo)))) return false;
  return parts.supplierCode === String(supplierCode ?? '').trim()
    && parts.grcNumber === grcNumberForBarcode(grcNumber)
    && parts.billSlNo === billSlNoForBarcode(row?.billSlNo);
}

/* Kept for callers written when the two numbering rules were told apart by
   field; the value-based test above answers for both. */
export function hasOldComposedBarcode(row, parts = {}) {
  return hasComposedBarcode(row, parts);
}

/* THE SAME VALUE, AS A LABEL PRINTS IT - and as the bars encode it.

   "G1318 * 05178 * 1 * 16" -> "G1318*05178*1*16"

   The canonical spelling (canonicalBarcodeValue). Kept under this name for
   the callers that already use it; the stored string stays the stored
   string, spaces and all. */
export function displayBarcodeValue(value) {
  return canonicalBarcodeValue(value);
}
