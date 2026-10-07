/* THE GRC MONEY TRIPLE - taxable, GST and net amount.

   One module, imported by the save route, the list API, the GRC screen, the
   barcode generation screen and the print view, so no two of them can work
   the same GRC out differently. Pure arithmetic - no database, no server-only
   import - so a client component may import it as freely as a route.

   THE INVARIANT, on every screen and in every stored header:

       taxable + gst = netAmount        i.e.   taxable = netAmount - gst

   The order it is worked out in matters, and is always:

       1. net amount        from the lines, or as the header stores it
       2. GST amount        an AMOUNT, never a percentage
       3. taxable           = net amount - GST amount

   ---- why taxable is read back OUT of the net amount ---------------------

   Both halves are rounded to the paisa before the subtraction, so the three
   figures on a row always add up exactly as shown. Deriving the taxable value
   separately - from the rate, the quantity or some intermediate the screen
   was holding - is what let 22000.000000001 and 21999.999999999 onto the
   screen, and what let Taxable + GST stop agreeing with Net Amount.

   ---- the two shapes a stored header comes in ----------------------------

   A header saved by the current barcode save route holds three real amounts
   (grcTotals below), and an imported one holds the amounts of the document it
   came from. Either way `gst` is an AMOUNT and is used as it stands.

   A header written before 2026-09-17 holds neither: the save route of the day
   put a SELLING-price sum in both `taxable` and `netAmount` - the same figure
   in both - and the SUM OF THE ROWS' GST PERCENTAGES in `gst`, so a GRC of 15
   lines at 5% stored a `gst` of 75. Such a header is recognised by that very
   signal (headerGstIsAmount), and its GST is worked out instead from the GST
   RATE ITS OWN BARCODE ROWS CARRY, applied to the net amount it stores. No
   rate is ever assumed or hardcoded: a GRC whose rows carry no rate is shown
   with no GST, and its whole net amount is taxable.

   Nothing here writes to the database. A stored header is left exactly as it
   is - prices, quantities, rates and the net amount included. */

const num = (value) => {
  const parsed = parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

/* The ERP's monetary rounding: two decimals, with the epsilon that lands
   21999.999999999 and 22000.000000001 both on 22000. Every figure this module
   hands out has been through it. */
export const r2 = (value) => Math.round((num(value) + Number.EPSILON) * 100) / 100;

/* ---- one barcode row ---------------------------------------------------

   purRate / finalNet are the stored spellings of the grid's purchaseRate /
   finalPrice (components/GCRBarcodeGeneration.jsx), so a row is read the same
   whether it came back from the database or straight off the sheet. The rate
   is the PURCHASE rate after discount - tax-exclusive, never a selling price.

   A stored row spells an absent number as '', not as null, so these fall
   through with || rather than ?? - exactly as the save route always has. */
export const rowRate = (row) => num(row?.finalNet || row?.finalPrice || row?.purRate || row?.purchaseRate);
export const rowQty = (row) => num(row?.qty || row?.qtyNum);
/* the row's own GST rate, from the item / HSN master - dynamic, never fixed */
export const rowGstRate = (row) => num(row?.gst);
/* 1. the line's tax-exclusive value */
export const rowTaxable = (row) => rowRate(row) * rowQty(row);
/* 2. the line's GST AMOUNT, rounded to the paisa - the way the GRC voucher
      works its tax out, so a GRC's lines add up to the total it prints */
export const rowGst = (row) => Math.round(rowTaxable(row) * rowGstRate(row)) / 100;
/* 3. the line's net amount */
export const rowNet = (row) => r2(rowTaxable(row) + rowGst(row));

/* ---- a GRC's totals, from its barcode rows -----------------------------

   What the save route stores on the header and what every screen showing
   priced rows adds up.

     net amount = sum(line taxable) + sum(line GST)
     GST        = sum(line GST)                      - an AMOUNT
     taxable    = net amount - GST

   It used to add up selling prices for the net amount, take a discount off a
   rate already net of it, and add up the rows' GST PERCENTAGES as the GST. */
export function grcTotals(rows) {
  const list = Array.isArray(rows) ? rows : [];
  const totalQuantity = list.reduce((sum, row) => sum + rowQty(row), 0);
  const gst = r2(list.reduce((sum, row) => sum + rowGst(row), 0));
  const netAmount = r2(r2(list.reduce((sum, row) => sum + rowTaxable(row), 0)) + gst);
  return { totalQuantity, taxable: r2(netAmount - gst), gst, netAmount };
}

/* ---- GST inside a tax-inclusive total ----------------------------------

     total = taxable + taxable x rate/100   =>   GST = total x rate/(100+rate)

   22000 at 5% is 23100, and 23100 carries 23100 x 5/105 = 1100 of GST. */
export const gstWithin = (total, rate) => (num(rate) > 0
  ? (num(total) * num(rate)) / (100 + num(rate))
  : 0);

/* How a GRC's value is split across GST slabs, read off its own barcode rows:
   [{ rate, share }], the shares adding to 1. Weighted by each line's value, or
   by quantity where no line carries a price yet, so a GRC whose lines sit on
   different slabs is split the way its own lines are rather than averaged. */
export function gstRateMix(rows) {
  const list = (Array.isArray(rows) ? rows : []).filter((row) => rowQty(row) > 0 || rowTaxable(row) > 0);
  if (!list.length) return [];

  let weightOf = rowTaxable;
  let total = list.reduce((sum, row) => sum + weightOf(row), 0);
  if (!(total > 0)) { weightOf = rowQty; total = list.reduce((sum, row) => sum + weightOf(row), 0); }
  if (!(total > 0)) { weightOf = () => 1; total = list.length; }

  const byRate = new Map();
  list.forEach((row) => {
    const rate = rowGstRate(row);
    byRate.set(rate, (byRate.get(rate) || 0) + weightOf(row));
  });
  return [...byRate.entries()].map(([rate, weight]) => ({ rate, share: weight / total }));
}

/* Does this stored header's `gst` hold an AMOUNT?

   It does not when the header carries the pre-2026-09-17 shape: a positive
   `gst` with the SAME figure in `taxable` and `netAmount`. A header that
   genuinely had taxable = net would have to have no GST at all, so a positive
   `gst` alongside it can only be the old sum of percentages. */
export const headerGstIsAmount = (header) => !(
  num(header?.gst) > 0 && Math.abs(num(header?.taxable) - num(header?.netAmount)) < 0.01
);

/* ---- the triple to SHOW for one stored GRC header ----------------------

   `rows` are that GRC's barcode rows and are only read when the header's GST
   is not an amount; pass none and such a GRC simply shows no GST.

   The stored net amount is kept exactly as it is - this is a reading, not a
   correction of the document - and the taxable value is read back out of it,
   so TAXABLE + GST = NET AMOUNT on every row of the list. */
export function grcMoney(header, rows) {
  const netAmount = r2(header?.netAmount);
  const raw = headerGstIsAmount(header)
    ? r2(header?.gst)
    : r2(gstRateMix(rows).reduce((sum, slab) => sum + gstWithin(netAmount * slab.share, slab.rate), 0));
  /* GST can be neither negative nor larger than the total it sits in, so the
     taxable value can never come out negative on a malformed header */
  const gst = r2(Math.min(Math.max(raw, 0), Math.max(netAmount, 0)));
  return { netAmount, gst, taxable: r2(netAmount - gst) };
}
