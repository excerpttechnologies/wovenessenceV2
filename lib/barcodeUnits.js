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

/* Safe fixed-decimal rounding to eliminate binary floating-point noise
   (e.g. 1.25 + 0.25 or 0.1 + 0.2) across POS qty steps and totals. */
export function roundStepQty(value, dp = 2) {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const factor = 10 ** dp;
  const rounded = Math.round((n + Number.EPSILON) * factor) / factor;
  return Object.is(rounded, -0) ? 0 : rounded;
}

/* UOM-specific POS quantity rules.
   Meter-based items (uomType === 'MTR' or MTR/Metre UOM text, unless explicitly
   marked allowDecimal = 'No') step in 0.25 MTR increments. PCS and all other
   countable UOMs keep integer step 1. */
export function posQtyConfig(row) {
  const stored = String(row?.uomType || '').trim().toUpperCase();
  const kind = stored === 'PC' || stored === 'MTR' ? stored : uomTypeOf(row?.uom);
  const noDecimal = row?.allowDecimal === false
    || String(row?.allowDecimal || '').trim().toLowerCase() === 'no';
  if (kind === 'MTR' && !noDecimal) {
    return { unit: 'MTR', step: 0.25, min: 0.25, allowDecimal: true, dp: 2 };
  }
  return { unit: 'PCS', step: 1, min: 1, allowDecimal: false, dp: 0 };
}

/* Compute next POS line quantity when pressing + (direction = 1) or - (-1).
   Returns string with 2 decimals for MTR so quarter steps render cleanly
   (1.25, 1.50, 1.75, 1.00) while Number(qty) retains exact numeric value. */
export function stepPosQty(currentQty, direction, row) {
  const cfg = posQtyConfig(row);
  const raw = Number(currentQty);
  const base = Number.isFinite(raw) && raw > 0 ? raw : (direction > 0 ? 0 : cfg.min);
  const next = roundStepQty(base + (direction < 0 ? -cfg.step : cfg.step), cfg.dp);
  const clamped = next < cfg.min ? cfg.min : next;
  return cfg.allowDecimal ? clamped.toFixed(cfg.dp) : clamped;
}

/* Restores a valid positive fallback if manual input is left blank or <= 0. */
export function fallbackPosQty(row) {
  const cfg = posQtyConfig(row);
  return cfg.allowDecimal ? '1.00' : 1;
}
