'use client';

import styles from './dashboard.module.css';
import { Glyph, SectionHead, StatusPill } from './ui';
import { count, inr, percent, units } from './format';

const REC_ICON = {
  marketing: 'lightbulb',
  action: 'arrowRight',
  inventory: 'package',
};

export default function ForecastPanel({ forecast, recommendations, inventory }) {
  const growing = recommendations?.growingDemand || [];
  const alerts = inventory?.alerts || [];

  return (
    <div className={`${styles.card} ${styles.forecastCard}`}>
      <SectionHead
        title="Forecast & recommendations"
        subtitle="Three different kinds of statement, labelled so they are never mistaken for each other"
        badge="Rule-based"
      />

      <div className={styles.forecastGrid}>
        {/* ------------------------------------------------------------ forecast */}
        <section className={styles.forecastBlock} aria-label="Next month forecast">
          <div className={styles.blockHead}>
            <span className={styles.kindForecast}>Forecast</span>
            <StatusPill tone="gold" icon="trend">Model</StatusPill>
          </div>
          <h3 className={styles.blockTitle}>Next month projection</h3>
          <p className={styles.blockMonth}>{forecast?.nextMonth || '—'}</p>

          {forecast?.available ? (
            <>
              <p className={styles.forecastValue}>{inr(forecast.forecast)}</p>
              <p className={styles.forecastRange}>
                Range {inr(forecast.lower)} – {inr(forecast.upper)}
              </p>
              <div className={styles.forecastStats}>
                <div><span>Daily run rate</span><b>{inr(forecast.dailyAverage)}</b></div>
                <div><span>Basis</span><b>{count(forecast.basisDays)} days</b></div>
                <div><span>Month length</span><b>{count(forecast.nextMonthDays)} days</b></div>
              </div>
              <p className={styles.blockNote}>{forecast.model}</p>
              <p className={styles.disclaimer}><Glyph name="warning" size={13} /> {forecast.disclaimer}</p>
            </>
          ) : (
            <div className={styles.forecastUnavailable}>
              <Glyph name="info" size={18} />
              <div>
                <p>No forecast is shown.</p>
                <span>{forecast?.reason || 'The selected period does not support the run-rate model.'}</span>
              </div>
            </div>
          )}
        </section>

        {/* ----------------------------------------------------- recommendations */}
        <section className={styles.forecastBlock} aria-label="Recommendations">
          <div className={styles.blockHead}>
            <span className={styles.kindRecommendation}>Recommendation</span>
            <StatusPill tone="neutral" icon="info">Rule</StatusPill>
          </div>
          <h3 className={styles.blockTitle}>Where to act next</h3>
          <p className={styles.blockNote}>{recommendations?.note}</p>

          <ul className={styles.recList}>
            {(recommendations?.recommendations || []).map((item, index) => (
              <li key={`${item.type}-${index}`} className={styles.recItem}>
                <span className={styles.recIcon}><Glyph name={REC_ICON[item.type] || 'lightbulb'} size={15} /></span>
                <div>
                  <p className={styles.recTitle}>{item.title}</p>
                  <p className={styles.recBody}>{item.body}</p>
                  <p className={styles.recBasis}>Basis: {item.basis}</p>
                </div>
              </li>
            ))}
          </ul>
        </section>

        {/* --------------------------------------------------------- inventory */}
        <section className={styles.forecastBlock} aria-label="Inventory alerts">
          <div className={styles.blockHead}>
            <span className={styles.kindDerived}>Derived risk</span>
            <StatusPill tone={inventory?.alertCount ? 'warning' : 'neutral'} icon="package">
              {inventory?.available ? `${count(inventory.alertCount)} alerts` : 'Not available'}
            </StatusPill>
          </div>
          <h3 className={styles.blockTitle}>Inventory cover watch</h3>

          {inventory?.available ? (
            <>
              <p className={styles.blockNote}>{inventory.assumption}</p>
              {alerts.length ? (
                <ul className={styles.alertList}>
                  {alerts.map((alert) => (
                    <li key={`${alert.code}-${alert.uom}`} className={styles.alertItem}>
                      <div className={styles.alertTop}>
                        <span className={styles.alertCode}>{alert.code}</span>
                        <span className={`${styles.coverBadge} ${alert.severity === 'critical' ? styles.coverCritical : styles.coverWatch}`}>
                          {alert.daysCover} days cover
                        </span>
                      </div>
                      <p className={styles.alertName}>{alert.name}</p>
                      <p className={styles.alertMeta}>
                        {units(alert.stock, alert.uom)} on hand · {units(alert.sold28, alert.uom)} sold in {inventory.lookbackDays} days
                      </p>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className={styles.blockEmpty}>
                  No stocked item/uom combination is inside the {inventory.coverDays}-day cover line at the
                  current offline velocity.
                </p>
              )}
              <p className={styles.blockFoot}>
                {count(inventory.itemCount)} stocked item/uom combinations reviewed
              </p>
              {inventory.stockByUom?.length ? (
                <p className={styles.blockFoot}>
                  On hand by UOM:
                  {inventory.stockByUom.map((row) => ` ${units(row.stock, row.uom)}`).join(' · ')}
                </p>
              ) : null}
            </>
          ) : (
            <p className={styles.blockEmpty}>{inventory?.reason || 'Inventory cover is not available for this channel.'}</p>
          )}
        </section>
      </div>

      {/* -------------------------------------------------------- growing demand */}
      <div className={styles.growingBlock}>
        <div className={styles.growingHead}>
          <span className={styles.kindFact}>Recorded fact</span>
          <h3 className={styles.growingTitle}>Growing demand</h3>
          <p>Products with positive revenue growth against the comparison period and a positive prior base.</p>
        </div>
        {growing.length ? (
          <div className={styles.growingGrid}>
            {growing.map((row) => (
              <div key={row.key} className={styles.growingCard}>
                <span className={styles.growingName}>{row.label}</span>
                <span className={styles.growingCategory}>{row.category}</span>
                <span className={styles.growingGrowth}><Glyph name="arrowUp" size={13} />{percent(row.growth, { signed: true })}</span>
                <span className={styles.growingRevenue}>{inr(row.revenue)} <small>vs {inr(row.previousRevenue)}</small></span>
              </div>
            ))}
          </div>
        ) : (
          <p className={styles.blockEmpty}>
            No product had positive growth on a positive prior-period base in this selection.
          </p>
        )}
      </div>
    </div>
  );
}
