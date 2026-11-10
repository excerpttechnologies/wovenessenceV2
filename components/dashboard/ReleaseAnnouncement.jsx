'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  LuArrowRight, LuCalendar, LuMegaphone, LuX,
} from 'react-icons/lu';
import Modal from '@/components/Modal';
import { useScope } from '@/components/ScopeContext';
import ReleaseDetail, {
  ENTRY_GROUPS, formatReleaseDate,
} from '@/components/releases/ReleaseDetail';

/* ==========================================================================
   The latest-release panel on the dashboard.

   Sits between the top bar and the analytics: a short announcement of the
   newest published release, with the four counts and two ways into the notes.
   The full history is the same data, read in a dialog.

   NO FAKE NOTES. If /api/releases returns nothing the panel renders nothing.
   An empty release history is a real answer, not a reason to invent a
   placeholder announcement.

   DISMISSAL IS PER USER. The version the account has dismissed is remembered
   in localStorage under its user id, so a new release announces itself again.
   The compact "What's new" bar is the way back once the panel is dismissed.
   ========================================================================== */

export default function ReleaseAnnouncement() {
  const { user, userReady } = useScope();

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [dismissed, setDismissed] = useState(false);
  const [dismissChecked, setDismissChecked] = useState(false);

  const latest = data?.latest || null;
  const releases = useMemo(
    () => (Array.isArray(data?.releases) ? data.releases : []),
    [data]
  );

  const dismissKey = useMemo(() => {
    const owner = user?.id || user?.email;
    return owner ? 'orbit.release.dismissed.' + owner : '';
  }, [user?.id, user?.email]);

  useEffect(() => {
    let cancelled = false;

    fetch('/api/releases?limit=50', { cache: 'no-store' })
      .then((response) => {
        if (!response.ok) throw new Error('Could not load release notes.');
        return response.json();
      })
      .then((payload) => {
        if (!cancelled) setData(payload || null);
      })
      .catch(() => { /* the dashboard works without an announcement */ })
      .finally(() => { if (!cancelled) setLoading(false); });

    return () => { cancelled = true; };
  }, []);

  /* Decide whether this version has already been dismissed. Waiting for
     userReady avoids showing the panel for a frame under the wrong key. */
  useEffect(() => {
    if (!userReady || !latest) {
      setDismissed(false);
      setDismissChecked(false);
      return;
    }
    if (!dismissKey) {
      setDismissed(false);
      setDismissChecked(true);
      return;
    }

    let saved = '';
    try { saved = localStorage.getItem(dismissKey) || ''; } catch { /* ignore */ }
    setDismissed(saved === latest.version);
    setDismissChecked(true);
  }, [dismissKey, latest?.version, userReady]);

  const selected = releases.find((release) => release.id === selectedId)
    || latest
    || null;

  const openNotes = (release) => {
    setSelectedId(release?.id || latest?.id || '');
    setModalOpen(true);
  };

  const dismiss = () => {
    if (!dismissKey || !latest) return;
    try { localStorage.setItem(dismissKey, latest.version); } catch { /* ignore */ }
    setDismissed(true);
    setModalOpen(false);
  };

  const reopen = () => {
    if (dismissKey) {
      try { localStorage.removeItem(dismissKey); } catch { /* ignore */ }
    }
    setDismissed(false);
    openNotes(latest);
  };

  if (!userReady || loading || !latest || !dismissChecked) return null;

  if (dismissed) {
    return (
      <button type="button" className="rel-reopen" onClick={reopen}>
        <span className="rel-reopen-ico"><LuMegaphone size={15} strokeWidth={2} /></span>
        <span className="rel-reopen-copy">
          <b>What&apos;s new in v{latest.version}</b>
          <span>{latest.title}</span>
        </span>
        <LuArrowRight size={15} strokeWidth={2} className="rel-reopen-arrow" />
      </button>
    );
  }

  return (
    <>
      <section className="rel-panel" aria-label="Latest release notes">
        <span className="rel-panel-accent" aria-hidden="true" />

        <div className="rel-panel-main">
          <div className="rel-panel-top">
            <span className="rel-eyebrow">
              <LuMegaphone size={13} strokeWidth={2.2} />
              Latest release
            </span>
            <span className="rel-version">v{latest.version}</span>
            <span className="pill pill-green">Latest</span>
            <span className="rel-date">
              <LuCalendar size={13} strokeWidth={2} />
              {formatReleaseDate(latest.releaseDate)}
            </span>
          </div>

          <h2 className="rel-panel-title">{latest.title}</h2>

          {latest.description ? (
            <p className="rel-panel-desc">{latest.description}</p>
          ) : null}

          <div className="rel-counts">
            {ENTRY_GROUPS.map((group) => {
              const Icon = group.icon;
              const total = Number(latest.counts?.[group.key] ?? 0);
              return (
                <span key={group.key} className={'rel-count rel-count-' + group.tone}>
                  <Icon size={13} strokeWidth={2} />
                  <b>{total}</b>
                  <span>{group.label}</span>
                </span>
              );
            })}
          </div>
        </div>

        <div className="rel-panel-actions">
          <button
            type="button"
            className="btn btn-primary rel-action-primary"
            onClick={() => openNotes(latest)}
          >
            View release notes
          </button>
          <button
            type="button"
            className="btn rel-action-secondary"
            onClick={() => openNotes(latest)}
          >
            All releases
          </button>
          <button
            type="button"
            className="rel-dismiss"
            onClick={dismiss}
            aria-label="Dismiss this announcement"
            title="Dismiss"
          >
            <LuX size={15} strokeWidth={2.2} />
          </button>
        </div>
      </section>

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title="Release notes"
        size="lg"
        footer={(
          <button type="button" className="btn" onClick={() => setModalOpen(false)}>
            Close
          </button>
        )}
      >
        <div className="rel-modal">
          <aside className="rel-modal-list" aria-label="All releases">
            {releases.map((release) => (
              <button
                key={release.id}
                type="button"
                onClick={() => setSelectedId(release.id)}
                className={
                  'rel-modal-item '
                  + (selected?.id === release.id ? 'rel-modal-item-on' : '')
                }
              >
                <span className="rel-modal-item-top">
                  <span className="rel-version">v{release.version}</span>
                  {release.id === latest?.id && <span className="pill pill-green">Latest</span>}
                </span>
                <span className="rel-modal-item-title">{release.title}</span>
                <span className="rel-modal-item-date">
                  {formatReleaseDate(release.releaseDate)}
                </span>
              </button>
            ))}
          </aside>

          <div className="rel-modal-detail">
            <ReleaseDetail release={selected} />
          </div>
        </div>
      </Modal>
    </>
  );
}
