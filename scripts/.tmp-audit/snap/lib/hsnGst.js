/* HSN -> GST% resolution.

   An HSN record in HSN Master carries a Tax Slabs table: one row per GST rate,
   each row scoped to an Amount From / Amount To band. A single-slab HSN is one
   flat rate; a multi-slab HSN - footwear and apparel are the everyday case -
   charges a different rate above a price threshold, so choosing the rate needs
   the value of the goods as well as the HSN code.

   Pure functions with no fetching, so the screens that read a slab table and
   the routes that build one cannot drift apart on which slab applies. */

/* An open upper bound is stored as null on the HSN, and /api/item/<id>/detail
   coerces that null to 0 - so any non-positive Amount To reads as "and above"
   rather than as a band nothing can fall into. */
const upperBound = (slab) => {
  const to = Number(slab?.amountTo);
  return Number.isFinite(to) && to > 0 ? to : Infinity;
};

const lowerBound = (slab) => {
  const from = Number(slab?.amountFrom);
  return Number.isFinite(from) && from > 0 ? from : 0;
};

/* igst is the whole rate; cgst + sgst is that same rate split in two, which is
   why it is a fallback and not a second opinion. */
export function slabGstPercent(slab) {
  if (!slab) return 0;

  const igst = Number(slab.igst);
  if (Number.isFinite(igst) && igst > 0) return igst;

  const halves = (Number(slab.cgst) || 0) + (Number(slab.sgst) || 0);
  if (halves > 0) return halves;

  const gst = Number(slab.gst);
  return Number.isFinite(gst) ? gst : 0;
}

/* The slab whose Amount From / Amount To band contains `amount`.

   One slab answers for the whole HSN whatever the amount - its band is
   bookkeeping, not a condition. With several, an amount that falls outside
   every band drops to the highest band starting at or below it, and failing
   that to the first slab: the operator gets a rate they can correct rather
   than a blank GST% they have to go and look up. */
export function pickTaxSlab(slabs, amount) {
  const rows = Array.isArray(slabs) ? slabs.filter(Boolean) : [];
  if (!rows.length) return null;
  if (rows.length === 1) return rows[0];

  const value = Number(amount);
  if (!Number.isFinite(value)) return rows[0];

  const inBand = rows.find((s) => value >= lowerBound(s) && value <= upperBound(s));
  if (inBand) return inBand;

  const below = rows
    .filter((s) => lowerBound(s) <= value)
    .sort((a, b) => lowerBound(b) - lowerBound(a))[0];

  return below || rows[0];
}

/* The rate that applies to `amount` under this HSN's slab table. */
export const gstPercentForAmount = (slabs, amount) =>
  slabGstPercent(pickTaxSlab(slabs, amount));
