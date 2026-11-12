import UomConversion from '@/models/UomConversion';
import { uomTypeOf } from '@/lib/barcodeUnits';

/* ==========================================================================
   UOM CONVERSION - approved factors only.

   PCS and MTR are not interchangeable. A metre of one fabric may be four
   pieces, another six, another sold by the metre only. So nothing here
   assumes a factor: an approved row from Tools > UOM Conversion is required,
   either for the item or for the business.

   A row is directional - 1 fromUom = factor toUom - and the reverse direction
   is derived from it. Same-category conversions (MTR -> Metres) are 1:1
   because they are the same unit, not because 1 is a default.
   ========================================================================== */

export class ConversionError extends Error {
  constructor(message, code = 'UOM_CONVERSION_MISSING') {
    super(message);
    this.name = 'ConversionError';
    this.code = code;
    this.status = 422;
  }
}

export const roundQty = (value, dp = 4) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return 0;
  const p = 10 ** dp;
  return Math.round(n * p) / p;
};

/* The category a UOM belongs to (PC / MTR), read with the same function the
   barcode engine uses so "Meter", "MTR" and "Metres" are one thing. */
export function categoryOf(uom) {
  return uomTypeOf(uom);
}

const itemMatches = (row, itemId) => {
  const rowItem = row?.itemId ? String(row.itemId) : '';
  if (!rowItem) return false;                       // a business-wide row
  return Boolean(itemId) && rowItem === String(itemId);
};

/* The approved conversion from one UOM to another, or null.

   An ITEM-SPECIFIC row always wins over a business-wide one; a row written
   in the opposite direction is used with its factor inverted. */
export async function resolveConversion({ businessId, itemId = null, fromUom, toUom, session = null }) {
  const fromType = categoryOf(fromUom);
  const toType = categoryOf(toUom);

  /* Same category: the same physical unit spelled differently. */
  if (fromType === toType) {
    return { fromUom, toUom, fromType, toType, factor: 1, sameCategory: true, rowId: null };
  }

  const query = UomConversion.find({
    ...(businessId ? { businessId } : {}),
    status: { $ne: 'Inactive' },
  });
  if (session) query.session(session);
  const rows = await query.lean();

  const active = rows.filter((r) => Number(r.factor) > 0);

  const direct = active.filter(
    (r) => categoryOf(r.fromUom) === fromType && categoryOf(r.toUom) === toType
  );
  const reverse = active.filter(
    (r) => categoryOf(r.fromUom) === toType && categoryOf(r.toUom) === fromType
  );

  const pick = (list) => list.find((r) => itemMatches(r, itemId)) || list.find((r) => !r.itemId) || null;

  const row = pick(direct);
  if (row) {
    return {
      fromUom, toUom, fromType, toType,
      factor: Number(row.factor),
      sameCategory: false,
      rowId: String(row._id),
      rowName: row.name || '',
    };
  }

  const rev = pick(reverse);
  if (rev) {
    return {
      fromUom, toUom, fromType, toType,
      factor: 1 / Number(rev.factor),
      sameCategory: false,
      rowId: String(rev._id),
      rowName: rev.name || '',
      reversed: true,
    };
  }

  return null;
}

/* Same as resolveConversion, but refuses instead of returning null. The
   refusal names the two units and where to configure them, so the operator
   is never left guessing why a line will not save. */
export async function requireConversion(args) {
  const found = await resolveConversion(args);
  if (found) return found;
  throw new ConversionError(
    'No approved ' + categoryOf(args.fromUom) + ' to ' + categoryOf(args.toUom)
    + ' conversion is configured'
    + (args.itemId ? ' for this item' : '')
    + '. Add it on Tools > UOM Conversion before splitting or merging these barcodes.'
  );
}

/* Converts a quantity and returns both the converted number and the factor
   used, so the transaction can store exactly what was applied. */
export function convertQty(qty, conversion) {
  const factor = Number(conversion?.factor);
  return roundQty((Number(qty) || 0) * (Number.isFinite(factor) ? factor : 1));
}

export default { resolveConversion, requireConversion, convertQty, categoryOf, roundQty };
