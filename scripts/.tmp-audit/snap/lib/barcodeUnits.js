/* Unit and barcode-type normalisers - pure and client-safe.

   Moved here out of lib/barcodeEngine.js, which re-exports both unchanged.
   The engine also reserves numbers against the database, so the browser could
   not import these two from it without pulling the models into its bundle -
   and the label printing rule (lib/barcodeLabelPrint.js) has to read "is this
   metres" and "is this a batch" exactly the way the save route did when it
   wrote the row. One definition, two callers. */

/* The UOM master is free text ("Meter", "MTR", "Metres", "Pcs", "Piece"),
   so the type is matched rather than compared. */
const METER_RX = /(^|[^a-z])(mtr|mts|meter|metre|meters|metres)([^a-z]|$)/i;
const PIECE_RX = /(^|[^a-z])(pc|pcs|piece|pieces|nos|no)([^a-z]|$)/i;

/* 'PC' | 'MTR' - which quantity rule applies to a unit of measure. */
export function uomTypeOf(uom) {
  const text = String(uom || '').trim();
  if (METER_RX.test(text)) return 'MTR';
  if (PIECE_RX.test(text)) return 'PC';
  /* An unrecognised UOM behaves like a piece: a countable unit. That is the
     safe default - it never silently merges several units onto one label. */
  return 'PC';
}

/* 'batch' | 'unique'. Accepts every spelling the existing screens and stored
   rows use: the Item master's uniqueBarcode Yes/No, the generation screen's
   boolean, and the batchUnique column already on barcodeLabel rows. */
export function batchTypeOf(value) {
  if (value === true) return 'unique';
  if (value === false) return 'batch';
  const text = String(value ?? '').trim().toLowerCase();
  if (['unique', 'yes', 'y', 'true', '1'].includes(text)) return 'unique';
  if (['batch', 'no', 'n', 'false', '0'].includes(text)) return 'batch';
  return 'batch';
}

/* The batch type a barcode row will be SAVED with.

   This is the exact expression buildDocs in app/api/barcode-generation/
   route.js has always used, and that route now calls it from here - so the
   label printed for a row that has not been saved yet follows the rule the
   row is about to be stored under, and cannot drift from it. `??`, not `||`:
   only a missing field falls through to the next one. */
export function saveBatchTypeOf(row) {
  const r = row || {};
  return batchTypeOf(r.batchUnique ?? r.mode ?? r.uniqueBarcode);
}
