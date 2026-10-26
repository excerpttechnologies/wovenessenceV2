/* ==========================================================================
   Date and period helpers for the sales dashboard.

   Everything the dashboard shows is scoped by a calendar day in India. A
   transaction stored at 2026-10-01T00:00:00Z belongs to 1 October in India;
   a bill rung up at 00:30 IST is stored on the previous UTC day. The helpers
   below therefore treat a user's date input as an Asia/Kolkata calendar day
   and convert it to an exact UTC instant.

   Dates are represented as YYYY-MM-DD strings at the edge and as Date objects
   at the database boundary. Month arithmetic uses UTC because India has no
   daylight saving, which keeps it deterministic (and leap-year safe).
   ========================================================================== */

export const DASHBOARD_TZ = 'Asia/Kolkata';

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const FY_RE = /^(\d{4})-(\d{4})$/;
const MONTH_RE = /^(\d{4})-(\d{2})$/;

const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTHS_LONG = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const pad = (n) => String(n).padStart(2, '0');

export function isDateString(value) {
  if (!DATE_RE.test(String(value || ''))) return false;
  const [, y, m, d] = String(value).match(DATE_RE);
  const dt = new Date(Date.UTC(Number(y), Number(m) - 1, Number(d)));
  return dt.getUTCFullYear() === Number(y)
    && dt.getUTCMonth() === Number(m) - 1
    && dt.getUTCDate() === Number(d);
}

export function isFyString(value) {
  const m = String(value || '').match(FY_RE);
  return Boolean(m) && Number(m[2]) === Number(m[1]) + 1;
}

export function assertDate(value, field = 'date') {
  if (!isDateString(value)) {
    const err = new Error(`${field} must be a valid date (YYYY-MM-DD).`);
    err.status = 422;
    err.field = field;
    throw err;
  }
  return value;
}

/* A calendar day in India. The offset is explicit, so this is independent of
   the server's own timezone setting. */
export function startOfIndiaDay(dateString) {
  assertDate(dateString);
  return new Date(`${dateString}T00:00:00+05:30`);
}

/* The first instant AFTER the selected end day. Using an exclusive upper
   bound means 23:59:59.999 is not an arbitrary cut-off and February 29 works
   exactly like any other day. */
export function endExclusiveOfIndiaDay(dateString) {
  return startOfIndiaDay(addDays(dateString, 1));
}

export function todayInIndia(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: DASHBOARD_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const get = (type) => parts.find((p) => p.type === type)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export function addDays(dateString, days) {
  assertDate(dateString);
  const [y, m, d] = dateString.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + Number(days || 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function diffDays(from, to) {
  assertDate(from);
  assertDate(to);
  const a = Date.UTC(...from.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  const b = Date.UTC(...to.split('-').map((v, i) => (i === 1 ? Number(v) - 1 : Number(v))));
  return Math.round((b - a) / 86400000);
}

export function monthKeyOf(dateString) {
  assertDate(dateString);
  return dateString.slice(0, 7);
}

export function startOfMonth(monthKey) {
  if (!MONTH_RE.test(String(monthKey || ''))) {
    const err = new Error('month must be YYYY-MM.');
    err.status = 422;
    throw err;
  }
  return `${monthKey}-01`;
}

export function endOfMonth(monthKey) {
  const start = startOfMonth(monthKey);
  const [y, m] = start.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m, 0));
  return `${dt.getUTCFullYear()}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function addMonthsToDate(dateString, months) {
  assertDate(dateString);
  const [y, m, d] = dateString.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Number(months || 0), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return `${target.getUTCFullYear()}-${pad(target.getUTCMonth() + 1)}-${pad(target.getUTCDate())}`;
}

export function addMonthsToMonth(monthKey, months) {
  const date = startOfMonth(monthKey);
  return addMonthsToDate(date, months).slice(0, 7);
}

export function monthLabel(monthKey, { long = false } = {}) {
  const start = startOfMonth(monthKey);
  const [y, m] = start.split('-').map(Number);
  return `${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

export function monthShort(monthKey) {
  const start = startOfMonth(monthKey);
  const [, m] = start.split('-').map(Number);
  return MONTHS_SHORT[m - 1];
}

export function lastMonthKeys(endDate, count = 6) {
  assertDate(endDate);
  const endKey = monthKeyOf(endDate);
  const n = Math.max(1, Number(count) || 6);
  return Array.from({ length: n }, (_, i) => addMonthsToMonth(endKey, i - (n - 1)));
}

/* The financial year a calendar date belongs to. India runs 1 April to
   31 March; 31 March is the last day of the previous year's FY. */
export function financialYearOf(dateString) {
  assertDate(dateString);
  const [y, m] = dateString.split('-').map(Number);
  const start = m >= 4 ? y : y - 1;
  return `${start}-${start + 1}`;
}

export function financialYearStart(fy) {
  if (!isFyString(fy)) {
    const err = new Error('financialYear must be YYYY-YYYY.');
    err.status = 422;
    err.field = 'financialYear';
    throw err;
  }
  return `${fy.slice(0, 4)}-04-01`;
}

export function financialYearEnd(fy) {
  financialYearStart(fy);
  return `${Number(fy.slice(0, 4)) + 1}-03-31`;
}

export function financialYearLabel(fy) {
  if (!isFyString(fy)) return '';
  const a = fy.slice(0, 4);
  const b = fy.slice(5);
  return `FY ${a}–${b.slice(2)}`;
}

export function financialYearOptions(now = new Date()) {
  const today = todayInIndia(now);
  const currentStart = Number(financialYearOf(today).slice(0, 4));
  const firstStart = currentStart + 20;
  const lastStart = currentStart - 4;
  return Array.from({ length: firstStart - lastStart + 1 }, (_, i) => {
    const start = firstStart - i;
    const value = `${start}-${start + 1}`;
    return { value, label: financialYearLabel(value) };
  });
}

export function buildRange(start, end) {
  assertDate(start, 'startDate');
  assertDate(end, 'endDate');
  if (diffDays(start, end) < 0) {
    const err = new Error('startDate must be on or before endDate.');
    err.status = 422;
    err.field = 'startDate';
    throw err;
  }
  return {
    start,
    end,
    startDate: startOfIndiaDay(start),
    endExclusive: endExclusiveOfIndiaDay(end),
    days: diffDays(start, end) + 1,
  };
}

export function shiftYear(dateString, years) {
  assertDate(dateString);
  const [y, m, d] = dateString.split('-').map(Number);
  const targetYear = y + Number(years || 0);
  const last = new Date(Date.UTC(targetYear, m, 0)).getUTCDate();
  return `${targetYear}-${pad(m)}-${pad(Math.min(d, last))}`;
}

export function comparisonRange(start, end, kind = 'previous_period') {
  if (!kind || kind === 'none') return null;

  if (kind === 'previous_period') {
    const days = diffDays(start, end) + 1;
    const cEnd = addDays(start, -1);
    const cStart = addDays(cEnd, -(days - 1));
    return {
      ...buildRange(cStart, cEnd),
      kind,
      label: `${formatDate(cStart)} – ${formatDate(cEnd)}`,
    };
  }

  if (kind === 'previous_month') {
    const cStart = addMonthsToDate(start, -1);
    const cEnd = addMonthsToDate(end, -1);
    return {
      ...buildRange(cStart, cEnd),
      kind,
      label: `${formatDate(cStart)} – ${formatDate(cEnd)}`,
    };
  }

  if (kind === 'previous_year') {
    const cStart = shiftYear(start, -1);
    const cEnd = shiftYear(end, -1);
    return {
      ...buildRange(cStart, cEnd),
      kind,
      label: `${formatDate(cStart)} – ${formatDate(cEnd)}`,
    };
  }

  const err = new Error('comparison must be previous_period, previous_month, previous_year or none.');
  err.status = 422;
  err.field = 'comparison';
  throw err;
}

export function formatDate(dateString, { long = false } = {}) {
  if (!isDateString(dateString)) return '';
  const [y, m, d] = dateString.split('-').map(Number);
  return `${d} ${(long ? MONTHS_LONG : MONTHS_SHORT)[m - 1]} ${y}`;
}

export function formatDateRange(start, end) {
  if (!isDateString(start) || !isDateString(end)) return '';
  return start === end ? formatDate(start) : `${formatDate(start)} – ${formatDate(end)}`;
}

export function eachDay(start, end) {
  const days = diffDays(start, end);
  if (days < 0) return [];
  return Array.from({ length: days + 1 }, (_, i) => addDays(start, i));
}

/* Indian financial year boundaries for a date, as a period preset. */
export function financialYearPeriod(fy, now = new Date()) {
  const start = financialYearStart(fy);
  const end = financialYearEnd(fy);
  const today = todayInIndia(now);
  return {
    start,
    end: today < start ? start : end > today ? today : end,
    fullEnd: end,
  };
}

/* Default dashboard window: the last 30 calendar days, never before the
   selected FY started and never after it ended. A past financial year opens
   on its final 30 days rather than on a window that runs past 31 March; the
   operator can widen it from the filters. */
export function defaultPeriod(fy, now = new Date()) {
  const today = todayInIndia(now);
  const fyStart = isFyString(fy) ? financialYearStart(fy) : '';
  const fyEnd = isFyString(fy) ? financialYearEnd(fy) : '';
  const anchor = fyStart && today < fyStart
    ? fyStart
    : fyEnd && fyEnd < today
      ? fyEnd
      : today;
  const candidate = addDays(anchor, -29);
  const start = fyStart && candidate < fyStart ? fyStart : candidate;
  return { start, end: anchor };
}
