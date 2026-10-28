/* Reporting periods for the AI Business Assistant.

   A question arrives in English ("this month", "last week", "in September",
   "1 Oct to 15 Oct"), and every tool downstream needs the same thing: an
   inclusive pair of Asia/Kolkata calendar days plus a clearly labelled
   comparison window.

   All date arithmetic is delegated to lib/dashboard/date.js, the module the
   sales dashboard already uses, so the assistant and the dashboard cannot
   disagree about what "this month" means. Nothing here reads the database.

   A resolved period always states the days it actually used. If a question
   named a month that has not happened yet, or a range longer than the ERP
   allows a report to cover, this module says so instead of silently
   substituting a different window.
   ========================================================================== */

import {
  addDays,
  buildRange,
  diffDays,
  endOfMonth,
  financialYearOf,
  formatDate,
  startOfMonth,
  todayInIndia,
} from '@/lib/dashboard/date';

export const MAX_PERIOD_DAYS = 366;

const MONTHS = {
  january: 1, jan: 1,
  february: 2, feb: 2,
  march: 3, mar: 3,
  april: 4, apr: 4,
  may: 5,
  june: 6, jun: 6,
  july: 7, jul: 7,
  august: 8, aug: 8,
  september: 9, sep: 9, sept: 9,
  october: 10, oct: 10,
  november: 11, nov: 11,
  december: 12, dec: 12,
};

export class PeriodError extends Error {
  constructor(message, field = 'period') {
    super(message);
    this.name = 'PeriodError';
    this.status = 422;
    this.code = 'INVALID_PERIOD';
    this.field = field;
  }
}

function daysBetween(start, end) {
  return diffDays(start, end) + 1;
}

function shiftMonths(dateKey, months) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const target = new Date(Date.UTC(y, m - 1 + Number(months || 0), 1));
  const last = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, last));
  return `${target.getUTCFullYear()}-${String(target.getUTCMonth() + 1).padStart(2, '0')}-${String(target.getUTCDate()).padStart(2, '0')}`;
}

function shiftYears(dateKey, years) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const targetYear = y + Number(years || 0);
  const last = new Date(Date.UTC(targetYear, m, 0)).getUTCDate();
  return `${targetYear}-${String(m).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}

function monthBounds(monthKey) {
  return { start: startOfMonth(monthKey), end: endOfMonth(monthKey) };
}

/* Monday-based week containing `dateKey`. */
function weekStart(dateKey) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  const weekday = dt.getUTCDay(); // 0 = Sunday
  const back = weekday === 0 ? 6 : weekday - 1;
  return addDays(dateKey, -back);
}

function previousWindow(period) {
  const days = daysBetween(period.start, period.end);
  const end = addDays(period.start, -1);
  const start = addDays(end, -(days - 1));
  return { start, end, kind: 'previous_period', label: `${formatDate(start)} – ${formatDate(end)}` };
}

function finish(period, today) {
  if (!period || !period.start || !period.end) throw new PeriodError('Could not determine the reporting period.');
  if (diffDays(period.start, period.end) < 0) {
    throw new PeriodError('The start date must be on or before the end date.');
  }
  const days = daysBetween(period.start, period.end);
  if (days > MAX_PERIOD_DAYS) {
    throw new PeriodError(`A report can cover at most ${MAX_PERIOD_DAYS} days; that range is ${days} days.`);
  }
  return {
    ...period,
    days,
    label: period.label || `${formatDate(period.start)} – ${formatDate(period.end)}`,
    today: today || todayInIndia(),
  };
}

/* A preset the API and the AI tool schema both accept. */
export function periodFromPreset(preset, { today = todayInIndia(), label } = {}) {
  const key = String(preset || 'this_month').trim().toLowerCase().replace(/[\s-]+/g, '_');
  const fy = financialYearOf(today);

  const build = (start, end, title) => finish({
    start,
    end: end > today ? today : end,
    preset: key,
    label: label || title,
  }, today);

  switch (key) {
    case 'today':
      return build(today, today, 'Today');
    case 'yesterday': {
      const day = addDays(today, -1);
      return build(day, day, 'Yesterday');
    }
    case 'this_week':
      return build(weekStart(today), today, 'This week to date');
    case 'last_week': {
      const thisWeek = weekStart(today);
      const start = addDays(thisWeek, -7);
      return build(start, addDays(thisWeek, -1), 'Last week');
    }
    case 'last_7':
    case 'last_7_days':
    case '7d':
      return build(addDays(today, -6), today, 'Last 7 days');
    case 'last_14':
    case 'last_14_days':
    case '14d':
      return build(addDays(today, -13), today, 'Last 14 days');
    case 'last_30':
    case 'last_30_days':
    case '30d':
      return build(addDays(today, -29), today, 'Last 30 days');
    case 'last_90':
    case 'last_90_days':
    case '90d':
      return build(addDays(today, -89), today, 'Last 90 days');
    case 'this_month':
    case 'month':
    case 'month_to_date':
      return build(startOfMonth(today.slice(0, 7)), today, 'This month to date');
    case 'last_month':
    case 'previous_month': {
      const firstOfThis = startOfMonth(today.slice(0, 7));
      const lastOfPrev = addDays(firstOfThis, -1);
      return build(startOfMonth(lastOfPrev.slice(0, 7)), lastOfPrev, 'Last month');
    }
    case 'this_year':
    case 'year_to_date':
      return build(`${today.slice(0, 4)}-01-01`, today, 'This year to date');
    case 'last_year': {
      const y = Number(today.slice(0, 4)) - 1;
      return build(`${y}-01-01`, `${y}-12-31`, 'Last year');
    }
    case 'this_quarter': {
      const [year, month] = today.split('-').map(Number);
      const qStartMonth = Math.floor((month - 1) / 3) * 3 + 1;
      return build(`${year}-${String(qStartMonth).padStart(2, '0')}-01`, today, 'This quarter to date');
    }
    case 'fy':
    case 'financial_year':
    case 'this_fy':
      return build(`${fy.slice(0, 4)}-04-01`, `${Number(fy.slice(0, 4)) + 1}-03-31`,
        `Financial year ${fy.slice(0, 4)}–${String(Number(fy.slice(0, 4)) + 1).slice(-2)}`);
    default:
      throw new PeriodError(`Unknown period "${preset}". Use today, yesterday, this_week, last_week, last_7, last_30, last_90, this_month, last_month, this_year, last_year, this_quarter, fy or custom.`);
  }
}

export function periodFromDates(start, end, { today = todayInIndia(), label } = {}) {
  if (!start || !end) throw new PeriodError('Both a start date and an end date are required.');
  return finish({ start, end, preset: 'custom', label }, today);
}

/* Month name mentioned in the question. The most recent occurrence on or
   before today wins, so "October sales" in October is this October and
   "September" in October is the September just gone. */
function periodFromMonthName(month, year, today) {
  const todayYear = Number(today.slice(0, 4));
  const todayMonth = Number(today.slice(5, 7));
  let targetYear = year || todayYear;
  if (!year) {
    if (month > todayMonth) targetYear -= 1;
  }
  const monthKey = `${targetYear}-${String(month).padStart(2, '0')}`;
  const bounds = monthBounds(monthKey);
  if (bounds.start > today) {
    throw new PeriodError(`That month has not started yet, so there is no data for it.`);
  }
  return finish({
    start: bounds.start,
    end: bounds.end > today ? today : bounds.end,
    preset: 'month',
    label: new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' })
      .format(new Date(`${monthKey}-01T00:00:00Z`)),
  }, today);
}

const ISO_RE = /\b(\d{4})-(\d{2})-(\d{2})\b/;
const DMY_RE = /\b(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{4})\b/;
const LONG_RE = /\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b(?:,?\s+(\d{4}))?/i;
const MONTH_YEAR_RE = /\b(january|jan|february|feb|march|mar|april|apr|may|june|jun|july|jul|august|aug|september|sept|sep|october|oct|november|nov|december|dec)\b(?:\s+(\d{4}))?/i;

function collectDates(text) {
  const out = [];
  const iso = [...String(text).matchAll(new RegExp(ISO_RE.source, 'g'))];
  iso.forEach((m) => out.push({ key: `${m[1]}-${m[2]}-${m[3]}`, index: m.index }));
  const dmy = [...String(text).matchAll(new RegExp(DMY_RE.source, 'g'))];
  dmy.forEach((m) => {
    const day = String(Number(m[1])).padStart(2, '0');
    const month = String(Number(m[2])).padStart(2, '0');
    if (Number(m[2]) >= 1 && Number(m[2]) <= 12) out.push({ key: `${m[3]}-${month}-${day}`, index: m.index });
  });
  const long = [...String(text).matchAll(new RegExp(LONG_RE.source, 'gi'))];
  long.forEach((m) => {
    const month = MONTHS[String(m[2]).toLowerCase()];
    if (!month) return;
    const year = m[3] || todayInIndia().slice(0, 4);
    out.push({ key: `${year}-${String(month).padStart(2, '0')}-${String(Number(m[1])).padStart(2, '0')}`, index: m.index });
  });
  return out
    .filter((d) => /^\d{4}-\d{2}-\d{2}$/.test(d.key))
    .sort((a, b) => a.index - b.index);
}

function comparisonFor(period, kind, today) {
  const days = daysBetween(period.start, period.end);

  if (kind === 'previous_period' || !kind) {
    return previousWindow(period);
  }

  if (kind === 'previous_month') {
    const start = shiftMonths(period.start, -1);
    const end = shiftMonths(period.end, -1);
    return { start, end, kind, label: `${formatDate(start)} – ${formatDate(end)}` };
  }

  if (kind === 'previous_year') {
    const start = shiftYears(period.start, -1);
    const end = shiftYears(period.end, -1);
    return { start, end, kind, label: `${formatDate(start)} – ${formatDate(end)}` };
  }

  return previousWindow({ ...period, days });
}

export function withComparison(period, kind = 'auto') {
  const key = String(kind || 'auto').toLowerCase();
  let resolved = key;
  if (!key || key === 'auto') {
    if (/month/.test(period.preset || '')) resolved = 'previous_month';
    else if (/year|fy/.test(period.preset || '')) resolved = 'previous_year';
    else resolved = 'previous_period';
  }
  return { ...period, comparison: comparisonFor(period, resolved, period.today) };
}

const COMPARISON_WORDS = /(compare|compared|versus|vs\.?|growth|trend|declin|increase|decrease|last month|previous month|last year|previous year|last week)/i;

/* Extract a period from free text. Returns null when the question does not
   name one, so the caller can apply a documented default. */
export function detectPeriod(question, { today = todayInIndia() } = {}) {
  const text = String(question || '');

  const explicit = collectDates(text);
  if (explicit.length >= 2) {
    return withComparison(periodFromDates(explicit[0].key, explicit[explicit.length - 1].key, { today }));
  }
  if (explicit.length === 1) {
    return withComparison(periodFromDates(explicit[0].key, explicit[0].key, { today }));
  }

  if (/\b(today|so far today)\b/i.test(text)) return withComparison(periodFromPreset('today', { today }));
  if (/\byesterday\b/i.test(text)) return withComparison(periodFromPreset('yesterday', { today }));

  /* "compare this month with last month" names both windows. The FIRST one
     named is the subject of the answer and the second is its comparison, so
     the this-* checks come before the last-* ones. Otherwise "this month"
     in that sentence would be read as "last month". */
  if (/\bthis week\b/i.test(text)) return withComparison(periodFromPreset('this_week', { today }));
  if (/\b(last|previous) week\b/i.test(text)) return withComparison(periodFromPreset('last_week', { today }));
  if (/\bthis month\b|\bmonth to date\b|\bcurrent month\b/i.test(text)) {
    return withComparison(periodFromPreset('this_month', { today }));
  }
  if (/\b(last|previous) month\b/i.test(text)) return withComparison(periodFromPreset('last_month', { today }));
  if (/\bthis (financial year|fy)\b|\bfinancial year\b|\bfy\b/i.test(text)) {
    return withComparison(periodFromPreset('fy', { today }));
  }
  if (/\bthis (financial )?year\b|\byear to date\b|\bytd\b/i.test(text)) {
    return withComparison(periodFromPreset('this_year', { today }));
  }
  if (/\b(last|previous) (financial )?year\b|\blast fy\b/i.test(text)) {
    return withComparison(periodFromPreset('last_year', { today }));
  }
  if (/\bthis quarter\b/i.test(text)) return withComparison(periodFromPreset('this_quarter', { today }));

  const lastDays = text.match(/\b(?:last|past|previous)\s+(\d{1,3})\s+days?\b/i);
  if (lastDays) {
    const n = Math.max(1, Math.min(MAX_PERIOD_DAYS, Number(lastDays[1])));
    const start = addDays(today, -(n - 1));
    return withComparison(periodFromDates(start, today, { today, label: `Last ${n} days` }));
  }

  const monthName = text.match(MONTH_YEAR_RE);
  if (monthName) {
    const month = MONTHS[String(monthName[1]).toLowerCase()];
    if (month) {
      const year = monthName[2] ? Number(monthName[2]) : null;
      return withComparison(periodFromMonthName(month, year, today));
    }
  }

  return null;
}

/* Default window when a question names no period. Month-to-date is the
   window a shopkeeper means by "sales this month" and it keeps a report
   small enough to answer quickly; the label says so in the answer. */
export function defaultPeriod({ today = todayInIndia() } = {}) {
  return withComparison(periodFromPreset('this_month', { today }));
}

/* Resolve an AI tool's arguments. The model may send a preset, an explicit
   pair of dates, or a natural-language phrase; all three end up validated
   here rather than being trusted. */
export function periodFromArgs(args = {}, { today = todayInIndia() } = {}) {
  const startDate = String(args.startDate || args.from || '').trim();
  const endDate = String(args.endDate || args.to || '').trim();
  if (startDate || endDate) {
    if (!startDate || !endDate) throw new PeriodError('Both startDate and endDate are required.');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate) || !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      throw new PeriodError('Dates must be YYYY-MM-DD.');
    }
    return withComparison(periodFromDates(startDate, endDate, { today }), args.comparison);
  }

  const phrase = String(args.period || args.periodLabel || '').trim();
  if (phrase && !/^[a-z0-9_\s-]+$/i.test(phrase)) {
    const detected = detectPeriod(phrase, { today });
    if (detected) return detected;
  }
  if (phrase) {
    try {
      return withComparison(periodFromPreset(phrase, { today }), args.comparison);
    } catch {
      const detected = detectPeriod(phrase, { today });
      if (detected) return detected;
      throw new PeriodError(`Unknown period "${phrase}".`);
    }
  }

  return defaultPeriod({ today });
}

/* Does this question ask for a comparison? Used to decide whether the answer
   leads with the change or only mentions it in passing. */
export function wantsComparison(question) {
  return COMPARISON_WORDS.test(String(question || ''));
}

export function describePeriod(period) {
  return {
    from: period.start,
    to: period.end,
    label: period.label,
    days: period.days,
    preset: period.preset,
    comparison: period.comparison
      ? {
        from: period.comparison.start,
        to: period.comparison.end,
        label: period.comparison.label,
        kind: period.comparison.kind,
      }
      : null,
  };
}

/* Kept for callers that need the exact UTC boundaries Mongo expects. */
export function rangeOf(period) {
  return buildRange(period.start, period.end);
}

export { daysBetween, shiftMonths, shiftYears, weekStart };
