'use client';

import Icon from '@/components/Icon';

/* One dashboard figure.

   `value` is already formatted by the caller: money and counts are not the
   same thing, and a shared number formatter here would have to guess. The
   component owns only the card, the change pill and the "not tracked" state. */

const TONES = {
  green: 'stat-ico-green',
  blue: 'stat-ico-blue',
  amber: 'stat-ico-amber',
  rose: 'stat-ico-rose',
  teal: 'stat-ico-teal',
  violet: 'stat-ico-violet',
};

function changeTone(change, goodWhen) {
  if (change === null || change === undefined || change === 0) return 'flat';
  const up = change > 0;
  if (goodWhen === 'none') return 'neutral';
  if (goodWhen === 'down') return up ? 'bad' : 'good';
  return up ? 'good' : 'bad';
}

function changeText(change, suffix) {
  if (change === null || change === undefined) return '';
  return `${change > 0 ? '+' : ''}${Number(change).toFixed(1)}${suffix}`;
}

export default function StatTile({
  icon = 'chart',
  tone = 'blue',
  label,
  value,
  previous,
  previousLabel = 'vs previous',
  change,
  note,
  loading = false,
  unavailable = '',
  goodWhen = 'up',
  size = '',
  changeSuffix = '%',
  rawValue,
}) {
  const hasValue = value !== null && value !== undefined && value !== '';
  const isUnavailable = Boolean(unavailable) || !hasValue;
  const toneClass = TONES[tone] || TONES.blue;
  const zero = rawValue !== undefined && Number(rawValue) === 0;

  return (
    <div className="stat-card">
      <div className="stat-top">
        <span className={'stat-ico ' + toneClass}>
          <Icon name={icon} size={20} />
        </span>

        <span className="stat-label">
          {label}
          {note && <span className="stat-note">{note}</span>}
        </span>
      </div>

      <div className="stat-bottom">
        <span className={'stat-value ' + (size === 'sm' || isUnavailable ? 'stat-value-sm' : '')}>
          {loading ? <span className="spin" /> : isUnavailable ? (unavailable || 'No data') : value}
        </span>

        {!loading && !isUnavailable && change !== undefined && (change !== null || !zero) && (
          <span className={'stat-change stat-change-' + changeTone(change, goodWhen)}>
            {change === null ? 'New' : changeText(change, changeSuffix)}
          </span>
        )}
      </div>

      {!loading && !isUnavailable && previous !== undefined && previous !== null && previous !== '' && (
        <span className="stat-prev">{previousLabel}: {previous}</span>
      )}
    </div>
  );
}
