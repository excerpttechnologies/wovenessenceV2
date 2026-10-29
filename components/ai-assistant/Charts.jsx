'use client';

import { useMemo, useRef, useState } from 'react';
import { formatChartValue } from './formatters';

/* Charts drawn by hand, in the project's existing style: no chart library,
   responsive by viewBox, and readable when every value is zero. Every point
   and bar is keyboard-focusable and states its value, so a chart is never the
   only way to read the figure - the table below carries the same numbers. */

const PALETTE = ['#12a65e', '#2b57b0', '#d97706', '#7c3aed', '#0891b2', '#dc2626', '#64748b'];

function EmptyChart({ title }) {
  return (
    <div className="rounded-xl border border-dashed border-linestrong bg-white p-4">
      <p className="text-[13px] font-semibold text-ink">{title}</p>
      <p className="mt-1 text-[12px] text-inkmuted">No data in this period for the selected scope.</p>
    </div>
  );
}

export function BarChart({ chart }) {
  const data = (chart.data || []).filter((row) => Number.isFinite(Number(row.value)));
  const [active, setActive] = useState(null);
  const max = Math.max(0, ...data.map((row) => Math.abs(Number(row.value))));
  const total = data.reduce((sum, row) => sum + Number(row.value), 0);

  if (!data.length) return <EmptyChart title={chart.title} />;

  return (
    <figure className="rounded-xl border border-line bg-white p-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="text-[13px] font-bold text-ink">{chart.title}</span>
        <span className="text-[11px] text-inkmuted">{formatChartValue(total, chart.valueFormat)} total</span>
      </figcaption>
      <div className="space-y-2" role="list">
        {data.map((row, index) => {
          const value = Number(row.value);
          const width = max ? Math.max(2, Math.round((Math.abs(value) / max) * 100)) : 0;
          const isActive = active === index;
          return (
            <div
              key={`${row.label}-${index}`}
              role="listitem"
              tabIndex={0}
              onMouseEnter={() => setActive(index)}
              onMouseLeave={() => setActive(null)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
              className={'rounded-md px-1 py-0.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-brand/40 ' + (isActive ? 'bg-[#f3faf6]' : '')}
              title={`${row.label}: ${formatChartValue(value, chart.valueFormat)}`}
            >
              <div className="mb-1 flex items-center justify-between gap-2">
                <span className="truncate text-[12px] text-cell">{row.label}</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
                  {formatChartValue(value, chart.valueFormat)}
                </span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-[#edf2ef]">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${width}%`, background: PALETTE[index % PALETTE.length] }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </figure>
  );
}

export function LineChart({ chart }) {
  const labels = chart.labels || [];
  const series = (chart.series || []).filter((row) => Array.isArray(row.points));
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const peak = useMemo(() => Math.max(1, ...series.flatMap((row) => row.points.map((value) => Number(value) || 0))), [series]);
  const W = 680;
  const H = 240;
  const padX = 44;
  const padY = 28;
  const n = Math.max(labels.length, 2);
  const x = (index) => padX + (index * (W - padX * 2)) / (n - 1);
  const y = (value) => H - padY - (Number(value || 0) / peak) * (H - padY * 2);

  if (!labels.length || !series.length) return <EmptyChart title={chart.title} />;

  const step = Math.max(1, Math.ceil(labels.length / 8));

  const onMove = (event) => {
    const rect = wrapRef.current?.getBoundingClientRect();
    if (!rect) return;
    const relative = ((event.clientX - rect.left) / rect.width) * W;
    const index = Math.round(((relative - padX) / (W - padX * 2)) * (n - 1));
    setHover(Math.max(0, Math.min(labels.length - 1, index)));
  };

  return (
    <figure className="rounded-xl border border-line bg-white p-4">
      <figcaption className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[13px] font-bold text-ink">{chart.title}</span>
        <span className="flex flex-wrap gap-3">
          {series.map((row, index) => (
            <span key={row.name} className="flex items-center gap-1.5 text-[11px] text-inkmuted">
              <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
              {row.name}
            </span>
          ))}
        </span>
      </figcaption>

      <div ref={wrapRef} className="relative">
        <svg
          viewBox={`0 0 ${W} ${H}`}
          className="w-full"
          role="img"
          aria-label={chart.title}
          onMouseMove={onMove}
          onMouseLeave={() => setHover(null)}
        >
          {[0, 0.25, 0.5, 0.75, 1].map((fraction) => (
            <g key={fraction}>
              <line x1={padX} x2={W - padX} y1={y(peak * fraction)} y2={y(peak * fraction)} stroke="#e8eeeb" />
              <text x={padX - 6} y={y(peak * fraction) + 3} textAnchor="end" fontSize="9" fill="#7b8a96">
                {formatChartValue(peak * fraction, chart.valueFormat)}
              </text>
            </g>
          ))}

          {hover !== null && (
            <line x1={x(hover)} x2={x(hover)} y1={padY} y2={H - padY} stroke="#b9c7c0" strokeDasharray="3 3" />
          )}

          {series.map((row, seriesIndex) => {
            const path = row.points
              .map((value, index) => `${index ? 'L' : 'M'}${x(index)} ${y(value)}`)
              .join(' ');
            return (
              <g key={row.name}>
                <path d={path} fill="none" stroke={PALETTE[seriesIndex % PALETTE.length]} strokeWidth="2.2" strokeLinejoin="round" />
                {row.points.map((value, index) => (
                  <circle
                    key={`${row.name}-${index}`}
                    cx={x(index)}
                    cy={y(value)}
                    r={hover === index ? 5 : 3}
                    fill="#fff"
                    stroke={PALETTE[seriesIndex % PALETTE.length]}
                    strokeWidth="2"
                  />
                ))}
              </g>
            );
          })}

          {labels.map((label, index) => (
            index % step === 0 ? (
              <text key={`${label}-${index}`} x={x(index)} y={H - padY + 16} textAnchor="middle" fontSize="9" fill="#7b8a96">
                {label}
              </text>
            ) : null
          ))}
        </svg>

        {hover !== null && (
          <div className="pointer-events-none absolute left-2 top-2 rounded-lg border border-line bg-white px-3 py-2 shadow-pop">
            <p className="text-[11px] font-semibold text-ink">{labels[hover]}</p>
            {series.map((row, index) => (
              <p key={row.name} className="flex items-center gap-2 text-[11px] text-cell">
                <span className="h-2 w-2 rounded-full" style={{ background: PALETTE[index % PALETTE.length] }} />
                {row.name}: <span className="font-semibold tabular-nums text-ink">{formatChartValue(row.points[hover], chart.valueFormat)}</span>
              </p>
            ))}
          </div>
        )}
      </div>
    </figure>
  );
}

export function DonutChart({ chart }) {
  const data = (chart.data || []).filter((row) => Number(row.value) > 0);
  const [active, setActive] = useState(null);
  const total = data.reduce((sum, row) => sum + Number(row.value), 0);

  if (!data.length || !total) return <EmptyChart title={chart.title} />;

  const radius = 62;
  const circumference = 2 * Math.PI * radius;
  let offset = 0;
  const segments = data.map((row, index) => {
    const fraction = Number(row.value) / total;
    const segment = {
      ...row,
      index,
      fraction,
      dash: fraction * circumference,
      offset,
      color: PALETTE[index % PALETTE.length],
    };
    offset += fraction * circumference;
    return segment;
  });
  const shown = active === null ? null : segments[active];

  return (
    <figure className="rounded-xl border border-line bg-white p-4">
      <figcaption className="mb-2 text-[13px] font-bold text-ink">{chart.title}</figcaption>
      <div className="flex flex-col items-center gap-4 sm:flex-row">
        <svg viewBox="0 0 160 160" className="h-40 w-40 shrink-0" role="img" aria-label={chart.title}>
          <circle cx="80" cy="80" r={radius} fill="none" stroke="#eef3f0" strokeWidth="20" />
          {segments.map((segment) => (
            <circle
              key={segment.label}
              cx="80"
              cy="80"
              r={radius}
              fill="none"
              stroke={segment.color}
              strokeWidth={active === segment.index ? 24 : 20}
              strokeDasharray={`${segment.dash} ${circumference - segment.dash}`}
              strokeDashoffset={-segment.offset}
              transform="rotate(-90 80 80)"
              className="cursor-pointer transition-all"
              onMouseEnter={() => setActive(segment.index)}
              onMouseLeave={() => setActive(null)}
              tabIndex={0}
              onFocus={() => setActive(segment.index)}
              onBlur={() => setActive(null)}
            >
              <title>{`${segment.label}: ${formatChartValue(segment.value, chart.valueFormat)}`}</title>
            </circle>
          ))}
          <text x="80" y={shown ? 76 : 80} textAnchor="middle" fontSize="14" fontWeight="700" fill="#223047">
            {shown ? formatChartValue(shown.value, chart.valueFormat) : formatChartValue(total, chart.valueFormat)}
          </text>
          <text x="80" y={shown ? 94 : 98} textAnchor="middle" fontSize="9" fill="#6b7a94">
            {shown ? shown.label.slice(0, 18) : 'Total'}
          </text>
        </svg>

        <ul className="min-w-0 flex-1 space-y-1.5">
          {segments.map((segment) => (
            <li key={segment.label}>
              <button
                type="button"
                onMouseEnter={() => setActive(segment.index)}
                onMouseLeave={() => setActive(null)}
                onFocus={() => setActive(segment.index)}
                onBlur={() => setActive(null)}
                className={'flex w-full items-center gap-2 rounded px-1 py-0.5 text-left ' + (active === segment.index ? 'bg-[#f3faf6]' : '')}
              >
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: segment.color }} />
                <span className="min-w-0 flex-1 truncate text-[12px] text-cell">{segment.label}</span>
                <span className="shrink-0 text-[11px] tabular-nums text-inkmuted">{Math.round(segment.fraction * 100)}%</span>
                <span className="shrink-0 text-[12px] font-semibold tabular-nums text-ink">
                  {formatChartValue(segment.value, chart.valueFormat)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

export default function Chart({ chart }) {
  if (!chart) return null;
  if (chart.type === 'line') return <LineChart chart={chart} />;
  if (chart.type === 'donut') return <DonutChart chart={chart} />;
  return <BarChart chart={chart} />;
}
