'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import Icon from '@/components/Icon';
import LineChart from '@/components/LineChart';
import BarList from '@/components/analytics/BarList';
import StatTile from '@/components/analytics/StatTile';
import { useScope } from '@/components/ScopeContext';
import { RANGE_PRESETS } from '@/lib/dashboard/range';
import {
  formatCompactCurrency,
  formatCurrency,
  formatDateTime,
  formatNumber,
  formatPercent,
  relativeTime,
} from '@/lib/dashboard/format';
import RangePicker from './RangePicker';

const SALES_COLORS = ['#17a862', '#e2587c'];
const PURCHASE_COLORS = ['#3d7ce6'];

function greeting(hour) {
  if (hour === null || hour === undefined) return 'Welcome';
  if (hour < 12) return 'Good Morning';
  if (hour < 17) return 'Good Afternoon';
  return 'Good Evening';
}

function statusTone(status) {
  const text = String(status || '').toLowerCase();
  if (/paid|complete|closed|refund/.test(text)) return 'pill-green';
  if (/part/.test(text)) return 'pill-yellow';
  if (/due|unpaid|pending|fail/.test(text)) return 'pill-red';
  if (/invoice/.test(text)) return 'pill-blue';
  return 'pill-grey';
}

function Legend({ series, colors }) {
  if (!series?.length) return null;
  return (
    <div className="chart-legend">
      {series.map((item, index) => (
        <span className="chart-legend-item" key={item.name + index}>
          <i style={{ background: colors[index] || '#888' }} />
          {item.name}
        </span>
      ))}
    </div>
  );
}

function Hero({ user, finYear, loading, failed, stale, rangeLabel }) {
  const [now, setNow] = useState(null);

  useEffect(() => setNow(new Date()), []);

  const chip = loading
    ? 'Refreshing...'
    : failed
      ? 'Data Unavailable'
      : stale
        ? 'Showing Last Result'
        : 'All Systems Operational';

  return (
    <section className="hero">
      <div className="hero-bg" />
      <div className="hero-tint" />

      <div className="hero-inner">
        <div className="min-w-0">
          <p className="hero-greet">
            {greeting(now?.getHours())} <span aria-hidden="true">&#128075;</span>
          </p>

          <h1 className="hero-name">{user?.name || 'There'}</h1>
          <p className="hero-sub">A live read of sales, stock and the storefront - all in one place</p>

          <div className="hero-meta">
            <span className={'hero-chip ' + (failed ? 'hero-chip-bad' : '')}>
              <i className="hero-dot" />
              {chip}
            </span>

            {now && (
              <span className="hero-fact">
                {now.toLocaleDateString('en-IN', {
                  weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
                })}
              </span>
            )}

            {finYear && <span className="hero-fact">Financial Year {finYear}</span>}
            {rangeLabel && <span className="hero-fact">{rangeLabel}</span>}
          </div>
        </div>

        <p className="hero-quote">
          Streamline
          <span>Operate</span>
          <span>Grow <b>Together</b></span>
        </p>
      </div>
    </section>
  );
}

function SectionHead({ title, sub, children }) {
  return (
    <div className="card-head">
      <span className="card-title">{title}</span>
      {sub && <span className="card-sub">{sub}</span>}
      {children}
    </div>
  );
}

export default function DashboardClient() {
  const { business, location, finYear, user, businessReady, locationReady } = useScope();

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

  /* The period presets come from the API so a server-side change to the list
     reaches the screen. The local constant is the fallback: a failed options
     call must not leave the picker with no controls at all. */
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

    /* A new scope or period starts from a clean slate. A manual refresh keeps
       the last answer on screen while it re-reads, so the page does not blink
       for a figure that has not changed. */
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

    fetch('/api/dashboard/analytics?' + params.toString(), {
      cache: 'no-store',
      signal: controller.signal,
    })
      .then(async (response) => {
        const body = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(body.error || 'The dashboard could not be loaded.');
        return body;
      })
      .then((body) => setData(body))
      .catch((err) => {
        if (err.name === 'AbortError') return;
        setError(err.message || 'The dashboard could not be loaded.');
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
  const inventory = data?.inventory || {};
  const website = data?.website || {};
  const range = data?.range || {};
  const initialLoading = loading && !data;
  const stale = Boolean(error && data);

  const exportHref = useMemo(() => {
    const params = new URLSearchParams({
      business: business || '',
      location: location || '',
      finYear: finYear || '',
      preset,
      from,
      to,
    });
    return '/api/dashboard/export?' + params.toString();
  }, [business, location, finYear, preset, from, to]);

  const periodLabel = range.label || 'Last 30 days';

  return (
    <>
      <Hero
        user={user}
        finYear={finYear}
        loading={loading}
        failed={Boolean(error && !data)}
        stale={stale}
        rangeLabel={data ? periodLabel : ''}
      />

      {error && (
        <div className="flash flash-err dash-flash">
          <span>{error}</span>
          <button type="button" className="btn ml-auto" onClick={() => setTick((value) => value + 1)}>
            Try again
          </button>
        </div>
      )}

      <div className="stat-row grid grid-cols-1 gap-3.5 sm:grid-cols-2 xl:grid-cols-6">
        <StatTile
          icon="chart"
          tone="green"
          label="Net sales"
          note="invoices less returns"
          value={data ? formatCompactCurrency(kpis.netSales?.value) : ''}
          previous={data ? formatCompactCurrency(kpis.netSales?.previous) : ''}
          rawValue={kpis.netSales?.value}
          change={kpis.netSales?.change}
          loading={initialLoading}
        />
        <StatTile
          icon="register"
          tone="blue"
          label="Gross sales"
          value={data ? formatCompactCurrency(kpis.grossSales?.value) : ''}
          previous={data ? formatCompactCurrency(kpis.grossSales?.previous) : ''}
          rawValue={kpis.grossSales?.value}
          change={kpis.grossSales?.change}
          loading={initialLoading}
        />
        <StatTile
          icon="undo"
          tone="rose"
          label="Returns"
          note="POS and invoices"
          value={data ? formatCompactCurrency(kpis.returns?.value) : ''}
          previous={data ? formatCompactCurrency(kpis.returns?.previous) : ''}
          rawValue={kpis.returns?.value}
          change={kpis.returns?.change}
          goodWhen="down"
          loading={initialLoading}
        />
        <StatTile
          icon="bag"
          tone="teal"
          label="Orders"
          value={data ? formatNumber(kpis.orders?.value) : ''}
          previous={data ? formatNumber(kpis.orders?.previous) : ''}
          rawValue={kpis.orders?.value}
          change={kpis.orders?.change}
          loading={initialLoading}
        />
        <StatTile
          icon="cash"
          tone="amber"
          label="Average order"
          value={data ? formatCompactCurrency(kpis.averageOrderValue?.value) : ''}
          previous={data ? formatCompactCurrency(kpis.averageOrderValue?.previous) : ''}
          rawValue={kpis.averageOrderValue?.value}
          change={kpis.averageOrderValue?.change}
          loading={initialLoading}
        />
        <StatTile
          icon="users"
          tone="violet"
          label="Customers"
          note={data ? `${formatNumber(kpis.units?.value)} units sold` : ''}
          value={data ? formatNumber(kpis.customers?.value) : ''}
          previous={data ? formatNumber(kpis.customers?.previous) : ''}
          rawValue={kpis.customers?.value}
          change={kpis.customers?.change}
          loading={initialLoading}
        />
      </div>

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
              <Icon name="refresh" size={15} />
              {loading ? 'Refreshing...' : 'Refresh'}
            </button>

            <a className="btn" href={exportHref} aria-label="Download dashboard CSV">
              <Icon name="file" size={15} />
              Export CSV
            </a>
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

      <div className="dash-grid-2">
        <div className="card chart-card mb-0">
          <SectionHead
            title="Sales trend"
            sub={data ? `${formatCurrency(kpis.netSales?.value)} net` : 'Sales and returns'}
          >
            {data && !data.dataState?.hasSales && <span className="pill pill-grey">No sales in period</span>}
          </SectionHead>
          <div className="card-body chart-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : data ? (
              <>
                <LineChart
                  labels={data.salesTrend?.labels || []}
                  series={data.salesTrend?.series || []}
                  colors={SALES_COLORS}
                  height={250}
                />
                <Legend series={data.salesTrend?.series || []} colors={SALES_COLORS} />
              </>
            ) : null}
          </div>
        </div>

        <div className="card chart-card mb-0">
          <SectionHead
            title="Purchases"
            sub={data ? `${formatCompactCurrency(data.purchaseTrend?.total)} · ${data.purchaseTrend?.source || ''}` : 'Goods received'}
          >
            {data && !data.dataState?.hasPurchases && <span className="pill pill-grey">No purchases in period</span>}
          </SectionHead>
          <div className="card-body chart-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : data ? (
              <>
                <LineChart
                  labels={data.purchaseTrend?.labels || []}
                  series={data.purchaseTrend?.series || []}
                  colors={PURCHASE_COLORS}
                  height={250}
                />
                <Legend series={data.purchaseTrend?.series || []} colors={PURCHASE_COLORS} />
              </>
            ) : null}
          </div>
        </div>
      </div>

      <div className="dash-grid-3">
        <div className="card mb-0">
          <SectionHead title="Sales channels" sub="net of returns" />
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={(data?.channels || []).map((channel) => ({
                  ...channel,
                  value: channel.net,
                  sub: `${formatCompactCurrency(channel.sales)} sales · ${formatNumber(channel.orders)} orders`,
                }))}
                formatValue={(value, row) => `${formatCompactCurrency(value)} · ${formatPercent(row.share)}`}
                empty="No sales were recorded in this period."
              />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <SectionHead title="Payment mix" sub="what the till collected" />
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <BarList
                rows={(data?.payments || []).map((payment) => ({
                  ...payment,
                  sub: formatPercent(payment.share),
                }))}
                formatValue={(value) => formatCompactCurrency(value)}
                tone="blue"
                empty="No POS payment was recorded in this period."
              />
            )}
          </div>
        </div>

        <div className="card mb-0">
          <SectionHead title="Top products" sub="by revenue" />
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : data?.topProducts?.length ? (
              <BarList
                rows={data.topProducts.map((product) => ({
                  ...product,
                  label: product.name,
                  value: product.revenue,
                  sub: `${formatNumber(product.qty)} sold${product.code ? ` · ${product.code}` : ''}`,
                }))}
                formatValue={(value) => formatCompactCurrency(value)}
                tone="amber"
              />
            ) : (
              <p className="dash-empty">No product lines were sold in this period.</p>
            )}
          </div>
        </div>
      </div>

      <div className="dash-grid-2">
        <div className="card mb-0">
          <SectionHead title="Inventory at cost" sub={data ? `${formatNumber(inventory.items)} items` : ''} />
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : (
              <>
                <div className="dash-mini-stats">
                  <div>
                    <span>Stock value</span>
                    <strong>{formatCurrency(inventory.value)}</strong>
                  </div>
                  <div>
                    <span>Units in stock</span>
                    <strong>{formatNumber(inventory.units)}</strong>
                  </div>
                  <div>
                    <span>Low stock</span>
                    <strong className={inventory.lowStockCount ? 'text-[#b77900]' : ''}>
                      {formatNumber(inventory.lowStockCount)}
                    </strong>
                  </div>
                  <div>
                    <span>Out of stock</span>
                    <strong className={inventory.outOfStockCount ? 'text-danger' : ''}>
                      {formatNumber(inventory.outOfStockCount)}
                    </strong>
                  </div>
                </div>

                <div className="dash-subhead">Needs attention</div>
                {inventory.lowStock?.length || inventory.outOfStock?.length ? (
                  <ul className="dash-list">
                    {(inventory.outOfStock || []).map((item) => (
                      <li key={'out-' + (item.code || item.name)}>
                        <span className="dash-list-name" title={item.name}>{item.name}</span>
                        <span className="pill pill-red">Out</span>
                      </li>
                    ))}
                    {(inventory.lowStock || []).map((item) => (
                      <li key={'low-' + (item.code || item.name)}>
                        <span className="dash-list-name" title={item.name}>{item.name}</span>
                        <span className="pill pill-yellow">{formatNumber(item.qty)} left</span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="dash-empty">
                    {inventory.items ? 'Nothing is at or below the low-stock level.' : 'No barcode stock rows are available for this scope.'}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        <div className="card mb-0">
          <SectionHead
            title="Website tracking"
            sub="storefront, kept separate"
          >
            <Link className="card-sub dash-link" href="/admin/ecommerce/website-analytics">
              Open analytics
            </Link>
          </SectionHead>
          <div className="card-body">
            {initialLoading ? (
              <div className="center-load"><span className="spin" /></div>
            ) : !website.installed ? (
              <div className="dash-hint">
                <span className="dash-hint-ico"><Icon name="eye" size={20} /></span>
                <div>
                  <strong>Not connected yet</strong>
                  <p>
                    No storefront event has been received. Add <code>public/we-analytics.js</code> to the
                    website and set its <code>data-business</code> attribute.
                  </p>
                </div>
              </div>
            ) : (
              <>
                <div className="dash-mini-stats">
                  <div>
                    <span>Events in period</span>
                    <strong>{formatNumber(website.events)}</strong>
                  </div>
                  <div>
                    <span>Tracked purchases</span>
                    <strong>{formatNumber(website.purchases)}</strong>
                  </div>
                  <div>
                    <span>Tracked revenue</span>
                    <strong>{formatCurrency(website.revenue)}</strong>
                  </div>
                  <div>
                    <span>Last event</span>
                    <strong className="text-[15px]">{website.lastEventAt ? relativeTime(website.lastEventAt) : '-'}</strong>
                  </div>
                </div>
                <p className="dash-note-line">
                  Website revenue is tracked by the storefront tag and is not added to ERP net sales - the two
                  would double-count an order that also reached the ERP.
                </p>
              </>
            )}
          </div>
        </div>
      </div>

      <div className="card">
        <SectionHead title="Recent activity" sub="latest documents in this period" />
        <div className="dash-table-wrap">
          {initialLoading ? (
            <div className="center-load"><span className="spin" /></div>
          ) : data?.recent?.length ? (
            <table className="dt">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Type</th>
                  <th>Document</th>
                  <th>Party</th>
                  <th className="text-right">Amount</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.recent.map((row) => {
                  const document = row.href ? (
                    <Link className="dash-doc-link" href={row.href}>{row.no}</Link>
                  ) : row.no;
                  return (
                    <tr key={row.key}>
                      <td className="whitespace-nowrap" title={formatDateTime(row.date)}>
                        {relativeTime(row.date)}
                      </td>
                      <td className="whitespace-nowrap">{row.type}</td>
                      <td className="whitespace-nowrap">{document}</td>
                      <td>{row.party}</td>
                      <td className="whitespace-nowrap text-right">{formatCurrency(row.amount)}</td>
                      <td><span className={'pill ' + statusTone(row.status)}>{row.status || '-'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          ) : (
            <p className="dash-empty pad">No sales, returns or purchases were recorded in this period.</p>
          )}
        </div>
      </div>

      {data?.notes?.length > 0 && (
        <div className="card dash-notes">
          <SectionHead title="How these figures are built" />
          <div className="card-body">
            <ul>
              {data.notes.map((note) => <li key={note}>{note}</li>)}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
