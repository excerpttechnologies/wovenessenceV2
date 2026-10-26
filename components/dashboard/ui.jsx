'use client';

import styles from './dashboard.module.css';
import { percent, points } from './format';

const PATHS = {
  sparkle: [
    'M12 3l1.7 5.3L19 10l-5.3 1.7L12 17l-1.7-5.3L5 10l5.3-1.7z',
    'M19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z',
  ],
  arrowUp: ['M12 19V5', 'M6 11l6-6 6 6'],
  arrowDown: ['M12 5v14', 'M18 13l-6 6-6-6'],
  arrowRight: ['M5 12h14', 'M13 6l6 6-6 6'],
  download: ['M12 3v12', 'M7 10l5 5 5-5', 'M4 20h16'],
  refresh: ['M20 12a8 8 0 10-2.3 5.7', 'M20 4v6h-6'],
  calendar: ['M4 6h16v15H4z', 'M4 10h16', 'M8 3v4', 'M16 3v4'],
  filter: ['M3 5h18l-7 8v6l-4-2v-4z'],
  chevron: ['M8 10l4 4 4-4'],
  close: ['M6 6l12 12', 'M18 6L6 18'],
  globe: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M3 12h18', 'M12 3c2.6 2.6 4 5.6 4 9s-1.4 6.4-4 9c-2.6-2.6-4-5.6-4-9s1.4-6.4 4-9z'],
  instagram: ['M7 3h10a4 4 0 014 4v10a4 4 0 01-4 4H7a4 4 0 01-4-4V7a4 4 0 014-4z', 'M12 16a4 4 0 100-8 4 4 0 000 8z', 'M17.5 6.5h.01'],
  store: ['M4 10h16', 'M5 10l1-6h12l1 6', 'M4 10v10h16V10', 'M9 20v-5h6v5'],
  box: ['M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z', 'M4 7.5l8 4.5 8-4.5', 'M12 12v9'],
  warning: ['M12 3L2.5 20h19z', 'M12 9v5', 'M12 17h.01'],
  info: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M12 11v5', 'M12 8h.01'],
  check: ['M12 21a9 9 0 100-18 9 9 0 000 18z', 'M8 12l3 3 5-6'],
  users: ['M16 20v-1a4 4 0 00-4-4H7a4 4 0 00-4 4v1', 'M9.5 11a3.5 3.5 0 100-7 3.5 3.5 0 000 7z', 'M17 4h4', 'M17 8h4', 'M17 12h3'],
  bag: ['M4 8h16l-1 12H5L4 8z', 'M9 8V6a3 3 0 016 0v2'],
  rupee: ['M7 4h10', 'M7 8h10', 'M7 12h5a4 4 0 000-8', 'M7 12l7 8'],
  undo: ['M4 9h11a5 5 0 010 10h-6', 'M4 9l4-4', 'M4 9l4 4'],
  chart: ['M4 20V10', 'M10 20V4', 'M16 20v-7', 'M22 20H2'],
  package: ['M4 5h16v14H4z', 'M4 10h16', 'M9 5v14'],
  map: ['M12 21s7-5.4 7-11a7 7 0 10-14 0c0 5.6 7 11 7 11z', 'M12 12a2.5 2.5 0 100-5 2.5 2.5 0 000 5z'],
  lightbulb: ['M9 18h6', 'M10 21h4', 'M8.5 15a5.5 5.5 0 116.9 0c-.8.6-1.4 1.4-1.4 2H9.9c0-.6-.6-1.4-1.4-2z'],
  trend: ['M3 17l6-6 4 4 7-8', 'M15 7h5v5'],
  lock: ['M6 10h12v10H6z', 'M9 10V7a3 3 0 016 0v3'],
};

export function Glyph({ name, size = 18, className = '', strokeWidth = 1.8 }) {
  const paths = PATHS[name] || PATHS.info;
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths.map((d, i) => <path key={i} d={d} />)}
    </svg>
  );
}

export function Delta({ change, changeType = 'percent', goodWhenDown = false, className = '' }) {
  if (change === null || change === undefined || !Number.isFinite(Number(change))) {
    return <span className={`${styles.delta} ${styles.deltaNa} ${className}`}>No comparison</span>;
  }
  const value = Number(change);
  if (value === 0) {
    return <span className={`${styles.delta} ${styles.deltaFlat} ${className}`}>No change</span>;
  }
  const up = value > 0;
  const improvement = goodWhenDown ? value < 0 : value > 0;
  const label = changeType === 'points' ? points(value) : percent(value, { signed: true });
  return (
    <span
      className={`${styles.delta} ${improvement ? styles.deltaGood : styles.deltaBad} ${className}`}
      title={improvement ? 'Improvement against the comparison period' : 'Behind the comparison period'}
    >
      <Glyph name={up ? 'arrowUp' : 'arrowDown'} size={12} strokeWidth={2.2} />
      {label}
    </span>
  );
}

export function SectionHead({ title, subtitle, badge, action }) {
  return (
    <div className={styles.sectionHead}>
      <div className={styles.sectionHeadText}>
        <h2 className={styles.sectionTitle}>{title}</h2>
        {subtitle ? <p className={styles.sectionSub}>{subtitle}</p> : null}
      </div>
      <div className={styles.sectionHeadRight}>
        {badge ? <span className={styles.sectionBadge}>{badge}</span> : null}
        {action || null}
      </div>
    </div>
  );
}

export function StatusPill({ tone = 'neutral', children, icon }) {
  return (
    <span className={`${styles.statusPill} ${styles[`status_${tone}`] || styles.status_neutral}`}>
      {icon ? <Glyph name={icon} size={12} strokeWidth={2} /> : null}
      {children}
    </span>
  );
}

export function EmptyState({ title = 'No data for this selection', message, icon = 'chart' }) {
  return (
    <div className={styles.emptyState}>
      <span className={styles.emptyIcon}><Glyph name={icon} size={22} /></span>
      <div>
        <p className={styles.emptyTitle}>{title}</p>
        {message ? <p className={styles.emptyMsg}>{message}</p> : null}
      </div>
    </div>
  );
}

export function ErrorPanel({ message, code, onRetry, compact = false }) {
  return (
    <div className={`${styles.errorPanel} ${compact ? styles.errorCompact : ''}`} role="alert">
      <span className={styles.errorIcon}><Glyph name="warning" size={20} /></span>
      <div className={styles.errorBody}>
        <p className={styles.errorTitle}>The dashboard could not load</p>
        <p className={styles.errorMsg}>{message || 'Something went wrong while reading the sales records.'}</p>
        {code ? <p className={styles.errorCode}>Reference: {code}</p> : null}
      </div>
      {onRetry ? (
        <button type="button" className={styles.btn} onClick={onRetry}>
          <Glyph name="refresh" size={15} /> Retry
        </button>
      ) : null}
    </div>
  );
}

export function Skeleton({ className = '' }) {
  return <span className={`${styles.skeleton} ${className}`} aria-hidden="true" />;
}

export function DeltaFootnote({ children }) {
  return <p className={styles.deltaFootnote}>{children}</p>;
}
