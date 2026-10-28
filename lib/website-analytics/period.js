import {
  addDays,
  buildRange,
  comparisonRange,
  diffDays,
  formatDateRange,
  todayInIndia,
} from '@/lib/dashboard/date';

/* ==========================================================================
   Reporting-period resolution for Website Analytics.

   Kept in its own module so the GA4 service and the section routes resolve a
   query string exactly the same way the main overview does. A date filter
   must never mean one thing to the GA4 cards and another to the backend
   orders on the same screen.
   ========================================================================== */

export const MAX_RANGE_DAYS = 366;

export const DATE_PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'custom', label: 'Custom range' },
];

export const COMPARISON_OPTIONS = [
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'previous_year', label: 'Previous year' },
  { value: 'none', label: 'No comparison' },
];

export const COMPARISON_KINDS = new Set(COMPARISON_OPTIONS.map((option) => option.value));

export class AnalyticsError extends Error {
  constructor(status, message, { code = '', field = '' } = {}) {
    super(message);
    this.name = 'AnalyticsError';
    this.status = status;
    this.code = code;
    this.field = field;
  }
}

const utcDay = (dateString) => new Date(`${dateString}T00:00:00.000Z`);

function presetRange(preset, today) {
  switch (preset) {
    case 'today':
      return { start: today, end: today };
    case 'yesterday': {
      const day = addDays(today, -1);
      return { start: day, end: day };
    }
    case 'last_7':
      return { start: addDays(today, -6), end: today };
    case 'last_90':
      return { start: addDays(today, -89), end: today };
    case 'this_month':
      return { start: `${today.slice(0, 7)}-01`, end: today };
    case 'previous_month': {
      const firstOfThis = `${today.slice(0, 7)}-01`;
      const lastOfPrev = addDays(firstOfThis, -1);
      return { start: `${lastOfPrev.slice(0, 7)}-01`, end: lastOfPrev };
    }
    case 'last_30':
    default:
      return { start: addDays(today, -29), end: today };
  }
}

export function resolveRange(sp, today) {
  const rawStart = String(sp.get('startDate') || '').trim();
  const rawEnd = String(sp.get('endDate') || '').trim();
  const preset = String(sp.get('preset') || (rawStart && rawEnd ? 'custom' : 'last_30')).trim();

  if (rawStart || rawEnd) {
    if (!rawStart || !rawEnd) {
      throw new AnalyticsError(422, 'startDate and endDate must be supplied together.', {
        code: 'INVALID_FILTER', field: rawStart ? 'endDate' : 'startDate',
      });
    }
    return { range: buildRange(rawStart, rawEnd), preset: 'custom' };
  }

  const period = presetRange(preset, today);
  return { range: buildRange(period.start, period.end), preset };
}

/**
 * Resolve every filter the Website Analytics endpoint accepts.
 *
 * @param {URLSearchParams} sp
 * @param {Date} [now]
 */
export function resolveAnalyticsPeriod(sp, now = new Date()) {
  const today = todayInIndia(now);
  const { range, preset } = resolveRange(sp, today);

  if (range.days > MAX_RANGE_DAYS) {
    throw new AnalyticsError(
      422,
      `Select ${MAX_RANGE_DAYS} days or fewer (this range is ${range.days} days).`,
      { code: 'RANGE_TOO_LONG', field: 'endDate' }
    );
  }

  const comparisonKind = String(sp.get('comparison') || 'previous_period').trim();
  if (!COMPARISON_KINDS.has(comparisonKind)) {
    throw new AnalyticsError(
      422,
      'comparison must be previous_period, previous_month, previous_year or none.',
      { code: 'INVALID_FILTER', field: 'comparison' }
    );
  }

  const comparison = comparisonRange(range.start, range.end, comparisonKind);

  return {
    range,
    preset,
    comparisonKind,
    comparison,
    periodLabel: formatDateRange(range.start, range.end),
    days: diffDays(range.start, range.end) + 1,
  };
}

export { utcDay };
