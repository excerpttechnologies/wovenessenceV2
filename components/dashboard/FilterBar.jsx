'use client';

import styles from './dashboard.module.css';
import { Glyph } from './ui';
import { financialYearBounds, timeLabel } from './format';

export default function FilterBar({
  options, filters, onChange, onRefresh, onDownload,
  loading, downloading, lastUpdated, error, canDownload = true,
}) {
  const branches = options.branches.filter(
    (branch) => !filters.company || branch.companyId === filters.company
  );
  const bounds = financialYearBounds(filters.financialYear);

  return (
    <section className={styles.filterCard} aria-label="Dashboard filters">
      <div className={styles.filterHead}>
        <div>
          <span className={styles.eyebrow}>Report scope</span>
          <h2 className={styles.filterTitle}>Shape the view</h2>
          <p className={styles.filterHint}>
            These filters belong to this report. The top-bar selectors elsewhere in the ERP are unchanged.
          </p>
        </div>

        <div className={styles.filterActions}>
          <span className={styles.updated}>
            <i className={styles.liveDot} />
            {lastUpdated ? `Updated ${timeLabel(lastUpdated)} IST` : loading ? 'Reading records…' : 'Not loaded'}
          </span>
          <button
            type="button"
            className={styles.btnGhost}
            onClick={onRefresh}
            disabled={loading}
            aria-label="Refresh dashboard"
          >
            <Glyph name="refresh" size={15} className={loading ? styles.spinning : ''} />
            <span>{loading ? 'Refreshing' : 'Refresh'}</span>
          </button>
          <button
            type="button"
            className={styles.btnPrimary}
            onClick={onDownload}
            disabled={!canDownload || loading || downloading}
            title={canDownload ? 'Download the filtered workbook' : 'Load the report before downloading'}
          >
            <Glyph name="download" size={15} />
            <span>{downloading ? 'Building…' : 'Download full report'}</span>
          </button>
        </div>
      </div>

      <div className={styles.filterGrid}>
        <label className={styles.field}>
          <span>Company</span>
          <select value={filters.company} onChange={(e) => onChange('company', e.target.value)}>
            <option value="">All companies</option>
            {options.companies.map((company) => (
              <option key={company.value} value={company.value}>{company.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Branch / location</span>
          <select value={filters.branch} onChange={(e) => onChange('branch', e.target.value)}>
            <option value="">{filters.company ? 'All branches in company' : 'All four branches'}</option>
            {branches.map((branch) => (
              <option key={branch.value} value={branch.value}>{branch.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Sales channel</span>
          <select value={filters.channel} onChange={(e) => onChange('channel', e.target.value)}>
            {options.channels.map((channel) => (
              <option key={channel.value} value={channel.value}>{channel.label}</option>
            ))}
          </select>
        </label>

        <label className={styles.field}>
          <span>Financial year</span>
          <select value={filters.financialYear} onChange={(e) => onChange('financialYear', e.target.value)}>
            {options.financialYears.map((fy) => (
              <option key={fy.value} value={fy.value}>
                {fy.label}{fy.current ? ' · current' : ''}
              </option>
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
          <select value={filters.comparison} onChange={(e) => onChange('comparison', e.target.value)}>
            {options.comparisonOptions.map((comparison) => (
              <option key={comparison.value} value={comparison.value}>{comparison.label}</option>
            ))}
          </select>
        </label>
      </div>

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
