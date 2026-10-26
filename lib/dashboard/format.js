/* Display formatting shared by the dashboard and website analytics.

   Indian digit grouping is done here rather than left to Intl: ICU versions
   differ on whether a currency symbol is followed by a space, and the server
   and browser can disagree on the exact string. The screens need one stable
   answer. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const numeric = (value) => {
  /* null / undefined / "" mean "not available", not zero. A missing metric
     must render as a dash so it is not mistaken for a measured zero. */
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
};

export function formatNumber(value, decimals = 0) {
  const n = numeric(value);
  if (n === null) return '-';
  const negative = n < 0;
  const fixed = Math.abs(n).toFixed(Math.max(0, Math.min(4, decimals)));
  const [whole, fraction] = fixed.split('.');
  let grouped;
  if (whole.length <= 3) {
    grouped = whole;
  } else {
    const last3 = whole.slice(-3);
    const rest = whole.slice(0, -3).replace(/\B(?=(\d{2})+(?!\d))/g, ',');
    grouped = rest + ',' + last3;
  }
  return `${negative ? '-' : ''}${grouped}${fraction ? '.' + fraction : ''}`;
}

export function formatCurrency(value, { decimals = 0, dash = '-' } = {}) {
  const n = numeric(value);
  if (n === null) return dash;
  return `${n < 0 ? '-' : ''}\u20b9${formatNumber(Math.abs(n), decimals)}`;
}

/* Compact money for tiles and axes: 1.2L, 4.5Cr. */
export function formatCompactCurrency(value, { dash = '-' } = {}) {
  const n = numeric(value);
  if (n === null) return dash;
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const trim = (x) => String(Number(x.toFixed(abs < 1000 ? 0 : 2)));
  if (abs >= 10000000) return `${sign}\u20b9${trim(abs / 10000000)}Cr`;
  if (abs >= 100000) return `${sign}\u20b9${trim(abs / 100000)}L`;
  if (abs >= 1000) return `${sign}\u20b9${trim(abs / 1000)}K`;
  return `${sign}\u20b9${formatNumber(abs, 0)}`;
}

export function formatPercent(value, { decimals = 1, dash = '-' } = {}) {
  const n = numeric(value);
  if (n === null) return dash;
  return `${formatNumber(n, decimals)}%`;
}

export function formatSignedPercent(value, { decimals = 1, dash = '-' } = {}) {
  const n = numeric(value);
  if (n === null) return dash;
  return `${n > 0 ? '+' : ''}${formatNumber(n, decimals)}%`;
}

export function formatDuration(seconds) {
  const n = numeric(seconds);
  if (n === null || n < 0) return '-';
  const total = Math.round(n);
  if (total < 60) return `${total}s`;
  const minutes = Math.floor(total / 60);
  const rest = total % 60;
  if (minutes < 60) return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  return `${hours}h ${minutes % 60}m`;
}

export function formatDate(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  return `${String(d.getUTCDate()).padStart(2, '0')} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}

export function formatDateTime(value) {
  if (!value) return '-';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '-';
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mm = String(d.getUTCMinutes()).padStart(2, '0');
  return `${formatDate(d)}, ${hh}:${mm}`;
}

export function relativeTime(value, now = new Date()) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return '';
  const diff = Math.max(0, now.getTime() - d.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return formatDate(d);
}

export function initials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'WE';
  return (parts[0][0] + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase();
}
