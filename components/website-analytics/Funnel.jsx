'use client';

import { formatNumber, formatPercent } from '@/lib/dashboard/format';

/* Session funnel: each step as a share of the sessions that started, so a
   drop-off is visible as a narrower bar rather than as a number to compare in
   your head. A null step is "not tracked", which draws nothing. */

export default function Funnel({ steps = [], conversionRate = null }) {
  const base = Number(steps[0]?.value) || 0;

  return (
    <div className="wa-funnel">
      <div className="wa-funnel-top">
        <span>Session conversion</span>
        <strong>{formatPercent(conversionRate, { decimals: 2 })}</strong>
      </div>

      {steps.map((step, index) => {
        const value = step.value;
        const width = value === null || value === undefined || !base
          ? 0
          : Math.max(3, Math.min(100, (Number(value) / base) * 100));

        return (
          <div className="wa-funnel-step" key={step.key || step.label}>
            <div className="wa-funnel-row">
              <span className="wa-funnel-label">{step.label}</span>
              <span className="wa-funnel-value">
                {value === null || value === undefined ? '-' : formatNumber(value)}
                {step.rate !== null && step.rate !== undefined && index > 0 && (
                  <em>{formatPercent(step.rate)}</em>
                )}
              </span>
            </div>
            <span className="wa-funnel-track" aria-hidden="true">
              <span className="wa-funnel-fill" style={{ width: width + '%' }} />
            </span>
          </div>
        );
      })}

      {!base && <p className="dash-empty">No tracked session in this period.</p>}
    </div>
  );
}
