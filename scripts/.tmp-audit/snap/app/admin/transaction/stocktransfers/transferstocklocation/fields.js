/* Stock Transfer Location - field spec, aggregation and totals.

   Plain module (no 'use client'), so the API routes import the same rules the
   form uses. This screen has no line entry of its own: every line is copied
   from the packets it consumes, which is why there is no scan box here and
   the grid is read-only. Same arrangement as
   app/admin/transaction/intercompanysell/salesinvoice/fields.js. */

import { num, r2, money } from '../transferstockpacket/fields';

export { num, r2, money };

/* The only fields the user picks. Both Location Name selectors and the
   read-only GSTN / Address boxes are driven by the form rather than by
   <Field>, for the same reason as on the packet screen. */
export const FIELDS = [
  { k: 'fromLocationId', label: 'Location Name', type: 'ref', ref: 'companylocations', req: true },
  { k: 'toLocationId', label: 'Location Name', type: 'ref', ref: 'companylocations', req: true },
  { k: 'toStockPointId', label: 'Stock Point', type: 'ref', ref: 'stockpoint', placeholder: '--Select--' },
  { k: 'stlDate', label: 'STL Date', type: 'date', req: true, def: 'today' },
  { k: 'stockTransferWaybill', label: 'Stock Transfer Waybill', type: 'file', info: true },
];

export const TOTAL_KEYS = [
  'totalQty', 'taxableValue', 'igstTotal', 'cgstTotal', 'sgstTotal', 'roundOff', 'netValue',
];

export const INFO = [
  '<b>Stock Transfer Packets:</b> Lists stock transfer packets for the selected form location that are linked to the to location but have not yet been converted into stock transfer location.',
  '<b>Multiple Stock Transfer Packet Selection:</b> You can select multiple stock transfer packets for creating a consolidated stock transfer location.',
];

/* The packet picker above the grid */
export const SOURCE_COLS = [
  { k: 'stpDate', t: 'STP Date', f: 'date' },
  { k: 'packetNo', t: 'STP Code' },
  { k: 'totalQty', t: 'Total Qty.', f: 'amount' },
  { k: 'taxableValue', t: 'Net Amount', f: 'amount' },
];

/* The consolidated line grid. First data column is the packet each line came
   from, so a merged transfer still shows its provenance. */
export const GRID_COLS = [
  'Sl No', 'Packet No', 'Item Code', 'Item Name', 'HSN', 'GST', 'QTY',
  'Net Rate', 'Before Tax', 'IGST Amount', 'CGST Amount', 'SGST Amount', 'Net Amount',
];

/* Flattens the selected packets into one line list, tagging each line with
   its source packet. The figures are carried across as stored - they were
   computed and validated when the packet was raised, so recomputing them here
   could only introduce a disagreement between the two documents. */
export function linesFromPackets(packets) {
  return packets.flatMap((p) =>
    (Array.isArray(p.items) ? p.items : []).map((it) => ({
      ...it,
      packetId: String(p._id),
      packetNo: p.packetNo || '',
    }))
  );
}

/* Transfer totals are the sum of the lines it carries, with a whole-rupee
   correction on the final figure. */
export function locationTotals(lines) {
  const taxableValue = r2(lines.reduce((a, r) => a + num(r.beforeTax), 0));
  const igstTotal = r2(lines.reduce((a, r) => a + num(r.igstAmount), 0));
  const cgstTotal = r2(lines.reduce((a, r) => a + num(r.cgstAmount), 0));
  const sgstTotal = r2(lines.reduce((a, r) => a + num(r.sgstAmount), 0));
  const totalQty = r2(lines.reduce((a, r) => a + num(r.qty), 0));
  const netRateTotal = r2(lines.reduce((a, r) => a + num(r.netRate), 0));

  const gross = r2(taxableValue + igstTotal + cgstTotal + sgstTotal);
  const netValue = Math.round(gross);
  const roundOff = r2(netValue - gross);

  return {
    totalQty, netRateTotal, taxableValue,
    igstTotal, cgstTotal, sgstTotal,
    roundOff, netValue: r2(netValue),
  };
}
