/* Shared number/currency formatting for the sales dashboard. Kept pure so the
   exact same definitions render on the server, in the client and in the
   export workbook. */

export const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

export const r2 = (value) => Math.round(num(value) * 100) / 100;
export const r1 = (value) => Math.round(num(value) * 10) / 10;

export const safeDiv = (numerator, denominator, fallback = 0) => {
  const d = num(denominator);
  return d === 0 ? fallback : num(numerator) / d;
};

/* A change against a prior figure is only meaningful when the prior figure is
   a positive amount. Zero is not "infinity percent growth", and a negative
   prior (returns outweighing sales) has no sensible percentage base. */
export const safeGrowth = (current, previous) => {
  const p = num(previous);
  const c = num(current);
  if (p <= 0) return null;
  return ((c - p) / p) * 100;
};

export const safeShare = (value, total) => {
  const t = num(total);
  if (t === 0) return 0;
  return (num(value) / t) * 100;
};

const inr = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const inr2 = new Intl.NumberFormat('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const number = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });

export function formatNumber(value) {
  return number.format(num(value));
}

export function formatINR(value, { decimals = 0 } = {}) {
  const n = num(value);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  const body = decimals ? inr2.format(abs) : inr.format(abs);
  return `${sign}\u20B9${body}`;
}

/* Compact for chart axes. Indian grouping: lakh (1e5), crore (1e7). */
export function formatINRCompact(value) {
  const n = num(value);
  const sign = n < 0 ? '-' : '';
  const abs = Math.abs(n);
  if (abs >= 1e7) return `${sign}\u20B9${(abs / 1e7).toFixed(abs >= 1e8 ? 0 : 1)} Cr`;
  if (abs >= 1e5) return `${sign}\u20B9${(abs / 1e5).toFixed(abs >= 1e6 ? 0 : 1)} L`;
  if (abs >= 1e3) return `${sign}\u20B9${(abs / 1e3).toFixed(abs >= 1e4 ? 0 : 1)}k`;
  return `${sign}\u20B9${Math.round(abs)}`;
}

export function formatPercent(value, { decimals = 1, signed = false, na = 'N/A' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return na;
  const n = Number(value);
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)}%`;
}

export function formatPointChange(value, { decimals = 2, unit = 'pp', na = 'N/A' } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return na;
  const n = Number(value);
  const sign = n > 0 ? '+' : '';
  return `${sign}${n.toFixed(decimals)} ${unit}`;
}

export function formatUnits(value) {
  const n = num(value);
  if (Math.abs(n - Math.round(n)) < 0.0001) return number.format(Math.round(n));
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 }).format(n);
}

export function formatCount(value) {
  return new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 }).format(Math.round(num(value)));
}

export function deltaDirection(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'flat';
  if (Number(value) > 0.0001) return 'up';
  if (Number(value) < -0.0001) return 'down';
  return 'flat';
}

export function pickComparisonLabel(comparison) {
  if (!comparison) return 'No comparison period';
  return comparison.label || 'Comparison period';
}
