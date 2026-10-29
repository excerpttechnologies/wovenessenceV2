'use client';

import styles from './dashboard.module.css';
import { Glyph } from './ui';
import { financialYearBounds, timeLabel } from './format';

export default function FilterBar({
  options, filters, financialYear, onChange, onRefresh, onDownload,
  loading, optionsLoading = false, optionsError = '', downloading, lastUpdated, error,
  canDownload = true,
}) {
  const bounds = financialYearBounds(financialYear);

  return (
    <section className={styles.filterCard} aria-label="Dashboard filters">
      <div className={styles.filterHead}>
        <div>
          <span className={styles.eyebrow}>Report scope</span>
          <h2 className={styles.filterTitle}>Shape the view</h2>
          <p className={styles.filterHint}>
            Company, location, and financial year follow the global selectors in the top bar.
          </p>
        </div>

        <div className={styles.filterActions}>
          <span className={styles.updated}>
            <i className={styles.liveDot} />
            {optionsLoading
              ? 'Refreshing filters…'
              : lastUpdated
                ? `Updated ${timeLabel(lastUpdated)} IST`
                : loading ? 'Reading records…' : 'Not loaded'}
          </span>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onRefresh}
            disabled={loading || optionsLoading}
            aria-label="Refresh dashboard"
          >
            <Glyph name="refresh" size={15} className={loading || optionsLoading ? styles.spinning : ''} />
            <span>{loading || optionsLoading ? 'Refreshing' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onDownload}
            disabled={!canDownload || loading || optionsLoading || downloading}
            title={canDownload ? 'Download the filtered workbook' : 'Load the report before downloading'}
          >
            <Glyph name="download" size={15} />
            <span>{downloading ? 'Building…' : 'Download full report'}</span>
          </button>
        </div>
      </div>

      <div className={styles.filterGrid}>
        <label className={styles.field}>
          <span>Sales channel</span>
          <select value={filters.channel} onChange={(e) => onChange('channel', e.target.value)} disabled={optionsLoading}>
            {options.channels.map((channel) => (
              <option key={channel.value} value={channel.value}>{channel.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>From</span>
          <input
            type="date"
            value={filters.startDate}
            min={bounds.start}
            max={bounds.end}
            onChange={(e) => onChange('startDate', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>To</span>
          <input
            type="date"
            value={filters.endDate}
            min={bounds.start}
            max={bounds.end}
            onChange={(e) => onChange('endDate', e.target.value)}
          />
        </label>

        <label className={styles.field}>
          <span>Compare with</span>
          <select value={filters.comparison} onChange={(e) => onChange('comparison', e.target.value)} disabled={optionsLoading}>
            {options.comparisonOptions.map((comparison) => (
              <option key={comparison.value} value={comparison.value}>{comparison.label}</option>
            ))}
          </select>
        </label>
      </div>

      {optionsLoading ? (
        <p className={styles.filterHint} role="status">Loading report filter options…</p>
      ) : null}
      {optionsError ? (
        <p className={styles.filterError} role="alert">
          <Glyph name="warning" size={15} /> {optionsError}
        </p>
      ) : null}
      {error ? (
        <p className={styles.filterError} role="alert">
          <Glyph name="warning" size={15} /> {error}
        </p>
      ) : null}

      <p className={styles.filterNote}>
        <Glyph name="info" size={13} />
        Dates are inclusive Asia/Kolkata calendar days. The report allows up to 366 days per selection.
        Instagram sales are the bills tagged with that channel at billing, net of tagged returns; untagged bills are offline store sales.
      </p>
    </section>
  );
}
