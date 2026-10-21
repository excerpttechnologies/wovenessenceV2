/* How a source document reads in a picker.

   "LR/26/011 | 64187 | G524 | KARNATAKA Saree Centre, MYSORE"

   A transaction number on its own does not tell two consignments apart, and
   the first thing an operator checks before receiving goods is who they came
   from. So the picker shows the LR number and the vendor beside it.

   This is DISPLAY ONLY. The value behind the option is always the document's
   own _id - the formatted string is never stored, never submitted and never
   parsed back apart. Keeping the composition here rather than inside the
   component means it can be tested on its own, and means the GRC card and
   anything else that grows a source picker compose their labels identically.

   Pure module: no React, no database. */

/* Builds the option text for one row.

   `card.sourceLabel`    the field that heads the label (e.g. transactionNo)
   `card.sourceSubLabel` the fields appended after it, in order

   Paths may be nested - "supplier.vendorNo" - because a joined vendor arrives
   as an object on the row rather than flattened into it.

   MISSING PARTS ARE SKIPPED, NEVER PRINTED EMPTY:
     - a vendor with no number shows just the name
     - a vendor with no name shows just the number
     - an LR whose supplier reference is broken still lists under its own
       number, rather than dropping out of the dropdown or rendering
       "LR/26/011 |  | "
   which is the difference between a picker that degrades and one that hides
   records the operator needs. */
export function sourceLabel(card, row) {
  const head = card?.sourceLabel
    ? (readPath(row, card.sourceLabel) || row?._id)
    : (row?.grcNumber || row?.grtNo || row?._id);

  const extras = (card?.sourceSubLabel || [])
    .map((path) => format(readPath(row, path)))
    .filter(Boolean);

  return extras.length ? [head, ...extras].join(' | ') : String(head ?? '');
}

/* "supplier.vendorNo" -> row.supplier?.vendorNo, without throwing when the
   join found nothing. */
export function readPath(row, path) {
  return String(path).split('.').reduce((acc, key) => (acc == null ? acc : acc[key]), row);
}

function format(v) {
  if (v === undefined || v === null || v === '') return '';
  /* money and quantities read better grouped; ids and codes are left alone */
  if (typeof v === 'number') {
    return v.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  return String(v).trim();
}
