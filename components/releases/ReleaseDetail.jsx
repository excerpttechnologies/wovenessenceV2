'use client';

import {
  LuCalendar, LuShieldCheck, LuSparkles, LuTrendingUp, LuWrench,
} from 'react-icons/lu';

/* ==========================================================================
   One release, rendered as prose.

   Shared by the dashboard announcement's dialog and the administrative
   screen's preview, so a note reads the same wherever it is opened. The
   server sends entries already grouped into four arrays; this file only groups
   them again by MODULE for display.
   ========================================================================== */

export const ENTRY_GROUPS = [
  { key: 'features', label: 'Features', icon: LuSparkles, tone: 'green' },
  { key: 'fixes', label: 'Fixes', icon: LuWrench, tone: 'blue' },
  { key: 'security', label: 'Security', icon: LuShieldCheck, tone: 'red' },
  { key: 'improvements', label: 'Improvements', icon: LuTrendingUp, tone: 'amber' },
];

export function formatReleaseDate(value) {
  if (!value) return '';
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

function byModule(entries) {
  const groups = new Map();
  (entries || []).forEach((entry) => {
    const module = String(entry?.module || 'General').trim() || 'General';
    if (!groups.has(module)) groups.set(module, []);
    const text = String(entry?.text || '').trim();
    if (text) groups.get(module).push(text);
  });
  return Array.from(groups.entries());
}

export default function ReleaseDetail({ release }) {
  if (!release) return null;

  const hasEntries = ENTRY_GROUPS.some(
    (group) => Array.isArray(release[group.key]) && release[group.key].length
  );

  return (
    <article className="rel-detail">
      <div className="rel-detail-head">
        <span className="rel-version">v{release.version}</span>

        {release.isLatest && <span className="pill pill-green">Latest</span>}
        {release.status === 'draft' && <span className="pill pill-yellow">Draft</span>}

        <span className="rel-detail-date">
          <LuCalendar size={13} strokeWidth={2} />
          {formatReleaseDate(release.releaseDate)}
        </span>
      </div>

      <h2 className="rel-detail-title">{release.title}</h2>

      {release.description ? (
        <p className="rel-detail-desc">{release.description}</p>
      ) : null}

      <div className="rel-counts rel-counts-detail">
        {ENTRY_GROUPS.map((group) => {
          const Icon = group.icon;
          const total = Number(release.counts?.[group.key] ?? release[group.key]?.length ?? 0);
          return (
            <span key={group.key} className={'rel-count rel-count-' + group.tone}>
              <Icon size={13} strokeWidth={2} />
              <b>{total}</b>
              <span>{group.label}</span>
            </span>
          );
        })}
      </div>

      {hasEntries ? (
        <div className="rel-sections">
          {ENTRY_GROUPS.map((group) => {
            const entries = Array.isArray(release[group.key]) ? release[group.key] : [];
            if (!entries.length) return null;

            const Icon = group.icon;
            const modules = byModule(entries);

            return (
              <section key={group.key} className="rel-section">
                <h3 className={'rel-section-title rel-tone-' + group.tone}>
                  <span className="rel-section-ico"><Icon size={14} strokeWidth={2} /></span>
                  {group.label}
                  <span className="rel-section-count">{entries.length}</span>
                </h3>

                {modules.map(([module, lines]) => (
                  <div key={module} className="rel-module">
                    <span className="rel-module-name">{module}</span>
                    <ul className="rel-module-list">
                      {lines.map((line, index) => (
                        <li key={module + '-' + index}>{line}</li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            );
          })}
        </div>
      ) : (
        <div className="rel-empty">
          No changes have been recorded for this release yet.
        </div>
      )}
    </article>
  );
}
