/* Date ranges for the dashboard and website analytics.

   Every range is cut in Indian time. The ERP stores timestamps in UTC, but a
   sale rung up at 00:30 IST belongs to that calendar day, not to the previous
   one - a UTC cut puts it on yesterday. The helpers below convert an instant
   to the IST calendar day first, then build exact UTC boundaries for Mongo.

   Plain module: no database, no React. Both API routes and the client range
   picker import it, so the two cannot drift apart. */

export const DASHBOARD_TIMEZONE = 'Asia/Kolkata';

const DAY_MS = 86400000;
const IST_OFFSET_MS = 330 * 60000; /* UTC+05:30, no daylight saving */

export const RANGE_PRESETS = [
  { value: 'today', label: 'Today', days: 1 },
  { value: '7d', label: 'Last 7 days', days: 7 },
  { value: '30d', label: 'Last 30 days', days: 30 },
  { value: '90d', label: 'Last 90 days', days: 90 },
  { value: 'month', label: 'This month' },
  { value: 'lastmonth', label: 'Last month' },
  { value: 'fy', label: 'Financial year' },
  { value: 'custom', label: 'Custom range' },
];

export function rangeLabel(value) {
  return RANGE_PRESETS.find((r) => r.value === value)?.label || 'Last 30 days';
}

const pad2 = (n) => String(n).padStart(2, '0');

function partsInIst(date) {
  const d = date instanceof Date ? date : new Date(date);
  if (Number.isNaN(d.getTime())) throw new RangeError('Invalid date.');
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: DASHBOARD_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(d);
  const get = (type) => Number(parts.find((p) => p.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day') };
}

function istMidnight(year, month, day) {
  return new Date(Date.UTC(year, month - 1, day) - IST_OFFSET_MS);
}

export function startOfIstDay(date) {
  const { year, month, day } = partsInIst(date);
  return istMidnight(year, month, day);
}

export function endOfIstDay(date) {
  return new Date(startOfIstDay(date).getTime() + DAY_MS - 1);
}

export function istDayKey(date) {
  const { year, month, day } = partsInIst(date);
  return `${year}-${pad2(month)}-${pad2(day)}`;
}

export function istMonthKey(date) {
  const { year, month } = partsInIst(date);
  return `${year}-${pad2(month)}`;
}

export function startOfIstMonth(date) {
  const { year, month } = partsInIst(date);
  return istMidnight(year, month, 1);
}

export function addIstDays(date, days) {
  return new Date(startOfIstDay(date).getTime() + Number(days || 0) * DAY_MS);
}

/* The Indian financial year runs 1 April -> 31 March. */
export function startOfIstFinancialYear(date) {
  const { year, month } = partsInIst(date);
  return istMidnight(month >= 4 ? year : year - 1, 4, 1);
}

export function endOfIstFinancialYear(date) {
  const { year, month } = partsInIst(date);
  const startYear = month >= 4 ? year : year - 1;
  return new Date(istMidnight(startYear + 1, 4, 1).getTime() - 1);
}

export function financialYearLabel(date) {
  const { year, month } = partsInIst(date);
  const startYear = month >= 4 ? year : year - 1;
  return `${startYear}-${String(startYear + 1).slice(-2)}`;
}

export function parseDateKey(value) {
  const key = String(value || '').trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return null;
  const [year, month, day] = key.split('-').map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  if (d.getUTCFullYear() !== year || d.getUTCMonth() !== month - 1 || d.getUTCDate() !== day) return null;
  return { year, month, day };
}

export function startOfDateKey(key) {
  const parts = parseDateKey(key);
  if (!parts) return null;
  return istMidnight(parts.year, parts.month, parts.day);
}

export function endOfDateKey(key) {
  const start = startOfDateKey(key);
  return start ? new Date(start.getTime() + DAY_MS - 1) : null;
}

export function istDateKeyLabel(key) {
  const parts = parseDateKey(key);
  if (!parts) return String(key || '');
  const d = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  return new Intl.DateTimeFormat('en-IN', {
    day: '2-digit',
    month: 'short',
    timeZone: 'UTC',
  }).format(d);
}

function previousWindow(from, to, days) {
  const previousToDay = new Date(startOfIstDay(from).getTime() - 1);
  const previousFrom = addIstDays(previousToDay, -(days - 1));
  return { previousFrom, previousTo: endOfIstDay(previousToDay) };
}

/* Resolve a preset, or the explicit from/to of a custom range.

   Returns inclusive UTC instants (`from`, `to`) and the immediate preceding
   window of the same length. A bad preset, a missing custom bound or a range
   longer than a year is rejected instead of being silently clamped - a
   dashboard that quietly shows a different period is worse than one that
   says the period is invalid. */
export function resolveRange({
  preset = '30d',
  from,
  to,
  finYear,
  now = new Date(),
} = {}) {
  const nowDate = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(nowDate.getTime())) throw new RangeError('Invalid reference date.');

  const todayStart = startOfIstDay(nowDate);
  const todayEnd = endOfIstDay(nowDate);
  const wanted = String(preset || '30d');

  let start;
  let end;
  let label;
  let previousFrom;
  let previousTo;

  if (wanted === 'today') {
    start = todayStart;
    end = todayEnd;
    label = 'Today';
  } else if (/^\d+d$/.test(wanted)) {
    const days = Number(wanted.slice(0, -1));
    if (!Number.isFinite(days) || days < 1 || days > 366) {
      throw new RangeError('Range must be between 1 and 366 days.');
    }
    start = addIstDays(todayStart, -(days - 1));
    end = todayEnd;
    label = `Last ${days} days`;
  } else if (wanted === 'month') {
    start = startOfIstMonth(nowDate);
    end = todayEnd;
    label = 'This month';
  } else if (wanted === 'lastmonth') {
    const firstOfThisMonth = startOfIstMonth(nowDate);
    const lastDayOfPrev = new Date(firstOfThisMonth.getTime() - 1);
    start = startOfIstMonth(lastDayOfPrev);
    end = endOfIstDay(lastDayOfPrev);
    label = 'Last month';
  } else if (wanted === 'fy') {
    const explicitStart = /^\d{4}/.test(String(finYear || ''))
      ? Number(String(finYear).slice(0, 4))
      : null;
    const { year, month } = partsInIst(nowDate);
    const startYear = explicitStart || (month >= 4 ? year : year - 1);
    start = istMidnight(startYear, 4, 1);
    end = new Date(istMidnight(startYear + 1, 4, 1).getTime() - 1);
    label = `FY ${startYear}-${String(startYear + 1).slice(-2)}`;
    previousFrom = istMidnight(startYear - 1, 4, 1);
    previousTo = new Date(start.getTime() - 1);
  } else if (wanted === 'custom') {
    const startKey = parseDateKey(from);
    const endKey = parseDateKey(to);
    if (!startKey || !endKey) {
      throw new RangeError('Choose a valid From and To date.');
    }
    start = istMidnight(startKey.year, startKey.month, startKey.day);
    end = endOfIstDay(istMidnight(endKey.year, endKey.month, endKey.day));
    if (start.getTime() > end.getTime()) {
      throw new RangeError('The From date must not be after the To date.');
    }
    label = `${istDateKeyLabel(from)} - ${istDateKeyLabel(to)}`;
  } else {
    throw new RangeError('Unknown range. Choose one of the dashboard period presets.');
  }

  const days = Math.round((startOfIstDay(end).getTime() - startOfIstDay(start).getTime()) / DAY_MS) + 1;
  if (days < 1) throw new RangeError('Range must include at least one day.');
  if (days > 366) throw new RangeError('Range cannot exceed 366 days.');

  if (previousFrom === undefined) {
    const previous = previousWindow(start, end, days);
    previousFrom = previous.previousFrom;
    previousTo = previous.previousTo;
  }

  return {
    preset: wanted,
    label,
    from: start,
    to: end,
    fromKey: istDayKey(start),
    toKey: istDayKey(end),
    days,
    previousFrom,
    previousTo,
    previousFromKey: istDayKey(previousFrom),
    previousToKey: istDayKey(previousTo),
    timezone: DASHBOARD_TIMEZONE,
    previousLabel: days === 1 ? 'previous day' : `previous ${days} days`,
  };
}

/* One key per calendar day in the range, in order. Used to build zero-filled
   series: a day with no sale is a real zero and must have a point. */
export function enumerateDays(range) {
  const out = [];
  let cursor = startOfIstDay(range.from);
  const end = startOfIstDay(range.to);
  let guard = 0;
  while (cursor.getTime() <= end.getTime() && guard < 400) {
    out.push(istDayKey(cursor));
    cursor = new Date(cursor.getTime() + DAY_MS);
    guard += 1;
  }
  return out;
}

/* The previous window's labels, used by the comparison strip on the client. */
export function describeRange(range) {
  return {
    preset: range.preset,
    label: range.label,
    from: range.fromKey,
    to: range.toKey,
    days: range.days,
    previousLabel: range.previousLabel,
  };
}
