'use client';

import styles from './dashboard.module.css';
import { EmptyState, Glyph, SectionHead } from './ui';
import { count, inr, percent } from './format';

const UNASSIGNED = '__unassigned__';

function GrowthCell({ value }) {
  if (value === null || value === undefined) return <span className={styles.naCell}>N/A</span>;
  const numeric = Number(value);
  return (
    <span className={`${styles.growthCell} ${numeric > 0 ? styles.growthGood : numeric < 0 ? styles.growthBad : ''}`}>
      {numeric !== 0 ? <Glyph name={numeric > 0 ? 'arrowUp' : 'arrowDown'} size={12} /> : null}
      {percent(Math.abs(numeric))}
    </span>
  );
}

export default function RegionPerformance({ branches, branchLabel, branchFiltered }) {
  const rows = branches?.rows || [];
  const totalRevenue = Number(branches?.totalRevenue) || 0;

  return (
    <div className={styles.card}>
      <SectionHead
        title="Sales by region"
        subtitle="The four storefront boutiques, mapped to their ERP company"
        badge={branchFiltered ? 'Branch filter active' : 'All branches'}
      />

      {rows.length === 0 ? (
        <EmptyState
          title="No branches are available to this account"
          message="The session is not assigned to an active storefront branch."
          icon="map"
        />
      ) : (
        <>
          <div className={styles.tableWrap}>
            <table className={styles.regionTable}>
              <thead>
                <tr>
                  <th scope="col">Boutique</th>
                  <th scope="col" className={styles.num}>Net revenue</th>
                  <th scope="col" className={styles.num}>Orders</th>
                  <th scope="col">Share of branch revenue</th>
                  <th scope="col" className={styles.num}>Growth</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => {
                  const unassigned = row.branchId === UNASSIGNED;
                  return (
                    <tr key={row.branchId} className={unassigned ? styles.regionUnassigned : ''}>
                      <td>
                        <div className={styles.branchCell}>
                          <span className={`${styles.branchMark} ${unassigned ? styles.branchMarkWarn : ''}`}>
                            <Glyph name={unassigned ? 'warning' : 'store'} size={15} />
                          </span>
                          <span className={styles.branchText}>
                            <span className={styles.branchName}>
                              {row.branchName}
                              {row.isMainBranch ? <i className={styles.mainTag}>Main</i> : null}
                            </span>
                            <span className={styles.branchCity}>
                              {unassigned ? 'Not attributed to a boutique' : row.city || 'City not recorded'}
                            </span>
                          </span>
                        </div>
                      </td>
                      <td className={styles.num}><span className={styles.moneyCell}>{inr(row.revenue)}</span></td>
                      <td className={styles.num}><span className={styles.countCell}>{count(row.orders)}</span></td>
                      <td>
                        <div className={styles.shareWrap}>
                          <div className={styles.shareTrack}>
                            <span
                              className={`${styles.shareFill} ${unassigned ? styles.shareFillWarn : ''}`}
                              style={{ width: `${Math.min(100, Math.max(0, Number(row.share) || 0))}%` }}
                            />
                          </div>
                          <span className={styles.shareValue}>{percent(row.share)}</span>
                        </div>
                      </td>
                      <td className={styles.num}><GrowthCell value={row.growth} /></td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total{branchFiltered && branchLabel ? ` · ${branchLabel}` : ''}</td>
                  <td className={styles.num}>{inr(branches?.totalRevenue)}</td>
                  <td className={styles.num}>{count(branches?.totalOrders)}</td>
                  <td><span className={styles.shareValue}>100.00%</span></td>
                  <td className={styles.num}><span className={styles.naCell}>—</span></td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p className={styles.tableFoot}>
            Branch revenue is net recorded revenue. Website orders are attributed to the branch stored on
            the order. Sales with no storefront branch mapping stay in the unassigned row.
            {branchFiltered ? ' Clear the branch filter to reconcile against all four boutiques.' : ''}
          </p>
        </>
      )}

      {totalRevenue === 0 && rows.length ? (
        <p className={styles.inlineWarn}>
          <Glyph name="info" size={14} /> All branch rows are zero for this selection; the table is complete,
          not missing.
        </p>
      ) : null}
    </div>
  );
}
