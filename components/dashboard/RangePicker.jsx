'use client';

import { useEffect, useState } from 'react';
import { RANGE_PRESETS } from '@/lib/dashboard/range';

/* The period strip shared by the dashboard and website analytics.

   Presets apply immediately because that is what a person expects from a
   chip. Custom dates wait for Apply: half-typed dates should not fire a
   request per keystroke, and a From after a To deserves an answer before the
   page changes. */

function daysBetween(from, to) {
  const a = new Date(from + 'T00:00:00Z');
  const b = new Date(to + 'T00:00:00Z');
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  return Math.round((b.getTime() - a.getTime()) / 86400000) + 1;
}

export default function RangePicker({
  presets = RANGE_PRESETS,
  preset = '30d',
  from = '',
  to = '',
  label = '',
  busy = false,
  maxDays = 366,
  onApply,
}) {
  const [draftPreset, setDraftPreset] = useState(preset);
  const [draftFrom, setDraftFrom] = useState(from);
  const [draftTo, setDraftTo] = useState(to);
  const [error, setError] = useState('');

  useEffect(() => {
    setDraftPreset(preset);
    setDraftFrom(from);
    setDraftTo(to);
    setError('');
  }, [preset, from, to]);

  const pick = (value) => {
    setDraftPreset(value);
    setError('');
    if (value !== 'custom') onApply?.({ preset: value, from: '', to: '' });
  };

  const applyCustom = () => {
    if (!draftFrom || !draftTo) {
      setError('Choose both dates.');
      return;
    }
    const days = daysBetween(draftFrom, draftTo);
    if (days === null) {
      setError('Those dates are not valid.');
      return;
    }
    if (days < 1) {
      setError('The From date must not be after the To date.');
      return;
    }
    if (days > maxDays) {
      setError(`Choose at most ${maxDays} days.`);
      return;
    }
    setError('');
    onApply?.({ preset: 'custom', from: draftFrom, to: draftTo });
  };

  return (
    <div className="range-bar">
      <div className="range-presets" role="group" aria-label="Reporting period">
        {presets.map((option) => (
          <button
            key={option.value}
            type="button"
            className={'range-chip' + (draftPreset === option.value ? ' range-chip-on' : '')}
            aria-pressed={draftPreset === option.value}
            disabled={busy}
            onClick={() => pick(option.value)}
          >
            {option.label}
          </button>
        ))}
      </div>

      {draftPreset === 'custom' && (
        <div className="range-custom">
          <label className="range-date">
            <span>From</span>
            <input
              type="date"
              className="f-input"
              value={draftFrom}
              max={draftTo || undefined}
              disabled={busy}
              onChange={(event) => setDraftFrom(event.target.value)}
            />
          </label>
          <label className="range-date">
            <span>To</span>
            <input
              type="date"
              className="f-input"
              value={draftTo}
              min={draftFrom || undefined}
              disabled={busy}
              onChange={(event) => setDraftTo(event.target.value)}
            />
          </label>
          <button type="button" className="btn btn-primary" disabled={busy} onClick={applyCustom}>
            Apply
          </button>
          {error && <span className="range-error">{error}</span>}
        </div>
      )}

      {label && draftPreset !== 'custom' && <span className="range-label">{label}</span>}
    </div>
  );
}
