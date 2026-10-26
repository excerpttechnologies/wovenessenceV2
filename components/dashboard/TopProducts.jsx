'use client';

import styles from './dashboard.module.css';
import { EmptyState, Glyph, SectionHead } from './ui';
import { inr, percent, units } from './format';

export default function TopProducts({ products, loading }) {
  const rows = (products || []).slice(0, 5);

  return (
    <div className={`${styles.card} ${styles.productsCard}`}>
      <SectionHead
        title="Top products"
        subtitle="Ranked by net revenue allocated to each item"
        badge="Top 5"
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No product revenue in this selection"
          message="Only resolved item lines can be ranked. Unmapped line value stays in the uncategorised total."
          icon="package"
        />
      ) : (
        <div className={styles.tableWrap}>
          <table className={styles.productTable}>
            <thead>
              <tr>
                <th scope="col">#</th>
                <th scope="col">Product</th>
                <th scope="col">Category</th>
                <th scope="col" className={styles.num}>Units</th>
                <th scope="col" className={styles.num}>Revenue</th>
                <th scope="col" className={styles.num}>Growth</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row, index) => {
                const change = row.growth;
                const good = change !== null && Number(change) > 0;
                return (
                  <tr key={row.key}>
                    <td>
                      <span className={`${styles.rank} ${index === 0 ? styles.rankFirst : ''}`}>
                        {String(index + 1).padStart(2, '0')}
                      </span>
                    </td>
                    <td>
                      <div className={styles.productName}>
                        <span className={styles.productCode} title={row.name}>{row.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`${styles.categoryPill} ${row.category === 'Uncategorised / unallocated' ? styles.categoryUncat : ''}`}>
                        {row.category}
                      </span>
                    </td>
                    <td className={styles.num}>
                      <span className={styles.unitsCell}>{units(row.units, row.uom)}</span>
                    </td>
                    <td className={styles.num}>
                      <span className={styles.moneyCell}>{inr(row.revenue)}</span>
                      <span className={styles.shareCell}>{percent(row.share)}</span>
                    </td>
                    <td className={styles.num}>
                      {change === null || change === undefined ? (
                        <span className={styles.naCell}>N/A</span>
                      ) : (
                        <span className={`${styles.growthCell} ${good ? styles.growthGood : change < 0 ? styles.growthBad : ''}`}>
                          <Glyph name={change >= 0 ? 'arrowUp' : 'arrowDown'} size={12} />
                          {percent(Math.abs(change))}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      <p className={styles.tableFoot}>
        Growth is N/A when the item had no prior-period revenue. Units are kept in their recorded
        UOM; pieces and metres are never added together.
      </p>

      {loading ? <span className={styles.cardLoading} aria-hidden="true" /> : null}
    </div>
  );
}
