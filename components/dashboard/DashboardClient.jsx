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
import { useScope } from '@/components/ScopeContext';
import {
  count, dateRangeLabel, daysBetween, financialYearBounds,
  periodForFinancialYear, timeLabel,
} from './format';

const EMPTY_FILTERS = {
  channel: 'all',
  comparison: 'previous_period',
  startDate: '',
  endDate: '',
};

const LIVE_REFRESH_MS = 60_000;

function validateFilters(filters, financialYear) {
  if (!financialYear) return 'Choose a financial year in the top bar.';
  const bounds = financialYearBounds(financialYear);
  if (!filters.startDate || !filters.endDate) return 'Choose both a start and an end date.';
  if (filters.startDate > filters.endDate) return 'The start date must be on or before the end date.';
  const days = daysBetween(filters.startDate, filters.endDate);
  if (days > 366) return `Select 366 days or fewer. This range is ${count(days)} days.`;
  if (filters.startDate < bounds.start || filters.endDate > bounds.end) {
    return `The selected dates must fall inside financial year ${financialYear}.`;
  }
  return '';
}

function validId(value) {
  return /^[a-f\d]{24}$/i.test(String(value || ''));
}

function financialYearLabel(value) {
  const match = /^(\d{4})-(\d{4})$/.exec(String(value || ''));
  return match ? `FY ${match[1]}–${match[2].slice(-2)}` : '';
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
  const {
    businesses, locations, business: headerBusiness, location: headerLocation, finYear: headerFinancialYear,
    businessReady, locationReady,
  } = useScope();
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
  const [datesForFinancialYear, setDatesForFinancialYear] = useState('');
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

  /* The report options are loaded independently of the global ERP selectors
     and are narrowed to the session's authorized locations by the route. */
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
      })
      .catch((err) => {
        if (!alive || err.name === 'AbortError') return;
        setOptionsError(err.message || 'The dashboard filters could not be loaded.');
      })
      .finally(() => { if (alive) setOptionsLoading(false); });

    return () => { alive = false; controller.abort(); };
  }, [optionsRetry]);

  useEffect(() => {
    if (!businessReady || !locationReady || !headerFinancialYear) return;
    const bounds = financialYearBounds(headerFinancialYear);
    if (!bounds.start || !bounds.end) return;

    setFilters((current) => {
      if (current.startDate && current.endDate
        && current.startDate >= bounds.start && current.endDate <= bounds.end) return current;
      return { ...current, ...periodForFinancialYear(headerFinancialYear) };
    });
    setDatesForFinancialYear(headerFinancialYear);
  }, [businessReady, locationReady, headerFinancialYear]);

  const contextReady = businessReady
    && locationReady
    && validId(headerBusiness)
    && validId(headerLocation)
    && /^\d{4}-\d{4}$/.test(String(headerFinancialYear || ''));
  const contextError = !businessReady || !locationReady
    ? ''
    : !validId(headerBusiness)
      ? 'Choose a company in the top bar to load this report.'
      : !validId(headerLocation)
        ? 'Choose a location in the top bar to load this report.'
        : !/^\d{4}-\d{4}$/.test(String(headerFinancialYear || ''))
          ? 'Choose a financial year in the top bar to load this report.'
          : '';
  const reportFilters = useMemo(() => ({
    company: headerBusiness,
    branch: headerLocation,
    financialYear: headerFinancialYear,
    ...filters,
  }), [headerBusiness, headerLocation, headerFinancialYear, filters]);
  const validationError = useMemo(
    () => validateFilters(filters, headerFinancialYear),
    [filters, headerFinancialYear]
  );

  /* Every filter change becomes one private, abortable request. A response is
     only allowed to land if it belongs to the latest request. */
  useEffect(() => {
    if (!options) {
      requestSeq.current += 1;
      setLoading(true);
      setData(null);
      setError(null);
      return undefined;
    }
    if (!contextReady || datesForFinancialYear !== headerFinancialYear) {
      requestSeq.current += 1;
      setLoading(!businessReady || !locationReady);
      setData(null);
      setError(contextError
        ? { message: contextError, code: 'GLOBAL_CONTEXT', validation: true }
        : null);
      return undefined;
    }
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
      fetch(`/api/dashboard/analytics?${queryString(reportFilters)}`, {
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
  }, [
    options, contextReady, datesForFinancialYear, headerFinancialYear, reportFilters,
    filters, validationError, contextError, businessReady, locationReady, refreshTick,
  ]);

  function changeFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }

  function retry() {
    setRefreshTick((tick) => tick + 1);
  }

  async function download() {
    if (!data) return;
    setDownloading(true);
    setDownloadError('');
    try {
      const response = await fetch(`/api/dashboard/export?${queryString(reportFilters)}`, { cache: 'no-store' });
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
  const companyLabel = businesses.find((company) => company.value === headerBusiness)?.label
    || (businessReady ? 'Company unavailable' : 'Loading company…');
  const branchLabel = locations.find((location) => location.value === headerLocation)?.label
    || (locationReady ? 'Location unavailable' : 'Loading location…');
  const financialYearText = financialYearLabel(headerFinancialYear)
    || (businessReady ? 'Financial year unavailable' : 'Loading financial year…');
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
              <span className={styles.heroChip}><Glyph name="calendar" size={13} /> {financialYearText}</span>
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
          financialYear={headerFinancialYear}
          onChange={changeFilter}
          onRefresh={retry}
          onDownload={download}
          loading={loading}
          optionsLoading={optionsLoading}
          optionsError={optionsError}
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
