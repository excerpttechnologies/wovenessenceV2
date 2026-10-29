'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './website-analytics.module.css';
import Glyph from './icons';
import { count, dateLabel, percent } from '@/components/dashboard/format';
import { todayInIndia } from '@/lib/dashboard/date';

/* ==========================================================================
   Active Users — the one dated section on the Website Analytics screen.

   Every figure comes from GA4 properties/:id:runReport through
   /api/website-analytics/active-users. Nothing here reads an ERP collection,
   and a failed section is shown as unavailable rather than as a zero.

   Filters live in the URL so a view can be shared and survives a refresh.
   Only one request is in flight at a time: the previous one is aborted, so a
   slow older response can never overwrite a newer range.
   ========================================================================== */

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'last_month', label: 'Last month' },
  { value: 'custom', label: 'Custom range' },
];

const GRANULARITIES = [
  { value: 'day', label: 'Day' },
  { value: 'week', label: 'Week' },
  { value: 'month', label: 'Month' },
];

const COMPARISONS = [
  { value: 'none', label: 'None' },
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_year', label: 'Same period last year' },
];

const DEFAULT_FILTERS = {
  preset: 'last_30',
  startDate: '',
  endDate: '',
  granularity: 'day',
  compare: 'none',
};

const DEBOUNCE_MS = 400;

const FIXES = {
  GA4_PERMISSION_DENIED: 'Add the service account as Viewer in GA4 Property access management and check GA4_PROPERTY_ID.',
  GA4_NOT_CONFIGURED: 'Set GA4_PROPERTY_ID and GA4_CREDENTIALS_JSON (or GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY) on the server.',
  GA4_INVALID_CREDENTIALS: 'The service-account key is invalid. Replace GA4_CREDENTIALS_JSON with a freshly downloaded key.',
  GA4_AUTH_FAILED: 'Google rejected the service-account sign-in. Check the key and the server clock.',
  GA4_PROPERTY_NOT_FOUND: 'GA4_PROPERTY_ID must be the property number (digits only), not the G- measurement ID or the account ID.',
  GA4_QUOTA_EXCEEDED: 'The GA4 Data API quota is exhausted. Wait a minute, then retry.',
  GA4_API_UNAVAILABLE: 'Google Analytics is unreachable right now. Retry in a moment.',
  GA4_INVALID_REQUEST: 'Check the selected dates: a custom range needs both dates, in order, and 366 days or fewer.',
  GA4_REPORT_FAILED: 'The GA4 report could not be read. Retry in a moment.',
};

function fixFor(code) {
  return FIXES[code] || 'Check the GA4 configuration on the server, then retry.';
}

function clockLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function axisLabel(point, granularity) {
  const label = String(point?.label || '');
  if (granularity === 'week') return label.replace(/^Week (\d+), (\d{4})$/, 'W$1');
  return label.replace(/ \d{4}$/, '');
}

function deviceLabel(value) {
  const text = String(value || '');
  if (!text || text === '(not set)') return 'Unknown';
  return text.charAt(0).toUpperCase() + text.slice(1);
}

function Panel({ title, icon = 'chart', badge, subtitle, children }) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <div className={styles.panelHeadText}>
          <h3 className={styles.panelTitle}>
            <Glyph name={icon} size={15} /> {title}
          </h3>
          {subtitle ? <p className={styles.panelSub}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.panelBadge}>{badge}</span> : null}
      </header>
      {children}
    </section>
  );
}

function changeTone(change) {
  if (!change || change.absolute === null) return '';
  if (change.absolute > 0) return styles.changeUp;
  if (change.absolute < 0) return styles.changeDown;
  return styles.changeFlat;
}

function ChangePill({ change, label }) {
  if (!change || change.absolute === null) return null;
  const { absolute, percent: pct } = change;
  const headline = absolute === 0
    ? 'No change'
    : pct === null
      ? 'New'
      : percent(pct, { signed: true, digits: 1 });
  return (
    <span className={`${styles.changePill} ${changeTone(change)}`}>
      <Glyph name={absolute < 0 ? 'arrowDown' : 'arrowUp'} size={12} strokeWidth={2.2} />
      <strong>{headline}</strong>
      <span className={styles.changeMeta}>
        {`${absolute > 0 ? '+' : ''}${count(absolute)}`} vs {label || 'previous period'}
      </span>
    </span>
  );
}

function StatCard({ label, value, change }) {
  let text = '';
  if (change && change.absolute !== null) {
    if (change.absolute === 0) {
      text = 'No change';
    } else if (change.percent === null) {
      text = `New (${change.absolute > 0 ? '+' : ''}${count(change.absolute)})`;
    } else {
      text = `${percent(change.percent, { signed: true, digits: 1 })} (${change.absolute > 0 ? '+' : ''}${count(change.absolute)})`;
    }
  }
  return (
    <article className={styles.statCard}>
      <span className={styles.statLabel}>{label}</span>
      <p className={styles.statValue}>{value === null || value === undefined ? '—' : count(value)}</p>
      <p className={`${styles.statFoot} ${changeTone(change)}`}>{text || '\u00a0'}</p>
    </article>
  );
}

function TrendChart({ series, granularity, compare, compareLabel }) {
  const [hover, setHover] = useState(null);
  const rows = Array.isArray(series) ? series : [];
  const n = rows.length;

  const width = 720;
  const height = 232;
  const padL = 36;
  const padR = 10;
  const padT = 14;
  const padB = 26;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const hasCompare = compare !== 'none'
    && rows.some((row) => typeof row.compareActiveUsers === 'number');

  const max = Math.max(1, ...rows.map((row) => Number(row.activeUsers) || 0), ...(hasCompare
    ? rows.map((row) => Number(row.compareActiveUsers) || 0)
    : [0]));

  const step = n > 1 ? plotW / (n - 1) : 0;
  const xOf = (index) => (n > 1 ? padL + index * step : padL + plotW / 2);
  const yOf = (value) => padT + plotH - ((Number(value) || 0) / max) * plotH;

  if (!n) {
    return <div className={styles.chartEmpty}>No active users in this period.</div>;
  }

  const mainPath = rows
    .map((row, index) => `${index === 0 ? 'M' : 'L'}${xOf(index).toFixed(1)} ${yOf(row.activeUsers).toFixed(1)}`)
    .join(' ');
  const areaPath = n > 1
    ? `${mainPath} L${xOf(n - 1).toFixed(1)} ${(padT + plotH).toFixed(1)} L${xOf(0).toFixed(1)} ${(padT + plotH).toFixed(1)} Z`
    : '';
  const comparePath = hasCompare
    ? rows
      .map((row, index) => `${index === 0 ? 'M' : 'L'}${xOf(index).toFixed(1)} ${yOf(row.compareActiveUsers).toFixed(1)}`)
      .join(' ')
    : '';

  const ticks = [...new Set([0, Math.round(max / 2), max])];
  const labelSlots = Math.min(6, n);
  const labelIndexes = [...new Set(Array.from(
    { length: labelSlots },
    (_, slot) => Math.round((slot * (n - 1)) / Math.max(1, labelSlots - 1))
  ))];

  const hovered = hover === null ? null : rows[hover];

  return (
    <div className={styles.lineWrap}>
      <svg
        className={styles.lineChart}
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label={`Active users over time, ${rows[0]?.label || ''} to ${rows[n - 1]?.label || ''}`}
        onMouseLeave={() => setHover(null)}
      >
        {ticks.map((tick) => {
          const y = yOf(tick);
          return (
            <g key={tick}>
              <line className={styles.chartGrid} x1={padL} x2={width - padR} y1={y} y2={y} />
              <text className={styles.chartAxisText} x={padL - 6} y={y + 3} textAnchor="end">{tick}</text>
            </g>
          );
        })}

        {n > 1 ? <path className={styles.lineArea} d={areaPath} /> : null}
        <path className={styles.lineStroke} d={mainPath} />
        {hasCompare ? <path className={styles.lineCompare} d={comparePath} /> : null}

        {rows.map((row, index) => (
          <circle
            key={`dot-${row.key || index}`}
            className={styles.lineDot}
            cx={xOf(index)}
            cy={yOf(row.activeUsers)}
            r={n > 60 ? 1.5 : 2.6}
          >
            <title>{`${row.label}: ${count(row.activeUsers)} active user${Number(row.activeUsers) === 1 ? '' : 's'}`}</title>
          </circle>
        ))}

        {rows.map((row, index) => (
          <rect
            key={`hit-${row.key || index}`}
            x={xOf(index) - (n > 1 ? step / 2 : plotW / 2)}
            y={padT}
            width={n > 1 ? step : plotW}
            height={plotH}
            fill="transparent"
            onMouseEnter={() => setHover(index)}
          />
        ))}

        {hovered ? (
          <line
            className={styles.lineGuide}
            x1={xOf(hover)}
            x2={xOf(hover)}
            y1={padT}
            y2={padT + plotH}
          />
        ) : null}

        {labelIndexes.map((index) => (
          <text
            key={`x-${rows[index]?.key || index}`}
            className={styles.chartAxisText}
            x={xOf(index)}
            y={height - 6}
            textAnchor={index === 0 ? 'start' : index === n - 1 ? 'end' : 'middle'}
          >
            {axisLabel(rows[index], granularity)}
          </text>
        ))}
      </svg>

      {hovered ? (
        <div
          className={styles.chartTip}
          style={{
            left: `${Math.min(90, Math.max(10, (xOf(hover) / width) * 100))}%`,
          }}
        >
          <strong>{hovered.label}</strong>
          <span>{count(hovered.activeUsers)} active user{Number(hovered.activeUsers) === 1 ? '' : 's'}</span>
          {hasCompare ? (
            <span className={styles.chartTipCompare}>
              {count(hovered.compareActiveUsers)} in {compareLabel || 'the comparison period'}
            </span>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function BarList({ rows, labelKey, labelFor = (value) => value, emptyMessage }) {
  const list = Array.isArray(rows) ? rows : [];
  const max = Math.max(1, ...list.map((row) => Number(row.activeUsers) || 0));
  return (
    <div className={styles.barList}>
      {list.map((row) => (
        <div key={row[labelKey]} className={styles.barRow}>
          <span className={styles.barLabel} title={row[labelKey]}>{labelFor(row[labelKey])}</span>
          <span className={styles.barValue}>{count(row.activeUsers)}</span>
          <span className={styles.barTrack}>
            <span
              className={styles.barFill}
              style={{ width: `${((Number(row.activeUsers) || 0) / max) * 100}%` }}
            />
          </span>
        </div>
      ))}
      {list.length === 0 ? <p className={styles.tableEmpty}>{emptyMessage}</p> : null}
    </div>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeletonShell} aria-busy="true" aria-label="Loading GA4 active users">
      <div className={styles.skCard} />
      <div className={styles.skGrid}>
        <div className={styles.skCard} />
        <div className={styles.skCard} />
      </div>
      <div className={styles.skPanel} />
    </div>
  );
}

export default function ActiveUsersSection() {
  const [filters, setFilters] = useState(DEFAULT_FILTERS);
  const [hydrated, setHydrated] = useState(false);
  const [data, setData] = useState(null);
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const immediateRef = useRef(false);

  const today = useMemo(() => todayInIndia(), []);

  /* The URL is read after mount so the server-rendered markup and the first
     client render agree; the first request then uses the shared filters. */
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pick = (list, value) => (list.some((option) => option.value === value) ? value : '');
    const next = { ...DEFAULT_FILTERS };
    const preset = pick(PRESETS, params.get('preset') || '');
    const granularity = pick(GRANULARITIES, params.get('granularity') || '');
    const compare = pick(COMPARISONS, params.get('compare') || '');
    if (preset) next.preset = preset;
    if (granularity) next.granularity = granularity;
    if (compare) next.compare = compare;
    if (next.preset === 'custom') {
      const startDate = params.get('startDate') || '';
      const endDate = params.get('endDate') || '';
      if (startDate && endDate) {
        next.startDate = startDate;
        next.endDate = endDate;
      } else {
        next.preset = 'last_30';
      }
    }
    setFilters(next);
    setHydrated(true);
  }, []);

  /* Keep the view in the query string. replaceState avoids a navigation and a
     page reload while still making the URL shareable and refresh-proof. */
  useEffect(() => {
    if (!hydrated) return;
    const params = new URLSearchParams();
    params.set('preset', filters.preset);
    params.set('granularity', filters.granularity);
    params.set('compare', filters.compare);
    if (filters.preset === 'custom') {
      if (filters.startDate) params.set('startDate', filters.startDate);
      if (filters.endDate) params.set('endDate', filters.endDate);
    }
    window.history.replaceState(null, '', `${window.location.pathname}?${params.toString()}`);
  }, [filters, hydrated]);

  useEffect(() => {
    if (!hydrated) return undefined;

    const custom = filters.preset === 'custom';
    if (custom && (!filters.startDate || !filters.endDate)) {
      setData(null);
      setError(null);
      setLoading(false);
      return undefined;
    }

    const controller = new AbortController();
    const immediate = immediateRef.current;
    immediateRef.current = false;
    let alive = true;

    setLoading(true);

    const params = new URLSearchParams();
    params.set('preset', filters.preset);
    params.set('granularity', filters.granularity);
    params.set('compare', filters.compare);
    if (custom) {
      params.set('startDate', filters.startDate);
      params.set('endDate', filters.endDate);
    }

    const timer = window.setTimeout(() => {
      fetch(`/api/website-analytics/active-users?${params.toString()}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const failure = new Error(body?.error || 'GA4 active users could not be loaded.');
            failure.code = body?.code;
            throw failure;
          }
          return body;
        })
        .then((body) => {
          if (!alive) return;
          setData(body);
          setError(null);
        })
        .catch((failure) => {
          if (!alive || failure.name === 'AbortError') return;
          setError({
            message: failure.message || 'GA4 active users could not be loaded.',
            code: failure.code,
          });
        })
        .finally(() => {
          if (alive) setLoading(false);
        });
    }, custom && !immediate ? DEBOUNCE_MS : 0);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, hydrated]);

  const period = data?.period || null;
  const totals = data?.totals || null;
  const comparison = data?.comparison || null;
  const series = data?.series || [];
  const breakdownErrors = data?.errors || {};
  const zeroUsers = Boolean(totals) && !breakdownErrors.totals && totals.activeUsers === 0;

  const emptyDates = filters.preset === 'custom' && (!filters.startDate || !filters.endDate);

  const changePreset = (preset) => {
    setFilters((current) => {
      if (preset !== 'custom') return { ...current, preset };
      return {
        ...current,
        preset,
        startDate: current.startDate || period?.startDate || '',
        endDate: current.endDate || period?.endDate || '',
      };
    });
  };

  const applyCustomNow = () => {
    immediateRef.current = true;
    setFilters((current) => ({ ...current }));
  };

  return (
    <section className={styles.datedSection} aria-labelledby="active-users-heading">
      <header className={styles.sectionHead}>
        <div className={styles.sectionHeadText}>
          <h2 className={styles.sectionTitle} id="active-users-heading">
            <Glyph name="users" size={16} strokeWidth={2.1} /> Active Users
          </h2>
          <p className={styles.sectionSub}>
            Total Google Analytics 4 active users for the range you choose. Dates are
            {' '}{period?.timezone || 'Asia/Kolkata'} calendar days.
          </p>
        </div>
        <span className={styles.updated}>
          {loading
            ? 'Updating…'
            : data?.fetchedAt
              ? `Read ${clockLabel(data.fetchedAt)} IST`
              : 'Not loaded'}
        </span>
      </header>

      <div className={styles.filterBar} role="group" aria-label="Active users filters">
        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Date range</span>
          <select
            className={styles.filterControl}
            value={filters.preset}
            onChange={(event) => changePreset(event.target.value)}
          >
            {PRESETS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>From</span>
          <input
            type="date"
            className={styles.filterControl}
            value={filters.startDate}
            max={filters.endDate || today}
            disabled={filters.preset !== 'custom'}
            onChange={(event) => setFilters((current) => ({ ...current, startDate: event.target.value }))}
          />
        </label>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>To</span>
          <input
            type="date"
            className={styles.filterControl}
            value={filters.endDate}
            min={filters.startDate || undefined}
            max={today}
            disabled={filters.preset !== 'custom'}
            onChange={(event) => setFilters((current) => ({ ...current, endDate: event.target.value }))}
          />
        </label>

        <div className={styles.filterField}>
          <span className={styles.filterLabel}>Group by</span>
          <div className={styles.segmented} role="group" aria-label="Granularity">
            {GRANULARITIES.map((option) => (
              <button
                key={option.value}
                type="button"
                aria-pressed={filters.granularity === option.value}
                className={`${styles.segBtn} ${filters.granularity === option.value ? styles.segBtnActive : ''}`}
                onClick={() => setFilters((current) => ({ ...current, granularity: option.value }))}
              >
                {option.label}
              </button>
            ))}
          </div>
        </div>

        <label className={styles.filterField}>
          <span className={styles.filterLabel}>Compare</span>
          <select
            className={styles.filterControl}
            value={filters.compare}
            onChange={(event) => setFilters((current) => ({ ...current, compare: event.target.value }))}
          >
            {COMPARISONS.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>

        {filters.preset === 'custom' ? (
          <button
            type="button"
            className={styles.applyBtn}
            onClick={applyCustomNow}
            disabled={emptyDates || loading}
          >
            <Glyph name="check" size={14} /> Apply
          </button>
        ) : null}
      </div>

      {emptyDates ? (
        <p className={styles.note}>
          <Glyph name="info" size={12} /> Choose both a start and an end date to load this range.
        </p>
      ) : null}

      {error ? (
        <div className={styles.banner} role="alert">
          <p className={styles.bannerTitle}>
            <Glyph name="warning" size={15} /> {error.message}
          </p>
          {error.code ? <p className={styles.bannerCode}>Error code · {error.code}</p> : null}
          <p className={styles.bannerFix}>{fixFor(error.code)}</p>
        </div>
      ) : null}

      {/* A skeleton replaces the figures while a new range is read, so a number
          from the previous range is never shown beside the new filters. */}
      {loading ? <Skeleton /> : null}

      {!loading && data && !totals && !error ? (
        <div className={styles.banner} role="alert">
          <p className={styles.bannerTitle}>
            <Glyph name="warning" size={15} /> The active users total is unavailable for this range
          </p>
          {breakdownErrors.totals ? (
            <>
              <p className={styles.bannerCode}>Error code · {breakdownErrors.totals.code}</p>
              <p className={styles.bannerFix}>{fixFor(breakdownErrors.totals.code)}</p>
            </>
          ) : null}
        </div>
      ) : null}

      {/* A failed request hides the previous range's figures: they would sit
          beside filters that no longer describe them. */}
      {!loading && !error && data && totals ? (
        <>
          <article className={styles.headlineCard}>
            <div className={styles.headlineMain}>
              <span className={styles.bigLabel}>Total active users</span>
              <p className={styles.bigValue}>{count(totals.activeUsers)}</p>
              <p className={styles.bigHint}>
                Unique users across {period?.label || 'the selected range'} — not the sum of the daily
                figures, because GA4 counts each user once per range.
              </p>
            </div>
            <div className={styles.headlineSide}>
              <ChangePill change={comparison?.change?.activeUsers} label={comparison?.label} />
              {data.stale ? (
                <span className={styles.pillWarnNote}>
                  <Glyph name="warning" size={11} /> Cached result — the latest GA4 read failed.
                </span>
              ) : null}
            </div>
          </article>

          <div className={styles.statGrid}>
            <StatCard label="New users" value={totals.newUsers} change={comparison?.change?.newUsers} />
            <StatCard label="Sessions" value={totals.sessions} change={comparison?.change?.sessions} />
            <StatCard label="Page views" value={totals.pageViews} change={comparison?.change?.pageViews} />
          </div>

          {period?.firstDataDate && period.startDate < period.firstDataDate ? (
            <p className={styles.note}>
              <Glyph name="info" size={12} /> GA4 has no recorded data before {dateLabel(period.firstDataDate)},
              so earlier days in this range show zero. Nothing is filled in on their behalf.
            </p>
          ) : null}

          {zeroUsers ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><Glyph name="users" size={17} /></span>
              <div>
                <p className={styles.emptyTitle}>No active users in this period.</p>
                <p className={styles.emptyMsg}>
                  GA4 is connected and returned a zero for these dates. This is not an error — try a wider
                  range or a period when the storefront was live.
                </p>
              </div>
            </div>
          ) : (
            <Panel
              title="Active users over time"
              icon="trend"
              badge={`${count(series.length)} ${series.length === 1
                ? (filters.granularity === 'day' ? 'day' : filters.granularity === 'week' ? 'week' : 'month')
                : (filters.granularity === 'day' ? 'days' : filters.granularity === 'week' ? 'weeks' : 'months')}`}
              subtitle="Hover a point for the date and value. Empty days are real zeros returned by GA4."
            >
              {breakdownErrors.series ? (
                <div className={styles.sectionError} role="alert">
                  <p className={styles.sectionErrorTitle}>
                    <Glyph name="warning" size={14} /> {breakdownErrors.series.message}
                  </p>
                  <p className={styles.sectionErrorCode}>GA4 error code · {breakdownErrors.series.code}</p>
                </div>
              ) : (
                <>
                  {filters.compare !== 'none'
                    && series.some((point) => typeof point.compareActiveUsers === 'number') ? (
                    <div className={styles.legend}>
                      <span className={styles.legendItem}>
                        <i className={styles.legendLine} /> Active users
                      </span>
                      <span className={styles.legendItem}>
                        <i className={styles.legendDash} /> {comparison?.label || 'Previous period'}
                      </span>
                    </div>
                  ) : null}
                  <TrendChart
                    series={series}
                    granularity={filters.granularity}
                    compare={filters.compare}
                    compareLabel={comparison?.label}
                  />
                </>
              )}
            </Panel>
          )}

          <div className={styles.grid3}>
            <Panel title="Active users by country" icon="globe" badge="top 10">
              {breakdownErrors.countries ? (
                <div className={styles.sectionError} role="alert">
                  <p className={styles.sectionErrorTitle}>
                    <Glyph name="warning" size={14} /> {breakdownErrors.countries.message}
                  </p>
                  <p className={styles.sectionErrorCode}>GA4 error code · {breakdownErrors.countries.code}</p>
                </div>
              ) : (
                <BarList
                  rows={data.countries}
                  labelKey="country"
                  emptyMessage="No country data in this period."
                />
              )}
            </Panel>

            <Panel title="Active users by city" icon="map" badge="top 10">
              {breakdownErrors.cities ? (
                <div className={styles.sectionError} role="alert">
                  <p className={styles.sectionErrorTitle}>
                    <Glyph name="warning" size={14} /> {breakdownErrors.cities.message}
                  </p>
                  <p className={styles.sectionErrorCode}>GA4 error code · {breakdownErrors.cities.code}</p>
                </div>
              ) : (
                <BarList
                  rows={data.cities}
                  labelKey="city"
                  emptyMessage="No city data in this period."
                />
              )}
            </Panel>

            <Panel title="Active users by device" icon="mobile" badge="top 10">
              {breakdownErrors.devices ? (
                <div className={styles.sectionError} role="alert">
                  <p className={styles.sectionErrorTitle}>
                    <Glyph name="warning" size={14} /> {breakdownErrors.devices.message}
                  </p>
                  <p className={styles.sectionErrorCode}>GA4 error code · {breakdownErrors.devices.code}</p>
                </div>
              ) : (
                <BarList
                  rows={data.devices}
                  labelKey="deviceCategory"
                  labelFor={deviceLabel}
                  emptyMessage="No device data in this period."
                />
              )}
            </Panel>
          </div>

          <p className={styles.caption}>
            Dates use Asia/Kolkata. GA4 can take up to 24-48 hours to finish processing recent days, so the
            latest numbers may increase slightly.
          </p>
        </>
      ) : null}
    </section>
  );
}
