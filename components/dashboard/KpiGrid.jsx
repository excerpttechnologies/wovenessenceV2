'use client';

import styles from './dashboard.module.css';
import { Delta, Glyph } from './ui';
import { count, inr, percent } from './format';

const META = {
  revenue: { icon: 'rupee', accent: 'emerald', goodWhenDown: false },
  orders: { icon: 'bag', accent: 'maroon', goodWhenDown: false },
  aov: { icon: 'chart', accent: 'gold', goodWhenDown: false },
  newCustomers: { icon: 'users', accent: 'teal', goodWhenDown: false },
  returnRate: { icon: 'undo', accent: 'clay', goodWhenDown: true },
};

function formatValue(card) {
  if (card.value === null || card.value === undefined) return 'N/A';
  if (card.format === 'currency') return inr(card.value);
  if (card.format === 'percent') return percent(card.value);
  return count(card.value);
}

function formatPrevious(card) {
  if (card.previousValue === null || card.previousValue === undefined) return 'no prior figure';
  if (card.format === 'currency') return inr(card.previousValue);
  if (card.format === 'percent') return percent(card.previousValue);
  return count(card.previousValue);
}

export default function KpiGrid({ kpis, comparisonLabel }) {
  const cards = kpis?.cards || [];
  return (
    <section className={styles.kpiGrid} aria-label="Key performance indicators">
      {cards.map((card, index) => {
        const meta = META[card.key] || META.revenue;
        return (
          <article
            key={card.key}
            className={`${styles.kpiCard} ${styles[`kpi_${meta.accent}`] || ''}`}
            style={{ '--kpi-order': index }}
            title={card.note}
          >
            <div className={styles.kpiTop}>
              <span className={styles.kpiIcon}><Glyph name={meta.icon} size={18} /></span>
              <span className={styles.kpiLabel}>{card.label}</span>
            </div>

            <p className={styles.kpiValue}>{formatValue(card)}</p>

            <div className={styles.kpiDeltaRow}>
              <Delta
                change={card.change}
                changeType={card.changeType}
                goodWhenDown={meta.goodWhenDown}
              />
              <span className={styles.kpiPrev}>
                {comparisonLabel ? `vs ${formatPrevious(card)}` : 'Comparison off'}
              </span>
            </div>

            <p className={styles.kpiNote}>{card.note}</p>
          </article>
        );
      })}
    </section>
  );
}
