'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import LineChart from '@/components/LineChart';
import BarList from '@/components/analytics/BarList';
import StatTile from '@/components/analytics/StatTile';
import { useScope } from '@/components/ScopeContext';
import { RANGE_PRESETS } from '@/lib/dashboard/range';
import {
  formatCurrency,
  formatDuration,
  formatNumber,
  formatPercent,
  relativeTime,
} from '@/lib/dashboard/format';
import RangePicker from '@/components/dashboard/RangePicker';
import Funnel from './Funnel';
import {
  InstallPanel,
  ProductsPanel,
  RecentPurchasesPanel,
  SearchesPanel,
  TopPagesPanel,
} from './WebsitePanels';

const TRAFFIC_COLORS = ['#2f8ef4', '#17a862'];

function Legend({ series, colors }) {
  return (
    <div className="chart-legend">
      {series.map((item, index) => (
        <span className="chart-legend-item" key={item.name}>
          <i style={{ background: colors[index] || '#888' }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}

function Head({ loading, error, tracking, periodLabel }) {
  const status = loading
    ? { text: 'Refreshing...', tone: 'wait' }
    : error
      ? { text: 'Data Unavailable', tone: 'bad' }
      : !tracking.installed
        ? { text: 'Tracking not installed', tone: 'bad' }
        : !tracking.hasDataInRange
          ? { text: 'Tracked, no traffic in period', tone: 'warn' }
          : { text: 'Tracking live', tone: 'ok' };

  return (
    <section className="wa-head">
      <div className="wa-head-copy">
        <span className="wa-eyebrow">E-commerce</span>
        <h1>Website Analytics</h1>
        <p>Traffic, product interest and storefront conversion, read separately from ERP sales.</p>

        <div className="wa-meta">
          <span className={'wa-status wa-status-' + status.tone}>
            <i />
            {status.text}
          </span>
          {periodLabel && <span>{periodLabel}</span>}
          {tracking.lastEventAt && <span>Last event {relativeTime(tracking.lastEventAt)}</span>}
        </div>
      </div>

      <div className="wa-head-actions">
        <a className="btn wa-head-btn" href="#install">
          Install guide
        </a>
      </div>
    </section>
  );
}

export default function WebsiteAnalyticsClient() {
  const { business, location, finYear, businessReady, locationReady } = useScope();

  const [presets, setPresets] = useState(RANGE_PRESETS);
  const [preset, setPreset] = useState('30d');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const lastKey = useRef('');
  const requestKey = [business, location, finYear, preset, from, to].join('|');
  const scopeReady = businessReady && locationReady;

  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams({ business: business || '', finYear: finYear || '' });
    fetch('/api/dashboard/options?' + params.toString(), { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((body) => {
        if (cancelled || !body) return;
        if (Array.isArray(body.presets) && body.presets.length) setPresets(body.presets);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [business, finYear]);

  useEffect(() => {
    if (!scopeReady) return undefined;

    if (lastKey.current !== requestKey) {
      setData(null);
      lastKey.current = requestKey;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({
      business: business || '',
      location: location || '',
      finYear: finYear || '',
      preset,
      from,
      to,
    });

    setLoading(true);
    setError('');

    fetch('/api/website-analytics/overview?' + params.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'Website analytics could not be loaded.');
        return body;
      })
      .then((body) => setData(body))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'Website analytics could not be loaded.');
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [scopeReady, requestKey, business, location, finYear, preset, from, to, tick]);

  const applyRange = (next) => {
    setPreset(next.preset);
    setFrom(next.from || '');
    setTo(next.to || '');
  };

  const kpis = data?.kpis || {};
  const tracking = data?.tracking || { installed: false, hasDataInRange: false };
  const installed = Boolean(tracking.installed);
  const range = data?.range || {};
  const initialLoading = loading && !data;
  const notTracked = Boolean(data) && !installed;
  const unavailable = notTracked ? 'Not tracked' : '';
  const periodLabel = data?.range?.label || 'Last 30 days';

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({
      business: business || '',
      location: location || '',
      finYear: finYear || '',
      preset,
      from,
      to,
    });
    return '/api/website-analytics/export?' + params.toString();
  }, [business, location, finYear, preset, from, to]);

  return (
    <>
      <Head loading={loading} error={error} tracking={tracking} periodLabel={data ? periodLabel : ''} />

      {error && (
        <div className="flash flash-err dash-flash">
          <span>{error}</span>
          <button type="button" className="btn ml-auto" onClick={() => setTick((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      <div className="card dash-controls">
        <div className="dash-controls-row">
          <div className="min-w-0">
            <span className="dash-eyebrow">Reporting period</span>
            <strong className="dash-period">{data ? periodLabel : 'Loading period...'}</strong>
            {range.days && (
              <span className="dash-period-sub">
                {range.days} day{range.days === 1 ? '' : 's'}
                {range.previousLabel ? ` · compared with the ${range.previousLabel}` : ''}
              </span>
            )}
          </div>

          <div className="dash-actions">
            <button
              type="button"
              className="btn"
              onClick={() => setTick((value) => value + 1)}
              disabled={loading}
            >
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>
            <a className="btn" href={exportHref}>Export CSV</a>
          </div>
        </div>

        <RangePicker
          presets={presets}
          preset={preset}
          from={from || range.fromKey || ''}
          to={to || range.toKey || ''}
          label={data ? `${range.fromKey || ''} to ${range.toKey || ''}` : ''}
          busy={loading}
          onApply={applyRange}
        />
      </div>

      <div className="wa-stat-grid">
        <StatTile
          icon="users"
          tone="green"
          label="Visitors"
          value={installed ? formatNumber(kpis.visitors?.value) : ''}
          previous={installed ? formatNumber(kpis.visitors?.previous) : ''}
          rawValue={kpis.visitors?.value}
          change={kpis.visitors?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="eye"
          tone="blue"
          label="Sessions"
          note="30 minute window"
          value={installed ? formatNumber(kpis.sessions?.value) : ''}
          previous={installed ? formatNumber(kpis.sessions?.previous) : ''}
          rawValue={kpis.sessions?.value}
          change={kpis.sessions?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="chart"
          tone="teal"
          label="Page views"
          value={installed ? formatNumber(kpis.pageviews?.value) : ''}
          previous={installed ? formatNumber(kpis.pageviews?.previous) : ''}
          rawValue={kpis.pageviews?.value}
          change={kpis.pageviews?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="cart"
          tone="amber"
          label="Purchases"
          value={installed ? formatNumber(kpis.purchases?.value) : ''}
          previous={installed ? formatNumber(kpis.purchases?.previous) : ''}
          rawValue={kpis.purchases?.value}
          change={kpis.purchases?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="cash"
          tone="rose"
          label="Tracked revenue"
          note="not added to ERP sales"
          value={installed ? formatCurrency(kpis.revenue?.value) : ''}
          previous={installed ? formatCurrency(kpis.revenue?.previous) : ''}
          rawValue={kpis.revenue?.value}
          change={kpis.revenue?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="checkCircle"
          tone="green"
          label="Conversion"
          note="sessions that bought"
          value={installed ? formatPercent(kpis.conversionRate?.value, { decimals: 2 }) : ''}
          previous={installed ? formatPercent(kpis.conversionRate?.previous, { decimals: 2 }) : ''}
          rawValue={kpis.conversionRate?.value}
          change={kpis.conversionRate?.change}
          changeSuffix=" pp"
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="undo"
          tone="blue"
          label="Bounce rate"
          note="one-page sessions"
          value={installed ? formatPercent(kpis.bounceRate?.value) : ''}
          previous={installed ? formatPercent(kpis.bounceRate?.previous) : ''}
          rawValue={kpis.bounceRate?.value}
          change={kpis.bounceRate?.change}
          changeSuffix=" pp"
          goodWhen="down"
          unavailable={unavailable}
          loading={initialLoading}
        />
        <StatTile
          icon="cal"
          tone="teal"
          label="Average session"
          value={installed ? formatDuration(kpis.avgSession?.value) : ''}
          previous={installed ? formatDuration(kpis.avgSession?.previous) : ''}
          rawValue={kpis.avgSession?.value}
          change={kpis.avgSession?.change}
          unavailable={unavailable}
          loading={initialLoading}
        />
      </div>

      {data && !installed && (
        <InstallPanel businessId={data.scope?.businessId || business} />
      )}

      {data && installed && !tracking.hasDataInRange && (
        <div className="card wa-hint">
          <div className="card-body">
            <strong>The tag is connected, but this period has no events.</strong>
            <p>
              That is a real zero for the selected period, not a missing integration. Widen the
              period or check that the storefront is still sending <code>pageview</code> events.
            </p>
          </div>
        </div>
      )}

      <div className="dash-grid-2">
        <div className="card chart-card mb-0">
          <div className="card-head">
            <span className="card-title">Daily traffic</span>
            <span className="card-sub">{installed ? 'page views and sessions' : 'not tracked'}</span>
          </div>
          <div className="card-body chart-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : installed && data?.daily?.labels?.length ? (
              <>
                <LineChart
                  labels={data.daily.labels}
                  series={[
                    { name: 'Page views', points: data.daily.pageviews || [] },
                    { name: 'Sessions', points: data.daily.sessions || [] },
                  ]}
                  colors={TRAFFIC_COLORS}
                  height={250}
                />
                <Legend
                  series={[
                    { name: 'Page views' },
                    { name: 'Sessions' },
                  ]}
                  colors={TRAFFIC_COLORS}
                />
              </>
            ) : (
              <p className="dash-empty">
                {installed ? 'No traffic was tracked in this period.' : 'Install the tag to start collecting traffic.'}
              </p>
            )}
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Conversion funnel</span>
            <span className="card-sub">sessions</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : !installed ? (
              <p className="dash-empty">Install the tag to measure the funnel.</p>
            ) : (
              <Funnel steps={data?.funnel?.steps || []} conversionRate={data?.funnel?.conversionRate} />
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid-3">
        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Traffic sources</span>
            <span className="card-sub">sessions</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={(data?.sources || []).map((source) => ({
                  ...source,
                  sub: `${formatNumber(source.pageviews)} views · ${formatNumber(source.purchases)} purchases · ${formatCurrency(source.revenue)}`,
                }))}
                valueKey="sessions"
                subKey="sub"
                formatValue={(value) => formatNumber(value)}
                empty={installed ? 'No source was recorded in this period.' : 'Not tracked yet.'}
              />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Devices</span>
            <span className="card-sub">sessions</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={(data?.devices || []).map((device) => ({
                  ...device,
                  original: device.share,
                }))}
                valueKey="sessions"
                formatValue={(value) => formatNumber(value)}
                tone="blue"
                empty={installed ? 'No device was recorded in this period.' : 'Not tracked yet.'}
              />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Countries</span>
            <span className="card-sub">sessions</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={data?.countries || []}
                valueKey="sessions"
                formatValue={(value) => formatNumber(value)}
                tone="amber"
                empty={installed ? 'No country was recorded in this period.' : 'Not tracked yet.'}
              />
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Top pages</span>
            <span className="card-sub">by views</span>
          </div>
          <div className="card-body p-0">
            {initialLoading ? (
              <div className="center-load pad"><span className="spin" /></div>
            ) : !installed ? (
              <p className="dash-empty pad">Not tracked yet.</p>
            ) : (
              <TopPagesPanel rows={data?.topPages || []} />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Referrers</span>
            <span className="card-sub">by sessions</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={(data?.referrers || []).map((referrer) => ({
                  ...referrer,
                  label: referrer.host,
                }))}
                formatValue={(value) => formatNumber(value)}
                tone="teal"
                empty={installed ? 'No external referrer was recorded in this period.' : 'Not tracked yet.'}
              />
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <div className="card-head">
          <span className="card-title">Product interest</span>
          <span className="card-sub">views, carts and purchases</span>
        </div>
        <div className="card-body p-0">
          {initialLoading ? (
            <div className="center-load pad"><span className="spin" /></div>
          ) : !installed ? (
            <p className="dash-empty pad">Not tracked yet.</p>
          ) : (
            <ProductsPanel rows={data?.products || []} />
          )}
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">On-site searches</span>
            <span className="card-sub">top terms</span>
          </div>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : !installed ? (
              <p className="dash-empty">Not tracked yet.</p>
            ) : (
              <SearchesPanel rows={data?.searches || []} />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <div className="card-head">
            <span className="card-title">Recent purchases</span>
            <span className="card-sub">tracked by the tag</span>
          </div>
          <div className="card-body p-0">
            {initialLoading ? (
              <div className="center-load pad"><span className="spin" /></div>
            ) : !installed ? (
              <p className="dash-empty pad">Not tracked yet.</p>
            ) : (
              <RecentPurchasesPanel rows={data?.recentPurchases || []} />
            )}
          </div>
        </div>
      </div>

      <div className="card" id="install">
        <div className="card-head">
          <span className="card-title">Setup &amp; privacy</span>
          <span className="card-sub">operator notes</span>
        </div>
        <div className="card-body">
          <ul className="dash-notes-list">
            {(data?.notes?.length ? data.notes : [
              'Add public/we-analytics.js to the storefront and set data-business to this branch.',
              'Consent is denied until the visitor grants it; Do Not Track always blocks collection.',
              'Purchases are deduplicated by order id, and page query strings, referrer paths, IP addresses and User-Agent strings are never stored.',
            ]).map((note) => <li key={note}>{note}</li>)}
          </ul>
          <p className="dash-note-line">
            Full setup, environment variables and the event schema are documented in
            <code> WEBSITE_ANALYTICS.md</code>.
          </p>
        </div>
      </div>
    </>
  );
}
