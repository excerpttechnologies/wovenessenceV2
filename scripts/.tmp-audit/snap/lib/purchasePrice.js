/* The purchase price of a received item - one rule for the Add Item form, the
   Barcode Generation grid, its Excel import and /api/barcode-generation, so a
   price the screen refuses cannot be sent round it.

   Client-safe and pure. */

export const PRICE_NOT_POSITIVE_MESSAGE = 'Purchase price should be greater than 0.';
export const PRICE_INVALID_MESSAGE = 'Enter a valid purchase price.';

/* The price as it should be STORED: separators and the rupee sign removed.
   "₹1,980" passes the check below, but Number("₹1,980") is NaN everywhere the
   stored value is read back - the label's CP, the challan, the GRC totals -
   so the API writes this form, never the raw text. */
export function normalisePurchasePrice(value) {
  return String(value ?? '').trim().replace(/[,\s₹]/g, '');
}

/* '' when the price is acceptable, otherwise the message to show.

   Blank counts as zero - a line with no price is exactly the line this rule
   exists to stop. 0, 0.00, -0 and every negative are refused with the same
   message. Thousands separators and a rupee sign are tolerated, because an
   Excel import delivers "1,980". */
export function purchasePriceError(value) {
  const text = normalisePurchasePrice(value);
  if (text === '') return PRICE_NOT_POSITIVE_MESSAGE;
  const n = Number(text);
  if (!Number.isFinite(n)) return PRICE_INVALID_MESSAGE;
  if (n <= 0) return PRICE_NOT_POSITIVE_MESSAGE;
  return '';
}

/* The price names a GRC line can carry, depending on the screen that made it:
   purchaseRate (the generation grid), purRate / finalNet (saved barcode rows),
   finalRate / rate (invoice-style lines). */
const LINE_PRICE_KEYS = ['purchaseRate', 'purRate', 'finalNet', 'finalRate', 'rate'];

/* Every priced line whose price fails purchasePriceError, as { ref, problem }.
   The first non-empty price the line carries is the one judged - the same way
   the save route reads `purRate || purchaseRate`. A line that carries no price
   field at all is not a priced line and is not judged here. */
export function itemPriceErrors(items) {
  return (Array.isArray(items) ? items : []).flatMap((item, index) => {
    if (!item || typeof item !== 'object') return [];
    const present = LINE_PRICE_KEYS.filter((k) => Object.prototype.hasOwnProperty.call(item, k));
    if (!present.length) return [];
    const value = present.map((k) => item[k]).find((v) => v) ?? item[present[0]];
    const problem = purchasePriceError(value);
    return problem ? [{ ref: item.itemCode || item.itemName || `Line ${index + 1}`, problem }] : [];
  });
}
