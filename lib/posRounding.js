/**
 * Shared POS monetary precision helpers.
 * Keeps per-line amounts, GST calculations, and subtotals at 2 decimals while
 * rounding the final payable Net Amount once to the nearest whole rupee
 * (>= 0.50 rounds up, < 0.50 rounds down).
 */

export function round2(value) {
  const n = Math.round(((Number(value) || 0) + Number.EPSILON) * 100) / 100;
  return Object.is(n, -0) ? 0 : n;
}

export function roundRupee(value) {
  const n = round2(value);
  if (n === 0) return 0;
  return n > 0 ? Math.floor(n + 0.5 + 1e-9) : -Math.floor(Math.abs(n) + 0.5 + 1e-9);
}
