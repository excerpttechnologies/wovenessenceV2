'use client';

import styles from './dashboard.module.css';
import { Delta, Glyph, SectionHead, StatusPill } from './ui';
import { count, inr, percent } from './format';

const META = {
  website: { icon: 'globe', accent: 'teal' },
  instagram: { icon: 'instagram', accent: 'clay' },
  offline: { icon: 'store', accent: 'emerald' },
};

export default function ChannelPerformance({ channels, reconciliation, selectedChannel }) {
  const rows = channels?.rows || [];
  const total = Number(channels?.totalRevenue) || 0;
  const allScope = !selectedChannel || selectedChannel === 'all';

  return (
    <div className={styles.card}>
      <SectionHead
        title="Channel performance"
        subtitle="Website, Instagram and offline stores, reconciled against the same net revenue"
        badge={allScope ? 'All channels' : 'Selected channel highlighted'}
      />

      <div className={styles.mixBarWrap}>
        <div className={styles.mixBar} aria-hidden="true">
          {rows.filter((row) => Number(row.revenue) > 0).map((row) => (
            <span
              key={row.key}
              className={`${styles.mixSegment} ${styles[`mix_${row.key}`]}`}
              style={{ width: `${Math.max(0, Number(row.share) || 0)}%` }}
              title={`${row.label}: ${inr(row.revenue)} (${percent(row.share)})`}
            />
          ))}
        </div>
        <div className={styles.mixLegend}>
          {rows.map((row) => (
            <span key={row.key}><i className={`${styles.mixDot} ${styles[`mix_${row.key}`]}`} />{row.label} · {percent(row.share)}</span>
          ))}
        </div>
      </div>

      <div className={styles.channelGrid}>
        {rows.map((row) => {
          const meta = META[row.key] || META.offline;
          const unavailable = row.available === false;
          return (
            <article
              key={row.key}
              className={[
                styles.channelCard,
                styles[`channel_${meta.accent}`],
                row.inScope ? styles.channelInScope : '',
                unavailable ? styles.channelUnavailable : '',
              ].filter(Boolean).join(' ')}
            >
              <div className={styles.channelTop}>
                <span className={styles.channelIcon}><Glyph name={meta.icon} size={17} /></span>
                <span className={styles.channelName}>{row.label}</span>
                {unavailable
                  ? <StatusPill tone="warning" icon="lock">No source</StatusPill>
                  : row.inScope && !allScope
                    ? <StatusPill tone="positive" icon="check">Selected</StatusPill>
                    : <StatusPill tone="neutral">In view</StatusPill>}
              </div>

              <p className={styles.channelRevenue}>{unavailable ? '₹0' : inr(row.revenue)}</p>
              <div className={styles.channelMeta}>
                <span>{count(row.orders)} orders</span>
                <span>{percent(row.share)} share</span>
              </div>

              <div className={styles.channelDelta}>
                <Delta change={row.growth} changeType="percent" />
                <span className={styles.channelPrev}>vs {inr(row.previousRevenue)} prior</span>
              </div>

              <p className={styles.channelNote}>{row.note}</p>
            </article>
          );
        })}
      </div>

      {!allScope ? (
        <p className={styles.inlineWarn}>
          <Glyph name="info" size={14} />
          All three channels stay visible so the totals can be reconciled. Only the selected channel drives
          the KPI cards, category mix, products, region table and forecast.
        </p>
      ) : null}

      <div className={styles.reconGrid}>
        <div className={styles.reconCard}>
          <span className={styles.reconLabel}>Offline reconciliation</span>
          <p className={styles.reconEquation}>
            <b>{inr(reconciliation?.offline?.sales, 2)}</b> gross
            <span>−</span>
            <b>{inr(reconciliation?.offline?.returns, 2)}</b> returns
          </p>
          <p className={styles.reconNet}>= {inr(reconciliation?.offline?.net, 2)} net</p>
          <p className={styles.reconMeta}>
            {count(reconciliation?.offline?.orders)} orders · {count(reconciliation?.offline?.returnDocuments)} return documents
          </p>
        </div>

        <div className={styles.reconCard}>
          <span className={styles.reconLabel}>Instagram reconciliation</span>
          <p className={styles.reconEquation}>
            <b>{inr(reconciliation?.instagram?.gross, 2)}</b> tagged
            <span>−</span>
            <b>{inr(reconciliation?.instagram?.returns, 2)}</b> tagged returns
          </p>
          <p className={styles.reconNet}>= {inr(reconciliation?.instagram?.net, 2)} net</p>
          <p className={styles.reconMeta}>
            {count(reconciliation?.instagram?.orders)} orders · {count(reconciliation?.instagram?.returnDocuments)} return documents
          </p>
        </div>

        <div className={styles.reconCard}>
          <span className={styles.reconLabel}>Website reconciliation</span>
          <p className={styles.reconEquation}>
            <b>{inr(reconciliation?.website?.eligible, 2)}</b> eligible
            <span>−</span>
            <b>{inr(reconciliation?.website?.duplicatesExcluded, 2)}</b> invoiced in ERP
          </p>
          <p className={styles.reconNet}>= {inr(reconciliation?.website?.net, 2)} net</p>
          <p className={styles.reconMeta}>
            {count(reconciliation?.website?.orders)} orders · {count(reconciliation?.website?.duplicateCount)} duplicate orders excluded
          </p>
        </div>

        <div className={styles.reconCard}>
          <span className={styles.reconLabel}>Total check</span>
          <p className={styles.reconEquation}>
            offline + Instagram + website <span>=</span> <b>{inr(reconciliation?.total, 2)}</b>
          </p>
          <p className={`${styles.reconNet} ${Number(reconciliation?.check) === 0 ? styles.reconPass : styles.reconFail}`}>
            {Number(reconciliation?.check) === 0 ? 'Reconciles exactly' : `Difference ${inr(reconciliation?.check, 2)}`}
          </p>
          <p className={styles.reconMeta}>
            {count(reconciliation?.totalOrders)} total orders · {reconciliation?.onlineReturns}
          </p>
        </div>
      </div>

      <p className={styles.tableFoot}>
        Total net channel revenue {inr(total)}. A bill is Instagram only when its Sales Channel was saved as
        Instagram at billing (a credit inherits its invoice's channel); every untagged bill stays offline.
        Nothing is inferred from a customer name, a note or a profile link.
      </p>
    </div>
  );
}
