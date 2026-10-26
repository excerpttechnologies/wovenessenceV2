'use client';

import { useState } from 'react';
import styles from './dashboard.module.css';
import { EmptyState, SectionHead } from './ui';
import { inr, percent, shortInr } from './format';

const COLORS = [
  '#1d4ed8', '#0e7490', '#b98a2f', '#4f46e5', '#be123c',
  '#2563eb', '#0891b2', '#64748b', '#7c3aed',
];

const SIZE = 220;
const STROKE = 26;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
const CENTRE = SIZE / 2;

export default function CategoryDonut({ categories, totalRevenue }) {
  const [hover, setHover] = useState(null);
  const rows = categories || [];
  const total = rows.reduce((sum, row) => sum + (Number(row.revenue) || 0), 0);

  let offset = 0;
  const segments = rows.map((row, index) => {
    const share = Number(row.share) || 0;
    const length = Math.max(0, (share / 100) * CIRCUMFERENCE);
    const gap = rows.length > 1 ? Math.min(2.5, length * 0.2) : 0;
    const segment = {
      ...row,
      color: row.category === 'Uncategorised / unallocated' ? '#94a3b8' : COLORS[index % COLORS.length],
      length,
      offset,
      dash: Math.max(length - gap, 0.4),
    };
    offset += length;
    return segment;
  });

  return (
    <div className={styles.card}>
      <SectionHead
        title="Category mix"
        subtitle="Allocated from authoritative product-group records"
        badge={rows.length ? `${rows.length} groups` : ''}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No category revenue yet"
          message="No eligible line could be linked to a product group in this selection."
        />
      ) : (
        <div className={styles.donutLayout}>
          <div className={styles.donutWrap}>
            <svg
              viewBox={`0 0 ${SIZE} ${SIZE}`}
              className={styles.donut}
              role="img"
              aria-label={`Category revenue mix, total ${inr(total)}`}
            >
              <circle cx={CENTRE} cy={CENTRE} r={RADIUS} fill="none" stroke="#eef2ed" strokeWidth={STROKE} />
              <g transform={`rotate(-90 ${CENTRE} ${CENTRE})`}>
                {segments.map((segment, index) => (
                  <circle
                    key={segment.category}
                    cx={CENTRE}
                    cy={CENTRE}
                    r={RADIUS}
                    fill="none"
                    stroke={segment.color}
                    strokeWidth={hover === index ? STROKE + 5 : STROKE}
                    strokeDasharray={`${segment.dash} ${CIRCUMFERENCE - segment.dash}`}
                    strokeDashoffset={-segment.offset}
                    strokeLinecap="butt"
                    opacity={hover === null || hover === index ? 1 : 0.35}
                    onMouseEnter={() => setHover(index)}
                    onMouseLeave={() => setHover(null)}
                    style={{ transition: 'opacity .18s ease, stroke-width .18s ease' }}
                  />
                ))}
              </g>
              <text x={CENTRE} y={CENTRE - 8} textAnchor="middle" className={styles.donutKicker}>
                {hover === null ? 'NET REVENUE' : 'SELECTED'}
              </text>
              <text x={CENTRE} y={CENTRE + 18} textAnchor="middle" className={styles.donutTotal}>
                {shortInr(hover === null ? total : segments[hover].revenue)}
              </text>
              <text x={CENTRE} y={CENTRE + 38} textAnchor="middle" className={styles.donutCaption}>
                {hover === null ? 'allocated' : percent(segments[hover].share)}
              </text>
            </svg>
          </div>

          <ul className={styles.donutLegend}>
            {segments.map((segment, index) => (
              <li
                key={segment.category}
                className={`${styles.donutLegendRow} ${hover === index ? styles.donutLegendActive : ''}`}
                onMouseEnter={() => setHover(index)}
                onMouseLeave={() => setHover(null)}
                title={`${segment.category}: ${inr(segment.revenue)} · ${percent(segment.share)}`}
              >
                <i style={{ background: segment.color }} />
                <span className={styles.donutName}>{segment.category}</span>
                <span className={styles.donutValue}>{percent(segment.share)}</span>
                <span className={styles.donutRevenue}>{inr(segment.revenue)}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {rows.some((row) => row.category === 'Uncategorised / unallocated') ? (
        <p className={styles.donutNote}>
          <i className={styles.uncatSwatch} />
          “Uncategorised / unallocated” is money whose line could not be linked to a product group.
          It is shown, not redistributed or guessed.
        </p>
      ) : null}

      {totalRevenue !== undefined && Math.abs(total - Number(totalRevenue)) > 0.5 ? (
        <p className={styles.donutNote}>
          Allocated category total {inr(total)} differs from net revenue {inr(totalRevenue)} because
          uncategorised value is not forced into a group.
        </p>
      ) : null}
    </div>
  );
}
