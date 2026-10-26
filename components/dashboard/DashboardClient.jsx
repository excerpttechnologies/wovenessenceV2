'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './dashboard.module.css';
import FilterBar from './FilterBar';
import KpiGrid from './KpiGrid';
import KeyTakeaway from './KeyTakeaway';
import RevenueTrend from './RevenueTrend';
import InsightsPanel from './InsightsPanel';
import CategoryDonut from './CategoryDonut';
import TopProducts from './TopProducts';
import RegionPerformance from './RegionPerformance';
import ChannelPerformance from './ChannelPerformance';
import ForecastPanel from './ForecastPanel';
import DataNotes from './DataNotes';
import { EmptyState, ErrorPanel, Glyph, Skeleton, StatusPill } from './ui';
import {
  count, dateRangeLabel, daysBetween, financialYearBounds,
  periodForFinancialYear, timeLabel,
} from './format';

const EMPTY_FILTERS = {
  company: '',
  branch: '',
  channel: 'all',
  financialYear: '',
  comparison: 'previous_period',
  startDate: '',
  endDate: '',
};

const LIVE_REFRESH_MS = 60_000;

function validateFilters(filters) {
  if (!filters.financialYear) return 'Choose a financial year.';
  const bounds = financialYearBounds(filters.financialYear);
  if (!filters.startDate || !filters.endDate) return 'Choose both a start and an end date.';
  if (filters.startDate > filters.endDate) return 'The start date must be on or before the end date.';
  const days = daysBetween(filters.startDate, filters.endDate);
  if (days > 366) return `Select 366 days or fewer. This range is ${count(days)} days.`;
  if (filters.startDate < bounds.start || filters.endDate > bounds.end) {
    return `The selected dates must fall inside financial year ${filters.financialYear}.`;
  }
  return '';
}

function queryString(filters) {
  const params = new URLSearchParams();
  Object.entries(filters).forEach(([key, value]) => {
    if (value !== '' && value !== null && value !== undefined) params.set(key, value);
  });
  return params.toString();
}

function DashboardSkeleton() {
  return (
    <div className={styles.skeletonShell} aria-busy="true" aria-label="Loading sales dashboard">
      <div className={styles.skeletonKpis}>
        {Array.from({ length: 5 }).map((_, index) => (
          <div key={index} className={styles.skeletonCard}>
            <Skeleton className={styles.skIcon} />
            <Skeleton className={styles.skLabel} />
            <Skeleton className={styles.skValue} />
            <Skeleton className={styles.skFoot} />
          </div>
        ))}
      </div>
      <div className={styles.skeletonGrid}>
        <div className={styles.skeletonPanel}><Skeleton className={styles.skPanelTitle} /><Skeleton className={styles.skChart} /></div>
        <div className={styles.skeletonPanel}><Skeleton className={styles.skPanelTitle} /><Skeleton className={styles.skLines} /></div>
      </div>
      <div className={styles.skeletonGrid}>
        <div className={styles.skeletonPanel}><Skeleton className={styles.skPanelTitle} /><Skeleton className={styles.skChartSmall} /></div>
        <div className={styles.skeletonPanel}><Skeleton className={styles.skPanelTitle} /><Skeleton className={styles.skLines} /></div>
      </div>
    </div>
  );
}

export default function DashboardClient() {
  const [options, setOptions] = useState(null);
  const [optionsLoading, setOptionsLoading] = useState(true);
  const [optionsError, setOptionsError] = useState('');
  const [optionsRetry, setOptionsRetry] = useState(0);
  const [filters, setFilters] = useState(EMPTY_FILTERS);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [refreshTick, setRefreshTick] = useState(0);
  const [lastUpdated, setLastUpdated] = useState('');
  const [downloading, setDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState('');
  const requestSeq = useRef(0);

  useEffect(() => {
    const refreshWhenVisible = () => {
      if (document.visibilityState === 'visible') {
        setRefreshTick((tick) => tick + 1);
      }
    };
    const interval = window.setInterval(refreshWhenVisible, LIVE_REFRESH_MS);
    document.addEventListener('visibilitychange', refreshWhenVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', refreshWhenVisible);
    };
  }, []);

  /* Filter vocabulary is fetched once per page load. It is already narrowed
     to the session's locations by the route. */
  useEffect(() => {
    const controller = new AbortController();
    let alive = true;
    setOptionsLoading(true);
    setOptionsError('');

    fetch('/api/dashboard/options', { signal: controller.signal, cache: 'no-store' })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) throw new Error(body?.error || 'The dashboard filters could not be loaded.');
        return body;
      })
      .then((body) => {
        if (!alive) return;
        setOptions(body);
        const fy = body.currentFinancialYear?.value || body.financialYears?.[0]?.value || '';
        const period = body.defaultPeriod || periodForFinancialYear(fy);
        setFilters({
          ...EMPTY_FILTERS,
          financialYear: fy,
          startDate: period.startDate,
          endDate: period.endDate,
        });
      })
      .catch((err) => {
        if (!alive || err.name === 'AbortError') return;
        setOptionsError(err.message || 'The dashboard filters could not be loaded.');
      })
      .finally(() => { if (alive) setOptionsLoading(false); });

    return () => { alive = false; controller.abort(); };
  }, [optionsRetry]);

  const validationError = useMemo(() => (options ? validateFilters(filters) : ''), [options, filters]);

  /* Every filter change becomes one private, abortable request. A response is
     only allowed to land if it belongs to the latest request. */
  useEffect(() => {
    if (!options) return undefined;
    if (validationError) {
      setLoading(false);
      setData(null);
      setError({ message: validationError, code: 'CHECK_FILTERS', validation: true });
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
      fetch(`/api/dashboard/analytics?${queryString(filters)}`, {
        signal: controller.signal,
        cache: 'no-store',
      })
        .then(async (response) => {
          const body = await response.json().catch(() => null);
          if (!response.ok) {
            const failure = new Error(body?.error || 'The sales analytics could not be loaded. Please retry.');
            failure.code = body?.code;
            failure.field = body?.field;
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
          setError({ message: err.message, code: err.code, field: err.field });
        })
        .finally(() => {
          if (alive && sequence === requestSeq.current) setLoading(false);
        });
    }, 220);

    return () => {
      alive = false;
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [options, filters, validationError, refreshTick]);

  function changeFilter(key, value) {
    setFilters((current) => {
      const next = { ...current, [key]: value };
      if (key === 'company') next.branch = '';
      if (key === 'financialYear') Object.assign(next, periodForFinancialYear(value));
      return next;
    });
  }

  function retry() {
    setRefreshTick((tick) => tick + 1);
  }

  async function download() {
    if (!data) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await fetch(`/api/dashboard/export?${queryString(filters)}`, { cache: 'no-store' });
      if (!response.ok) {
        const body = await response.json().catch(() => null);
        throw new Error(body?.error || 'The report could not be built. Please retry.');
      }
      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const match = /filename="([^"]+)"/i.exec(disposition);
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = match?.[1] || 'sales-dashboard.xlsx';
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setDownloadError(err.message || 'The report could not be built. Please retry.');
    } finally {
      setDownloading(false);
    }
  }

  const meta = data?.meta;
  const branchLabel = meta?.branchLabel
    || (filters.branch
      ? options?.branches.find((branch) => branch.value === filters.branch)?.label
      : 'All four branches')
    || 'All branches';
  const companyLabel = meta?.companyLabel || (filters.company
    ? options?.companies.find((company) => company.value === filters.company)?.label
    : 'All companies') || 'All companies';
  const comparisonLabel = meta?.comparison?.label || (filters.comparison === 'none' ? '' : 'Comparing');
  const rangeLabel = meta
    ? dateRangeLabel(meta.startDate, meta.endDate)
    : filters.startDate && filters.endDate
      ? dateRangeLabel(filters.startDate, filters.endDate)
      : 'Preparing the report';
  const emptySelection = data
    && Number(data.kpis?.current?.orders || 0) === 0
    && Number(data.kpis?.current?.revenue || 0) === 0;
  const statusTone = error ? 'warning' : loading ? 'gold' : 'positive';

  return (
    <div className={styles.shell}>
      <section className={styles.hero}>
        <span className={styles.heroWeave} aria-hidden="true" />
        <div className={styles.heroInner}>
          <div className={styles.heroCopy}>
            <span className={styles.heroEyebrow}>
              <Glyph name="sparkle" size={14} /> Retail ERP · Sales intelligence
            </span>
            <h1 className={styles.heroTitle}>Retail Saree &amp; Fabric Business</h1>
            <p className={styles.heroSub}>
              <b>AI-Powered Sales Report</b> · Four boutiques, read from the ERP and the storefront.
              Net revenue, returns and channel attribution stay reconciled to the records — nothing
              is estimated.
            </p>
            <div className={styles.heroMeta}>
              <span className={styles.heroChip}><Glyph name="calendar" size={13} /> {rangeLabel}</span>
              <span className={styles.heroChip}><Glyph name="store" size={13} /> {branchLabel}</span>
              <span className={styles.heroChip}><Glyph name="filter" size={13} /> {companyLabel}</span>
              <StatusPill tone={statusTone} icon={error ? 'warning' : loading ? 'refresh' : 'check'}>
                {error ? 'Data unavailable' : loading ? 'Reading records' : 'Live ERP + storefront'}
              </StatusPill>
            </div>
          </div>

          <div className={styles.heroAside}>
            <span className={styles.heroAsideLabel}>Report currency</span>
            <b className={styles.heroAsideValue}>INR</b>
            <span className={styles.heroAsideLine}>
              {meta ? `${count(meta.days)} calendar days` : 'Inclusive India dates'}
            </span>
            <span className={styles.heroAsideLine}>
              {comparisonLabel ? `Compared with ${comparisonLabel}` : 'No comparison period'}
            </span>
            <span className={styles.heroAsideRule} />
            <span className={styles.heroAsideLine}>Rule-based insights · no AI provider</span>
          </div>
        </div>
      </section>

      {options ? (
        <FilterBar
          options={options}
          filters={filters}
          onChange={changeFilter}
          onRefresh={retry}
          onDownload={download}
          loading={loading}
          downloading={downloading}
          lastUpdated={lastUpdated}
          error={error?.validation ? error.message : ''}
          canDownload={Boolean(data)}
        />
      ) : null}

      {downloadError ? (
        <div className={styles.actionError} role="alert">
          <Glyph name="warning" size={16} /> {downloadError}
          <button type="button" onClick={() => setDownloadError('')}>Dismiss</button>
        </div>
      ) : null}

      {optionsLoading ? <DashboardSkeleton /> : null}

      {!optionsLoading && optionsError ? (
        <ErrorPanel
          message={optionsError}
          code="FILTERS"
          onRetry={() => setOptionsRetry((value) => value + 1)}
        />
      ) : null}

      {!optionsLoading && options && error && !data ? (
        <ErrorPanel
          message={error.message}
          code={error.code}
          onRetry={error.validation ? null : retry}
        />
      ) : null}

      {!optionsLoading && options && !data && loading && !error ? <DashboardSkeleton /> : null}

      {data ? (
        <div className={`${styles.dataShell} ${loading ? styles.dataUpdating : ''}`} aria-busy={loading}>
          {loading ? (
            <div className={styles.updatingBar} role="status">
              <Glyph name="refresh" size={14} className={styles.spinning} />
              Updating the view for the selected filters…
            </div>
          ) : null}

          <KpiGrid kpis={data.kpis} comparisonLabel={comparisonLabel} />

          <KeyTakeaway text={data.keyTakeaway} />

          {emptySelection ? (
            <div className={styles.emptyCard}>
              <EmptyState
                title={data.meta?.channel === 'instagram' ? 'No bill was tagged Instagram in this selection' : 'No eligible sales in this selection'}
                message={data.meta?.channel === 'instagram'
                  ? 'Instagram sales are the bills whose Sales Channel was saved as Instagram at billing. Nothing is inferred, so an untagged order stays offline until its bill is corrected.'
                  : 'The tables remain visible so zero activity can be distinguished from an unavailable source. Adjust the date range, branch or channel.'}
              />
            </div>
          ) : null}

          <div className={`${styles.grid} ${styles.gridMain}`}>
            <RevenueTrend trend={data.trend} loading={loading} />
            <InsightsPanel insights={data.insights} />
          </div>

          <div className={`${styles.grid} ${styles.gridTwo}`}>
            <CategoryDonut categories={data.categories} totalRevenue={data.kpis?.current?.revenue} />
            <TopProducts products={data.products} loading={loading} />
          </div>

          <RegionPerformance
            branches={data.branches}
            branchLabel={data.meta?.branchLabel}
            branchFiltered={Boolean(data.meta?.branch)}
          />

          <ChannelPerformance
            channels={data.channels}
            reconciliation={data.reconciliation}
            selectedChannel={data.meta?.channel}
          />

          <ForecastPanel
            forecast={data.forecast}
            recommendations={data.recommendations}
            inventory={data.inventory}
          />

          <DataNotes dataQuality={data.dataQuality} meta={data.meta} />

          <footer className={styles.pageFoot}>
            <span>Generated {lastUpdated ? timeLabel(lastUpdated) : 'just now'} IST · {rangeLabel}</span>
            <span>Revenue is net recorded revenue. Zero means no recorded activity since go-live; N/A is reserved for unavailable sources.</span>
          </footer>
        </div>
      ) : null}
    </div>
  );
}
