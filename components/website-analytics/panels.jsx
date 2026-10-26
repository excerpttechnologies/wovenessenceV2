'use client';

import { useEffect, useState } from 'react';
import styles from './website-analytics.module.css';
import Glyph from './icons';
import { count, dateLabel, inr, percent, timeLabel } from '@/components/dashboard/format';

/* --------------------------------------------------------------- shared --- */

export function Delta({ change, changeType = 'percent', goodWhenDown = false }) {
  if (change === null || change === undefined || !Number.isFinite(Number(change))) {
    return <span className={`${styles.delta} ${styles.deltaNa}`}>No comparison</span>;
  }
  const value = Number(change);
  if (Math.abs(value) < 0.005) {
    return <span className={`${styles.delta} ${styles.deltaFlat}`}>No change</span>;
  }
  const up = value > 0;
  const improvement = goodWhenDown ? up === false : up === true;
  const label = changeType === 'points' ? `${up ? '+' : ''}${value.toFixed(2)} pp` : percent(value, { signed: true });
  return (
    <span
      className={`${styles.delta} ${improvement ? styles.deltaGood : styles.deltaBad}`}
      title={improvement ? 'Ahead of the comparison period' : 'Behind the comparison period'}
    >
      <Glyph name={up ? 'arrowUp' : 'arrowDown'} size={11} strokeWidth={2.4} />
      {label}
    </span>
  );
}

export function EmptyState({ title, message, icon = 'chart' }) {
  return (
    <div className={styles.empty}>
      <span className={styles.emptyIcon}><Glyph name={icon} size={17} /></span>
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        {message ? <p className={styles.emptyMsg}>{message}</p> : null}
      </div>
    </div>
  );
}

function Panel({ title, icon, subtitle, badge, children, style }) {
  return (
    <section className={styles.panel} style={style}>
      <header className={styles.panelHead}>
        <div className={styles.panelHeadText}>
          <h2 className={styles.panelTitle}>
            <Glyph name={icon} size={15} /> {title}
          </h2>
          {subtitle ? <p className={styles.panelSub}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.panelBadge}>{badge}</span> : null}
      </header>
      {children}
    </section>
  );
}

/* ----------------------------------------------------------------- KPIs --- */

const KPI_ICONS = {
  visitors: 'users',
  sessions: 'trend',
  logins: 'lock',
  orders: 'bag',
  revenue: 'rupee',
  conversion: 'percent',
};

function formatKpi(card) {
  if (card.value === null || card.value === undefined) return 'Not tracked';
  if (card.format === 'currency') return inr(card.value);
  if (card.format === 'percent') return percent(card.value);
  return count(card.value);
}

function formatKpiPrevious(card) {
  if (card.previousValue === null || card.previousValue === undefined) return 'no prior figure';
  if (card.format === 'currency') return inr(card.previousValue);
  if (card.format === 'percent') return percent(card.previousValue);
  return count(card.previousValue);
}

export function KpiGrid({ cards = [] }) {
  return (
    <section className={styles.kpiGrid} aria-label="Website key metrics">
      {cards.map((card) => {
        /* Two different nulls: a metric the tracker has never measured, and a
           metric with a source but no denominator in this period (0 orders over
           0 sessions). Only the first one is "not tracked". */
        const notTracked = Boolean(card.unavailable);
        const noFigure = !notTracked && (card.value === null || card.value === undefined);
        const unavailable = notTracked || noFigure;
        return (
          <article
            key={card.key}
            className={`${styles.kpiCard} ${unavailable ? styles.kpiCardMuted : ''}`}
            title={card.note}
          >
            <div className={styles.kpiTop}>
              <span className={styles.kpiIcon}><Glyph name={KPI_ICONS[card.key] || 'chart'} size={15} /></span>
              <span className={styles.kpiLabel}>{card.label}</span>
            </div>
            <p className={`${styles.kpiValue} ${unavailable ? styles.kpiValueMuted : ''}`}>
              {notTracked ? 'Not tracked' : noFigure ? '—' : formatKpi(card)}
            </p>
            <div className={styles.kpiDeltaRow}>
              {notTracked ? (
                <span className={`${styles.delta} ${styles.deltaNa}`}>{card.unavailableReason || 'Awaiting tracker'}</span>
              ) : noFigure ? (
                <span className={`${styles.delta} ${styles.deltaNa}`}>Nothing to measure in this period</span>
              ) : (
                <>
                  <Delta change={card.change} changeType={card.changeType} />
                  <span className={styles.kpiPrev}>vs {formatKpiPrevious(card)}</span>
                </>
              )}
            </div>
            <p className={styles.kpiNote}>{card.note}</p>
          </article>
        );
      })}
    </section>
  );
}

/* ---------------------------------------------------------------- trend --- */

const METRICS = [
  { key: 'pageViews', label: 'Page views', format: 'count' },
  { key: 'sessions', label: 'Sessions', format: 'count' },
  { key: 'orders', label: 'Orders', format: 'count' },
  { key: 'revenue', label: 'Revenue', format: 'currency' },
  { key: 'visitors', label: 'Unique visitors', format: 'count' },
];

export function TrendChart({ days = [], granularity = 'day' }) {
  const [metric, setMetric] = useState('pageViews');
  const active = METRICS.find((m) => m.key === metric) || METRICS[0];
  const points = days.map((day) => ({ date: day.date, value: day[active.key] }));
  /* A zero series is not a chart: it is a flat line along the axis with an
     unreadable 0-only scale. Say plainly that nothing was recorded. */
  const available = points.some((point) => Number(point.value) > 0);
  const max = Math.max(...points.map((point) => Number(point.value) || 0), 0);

  /* An SVG scales as one piece, so a 720-wide viewBox on a 330-wide phone
     shrinks 9px axis text to about 4px. Narrow screens get their own, smaller
     coordinate space: the same chart drawn for the width it actually has. */
  const [compact, setCompact] = useState(false);
  useEffect(() => {
    const query = window.matchMedia('(max-width: 720px)');
    const update = () => setCompact(query.matches);
    update();
    query.addEventListener('change', update);
    return () => query.removeEventListener('change', update);
  }, []);

  const W = compact ? 340 : 720;
  const H = compact ? 200 : 220;
  const padLeft = compact ? 34 : 46;
  const padRight = 12;
  const padTop = 14;
  const padBottom = 28;
  const n = Math.max(points.length, 2);
  const x = (i) => padLeft + (i * (W - padLeft - padRight)) / (n - 1);
  const y = (value) => H - padBottom - (max > 0 ? (Number(value) || 0) / max : 0) * (H - padTop - padBottom);
  const line = points.map((point, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)} ${y(point.value).toFixed(1)}`).join(' ');
  const area = points.length
    ? `${line} L${x(points.length - 1).toFixed(1)} ${H - padBottom} L${padLeft} ${H - padBottom} Z`
    : '';
  const labelCount = compact ? 4 : 8;
  const step = Math.max(1, Math.ceil(points.length / labelCount));
  const ticks = compact ? [0, 0.5, 1] : [0, 0.25, 0.5, 0.75, 1];
  const total = points.reduce((sum, point) => sum + (Number(point.value) || 0), 0);
  const peak = points.reduce((best, point) => (Number(point.value) || 0) > (Number(best.value) || 0) ? point : best, points[0] || {});

  return (
    <div>
      <div className={styles.chartTabs} role="tablist" aria-label="Chart metric">
        {METRICS.map((option) => (
          <button
            key={option.key}
            type="button"
            role="tab"
            aria-selected={option.key === metric}
            className={`${styles.chartTab} ${option.key === metric ? styles.chartTabActive : ''}`}
            onClick={() => setMetric(option.key)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {!available ? (
        <div className={styles.chartEmpty}>No {active.label.toLowerCase()} recorded in this period</div>
      ) : (
        <>
          <div className={styles.chartWrap}>
            <svg
              className={styles.chartSvg}
              viewBox={`0 0 ${W} ${H}`}
              role="img"
              aria-label={`${active.label} by ${granularity}`}
            >
              <defs>
                <linearGradient id="waArea" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#2c9c6a" stopOpacity="0.22" />
                  <stop offset="100%" stopColor="#2c9c6a" stopOpacity="0.01" />
                </linearGradient>
              </defs>
              {ticks.map((fraction) => {
                const value = max * fraction;
                const yy = y(value);
                return (
                  <g key={fraction}>
                    <line className={styles.chartGrid} x1={padLeft} x2={W - padRight} y1={yy} y2={yy} />
                    <text
                      className={`${styles.chartAxisText} ${compact ? styles.chartAxisTextCompact : ''}`}
                      x={padLeft - 7}
                      y={yy + 3}
                      textAnchor="end"
                    >
                      {active.format === 'currency'
                        ? (value >= 100000 ? `${Math.round(value / 100000)}L` : value >= 1000 ? `${Math.round(value / 1000)}k` : Math.round(value))
                        : Math.round(value)}
                    </text>
                  </g>
                );
              })}
              {points.map((point, index) => (
                index % step === 0 ? (
                  <text
                    key={point.date}
                    className={`${styles.chartAxisText} ${compact ? styles.chartAxisTextCompact : ''}`}
                    x={x(index)}
                    y={H - padBottom + 14}
                    textAnchor="middle"
                  >
                    {dateLabel(point.date).replace(/ \d{4}$/, '')}
                  </text>
                ) : null
              ))}
              <path className={styles.chartArea} d={area} />
              <path className={styles.chartLine} d={line} />
              {points.length <= 45 && points.map((point, index) => (
                Number(point.value) > 0 ? (
                  <circle key={point.date} className={styles.chartMarker} cx={x(index)} cy={y(point.value)} r="3">
                    <title>{`${dateLabel(point.date)}: ${active.format === 'currency' ? inr(point.value) : count(point.value)}`}</title>
                  </circle>
                ) : null
              ))}
            </svg>
          </div>

          <div className={styles.chartFoot}>
            <div className={styles.chartStat}>
              <span className={styles.chartStatLabel}>Total</span>
              <span className={styles.chartStatValue}>
                {active.format === 'currency' ? inr(total) : count(total)}
              </span>
            </div>
            <div className={styles.chartStat}>
              <span className={styles.chartStatLabel}>Daily average</span>
              <span className={styles.chartStatValue}>
                {active.format === 'currency'
                  ? inr(total / Math.max(points.length, 1))
                  : count(total / Math.max(points.length, 1), 1)}
              </span>
            </div>
            <div className={styles.chartStat}>
              <span className={styles.chartStatLabel}>Best day</span>
              <span className={styles.chartStatValue}>
                {peak?.date ? `${dateLabel(peak.date).replace(/ \d{4}$/, '')} · ${active.format === 'currency' ? inr(peak.value) : count(peak.value)}` : 'N/A'}
              </span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/* ------------------------------------------------------------ page types --- */

export function PageTypePanel({ pageTypes = [] }) {
  const max = Math.max(...pageTypes.map((row) => Number(row.views) || 0), 0);
  return (
    <Panel
      title="Page views by section"
      icon="globe"
      subtitle="Storefront page-type counters for this period. Page views, not unique people."
      badge="visits"
    >
      {!pageTypes.length ? (
        <EmptyState
          title="No page views recorded"
          message="The storefront's visits counter has no rows for the selected dates."
        />
      ) : (
        <div className={styles.barList}>
          {pageTypes.map((row) => (
            <div key={row.key} className={styles.barRow}>
              <span className={styles.barLabel}>{row.label}</span>
              <span className={styles.barValue}>{count(row.views)}</span>
              <span className={styles.barTrack}>
                <span
                  className={styles.barFill}
                  style={{ width: `${max ? Math.max(2, (row.views / max) * 100) : 0}%` }}
                />
              </span>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* --------------------------------------------------------------- funnel --- */

export function FunnelPanel({ funnel }) {
  const stages = funnel?.stages || [];
  const max = Math.max(...stages.map((stage) => Number(stage.count) || 0), 0);
  const modeLabel = funnel?.mode === 'visitors'
    ? 'Unique visitors, each person counted once per stage'
    : 'Counted from page types and sessions — not unique people';

  return (
    <Panel
      title="Website conversion funnel"
      icon="trend"
      subtitle={modeLabel}
      badge={funnel?.mode === 'visitors' ? 'tracker' : 'page views'}
    >
      {!stages.length ? (
        <EmptyState title="Funnel unavailable" message="No traffic or order records for this period." />
      ) : (
        <>
          <div className={styles.funnel}>
            {stages.map((stage, index) => (
              <div key={stage.key} className={styles.funnelRow}>
                <div className={styles.funnelTop}>
                  <span className={styles.funnelLabel}>{stage.label}</span>
                  <span className={styles.funnelCount}>{count(stage.count)}</span>
                </div>
                <div className={styles.funnelTrack}>
                  <div
                    className={`${styles.funnelFill} ${index === stages.length - 1 ? '' : styles.funnelFillSoft}`}
                    style={{ width: `${max ? Math.max(1.5, (stage.count / max) * 100) : 0}%` }}
                  />
                </div>
                <div className={styles.funnelMeta}>
                  <span className={styles.funnelMetaStrong}>
                    {index === 0
                      ? 'Starting stage'
                      : stage.comparable === false
                        ? 'Different unit — no rate'
                        : `${percent(stage.conversion)} from previous`}
                  </span>
                  {stage.dropOff !== null ? <span>{count(stage.dropOff)} did not continue</span> : null}
                  <span>{stage.unit}</span>
                </div>
              </div>
            ))}
          </div>
          <p className={styles.funnelNote}>
            {funnel?.mode === 'visitors'
              ? 'Guest checkout means a stage can be skipped; a visitor who adds to cart without logging in still continues down the funnel. Completed orders are credited only when the order reference was verified against the orders collection.'
              : 'The storefront counter records page views and sessions, not visitor identities. Catalogue, product, cart and checkout rows are page views, so this funnel measures pages reached, not people. Sessions and page views are different units, so the step between them carries no percentage. Install the tracker for visitor-based conversion.'}
          </p>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- sources --- */

export function SourcesPanel({ visitors, requiredEvents = [] }) {
  if (!visitors?.available) {
    return (
      <Panel
        title="Traffic sources & devices"
        icon="globe"
        subtitle="Needs the first-party tracker on wovenessence.in."
        badge="waiting"
      >
        <EmptyState
          icon="lock"
          title="No visitor-level tracking yet"
          message="Source attribution (UTM, referrer), device category and visitor identity are only recorded once the tracker runs on the storefront. Nothing is inferred from the order records."
        />
        {requiredEvents.length ? (
          <p className={styles.funnelNote}>
            Events the dashboard will read: {requiredEvents.join(', ')}.
          </p>
        ) : null}
      </Panel>
    );
  }

  return (
    <Panel
      title="Traffic sources & devices"
      icon="globe"
      subtitle="Unique visitors, sessions and verified purchases per source."
      badge="tracker"
    >
      <div className={styles.tableWrap}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Source</th>
              <th className={styles.num}>Visitors</th>
              <th className={styles.num}>Sessions</th>
              <th className={styles.num}>Purchases</th>
              <th className={styles.num}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {(visitors.sources || []).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className={styles.num}>{count(row.visitors)}</td>
                <td className={styles.num}>{count(row.sessions)}</td>
                <td className={styles.num}>{count(row.purchases)}</td>
                <td className={styles.num}>{inr(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className={styles.tableWrap} style={{ marginTop: 12 }}>
        <table className={styles.table}>
          <thead>
            <tr>
              <th>Device</th>
              <th className={styles.num}>Visitors</th>
              <th className={styles.num}>Purchases</th>
              <th className={styles.num}>Revenue</th>
            </tr>
          </thead>
          <tbody>
            {(visitors.devices || []).map((row) => (
              <tr key={row.key}>
                <td>{row.label}</td>
                <td className={styles.num}>{count(row.visitors)}</td>
                <td className={styles.num}>{count(row.purchases)}</td>
                <td className={styles.num}>{inr(row.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Panel>
  );
}

/* ------------------------------------------------------------ geography --- */

export function GeographyPanel({ geography }) {
  const cities = geography?.cities || [];
  return (
    <Panel
      title="Where orders are delivered"
      icon="map"
      subtitle="City and state from each qualifying order's shipping address."
      badge="order address"
    >
      {!geography?.available ? (
        <EmptyState
          icon="map"
          title="No qualifying order in this period"
          message="Location is only reported for orders that passed the status rules. Visitor location is a separate measure and needs the tracker."
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>City / state</th>
                  <th className={styles.num}>Orders</th>
                  <th className={styles.num}>Revenue</th>
                  <th className={styles.num}>AOV</th>
                  <th className={styles.num}>Share</th>
                </tr>
              </thead>
              <tbody>
                {cities.map((row, index) => (
                  <tr key={`${row.city}-${row.state}`}>
                    <td><span className={styles.rank}>{index + 1}</span></td>
                    <td>
                      {row.city}
                      {row.state ? <span className={styles.tableSub}>{row.state}</span> : null}
                    </td>
                    <td className={styles.num}>{count(row.orders)}</td>
                    <td className={styles.num}>{inr(row.revenue)}</td>
                    <td className={styles.num}>{inr(row.aov)}</td>
                    <td className={styles.num}>{percent(row.revenueShare)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.funnelNote}>{geography.note}</p>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- accounts -- */

export function AccountsPanel({ accounts }) {
  return (
    <Panel
      title="Accounts & retention"
      icon="users"
      subtitle="Storefront accounts and repeat buying, from customers and orders."
      badge="accounts"
    >
      {!accounts?.available ? (
        <EmptyState
          icon="lock"
          title="Account data not available"
          message="Either the storefront customers collection is missing, or this view is restricted to one branch and these totals cannot be narrowed to it."
        />
      ) : (
        <>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>New registrations</p>
              <p className={styles.tileValue}>{count(accounts.registrations)}</p>
              <p className={styles.tileHint}>
                {accounts.comparisonRegistrations === null
                  ? 'No comparison period'
                  : `${count(accounts.comparisonRegistrations)} in the comparison period`}
              </p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Logged-in accounts</p>
              <p className={styles.tileValue}>{count(accounts.loggedIn)}</p>
              <p className={styles.tileHint}>Latest login inside the period</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Buying customers</p>
              <p className={styles.tileValue}>{count(accounts.buyers)}</p>
              <p className={styles.tileHint}>{count(accounts.newBuyers)} placed their first order in this period</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Repeat buyers</p>
              <p className={styles.tileValue}>{count(accounts.repeatBuyers)}</p>
              <p className={styles.tileHint}>
                {accounts.repeatRate === null ? 'Rate unavailable' : `${percent(accounts.repeatRate)} of buyers`}
              </p>
            </div>
          </div>

          <div className={styles.kv} style={{ marginTop: 12 }}>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Repeat-buyer revenue</span>
              <span className={styles.kvValue}>
                {inr(accounts.repeatRevenue)}
                {accounts.repeatRevenueShare !== null ? ` · ${percent(accounts.repeatRevenueShare)}` : ''}
              </span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Total storefront accounts</span>
              <span className={styles.kvValue}>{count(accounts.total)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Email-verified accounts</span>
              <span className={styles.kvValue}>{count(accounts.verified)}</span>
            </div>
            <div className={styles.kvRow}>
              <span className={styles.kvKey}>Most recent login</span>
              <span className={styles.kvValue}>
                {accounts.lastLoginAt ? `${dateLabel(accounts.lastLoginAt.slice(0, 10))} · ${timeLabel(accounts.lastLoginAt)}` : 'N/A'}
              </span>
            </div>
          </div>

          <p className={styles.funnelNote}>{accounts.note}</p>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- products -- */

export function ProductsPanel({ products }) {
  const rows = products?.byOrders || [];
  return (
    <Panel
      title="Product performance"
      icon="box"
      subtitle="Order-line revenue for the selected period."
      badge="orders"
    >
      {!rows.length ? (
        <EmptyState
          icon="box"
          title="No product lines in this period"
          message="Ranking uses real order lines. No product view or add-to-cart figures are invented."
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Product</th>
                  <th className={styles.num}>Units</th>
                  <th className={styles.num}>Orders</th>
                  <th className={styles.num}>Revenue</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, index) => (
                  <tr key={`${row.itemCode}-${row.name}`}>
                    <td><span className={styles.rank}>{index + 1}</span></td>
                    <td>
                      {row.name}
                      {row.itemCode ? <span className={styles.tableSub}>{row.itemCode}</span> : null}
                    </td>
                    <td className={styles.num}>{count(row.quantity)}</td>
                    <td className={styles.num}>{count(row.orders)}</td>
                    <td className={styles.num}>{inr(row.revenue)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className={styles.funnelNote}>{products.note}</p>
        </>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- carts --- */

export function CartsPanel({ carts }) {
  return (
    <Panel
      title="Cart behaviour"
      icon="cart"
      subtitle={carts?.available ? 'Carts created in this period, from the storefront carts collection.' : 'Cart data unavailable.'}
      badge="carts"
    >
      {!carts?.available ? (
        <EmptyState
          icon="cart"
          title="No cart records available"
          message={carts?.note || 'The storefront carts collection could not be read for this view.'}
        />
      ) : (
        <>
          <div className={styles.tiles}>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Carts created</p>
              <p className={styles.tileValue}>{count(carts.created)}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Carts with items</p>
              <p className={styles.tileValue}>{count(carts.withItems)}</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Abandoned</p>
              <p className={styles.tileValue}>{count(carts.abandoned)}</p>
              <p className={styles.tileHint}>{carts.inactivityHours || 24}h inactivity rule</p>
            </div>
            <div className={styles.tile}>
              <p className={styles.tileLabel}>Abandonment rate</p>
              <p className={styles.tileValue}>{percent(carts.abandonmentRate)}</p>
              <p className={styles.tileHint}>{count(carts.stillActive)} still in progress</p>
            </div>
          </div>
          <p className={styles.funnelNote}>
            A cart counts as abandoned only when it holds at least one line and has not been updated for {carts.inactivityHours || 24} hours.
            A visitor who has not purchased <em>yet</em> is not counted as abandonment. Carts are only loaded for sessions that can see every branch.
          </p>
        </>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- realtime --- */

export function RealtimePanel({ realtime }) {
  const values = [
    { key: 'activeVisitors', label: 'Visitors active in the last 5 min' },
    { key: 'events', label: 'Events in the last 5 min' },
    { key: 'productViews', label: 'Product views' },
    { key: 'addToCart', label: 'Add-to-cart events' },
  ];

  return (
    <Panel
      title="Live activity"
      icon="clock"
      subtitle="Read from the tracker feed; refreshed with the dashboard every minute."
      badge="5 min"
    >
      {realtime?.activeVisitors === null || realtime?.activeVisitors === undefined ? (
        <EmptyState icon="clock" title="Live activity needs the tracker" message="Until events arrive there is nothing real to show, so no activity figure is displayed." />
      ) : (
        <div className={styles.rtRow}>
          {values.map((value) => (
            <div key={value.key} className={styles.rtTile}>
              <p className={styles.rtValue}>{count(realtime[value.key])}</p>
              <p className={styles.rtLabel}>{value.label}</p>
            </div>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* -------------------------------------------------------------- insights --- */

const INSIGHT_ICON = { good: 'check', warn: 'warning', info: 'info' };

export function InsightsPanel({ insights = [] }) {
  return (
    <Panel
      title="What the numbers say"
      icon="sparkle"
      subtitle="Rule-based observations computed from the figures on this screen. No generated measurement."
      badge="rule-based"
    >
      {!insights.length ? (
        <EmptyState title="Nothing to flag yet" message="There is not enough activity in this period for a defensible observation." />
      ) : (
        <div className={styles.insightList}>
          {insights.map((insight, index) => (
            <article key={index} className={`${styles.insight} ${styles[`insight${insight.tone === 'warn' ? 'Warn' : insight.tone === 'good' ? 'Good' : 'Info'}`]}`}>
              <p className={styles.insightTitle}>
                <Glyph name={INSIGHT_ICON[insight.tone] || 'info'} size={13} />
                {insight.title}
              </p>
              <p className={styles.insightBody}>{insight.body}</p>
              <p className={styles.insightBasis}>Basis: {insight.basis}</p>
            </article>
          ))}
        </div>
      )}
    </Panel>
  );
}

/* ----------------------------------------------------------------- notes --- */

export function NotesPanel({ notes = [] }) {
  return (
    <Panel
      title="Data sources & what they cannot answer"
      icon="info"
      subtitle="Every panel above names its source; nothing on this screen is estimated."
      badge="method"
    >
      <div className={styles.notes}>
        {notes.map((note) => (
          <div key={note.key} className={styles.note}>
            <div className={styles.noteHead}>
              <span className={styles.noteTitle}>{note.title}</span>
              <span className={`${styles.noteFlag} ${note.available ? styles.noteOn : styles.noteOff}`}>
                {note.available ? 'available' : 'unavailable'}
              </span>
            </div>
            <p className={styles.noteBody}>{note.body}</p>
          </div>
        ))}
      </div>
    </Panel>
  );
}

export { Panel };
