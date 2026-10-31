/* Inter Store Sell - line maths and the GST split.

   A PLAIN module (no 'use client', no imports), so the API routes and the
   screens run exactly the same arithmetic and cannot drift apart on what a
   document totals. The API still recomputes everything on save - this is the
   shared definition, not a reason to trust the browser.

   The rules are the ones already used by the Purchase Invoice / Inter Company
   challan in this project, checked against posted documents:

     Discount   = Unit Rate x Discount%
     Final Rate = Unit Rate - Discount - R.Off Discount
     Before Tax = Final Rate x QTY
     GST        = Before Tax x the line's GST%
     Net Amount = Before Tax + GST

   The GST percentage itself is NEVER hard-coded: it comes from the HSN > Tax
   master, resolved per line by lib/storeGst.js when the document is saved.
   ---------------------------------------------------------------- */

export const GST_MODE = {
  IGST: 'igst',
  CGST_SGST: 'cgst_sgst',
};

export const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

export const r2 = (v) => Math.round(num(v) * 100) / 100;

export const qty2 = (v) => Math.round(num(v) * 100) / 100;

/* GST on one taxable amount, split the way the document says it should be.
   IGST is the whole rate; CGST + SGST is that same rate halved, with the
   second half taking the rounding remainder so the two always add back to the
   exact total. */
export function splitGst(taxable, gstPct, mode = GST_MODE.CGST_SGST) {
  const base = r2(taxable);
  const pct = num(gstPct);
  if (!pct || base === 0) return { igst: 0, cgst: 0, sgst: 0 };

  const total = r2((base * pct) / 100);
  if (mode === GST_MODE.IGST) return { igst: total, cgst: 0, sgst: 0 };

  const half = r2(total / 2);
  return { igst: 0, cgst: half, sgst: r2(total - half) };
}

export function computeStoreLine(line = {}, { mode = GST_MODE.CGST_SGST } = {}) {
  const qty = num(line.qty);
  const rate = num(line.unitRate);
  const discount = r2((rate * num(line.discountPct)) / 100);
  const finalRate = r2(rate - discount - num(line.roffDiscount));
  const beforeTax = r2(finalRate * qty);
  const gst = splitGst(beforeTax, line.gstPct, mode);

  return {
    discount,
    finalRate,
    beforeTax,
    ...gst,
    netAmount: r2(beforeTax + gst.igst + gst.cgst + gst.sgst),
  };
}

/* Whole-document totals. Round Off is the whole-rupee correction on the final
   figure, which is how every other document in this ERP presents it. */
export function computeStoreTotals(items, { discountPercent = 0, roundOffDiscountAmt = 0, mode } = {}) {
  const rows = Array.isArray(items) ? items : [];
  const calc = rows.map((line) => computeStoreLine(line, { mode }));

  const taxableValue = r2(calc.reduce((a, c) => a + c.beforeTax, 0));
  const igstTotal = r2(calc.reduce((a, c) => a + c.igst, 0));
  const cgstTotal = r2(calc.reduce((a, c) => a + c.cgst, 0));
  const sgstTotal = r2(calc.reduce((a, c) => a + c.sgst, 0));
  const totalQty = qty2(rows.reduce((a, l) => a + num(l.qty), 0));

  const headDiscount = r2((taxableValue * num(discountPercent)) / 100);
  const gross = r2(
    taxableValue - headDiscount - num(roundOffDiscountAmt)
    + igstTotal + cgstTotal + sgstTotal
  );

  const netValue = Math.round(gross);

  return {
    calc,
    taxableValue,
    igstTotal,
    cgstTotal,
    sgstTotal,
    totalQty,
    headDiscount,
    roundOff: r2(netValue - gross),
    netValue: r2(netValue),
  };
}

/* Lines with their derived figures written back, plus the document totals -
   what the API stores. */
export function applyStoreTotals(items, opts = {}) {
  const rows = Array.isArray(items) ? items : [];
  const t = computeStoreTotals(rows, opts);
  return {
    ...t,
    items: rows.map((line, i) => ({ ...line, ...t.calc[i] })),
  };
}
