/* Formatting shared by the dashboard panels. The analytics service returns
   numbers and nullable growth values; this layer decides how they read and
   never turns a missing figure into a zero. */

const INR = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});

const INR2 = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const COUNT = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 0 });
const DECIMAL = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export function inr(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return digits > 0 ? INR2.format(Number(value)) : INR.format(Number(value));
}

export function count(value, digits = 0) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  return digits > 0 ? DECIMAL.format(Number(value)) : COUNT.format(Number(value));
}

export function units(value, uom = '') {
  const n = count(value, Number(value) % 1 === 0 ? 0 : 2);
  return uom ? `${n} ${uom}` : n;
}

export function percent(value, { signed = false, digits = 2 } = {}) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  const n = Number(value);
  const sign = signed && n > 0 ? '+' : '';
  return `${sign}${n.toFixed(digits)}%`;
}

export function points(value) {
  if (value === null || value === undefined || !Number.isFinite(Number(value))) return 'N/A';
  const n = Number(value);
  return `${n > 0 ? '+' : ''}${n.toFixed(2)} pp`;
}

export function shortInr(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 10000000) return `₹${(n / 10000000).toFixed(abs >= 100000000 ? 0 : 2)}Cr`;
  if (abs >= 100000) return `₹${(n / 100000).toFixed(abs >= 1000000 ? 1 : 2)}L`;
  if (abs >= 1000) return `₹${(n / 1000).toFixed(abs >= 10000 ? 0 : 1)}k`;
  return `₹${Math.round(n)}`;
}

export function dateLabel(value) {
  if (!value) return '';
  const date = new Date(`${value}T00:00:00+05:30`);
  if (Number.isNaN(date.getTime())) return String(value);
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', day: 'numeric', month: 'short', year: 'numeric',
  }).format(date);
}

export function dateRangeLabel(start, end) {
  if (!start || !end) return '';
  if (start === end) return dateLabel(start);
  return `${dateLabel(start)} – ${dateLabel(end)}`;
}

export function timeLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata', hour: 'numeric', minute: '2-digit', hour12: true,
  }).format(date);
}

export function monthTick(label) {
  const value = String(label || '');
  const [month] = value.split(' ');
  return month || value;
}

export function channelIcon(key) {
  return key === 'website' ? 'globe' : key === 'instagram' ? 'instagram' : 'home';
}

/* Indian financial year period as date inputs. Mirrors defaultPeriod() on the
   server: the last 30 days of the FY, or the final 30 days once it is past. */
export function periodForFinancialYear(fy, now = new Date()) {
  const start = `${fy.slice(0, 4)}-04-01`;
  const end = `${Number(fy.slice(0, 4)) + 1}-03-31`;
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  const today = `${get('year')}-${get('month')}-${get('day')}`;
  const anchor = today < start ? start : end < today ? end : today;
  const [y, m, d] = anchor.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() - 29);
  const candidate = `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
  return { startDate: candidate < start ? start : candidate, endDate: anchor };
}

export function daysBetween(start, end) {
  if (!start || !end) return 0;
  const a = Date.parse(`${start}T00:00:00Z`);
  const b = Date.parse(`${end}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return 0;
  return Math.round((b - a) / 86400000) + 1;
}

export function financialYearBounds(fy) {
  if (!fy) return { start: '', end: '' };
  return { start: `${fy.slice(0, 4)}-04-01`, end: `${Number(fy.slice(0, 4)) + 1}-03-31` };
}
