'use client';

import styles from './dashboard.module.css';
import { Glyph, SectionHead, StatusPill } from './ui';
import { count } from './format';

const LABELS = {
  revenue: 'Revenue',
  orders: 'Orders',
  aov: 'Average order value',
  newCustomers: 'New customers',
  returnRate: 'Return rate',
  category: 'Category allocation',
  region: 'Region attribution',
  forecast: 'Forecast',
  inventory: 'Inventory cover',
  instagram: 'Instagram',
};

function tone(level) {
  if (level === 'warning') return 'warning';
  if (level === 'info') return 'neutral';
  return 'positive';
}

export default function DataNotes({ dataQuality, meta }) {
  const items = dataQuality || [];
  const warnings = items.filter((item) => item.level === 'warning').length;
  const definitions = Object.entries(meta?.definitions || {});
  const counts = meta?.sourceCounts || {};

  return (
    <div className={styles.card} aria-label="Data notes and definitions">
      <SectionHead
        title="Data notes & definitions"
        subtitle="What is measured, what is missing, and why a figure is N/A"
        badge={items.length ? `${items.length} notes` : ''}
        action={warnings ? <StatusPill tone="warning" icon="warning">{warnings} warnings</StatusPill> : null}
      />

      {items.length ? (
        <ul className={styles.notesList}>
          {items.map((item) => (
            <li key={item.key} className={styles.noteItem}>
              <span className={`${styles.noteDot} ${styles[`note_${item.level}`] || ''}`}>
                <Glyph name={item.level === 'warning' ? 'warning' : 'info'} size={14} />
              </span>
              <div>
                <p className={styles.noteTitle}>{item.title}</p>
                <p className={styles.noteDetail}>{item.detail}</p>
              </div>
              <span className={styles.noteLevel}>{item.level}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className={styles.blockEmpty}>No data-quality notes were raised for this selection.</p>
      )}

      <details className={styles.methodDetails}>
        <summary>
          <span><Glyph name="info" size={15} /> How every figure is calculated</span>
          <Glyph name="chevron" size={16} className={styles.summaryChevron} />
        </summary>
        <dl className={styles.definitionGrid}>
          {definitions.map(([key, value]) => (
            <div key={key} className={styles.definitionRow}>
              <dt>{LABELS[key] || key}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </details>

      <details className={styles.methodDetails}>
        <summary>
          <span><Glyph name="info" size={15} /> Record counts and limits</span>
          <Glyph name="chevron" size={16} className={styles.summaryChevron} />
        </summary>
        <div className={styles.sourceCounts}>
          <span><b>{count(counts.posInvoices)}</b> POS invoices</span>
          <span><b>{count(counts.salesInvoices)}</b> sales invoices</span>
          <span><b>{count(counts.posReturns)}</b> POS returns</span>
          <span><b>{count(counts.salesReturns)}</b> sales returns</span>
          <span><b>{count(counts.websiteOrders)}</b> website orders included</span>
          <span><b>{count(counts.websiteDuplicateOrders)}</b> website duplicates excluded</span>
          <span><b>{count(meta?.caps?.documentsPerCollection)}</b> records per collection cap</span>
          <span><b>{count(meta?.caps?.maxRangeDays)}</b> maximum selected days</span>
        </div>
      </details>

      <p className={styles.sourceLine}>
        Source records: ERP POS, sales, POS returns and sales returns; storefront orders and branches.
        Instagram is attributed only from the Sales Channel saved on a bill at billing, and is never estimated.
        {meta?.timezone ? ` Dates use ${meta.timezone}.` : ''}
      </p>
    </div>
  );
}
