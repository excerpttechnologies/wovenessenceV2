/* Inter Company Sales Invoice - field spec, aggregation and totals.

   Plain module (no 'use client'), so the API routes import the same rules the
   form uses. The invoice has no line entry of its own: every line is copied
   from the delivery challans it consumes, which is why there is no scan box
   on this screen and the grid is read-only. */

import { num, r2, money } from '../deliverychallan/fields';

export { num, r2, money };

/* The only two things the user picks. Both are handled by the form rather
   than by <Field>, because the location list depends on the business chosen
   HERE, not on the business in the top bar. */
export const FIELDS = [
  { k: 'toBusinessId', label: 'Business', type: 'ref', ref: 'business', req: true },
  { k: 'toLocationId', label: 'Location', type: 'ref', ref: 'companylocations', req: true },
  { k: 'invoiceDate', label: 'Invoice Date', type: 'date', def: 'today' },
];

export const TOTAL_KEYS = [
  'taxableValue', 'igstTotal', 'cgstTotal', 'sgstTotal',
  'roundOff', 'totalQty', 'netValue',
];

/* The challan picker above the grid */
export const SOURCE_COLS = [
  { k: 'dcNo', t: 'DC Code' },
  { k: 'dcDate', t: 'Date', f: 'date' },
  { k: 'netValue', t: 'Net Amount', f: 'amount' },
];

/* The consolidated line grid. First column is the challan each line came
   from, so a merged invoice still shows its provenance. */
export const GRID_COLS = [
  'DC Code', 'Item Code', 'Item Name', 'HSN Code', 'GST Slab', 'UOM', 'QTY',
  'Unit Rate', 'Discount', 'R.Off Discount', 'Final Rate', 'Before Tax',
  'IGST Amount', 'CGST Amount', 'SGST Amount', 'Net Amount',
];

export const ROWS_PER_PAGE = 10;

/* Flattens the selected challans into one line list, tagging each line with
   its source challan. The figures are carried across as stored - they were
   computed and validated when the challan was raised, so recomputing them
   here could only introduce a disagreement between the two documents. */
export function linesFromChallans(challans) {
  return challans.flatMap((dc) =>
    (Array.isArray(dc.items) ? dc.items : []).map((it) => ({
      ...it,
      dcId: String(dc._id),
      dcNo: dc.dcNo || '',
    }))
  );
}

/* Invoice totals are the sum of the lines it carries, with a whole-rupee
   correction on the final figure. */
export function invoiceTotals(lines) {
  const taxableValue = r2(lines.reduce((a, r) => a + num(r.beforeTax), 0));
  const igstTotal = r2(lines.reduce((a, r) => a + num(r.igstAmount), 0));
  const cgstTotal = r2(lines.reduce((a, r) => a + num(r.cgstAmount), 0));
  const sgstTotal = r2(lines.reduce((a, r) => a + num(r.sgstAmount), 0));
  const totalQty = r2(lines.reduce((a, r) => a + num(r.qty), 0));

  const gross = r2(taxableValue + igstTotal + cgstTotal + sgstTotal);
  const netValue = Math.round(gross);
  const roundOff = r2(netValue - gross);

  return {
    taxableValue, igstTotal, cgstTotal, sgstTotal, totalQty,
    roundOff, netValue: r2(netValue),
  };
}

/* The printed invoice shows a separate quantity total per unit of measure -
   "Total Qty (Pc(s)) : 600" and "Total Qty (Mtr.) : 365" - because adding
   metres to pieces would be meaningless. */
export function qtyByUom(lines) {
  const out = {};
  lines.forEach((r) => {
    const u = r.uom || '-';
    out[u] = r2((out[u] || 0) + num(r.qty));
  });
  return out;
}

/* The HSN summary table at the foot of the printed invoice: one row per
   HSN + UoM pair, with its own tax rates and amounts. */
export function hsnSummary(lines) {
  const map = new Map();

  lines.forEach((r) => {
    const key = (r.hsn || '-') + '|' + (r.uom || '-');
    const cur = map.get(key) || {
      hsn: r.hsn || '-', uom: r.uom || '-',
      qty: 0, taxableValue: 0,
      cgstRate: num(r.cgstPct), cgstAmount: 0,
      sgstRate: num(r.sgstPct), sgstAmount: 0,
      igstRate: num(r.igstPct), igstAmount: 0,
      netAmount: 0,
    };
    cur.qty = r2(cur.qty + num(r.qty));
    cur.taxableValue = r2(cur.taxableValue + num(r.beforeTax));
    cur.cgstAmount = r2(cur.cgstAmount + num(r.cgstAmount));
    cur.sgstAmount = r2(cur.sgstAmount + num(r.sgstAmount));
    cur.igstAmount = r2(cur.igstAmount + num(r.igstAmount));
    cur.netAmount = r2(cur.netAmount + num(r.netAmount));
    map.set(key, cur);
  });

  const rows = [...map.values()];
  const total = rows.reduce((a, r) => ({
    qty: r2(a.qty + r.qty),
    taxableValue: r2(a.taxableValue + r.taxableValue),
    cgstAmount: r2(a.cgstAmount + r.cgstAmount),
    sgstAmount: r2(a.sgstAmount + r.sgstAmount),
    igstAmount: r2(a.igstAmount + r.igstAmount),
    netAmount: r2(a.netAmount + r.netAmount),
  }), { qty: 0, taxableValue: 0, cgstAmount: 0, sgstAmount: 0, igstAmount: 0, netAmount: 0 });

  return { rows, total };
}
