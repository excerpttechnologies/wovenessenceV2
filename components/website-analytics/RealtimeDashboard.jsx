'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './website-analytics.module.css';
import Glyph from './icons';
import ActiveUsersSection from './ActiveUsersSection';
import { count } from '@/components/dashboard/format';

/* ==========================================================================
   Website Analytics (Realtime).

   Only figures returned by GA4 properties/:id:runRealtimeReport are shown here.
   The API already removed every section GA4 rejects; a section that fails at
   runtime is rendered as an error with its stable code, never as a zero.
   ========================================================================== */

const REFRESH_MS = 30_000;

const FIXES = {
  GA4_PERMISSION_DENIED: 'Add the service account as Viewer in GA4 Property access management and check GA4_PROPERTY_ID.',
  GA4_NOT_CONFIGURED: 'Set GA4_PROPERTY_ID and GA4_CREDENTIALS_JSON (or GA4_CLIENT_EMAIL + GA4_PRIVATE_KEY) on the server.',
  GA4_INVALID_CREDENTIALS: 'The service-account key is invalid. Replace GA4_CREDENTIALS_JSON with a freshly downloaded key.',
  GA4_AUTH_FAILED: 'Google rejected the service-account sign-in. Check the key and the server clock.',
  GA4_PROPERTY_NOT_FOUND: 'GA4_PROPERTY_ID must be the property number (digits only), not the G- measurement ID or the account ID.',
  GA4_QUOTA_EXCEEDED: 'The GA4 realtime quota is exhausted. Wait a minute, then refresh.',
  GA4_API_UNAVAILABLE: 'Google Analytics is unreachable right now. Retry in a moment.',
  GA4_INVALID_REQUEST: 'GA4 rejected one realtime report field. Check the server log for the section that failed.',
  GA4_REPORT_FAILED: 'The realtime report could not be read. Retry in a moment.',
};

function fixFor(code) {
  return FIXES[code] || 'Check the GA4 configuration on the server, then retry.';
}

function clockLabel(iso) {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  return new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date);
}

function Panel({ title, icon = 'chart', subtitle, badge, children }) {
  return (
    <section className={styles.panel}>
      <header className={styles.panelHead}>
        <div className={styles.panelHeadText}>
          <h2 className={styles.panelTitle}>
            <Glyph name={icon} size={15} /> {title}
          </h2>
          {subtitle ? <p className={styles.panelSub}>{subtitle}</p> : null}
        </div>
        {badge ? <span className={styles.panelBadge}>{badge}</span> : null}
      </header>
      {children}
    </section>
  );
}

function SectionError({ error }) {
  return (
    <div className={styles.sectionError} role="alert">
      <p className={styles.sectionErrorTitle}>
        <Glyph name="warning" size={14} /> {error.message}
      </p>
      <p className={styles.sectionErrorCode}>GA4 error code · {error.code}</p>
    </div>
  );
}

function BigCard({ label, value, hint, error }) {
  const failed = Boolean(error);
  return (
    <article className={`${styles.bigCard} ${failed ? styles.bigCardBad : ''}`}>
      <span className={styles.bigLabel}>{label}</span>
      <p className={styles.bigValue}>{failed || value === null ? '—' : count(value)}</p>
      {failed
        ? <SectionError error={error} />
        : <p className={styles.bigHint}>{hint}</p>}
    </article>
  );
}

function MinuteChart({ rows }) {
  const bars = Array.isArray(rows) ? rows : [];
  const width = 660;
  const height = 192;
  const padL = 34;
  const padR = 6;
  const padT = 10;
  const padB = 22;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const max = Math.max(1, ...bars.map((row) => Number(row.activeUsers) || 0));
  const step = plotW / (bars.length || 30);
  const barW = Math.max(2, step - 4);
  const total = bars.reduce((sum, row) => sum + (Number(row.activeUsers) || 0), 0);
  const ticks = [...new Set([0, Math.round(max / 2), max])];

  const labelIndexes = bars.length
    ? [0, 5, 10, 15, 20, 25, bars.length - 1].filter((index, position, all) => index < bars.length && all.indexOf(index) === position)
    : [];

  return (
    <div className={styles.chartWrap}>
      {bars.length === 0 ? (
        <div className={styles.chartEmpty}>No per-minute data in this window.</div>
      ) : (
        <svg
          className={styles.chartSvg}
          viewBox={`0 0 ${width} ${height}`}
          role="img"
          aria-label="Active users per minute over the last 30 minutes"
        >
          {ticks.map((tick) => {
            const y = padT + plotH - (tick / max) * plotH;
            return (
              <g key={tick}>
                <line className={styles.chartGrid} x1={padL} x2={width - padR} y1={y} y2={y} />
                <text className={styles.chartAxisText} x={padL - 6} y={y + 3} textAnchor="end">{tick}</text>
              </g>
            );
          })}

          {bars.map((row, index) => {
            const value = Number(row.activeUsers) || 0;
            const barHeight = (value / max) * plotH;
            const x = padL + index * step + (step - barW) / 2;
            const y = padT + plotH - barHeight;
            return (
              <rect
                key={row.minutesAgo ?? index}
                className={`${styles.chartBar} ${index === bars.length - 1 ? styles.chartBarNow : ''}`}
                x={x}
                y={barHeight > 0 ? y : padT + plotH - 1}
                width={barW}
                height={Math.max(barHeight, 1)}
                rx="2"
              >
                <title>{`${row.minutesAgo === 0 ? 'Now' : `${row.minutesAgo} min ago`}: ${value} active user${value === 1 ? '' : 's'}`}</title>
              </rect>
            );
          })}

          {labelIndexes.map((index) => {
            const row = bars[index];
            if (!row) return null;
            const x = padL + index * step + step / 2;
            const label = row.minutesAgo === 0 ? 'now' : `-${row.minutesAgo}m`;
            return (
              <text
                key={`label-${row.minutesAgo ?? index}`}
                className={styles.chartAxisText}
                x={x}
                y={height - 6}
                textAnchor={index === 0 ? 'start' : index === bars.length - 1 ? 'end' : 'middle'}
              >
                {label}
              </text>
            );
          })}
        </svg>
      )}
      <p className={styles.chartFoot}>
        Peak {count(Math.max(0, ...bars.map((row) => Number(row.activeUsers) || 0)))} active users in a single minute ·
        {' '}{count(total)} user-minutes across the window
      </p>
    </div>
  );
}

function UserList({ rows, labelKey, emptyMessage, labelFor = (value) => value }) {
  const max = Math.max(1, ...rows.map((row) => Number(row.activeUsers) || 0));
  return (
    <div className={styles.barList}>
      {rows.map((row) => (
        <div key={row[labelKey]} className={styles.barRow}>
          <span className={styles.barLabel} title={row[labelKey]}>{labelFor(row[labelKey])}</span>
          <span className={styles.barValue}>{count(row.activeUsers)}</span>
          <span className={styles.barTrack}>
            <span className={styles.barFill} style={{ width: `${((Number(row.activeUsers) || 0) / max) * 100}%` }} />
          </span>
        </div>
      ))}
      {rows.length === 0 ? <p className={styles.tableEmpty}>{emptyMessage}</p> : null}
    </div>
  );
}

function SortHeader({ label, column, sort, onSort, align = 'right' }) {
  const active = sort.key === column;
  return (
    <th className={align === 'right' ? styles.num : undefined} aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button
        type="button"
        className={`${styles.sortBtn} ${active ? styles.sortBtnActive : ''}`}
        onClick={() => onSort(column)}
      >
        {label}
        <Glyph name={active && sort.dir === 'asc' ? 'arrowUp' : 'arrowDown'} size={11} />
      </button>
    </th>
  );
}

function Skeleton() {
  return (
    <div className={styles.skeletonShell} aria-busy="true" aria-label="Loading GA4 realtime reports">
      <div className={styles.skGrid}>
        {Array.from({ length: 2 }).map((_, index) => <div key={index} className={styles.skCard} />)}
      </div>
      <div className={styles.skPanel} />
      <div className={styles.skGrid}>
        <div className={styles.skPanel} />
        <div className={styles.skPanel} />
      </div>
    </div>
  );
}

export default function RealtimeDashboard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [requestError, setRequestError] = useState(null);
  const [tab, setTab] = useState('overview');
  const [tick, setTick] = useState(0);
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState({ key: 'views', dir: 'desc' });
  const forceRef = useRef(false);

  /* Poll every 30 seconds, but only while the tab is visible. Coming back to a
     hidden tab refreshes immediately instead of waiting for the next tick. */
  useEffect(() => {
    const interval = window.setInterval(() => {
      if (document.visibilityState === 'visible') setTick((value) => value + 1);
    }, REFRESH_MS);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') setTick((value) => value + 1);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const force = forceRef.current;
    forceRef.current = false;
    let alive = true;

    setLoading(true);
    fetch(`/api/website-analytics/overview${force ? '?refresh=1' : ''}`, {
      signal: controller.signal,
      cache: 'no-store',
    })
      .then(async (response) => {
        const body = await response.json().catch(() => null);
        if (!response.ok) {
          const failure = new Error(body?.error || 'Website analytics could not be loaded.');
          failure.code = body?.code;
          throw failure;
        }
        return body;
      })
      .then((body) => {
        if (!alive) return;
        setData(body);
        setRequestError(null);
      })
      .catch((error) => {
        if (!alive || error.name === 'AbortError') return;
        setRequestError({ message: error.message || 'Website analytics could not be loaded.', code: error.code });
      })
      .finally(() => {
        if (alive) setLoading(false);
      });

    return () => {
      alive = false;
      controller.abort();
    };
  }, [tick]);

  const refreshNow = () => {
    forceRef.current = true;
    setTick((value) => value + 1);
  };

  const realtime = data?.realtime || {};
  const errors = data?.errors || {};
  const connectionFailed = Boolean(data) && data.status !== 'connected';
  const zeroUsers = Boolean(data) && !connectionFailed && realtime.activeUsers30 === 0 && !errors.users;

  const pageRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    const rows = (realtime.pagePaths || []).filter((row) => (
      !term || String(row.screenName || '').toLowerCase().includes(term)
    ));
    return [...rows].sort((a, b) => {
      const direction = sort.dir === 'asc' ? 1 : -1;
      if (sort.key === 'screenName') {
        return String(a.screenName).localeCompare(String(b.screenName)) * direction;
      }
      return ((Number(a[sort.key]) || 0) - (Number(b[sort.key]) || 0)) * direction;
    });
  }, [realtime.pagePaths, query, sort]);

  const toggleSort = (key) => {
    setSort((current) => (current.key === key
      ? { key, dir: current.dir === 'asc' ? 'desc' : 'asc' }
      : { key, dir: key === 'screenName' ? 'asc' : 'desc' }));
  };

  return (
    <div className={styles.shell}>
      <header className={styles.topbar}>
        <div className={styles.brandRow}>
          <span className={styles.eyebrow}>
            <Glyph name="chart" size={12} strokeWidth={2.2} /> E-commerce · GA4 realtime
          </span>
          <h1 className={styles.title}>Website Analytics</h1>
          <p className={styles.subtitle}>
            Google Analytics 4 property 561098849: active users for a chosen date range, and the realtime
            overview and pages reports.
          </p>
          <a className={styles.siteLink} href="https://ecom.wovenessence.in/" target="_blank" rel="noopener noreferrer">
            ecom.wovenessence.in <Glyph name="external" size={12} />
          </a>

          <div className={styles.statusRow}>
            <span className={`${styles.pill} ${connectionFailed ? styles.pillWarn : data ? styles.pillOn : styles.pillOff}`}>
              <Glyph name={connectionFailed ? 'warning' : 'check'} size={11} strokeWidth={2.2} />
              {!data ? 'Connecting to GA4' : connectionFailed ? `GA4 · ${data.status}` : 'GA4 realtime connected'}
            </span>
            <span className={styles.pill}>Property 561098849</span>
            <span className={styles.pill}>Last 30 minutes</span>
          </div>
        </div>

        <div className={styles.topActions}>
          <span className={styles.updated}>
            <i className={styles.liveDot} />
            {data?.fetchedAt
              ? `Updated ${clockLabel(data.fetchedAt)} IST`
              : loading ? 'Reading GA4…' : 'Not loaded'}
          </span>
          <button type="button" className={styles.btnGhost} onClick={refreshNow} disabled={loading}>
            <Glyph name="refresh" size={14} className={loading ? styles.spinning : ''} />
            {loading ? 'Refreshing' : 'Refresh'}
          </button>
        </div>
      </header>

      {/* Dated report. Independent of the realtime connection, so it renders
          even when the realtime requests fail. */}
      <ActiveUsersSection />

      <p className={styles.footerNote}>
        <Glyph name="info" size={12} /> GA4 realtime reports cover only the last 30 minutes. Active users is
        Google Analytics&apos; estimate, not an exact count of people on the site.
      </p>

      {requestError ? (
        <section className={styles.banner} role="alert">
          <p className={styles.bannerTitle}>
            <Glyph name="warning" size={15} /> {requestError.message}
          </p>
          {requestError.code ? <p className={styles.bannerCode}>Error code · {requestError.code}</p> : null}
          <p className={styles.bannerFix}>{fixFor(requestError.code)}</p>
        </section>
      ) : null}

      {!data && loading ? <Skeleton /> : null}

      {connectionFailed ? (
        <section className={styles.banner} role="alert">
          <p className={styles.bannerTitle}>
            <Glyph name="warning" size={15} /> GA4 realtime reports are unavailable
          </p>
          <p className={styles.bannerCode}>Error code · {data.status}</p>
          <p className={styles.bannerFix}>{fixFor(data.status)}</p>
        </section>
      ) : null}

      {data && !connectionFailed ? (
        <>
          {zeroUsers ? (
            <div className={styles.empty}>
              <span className={styles.emptyIcon}><Glyph name="clock" size={17} /></span>
              <div>
                <p className={styles.emptyTitle}>No active users in the last 30 minutes.</p>
                <p className={styles.emptyMsg}>
                  GA4 is connected and returned an empty realtime report. This is a zero, not an error:
                  it changes the moment the storefront tag reports a visit.
                </p>
              </div>
            </div>
          ) : null}

          <div className={styles.tabs} role="tablist" aria-label="Realtime reports">
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'overview'}
              className={`${styles.tab} ${tab === 'overview' ? styles.tabActive : ''}`}
              onClick={() => setTab('overview')}
            >
              Realtime overview
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === 'pages'}
              className={`${styles.tab} ${tab === 'pages' ? styles.tabActive : ''}`}
              onClick={() => setTab('pages')}
            >
              Realtime pages
            </button>
          </div>

          {tab === 'overview' ? (
            <>
              <div className={styles.bigGrid}>
                <BigCard
                  label="Active users in last 30 minutes"
                  value={realtime.activeUsers30}
                  hint="Distinct users who triggered an event in the reporting window."
                  error={errors.users}
                />
                <BigCard
                  label="Active users in last 5 minutes"
                  value={realtime.activeUsers5}
                  hint="The same users counted over the most recent five minutes only."
                  error={errors.users}
                />
              </div>

              <div className={styles.grid2}>
                <Panel
                  title="Active users per minute"
                  icon="trend"
                  badge="last 30 minutes"
                  subtitle="One bar per minute, oldest on the left and the current minute on the right."
                >
                  {errors.perMinute ? <SectionError error={errors.perMinute} /> : <MinuteChart rows={realtime.perMinute} />}
                </Panel>

                <Panel title="Event count by event name" icon="sparkle" badge="top 10">
                  {errors.events ? <SectionError error={errors.events} /> : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Event name</th>
                            <th className={styles.num}>Event count</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(realtime.events || []).map((row) => (
                            <tr key={row.eventName}>
                              <td>{row.eventName}</td>
                              <td className={styles.num}>{count(row.eventCount)}</td>
                            </tr>
                          ))}
                          {(realtime.events || []).length === 0 ? (
                            <tr><td colSpan={2} className={styles.tableEmpty}>No events in the last 30 minutes.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>
              </div>

              <Panel title="Active users by city" icon="map" badge="top 10">
                {errors.cities ? <SectionError error={errors.cities} /> : (
                  <UserList
                    rows={realtime.cities || []}
                    labelKey="city"
                    emptyMessage="No city data in the last 30 minutes."
                  />
                )}
              </Panel>

              <div className={styles.grid2}>
                <Panel
                  title="Views by page title / screen name"
                  icon="monitor"
                  badge="top 10"
                  subtitle="GA4’s realtime page dimension is the page title or app screen name."
                >
                  {errors.pages ? <SectionError error={errors.pages} /> : (
                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <th>Page title / screen name</th>
                            <th className={styles.num}>Views</th>
                            <th className={styles.num}>Active users</th>
                          </tr>
                        </thead>
                        <tbody>
                          {(realtime.pages || []).map((row) => (
                            <tr key={row.screenName}>
                              <td>{row.screenName}</td>
                              <td className={styles.num}>{count(row.views)}</td>
                              <td className={styles.num}>{count(row.activeUsers)}</td>
                            </tr>
                          ))}
                          {(realtime.pages || []).length === 0 ? (
                            <tr><td colSpan={3} className={styles.tableEmpty}>No page views in the last 30 minutes.</td></tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Panel>

                {/* GA4 hides this card when nothing is a key event; a failed
                    request still gets an error card rather than an empty one. */}
                {errors.keyEvents || (realtime.keyEvents || []).length > 0 ? (
                  <Panel title="Key events by event name" icon="check" badge="last 30 minutes">
                    {errors.keyEvents ? <SectionError error={errors.keyEvents} /> : (
                      <div className={styles.tableWrap}>
                        <table className={styles.table}>
                          <thead>
                            <tr>
                              <th>Event name</th>
                              <th className={styles.num}>Key events</th>
                            </tr>
                          </thead>
                          <tbody>
                            {realtime.keyEvents.map((row) => (
                              <tr key={row.eventName}>
                                <td>{row.eventName}</td>
                                <td className={styles.num}>{count(row.keyEvents)}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </Panel>
                ) : null}
              </div>


            </>
          ) : (
            <>
              <div className={styles.bigGrid}>
                <BigCard
                  label="Active users in last 30 minutes"
                  value={realtime.activeUsers30}
                  hint="Distinct users who triggered an event in the reporting window."
                  error={errors.users}
                />
                <BigCard
                  label="Views in last 30 minutes"
                  value={realtime.views30}
                  hint="Page views recorded by GA4 in the reporting window."
                  error={errors.users}
                />
              </div>

              <Panel
                title="Active users per minute"
                icon="trend"
                badge="last 30 minutes"
                subtitle="One bar per minute, oldest on the left and the current minute on the right."
              >
                {errors.perMinute ? <SectionError error={errors.perMinute} /> : <MinuteChart rows={realtime.perMinute} />}
              </Panel>

              <Panel
                title="Page title and screen name in last 30 minutes"
                icon="monitor"
                subtitle="Search and sort the pages GA4 reported. The realtime API exposes the page title or screen name only — it has no page-path dimension."
              >
                {errors.pages ? <SectionError error={errors.pages} /> : (
                  <>
                    <div className={styles.searchRow}>
                      <span className={styles.searchField}>
                        <Glyph name="search" size={14} />
                        <input
                          type="search"
                          className={styles.searchInput}
                          placeholder="Search page titles"
                          value={query}
                          onChange={(event) => setQuery(event.target.value)}
                          aria-label="Search page titles"
                        />
                      </span>
                      <span className={styles.searchMeta}>
                        {count(pageRows.length)} of {count((realtime.pagePaths || []).length)} pages
                      </span>
                    </div>

                    <div className={styles.tableWrap}>
                      <table className={styles.table}>
                        <thead>
                          <tr>
                            <SortHeader label="Page title / screen name" column="screenName" sort={sort} onSort={toggleSort} align="left" />
                            <SortHeader label="Views" column="views" sort={sort} onSort={toggleSort} />
                            <SortHeader label="Active users" column="activeUsers" sort={sort} onSort={toggleSort} />
                          </tr>
                        </thead>
                        <tbody>
                          {pageRows.map((row) => (
                            <tr key={row.screenName}>
                              <td>{row.screenName}</td>
                              <td className={styles.num}>{count(row.views)}</td>
                              <td className={styles.num}>{count(row.activeUsers)}</td>
                            </tr>
                          ))}
                          {pageRows.length === 0 ? (
                            <tr>
                              <td colSpan={3} className={styles.tableEmpty}>
                                {query ? 'No page title matches that search.' : 'No page views in the last 30 minutes.'}
                              </td>
                            </tr>
                          ) : null}
                        </tbody>
                      </table>
                    </div>
                  </>
                )}
              </Panel>
            </>
          )}
        </>
      ) : null}
    </div>
  );
}
