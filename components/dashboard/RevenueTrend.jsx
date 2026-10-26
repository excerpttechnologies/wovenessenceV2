'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';
import { EmptyState, SectionHead } from './ui';
import { count, inr, monthTick, shortInr } from './format';

const W = 760;
const H = 300;
const PAD = { top: 24, right: 48, bottom: 42, left: 64 };
const PLOT_W = W - PAD.left - PAD.right;
const PLOT_H = H - PAD.top - PAD.bottom;

function smoothPath(points) {
  if (!points.length) return '';
  if (points.length === 1) return `M${points[0].x},${points[0].y}`;
  let d = `M${points[0].x},${points[0].y}`;
  for (let i = 1; i < points.length; i += 1) {
    const previous = points[i - 1];
    const current = points[i];
    const mid = (previous.x + current.x) / 2;
    d += ` C${mid},${previous.y} ${mid},${current.y} ${current.x},${current.y}`;
  }
  return d;
}

function niceMax(value) {
  const n = Math.max(Number(value) || 0, 1);
  const power = 10 ** Math.floor(Math.log10(n));
  const scaled = n / power;
  const step = scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10;
  return step * power;
}

export default function RevenueTrend({ trend, loading }) {
  const [hover, setHover] = useState(null);
  const rows = trend || [];
  const hasValue = rows.some((row) => Number(row.revenue) !== 0 || Number(row.orders) !== 0);

  const maxRevenue = niceMax(Math.max(...rows.map((r) => Number(r.revenue) || 0), 0));
  const maxOrders = niceMax(Math.max(...rows.map((r) => Number(r.orders) || 0), 0));

  const points = rows.map((row, index) => {
    const x = rows.length === 1
      ? PAD.left + PLOT_W / 2
      : PAD.left + (index * PLOT_W) / (rows.length - 1);
    const revenue = Number(row.revenue) || 0;
    const orders = Number(row.orders) || 0;
    return {
      ...row,
      x,
      revenue,
      orders,
      yRevenue: PAD.top + PLOT_H - (revenue / maxRevenue) * PLOT_H,
      yOrders: PAD.top + PLOT_H - (orders / maxOrders) * PLOT_H,
    };
  });

  /* smoothPath() draws from an {x, y} list, while the point rows carry the
     two series on separate scales. Hand it the right y for each line. */
  const revenuePath = smoothPath(points.map((point) => ({ x: point.x, y: point.yRevenue })));
  const ordersPath = smoothPath(points.map((point) => ({ x: point.x, y: point.yOrders })));
  const areaPath = revenuePath && points.length
    ? `${revenuePath} L${points[points.length - 1].x},${PAD.top + PLOT_H} L${points[0].x},${PAD.top + PLOT_H} Z`
    : '';
  const ticks = [0, 0.25, 0.5, 0.75, 1];
  const active = hover === null ? null : points[hover];
  const tooltipLeft = active ? Math.min(88, Math.max(12, (active.x / W) * 100)) : 0;

  return (
    <div className={styles.card}>
      <SectionHead
        title="Revenue & order rhythm"
        subtitle="Six calendar months ending in the selected period"
        badge="All figures in INR"
      />

      {!hasValue ? (
        <EmptyState
          title="No revenue or orders in the last six months"
          message="The chart is empty because the selected branches and channels have no eligible records in this window."
        />
      ) : (
        <>
          <div className={styles.chartLegend}>
            <span><i className={styles.legendRevenue} /> Net revenue</span>
            <span><i className={styles.legendOrders} /> Orders</span>
            <span className={styles.chartLegendNote}>Hover a month for exact figures</span>
          </div>

          <div className={styles.chartWrap} onMouseLeave={() => setHover(null)}>
            {active ? (
              <div className={styles.chartTooltip} style={{ left: `${tooltipLeft}%` }} role="status">
                <span className={styles.tooltipMonth}>{active.label}{active.partial ? ' · partial' : ''}</span>
                <span><b>{inr(active.revenue)}</b> net revenue</span>
                <span><b>{count(active.orders)}</b> orders</span>
              </div>
            ) : null}

            <svg
              viewBox={`0 0 ${W} ${H}`}
              className={styles.chart}
              role="img"
              aria-label={`Six month revenue and order trend: ${rows.map((r) => `${r.label} ${inr(r.revenue)} and ${count(r.orders)} orders`).join('; ')}`}
            >
              <defs>
                <linearGradient id="revenueFill" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#3b82f6" stopOpacity="0.26" />
                  <stop offset="100%" stopColor="#3b82f6" stopOpacity="0.02" />
                </linearGradient>
                <linearGradient id="revenueStroke" x1="0" y1="0" x2="1" y2="0">
                  <stop offset="0%" stopColor="#1d4ed8" />
                  <stop offset="100%" stopColor="#60a5fa" />
                </linearGradient>
              </defs>

              {ticks.map((tick) => {
                const y = PAD.top + PLOT_H - tick * PLOT_H;
                return (
                  <g key={tick}>
                    <line
                      x1={PAD.left} x2={W - PAD.right} y1={y} y2={y}
                      stroke="#e2ebf6" strokeWidth="1" strokeDasharray={tick === 0 ? '0' : '3 5'}
                    />
                    <text x={PAD.left - 12} y={y + 4} textAnchor="end" className={styles.axisText}>
                      {shortInr(tick * maxRevenue)}
                    </text>
                    <text x={W - PAD.right + 12} y={y + 4} textAnchor="start" className={styles.axisTextMuted}>
                      {count(Math.round(tick * maxOrders))}
                    </text>
                  </g>
                );
              })}

              <path d={areaPath} fill="url(#revenueFill)" />
              <path d={ordersPath} fill="none" stroke="#b98a2f" strokeWidth="2" strokeDasharray="4 5" opacity="0.9" />
              <path d={revenuePath} fill="none" stroke="url(#revenueStroke)" strokeWidth="3" strokeLinecap="round" />

              {points.map((point, index) => (
                <g key={point.key}>
                  <rect
                    x={point.x - (PLOT_W / Math.max(points.length, 1)) / 2}
                    y={PAD.top}
                    width={PLOT_W / Math.max(points.length, 1)}
                    height={PLOT_H}
                    fill="transparent"
                    tabIndex={0}
                    role="button"
                    aria-label={`${point.label}: ${inr(point.revenue)} net revenue, ${count(point.orders)} orders${point.partial ? ', partial month' : ''}`}
                    onMouseEnter={() => setHover(index)}
                    onFocus={() => setHover(index)}
                    onBlur={() => setHover(null)}
                  />
                  <circle
                    cx={point.x}
                    cy={point.yRevenue}
                    r={hover === index ? 5.5 : 3.5}
                    fill="#fff"
                    stroke="#1d4ed8"
                    strokeWidth="2.5"
                  />
                  <text
                    x={point.x}
                    y={H - 16}
                    textAnchor="middle"
                    className={`${styles.axisText} ${point.partial ? styles.axisTextPartial : ''}`}
                  >
                    {monthTick(point.label)}{point.partial ? '*' : ''}
                  </text>
                </g>
              ))}

              {active ? (
                <line
                  x1={active.x} x2={active.x} y1={PAD.top} y2={PAD.top + PLOT_H}
                  stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 4"
                />
              ) : null}
            </svg>
          </div>

          <p className={styles.chartFoot}>
            <span>* Partial month through {rows.find((r) => r.partial)?.label || 'the selected end date'}.</span>
            Revenue is net of returns and includes eligible storefront orders. Orders exclude return documents.
          </p>

          <table className={styles.srOnly}>
            <caption>Six month revenue and order trend</caption>
            <thead><tr><th>Month</th><th>Net revenue</th><th>Orders</th></tr></thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.key}><td>{row.label}</td><td>{inr(row.revenue)}</td><td>{count(row.orders)}</td></tr>
              ))}
            </tbody>
          </table>
        </>
      )}

      {loading ? <span className={styles.cardLoading} aria-hidden="true" /> : null}
    </div>
  );
}
