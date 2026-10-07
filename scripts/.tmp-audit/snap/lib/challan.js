import { uomTypeOf } from '@/lib/barcodeEngine';

/* ==========================================================================
   Delivery Challan arithmetic - shared by every challan in the app.

   The requirement is that a challan shows Total Quantity, Total PC and Total
   MTR, and that the same document can print in a detailed or a non-detailed
   format "without duplicating the entire business logic".

   So the logic is here, once, and the formats are a rendering choice made in
   components/ChallanDocument.jsx. A stock-transfer challan and a sell
   delivery challan carry different line shapes but the same quantities, and
   two copies of this arithmetic would eventually disagree about how much is
   in a consignment - which is the number that gets checked at the door.

   Pure functions, no React, no database: importable from a client component
   and testable on their own.
   ========================================================================== */

/* Line items reach us keyed three different ways:

     the stock transfer  itemCode, qty, uom      (proper names)
     the sell challan    'Item Code', 'QTY'      (column headings)
     a barcode row       itemCode, qtyNum, uom

   normaliseLine reads all of them, the same way lib/reports.js does and for
   the same reason: a challan should not depend on which screen wrote the
   document. */
export function normaliseLine(line) {
  const uom = String(pick(line, 'uom', 'UOM', 'Uom') ?? '');
  return {
    barcodeNo: String(pick(line, 'barcodeNo', 'Barcode No', 'barcode') ?? ''),
    itemCode: String(pick(line, 'itemCode', 'Item Code') ?? ''),
    itemName: String(pick(line, 'itemName', 'Item Name', 'name') ?? ''),
    description: String(pick(line, 'description', 'Description', 'printDescription') ?? ''),
    hsn: String(pick(line, 'hsn', 'HSN') ?? ''),
    uom,
    /* uomType decides which total a line lands in. It is stored on a transfer
       line; for anything else it is read from the UOM text by the same
       matcher the barcode engine uses, so PC and MTR mean one thing app-wide. */
    uomType: String(pick(line, 'uomType') ?? '') || uomTypeOf(uom),
    batchType: String(pick(line, 'batchType', 'batchUnique') ?? ''),
    qty: num(pick(line, 'qty', 'QTY', 'Qty', 'qtyNum')),
    rate: num(pick(line, 'rate', 'Final Rate', 'Unit Rate', 'finalNet', 'purRate')),
    rsp: num(pick(line, 'rsp', 'RSP', 'retailPrice', 'offerPrice')),
    gst: num(pick(line, 'gst', 'GST Slab', 'GST (%)')),
    amount: num(pick(line, 'amount', 'Net Amount', 'netAmount')),
    supplierId: String(pick(line, 'supplierId') ?? ''),
    supplierName: String(pick(line, 'supplierName') ?? ''),
    grcNo: String(pick(line, 'grcNo', 'GRC No') ?? ''),
    returned: Boolean(line?.returned),
    received: Boolean(line?.received),
  };
}

export const normaliseLines = (lines) => (Array.isArray(lines) ? lines : []).map(normaliseLine);

/* THE QUANTITY SUMMARY the requirement asks for.

   Total Qty is every line added up. PC and MTR are the same lines split by
   what they measure - 15 pieces and 10 metres is not 25 of anything, and a
   single total hides that. Calculated from the lines every time; never
   stored, never entered. */
export function summarise(lines) {
  const rows = normaliseLines(lines);
  const of = (type) => r3(rows.filter((l) => l.uomType === type).reduce((a, l) => a + l.qty, 0));

  const taxable = r2(rows.reduce((a, l) => a + l.rate * l.qty, 0));
  const gst = r2(rows.reduce((a, l) => a + l.rate * l.qty * (l.gst / 100), 0));

  return {
    lineCount: rows.length,
    totalQty: r3(rows.reduce((a, l) => a + l.qty, 0)),
    totalPc: of('PC'),
    totalMtr: of('MTR'),
    taxable,
    gst,
    net: r2(taxable + gst),
    rspValue: r2(rows.reduce((a, l) => a + l.rsp * l.qty, 0)),
  };
}

/* One printed row per item + rate, rather than one per barcode.

   A challan for 40 individually barcoded pieces of the same cloth is
   unreadable as 40 rows, and the person receiving it counts cartons, not
   labels. The barcodes stay on the row so the detailed copy can list them and
   traceability is not lost. */
export function groupLines(lines) {
  const acc = new Map();
  normaliseLines(lines).forEach((l) => {
    const key = [l.itemCode || l.itemName, l.uomType, l.rate, l.rsp, l.supplierId].join('|');
    const row = acc.get(key) || {
      ...l, qty: 0, count: 0, barcodes: [],
    };
    row.qty = r3(row.qty + l.qty);
    row.count += 1;
    if (l.barcodeNo) row.barcodes.push(l.barcodeNo);
    acc.set(key, row);
  });
  return [...acc.values()];
}

/* --------------------------------------------------------------- helpers -- */

function pick(line, ...keys) {
  for (const k of keys) {
    if (line?.[k] !== undefined && line[k] !== null && line[k] !== '') return line[k];
  }
  return undefined;
}

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;
const r3 = (v) => Math.round((Number(v) || 0) * 1000) / 1000;

/* 5 rather than 5.000, but 2.5 stays 2.5 - a metre figure has to be exact. */
export function qtyText(v) {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

export const money = (v) =>
  Number(v || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
