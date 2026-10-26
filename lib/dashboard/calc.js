/* ==========================================================================
   Pure arithmetic shared by the dashboard service, the export workbook and
   the tests. Nothing here touches Mongoose or the request.

   The one rule every helper follows: a zero denominator is not a division
   by zero and is never reported as an infinite growth rate.
   ========================================================================== */

import { num, r2, safeGrowth, safeShare } from './format.js';

export const UNCATEGORISED = 'Uncategorised / unallocated';
export const UNASSIGNED_BRANCH = '__unassigned__';

/* Distribute one document's recorded value across its lines in proportion to
   the lines' observed value. The last slice absorbs the rounding remainder, so
   the returned amounts always add back to the document value exactly.

   A negative weight is legitimate: a POS line with isReturn: true is a return
   already netted into the invoice header, and it must pull value away from the
   categories/products it belongs to rather than being treated as a sale. */
export function allocateAmount(amount, weights) {
  const target = num(amount);
  const list = (Array.isArray(weights) ? weights : []).map((w) => num(w));
  const total = list.reduce((sum, w) => sum + w, 0);
  if (!list.length || total === 0) return null;

  let allocated = 0;
  return list.map((weight, index) => {
    if (index === list.length - 1) return r2(target - allocated);
    const share = weight / total;
    const slice = r2(target * share);
    allocated = r2(allocated + slice);
    return slice;
  });
}

/* Percentage change in a rate, expressed in percentage points. A rate can
   legitimately be zero (no returns), so this does not use safeGrowth. */
export function pointChange(current, previous) {
  if (current === null || current === undefined) return null;
  if (previous === null || previous === undefined) return null;
  if (!Number.isFinite(Number(current)) || !Number.isFinite(Number(previous))) return null;
  return r2(Number(current) - Number(previous));
}

/* The return rate the dashboard reports: return documents ÷ offline sales
   orders. Online returns are not tracked, so a website-only scope cannot
   produce a rate at all; null is the honest answer, not zero. */
export function returnRatePercent(returnDocs, offlineOrders) {
  const orders = num(offlineOrders);
  if (orders <= 0) return null;
  return r2((num(returnDocs) / orders) * 100);
}

/* An average is only defined when there is at least one order. */
export function averageOrderValue(netRevenue, orders) {
  const count = num(orders);
  if (count <= 0) return null;
  return r2(num(netRevenue) / count);
}

/* Growth used by all KPI cards, page panels and the export. */
export function comparableGrowth(current, previous) {
  return safeGrowth(current, previous);
}

export function sharePercent(value, total) {
  return r2(safeShare(value, total));
}

export function sumBy(rows, pick) {
  return r2((rows || []).reduce((sum, row) => sum + num(pick(row)), 0));
}

export { num, r2, safeGrowth, safeShare };
