'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './website-analytics.module.css';
import Glyph from './icons';
import {
  AccountsPanel,
  CartsPanel,
  FunnelPanel,
  GeographyPanel,
  InsightsPanel,
  KpiGrid,
  NotesPanel,
  PageTypePanel,
  Panel,
  ProductsPanel,
  RealtimePanel,
  SourcesPanel,
  TrendChart,
} from './panels';
import { count, dateRangeLabel, timeLabel } from '@/components/dashboard/format';

const PRESETS = [
  { value: 'today', label: 'Today' },
  { value: 'yesterday', label: 'Yesterday' },
  { value: 'last_7', label: 'Last 7 days' },
  { value: 'last_30', label: 'Last 30 days' },
  { value: 'last_90', label: 'Last 90 days' },
  { value: 'this_month', label: 'This month' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'custom', label: 'Custom range' },
];

const COMPARISONS = [
  { value: 'previous_period', label: 'Previous period' },
  { value: 'previous_month', label: 'Previous month' },
  { value: 'previous_year', label: 'Previous year' },
  { value: 'none', label: 'No comparison' },
];

const DEFAULTS = { preset: 'last_30', comparison: 'previous_period', branch: '', startDate: '', endDate: '' };
const REFRESH_MS = 60_000;

function queryFor(filters) {
  const params = new URLSearchParams();
  params.set('preset', filters.preset);
  params.set('comparison', filters.comparison);
  if (filters.branch) params.set('branch', filters.branch);
  if (filters.preset === 'custom') {
    if (filters.startDate) params.set('startDate', filters.startDate);
    if (filters.endDate) params.set('endDate', filters.endDate);
  }
  return params.toString();
}

function Skeleton() {
  return (
    <div className={styles.skeletonShell} aria-busy="true" aria-label="Loading website analytics">
      <div className={styles.skGrid}>
        {Array.from({ length: 6 }).map((_, index) => <div key={index} className={styles.skCard} />)}
      </div>
      <div className={styles.skGrid} style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className={styles.skPanel} />
        <div className={styles.skPanel} />
      </div>
      <div className={styles.skGrid} style={{ gridTemplateColumns: '2fr 1fr' }}>
        <div className={styles.skPanel} />
        <div className={styles.skPanel} />
      </div>
    </div>
  );
}

export default function WebsiteAnalyticsClient() {
  const [filters, setFilters] = useState(DEFAULTS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const requestSeq = useRef(0);

  /* The dashboard is a private, non-cacheable read: refetch when the tab is
     brought back into view, and on a one-minute cadence while visible. */
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === 'visible') setRefreshTick((tick) => tick + 1);
    };
    const interval = window.setInterval(refresh, REFRESH_MS);
    document.addEventListener('visibilitychange', refresh);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refresh);
    };
  }, []);

  const validationError = useMemo(() => {
    if (filters.preset !== 'custom') return '';
    if (!filters.startDate || !filters.endDate) return 'Choose both a start and an end date.';
    if (filters.startDate > filters.endDate) return 'The start date must be on or before the end date.';
    const start = Date.parse(`${filters.startDate}T00:00:00Z`);
    const end = Date.parse(`${filters.endDate}T00:00:00Z`);
    if (Number.isFinite(start) && Number.isFinite(end) && (end - start) / 86400000 + 1 > 366) {
      return 'Select 366 days or fewer.';
    }
    return '';
  }, [filters]);

  useEffect(() => {
    if (validationError) {
      setLoading(false);
      setData(null);
      setError({ message: validationError, code: 'CHECK_FILTERS' });
      return undefined;
    }

    const controller = new AbortController();
    const sequence = requestSeq.current + 1;
    requestSeq.current = sequence;
    let alive = true;
    setLoading(true);
    setError(null);
    setDownloadError('');

    const timer = window.setTimeout(() => {
      fetch(`/api/website-analytics/overview?${queryFor(filters)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const failure = new Error(body?.error || 'The website analytics could not be loaded. Please retry.');
            failure.code = body?.code;
            throw failure;
          }
          return body;
        })
        .then((body) => {
          if (!alive || sequence !== requestSeq.current) return;
          setData(body);
          setLastUpdated(body?.meta?.generatedAt || '');
        })
        .catch((err) => {
          if (!alive || sequence !== requestSeq.current || err.name === 'AbortError') return;
          setData(null);
          setError({ message: err.message, code: err.code });
        })
        .finally(() => {
          if (alive && sequence === requestSeq.current) setLoading(false);
        });
    }, 180);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [filters, refreshTick, validationError]);

  const setFilter = useCallback((key, value) => {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      /* Editing a date turns a preset into an explicit range, so the two can
         never disagree about which days are being reported. */
      if (key === 'startDate' || key === 'endDate') {
        next.preset = 'custom';
        /* A hand-edited bound needs its partner, otherwise the range is
           half-specified and the request is rejected. Seed it from the period
           currently on screen. */
        if (data?.meta) {
          if (key === 'startDate' && !next.endDate) next.endDate = data.meta.endDate;
          if (key === 'endDate' && !next.startDate) next.startDate = data.meta.startDate;
        }
      }
      if (key === 'preset' && value === 'custom' && !next.startDate && data?.meta) {
        next.startDate = data.meta.startDate;
        next.endDate = data.meta.endDate;
      }
      return next;
    });
  }, [data]);

  const download = async () => {
    if (!data?.meta) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const params = new URLSearchParams();
      params.set('startDate', data.meta.startDate);
      params.set('endDate', data.meta.endDate);
      params.set('comparison', filters.comparison);
      if (filters.branch) params.set('branch', filters.branch);

      const response = await fetch(`/api/website-analytics/export?${params.toString()}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'The report could not be built.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = disposition.match(/filename="([^"]+)"/);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] || 'website-analytics.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setDownloadError(err.message || 'The report could not be built.');
    } finally {
      setDownloading(false);
    }
  };

  const meta = data?.meta;
  const tracker = meta?.tracking;
  const coverage = meta?.coverage || {};
  const comparisonLabel = meta?.comparison ? meta.comparison.label : '';

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandRow}>
          <span className={styles.eyebrow}>
            <Glyph name="chart" size={12} strokeWidth={2.2} /> E-commerce · Live report
          </span>
          <h1 className={styles.title}>Woven Essence — Website Analytics</h1>
          <p className={styles.subtitle}>
            Visitor behaviour, customer engagement and e-commerce performance for the storefront.
            Every figure is read from the storefront collections that share this database.
          </p>
          <a className={styles.siteLink} href="https://wovenessence.in/" target="_blank" rel="noopener noreferrer">
            wovenessence.in <Glyph name="external" size={12} />
          </a>

          <div className={styles.statusRow}>
            <span className={`${styles.pill} ${tracker?.installed ? styles.pillOn : styles.pillWait}`}>
              <Glyph name={tracker?.installed ? 'check' : 'clock'} size={11} strokeWidth={2.2} />
              {tracker?.installed ? 'Visitor tracker live' : 'Visitor tracker not installed'}
            </span>
            <span className={`${styles.pill} ${meta ? (coverage.visits ? styles.pillOn : styles.pillWarn) : styles.pillOff}`}>
              Page counter · {!meta
                ? 'reading…'
                : meta.sourceCounts?.visitsLastRecordedAt
                  ? `last ${dateRangeLabel(meta.sourceCounts.visitsLastRecordedAt.slice(0, 10), meta.sourceCounts.visitsLastRecordedAt.slice(0, 10))}`
                  : 'no records'}
            </span>
            <span className={`${styles.pill} ${meta ? (coverage.orders ? styles.pillOn : styles.pillOff) : styles.pillOff}`}>
              Orders · {meta ? count(meta.sourceCounts?.ordersRead ?? null) : 'reading…'}
            </span>
            <span className={styles.pill}>Scope · {meta?.branchLabel || 'All website branches'}</span>
            {meta?.periodLabel ? (
              <span className={styles.pill}>
                {dateRangeLabel(meta.startDate, meta.endDate)} · {count(meta.days)} {meta.days === 1 ? 'day' : 'days'}
              </span>
            ) : null}
          </div>
        </div>

        <div className={styles.topActions}>
          <span className={styles.updated}>
            <i className={styles.liveDot} />
            {lastUpdated ? `Updated ${timeLabel(lastUpdated)} IST` : loading ? 'Reading records…' : 'Not loaded'}
          </span>
          <button type="button" className={styles.btnGhost} onClick={() => setRefreshTick((tick) => tick + 1)} disabled={loading}>
            <Glyph name="refresh" size={14} className={loading ? styles.spinning : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={download}
            disabled={!data || loading || downloading}
          >
            <Glyph name="download" size={14} />
            {downloading ? 'Building…' : 'Download report'}
          </button>
        </div>
      </header>

      <section className={styles.filters} aria-label="Website analytics filters">
        <div className={styles.filterHead}>
          <span className={styles.filterTitle}>Report scope</span>
          <span className={styles.filterHint}>
            Days are Asia/Kolkata calendar days. Up to 366 days per selection.
          </span>
        </div>

        <div className={styles.filterGrid}>
          <label className={styles.field}>
            <span>Date range</span>
            <select value={filters.preset} onChange={(event) => setFilter('preset', event.target.value)}>
              {PRESETS.map((preset) => (
                <option key={preset.value} value={preset.value}>{preset.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>From</span>
            <input
              type="date"
              value={filters.preset === 'custom' ? filters.startDate : (meta?.startDate || '')}
              onChange={(event) => setFilter('startDate', event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>To</span>
            <input
              type="date"
              value={filters.preset === 'custom' ? filters.endDate : (meta?.endDate || '')}
              onChange={(event) => setFilter('endDate', event.target.value)}
            />
          </label>

          <label className={styles.field}>
            <span>Compare with</span>
            <select value={filters.comparison} onChange={(event) => setFilter('comparison', event.target.value)}>
              {COMPARISONS.map((option) => (
                <option key={option.value} value={option.value}>{option.label}</option>
              ))}
            </select>
          </label>

          <label className={styles.field}>
            <span>Branch</span>
            <select value={filters.branch} onChange={(event) => setFilter('branch', event.target.value)}>
              <option value="">All website branches</option>
              {(meta?.branches || []).map((branch) => (
                <option key={branch.value} value={branch.value}>{branch.label}</option>
              ))}
            </select>
          </label>
        </div>

        {error ? (
          <p className={styles.filterError} role="alert">
            <Glyph name="warning" size={14} /> {error.message}
            {error.code ? <span className={styles.muted}> · {error.code}</span> : null}
          </p>
        ) : null}

        {downloadError ? (
          <p className={styles.filterError} role="alert">
            <Glyph name="warning" size={14} /> {downloadError}
          </p>
        ) : null}

        <p className={styles.filterNote}>
          <Glyph name="info" size={12} />
          Visitor types, traffic sources and devices are not offered as filters yet: they can only be measured once the
          first-party tracker is loaded on the storefront. Adding a control that silently did nothing would be worse than
          saying so.
        </p>
      </section>

      {loading && !data ? <Skeleton /> : null}

      {error && !data && !loading ? (
        <section className={styles.filters} role="alert" style={{ marginTop: 12 }}>
          <p className={styles.filterError}>
            <Glyph name="warning" size={15} /> {error.message}
          </p>
        </section>
      ) : null}

      {data ? (
        <>
          <KpiGrid cards={data.kpis?.cards || []} />

          <div className={styles.grid2}>
            <Panel
              title="Traffic and sales over time"
              icon="trend"
              subtitle={
                comparisonLabel
                  ? `Selected period, compared with ${comparisonLabel}.`
                  : 'Selected period. Comparison is switched off.'
              }
              badge={`by ${data.trend?.granularity === 'hour' ? 'hour' : 'day'}`}
            >
              <TrendChart days={data.trend?.days || []} granularity={data.trend?.granularity} />
            </Panel>

            <FunnelPanel funnel={data.funnel} />
          </div>

          <div className={styles.grid3}>
            <PageTypePanel pageTypes={data.pageTypes || []} />
            <AccountsPanel accounts={data.accounts} />
            <CartsPanel carts={data.carts} />
          </div>

          <div className={styles.grid2}>
            <GeographyPanel geography={data.geography} />
            <SourcesPanel visitors={data.visitors} requiredEvents={tracker?.requiredEvents || []} />
          </div>

          <div className={styles.grid2}>
            <ProductsPanel products={data.products} />
            <InsightsPanel insights={data.insights || []} />
          </div>

          <div className={styles.grid2}>
            <NotesPanel notes={data.notes || []} />
            <RealtimePanel realtime={data.realtime} />
          </div>
        </>
      ) : null}
    </div>
  );
}
