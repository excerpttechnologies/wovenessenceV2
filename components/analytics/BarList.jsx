'use client';

/* A horizontal bar list for the small breakdown cards.

   The width is a percentage of the largest row, not of a hidden total: the
   card is there to compare rows with each other, and a row whose value is
   unknown simply does not render a bar. */

function widthOf(value, max) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0 || !max) return 0;
  return Math.max(2, Math.min(100, (n / max) * 100));
}

export default function BarList({
  rows = [],
  labelKey = 'label',
  valueKey = 'value',
  subKey = '',
  formatValue,
  empty = 'No data for this period.',
  tone = 'green',
}) {
  const max = Math.max(...rows.map((row) => Number(row[valueKey]) || 0), 0);

  if (!rows.length) return <p className="dash-empty">{empty}</p>;

  return (
    <ul className="bar-list">
      {rows.map((row, index) => {
        const value = Number(row[valueKey]) || 0;
        const label = String(row[labelKey] ?? '—');
        return (
          <li className="bar-row" key={(row.key || row.path || row.host || label) + index}>
            <div className="bar-top">
              <span className="bar-label" title={label}>{label}</span>
              <span className="bar-value">
                {formatValue ? formatValue(value, row) : value.toLocaleString('en-IN')}
              </span>
            </div>

            {subKey && row[subKey] && <span className="bar-sub">{row[subKey]}</span>}

            <span className="bar-track" aria-hidden="true">
              <span
                className={'bar-fill bar-fill-' + tone}
                style={{ width: widthOf(value, max) + '%' }}
              />
            </span>
          </li>
        );
      })}
    </ul>
  );
}
