/* Stock Transfer Packet - field spec, line maths and grid columns.

   Plain module (no 'use client'), so the API routes import the same rules the
   form uses: what you watch while typing is exactly what gets stored. Same
   arrangement as app/admin/transaction/intercompanysell/deliverychallan/fields.js.

   A stock transfer moves goods between two locations of the SAME business, so
   there is no customer, no agent and no discount - which is why this grid is
   shorter than the Inter Company Delivery Challan's. */

/* Header fields. The two Location Name selectors and the read-only GSTN /
   Address boxes are driven by the form rather than by <Field>, because the
   destination list depends on the business in the top bar and the address
   boxes mirror whichever location is chosen. */
export const FIELDS = [
  { k: 'fromLocationId', label: 'Location Name', type: 'ref', ref: 'companylocations', req: true },
  { k: 'toLocationId', label: 'Location Name', type: 'ref', ref: 'companylocations', req: true },
  { k: 'toStockPointId', label: 'Stock Point', type: 'ref', ref: 'stockpoint', placeholder: '--Select--' },
  { k: 'stpDate', label: 'STP Date', type: 'date', req: true, def: 'today' },
];

/* Stored totals. Not header fields, so the API allows them through
   explicitly rather than via validate(). */
export const TOTAL_KEYS = [
  'totalQty', 'taxableValue', 'igstTotal', 'cgstTotal', 'sgstTotal', 'netValue',
];

/* The deployed grid. "Net Amount" here is the line's pre-tax value - the
   Stock Transfer Location screen shows the same figure under "Before Tax" and
   adds the GST split beside it. The label is kept as the deployed app prints
   it; the stored field is named beforeTax so the code stays honest. */
export const GRID_COLS = [
  'Sl No', 'Barcode', 'Item Code', 'Item Name', 'HSN', 'GST', 'Max QTY', 'QTY',
  'Net Rate', 'Net Amount', 'Action',
];

export const INFO = [
  '<b>Item Code Validation:</b> The item code must exist in selected form business &amp; location',
  '<b>Stock Availability Check:</b> The item must be available in stock before proceeding.',
];

/* ------------------------------------------------------------------ maths */

export const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
export const r2 = (v) => Math.round(num(v) * 100) / 100;
export const money = (v) => r2(v).toFixed(2);

/* One line's derived figures.

     Before Tax = Net Rate x QTY
     GST        = Before Tax x each slab %
     Net Amount = Before Tax + IGST + CGST + SGST

   Intra-state moves split into CGST + SGST and inter-state carry IGST; the
   item lookup decides which by comparing the two locations' GSTIN state
   codes, so this function just applies whatever percentages the line holds. */
export function computeLine(r) {
  const rate = num(r.netRate);
  const qty = num(r.qty);
  const beforeTax = r2(rate * qty);
  const igst = r2(beforeTax * (num(r.igstPct) / 100));
  const cgst = r2(beforeTax * (num(r.cgstPct) / 100));
  const sgst = r2(beforeTax * (num(r.sgstPct) / 100));
  return {
    beforeTax, igst, cgst, sgst,
    netAmount: r2(beforeTax + igst + cgst + sgst),
  };
}

/* Whole-document totals.

   NOTE: the deployed View dialog prints the Net Rate and Net Amount totals in
   each other's columns (a packet of 2 x 80 @ 43.00 shows "6880.00" under Net
   Rate and "86.00" under Net Amount). Each figure is put under its own header
   here rather than reproducing that. */
export function computeTotals(rows) {
  const calc = rows.map(computeLine);

  const taxableValue = r2(calc.reduce((a, c) => a + c.beforeTax, 0));
  const igstTotal = r2(calc.reduce((a, c) => a + c.igst, 0));
  const cgstTotal = r2(calc.reduce((a, c) => a + c.cgst, 0));
  const sgstTotal = r2(calc.reduce((a, c) => a + c.sgst, 0));
  const totalQty = r2(rows.reduce((a, r) => a + num(r.qty), 0));
  const netRateTotal = r2(rows.reduce((a, r) => a + num(r.netRate), 0));

  return {
    calc, totalQty, netRateTotal, taxableValue,
    igstTotal, cgstTotal, sgstTotal,
    netValue: r2(taxableValue + igstTotal + cgstTotal + sgstTotal),
  };
}

/* A blank grid row. `maxQty` stays null until the item lookup supplies a
   stock ceiling, so the Max QTY cell renders empty rather than a misleading
   zero on a row added before the lookup answered. */
export const BLANK_ROW = {
  itemId: '', itemCode: '', barcode: '', itemName: '', hsn: '', slabName: '',
  igstPct: 0, cgstPct: 0, sgstPct: 0,
  uom: '', maxQty: null, qty: '', netRate: '',
};
