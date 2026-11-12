'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import {
  LuChevronDown, LuChevronRight, LuHistory, LuStar,
} from 'react-icons/lu';
import { useScope } from './ScopeContext';
import { isAdminOnlyHref, isFrequentHref, navEntry } from '@/lib/navRegistry';

/* ==========================================================================
   Frequently Visited Pages – display component.

   Reads the user's visit history from /api/user-activity and renders a short
   ranked list in the sidebar, directly under Dashboard.

   TRACKING IS HANDLED BY NavTracker (components/NavTracker.jsx), which is
   mounted once at the admin layout level. That component fires one POST to
   /api/user-activity per pathname change, so this component does NOT make
   any tracking requests of its own. Keeping tracking in one place prevents
   double-counting.

   OPTIMISTIC UPDATE. When the user clicks a link in this list, mergeActivity
   updates the in-memory list immediately — no need to wait for a fresh fetch.
   The write itself is handled by NavTracker; this only adjusts the UI order.

   THE DASHBOARD IS EXCLUDED. It is the fixed first row of the rail; ranking
   it would push operational pages out of view.
   ========================================================================== */

const OPEN_KEY = 'orbit.freq.open';
const MAX_ITEMS = 8;
const ACTIONS = ['create', 'read', 'update', 'download', 'delete'];

/* Same rule the API applies: ungoverned role can open everything; a governed
   one needs at least one action on the screen. */
function holdsScreen(perms, href) {
  if (!perms?.governed) return true;
  const held = perms.screens?.[href];
  return Array.isArray(held) && held.some((action) => ACTIONS.includes(action));
}

/* Human-readable "last visited" string for the tooltip. */
function visitedLabel(value) {
  const date = new Date(value || 0);
  if (Number.isNaN(date.getTime())) return '';

  const minutes = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return minutes + 'm ago';

  const hours = Math.round(minutes / 60);
  if (hours < 24) return hours + 'h ago';

  const days = Math.round(hours / 24);
  if (days < 30) return days + 'd ago';

  return date.toLocaleDateString('en-IN', { day: '2-digit', month: 'short' });
}

/* Re-orders the in-memory list optimistically after a click, so the sidebar
   responds immediately without waiting for the next full fetch. */
function mergeActivity(list, href) {
  const entry = navEntry(href);
  if (!entry) return list;

  const existing = list.find((item) => item.href === href);
  const next = list.filter((item) => item.href !== href);
  next.push({
    href,
    label: entry.label,
    group: entry.group,
    count: Number(existing?.count || 0) + 1,
    lastVisitedAt: new Date().toISOString(),
  });

  next.sort((a, b) => {
    const byCount = Number(b.count || 0) - Number(a.count || 0);
    if (byCount) return byCount;
    return new Date(b.lastVisitedAt || 0) - new Date(a.lastVisitedAt || 0);
  });

  return next.slice(0, MAX_ITEMS);
}

export default function FrequentlyPagesNav({ collapsed, onExpandRail }) {
  const {
    user, userReady, business, perms, permsReady,
  } = useScope();

  const [open, setOpen] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const mounted = useRef(true);
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* Restore collapsed/expanded state across reloads. */
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === '0') setOpen(false);
    } catch { /* ignore */ }
  }, []);

  const persistOpen = (next) => {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  /* ---------------------------------------------------------------- read -- */
  useEffect(() => {
    if (!userReady || !business || !permsReady) {
      setItems([]);
      setLoading(false);
      setError('');
      return undefined;
    }

    let cancelled = false;
    const controller = new AbortController();

    setLoading(true);
    setError('');

    fetch(
      '/api/user-activity?business=' + encodeURIComponent(business)
        + '&limit=' + MAX_ITEMS,
      { cache: 'no-store', signal: controller.signal }
    )
      .then((response) => {
        if (!response.ok) throw new Error('Could not load recent pages.');
        return response.json();
      })
      .then((data) => {
        if (!cancelled) setItems(Array.isArray(data.items) ? data.items : []);
      })
      .catch((err) => {
        if (!cancelled && err?.name !== 'AbortError') {
          setError(err?.message || 'Could not load recent pages.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [userReady, business, permsReady, tick]);

  /* ---------------------------------------------------------- view filter -- */
  const visible = items.filter((item) => {
    if (!isFrequentHref(item.href)) return false;
    if (isAdminOnlyHref(item.href) && !isAdmin) return false;
    if (permsReady && !holdsScreen(perms, item.href)) return false;
    return true;
  });

  const onHeaderClick = () => {
    const mini = collapsed
      && typeof window !== 'undefined'
      && window.matchMedia('(min-width: 1024px)').matches;

    /* On the mini rail the list is hidden by CSS; the useful action is to
       expand the rail so the labels are readable. */
    if (mini) {
      persistOpen(true);
      onExpandRail?.();
      return;
    }

    persistOpen(!open);
  };

  /* Optimistically reorder the list when the user clicks a shortcut, without
     waiting for the NavTracker's server round-trip to complete. */
  const onLinkClick = (href) => {
    setItems((prev) => mergeActivity(prev, href));
  };

  const emptyText = !business
    ? 'Choose a company to see recent pages.'
    : loading
      ? 'Loading recent pages…'
      : error
        ? 'Recent pages could not be loaded.'
        : 'Pages you open often will appear here.';

  return (
    <div className="sb-freq">
      <button
        type="button"
        onClick={onHeaderClick}
        aria-expanded={open}
        className={'sb-item sb-freq-head ' + (open ? 'sb-item-open' : '')}
        title="Frequently visited pages"
      >
        <span className="sb-item-ico">
          <LuHistory size={18} strokeWidth={1.9} />
        </span>

        <span className="sb-label flex-1 truncate uppercase">Frequently Visited</span>

        {visible.length > 0 && (
          <span className="sb-freq-count" aria-label={visible.length + ' pages'}>
            {visible.length}
          </span>
        )}

        {open ? (
          <LuChevronDown size={14} strokeWidth={2} className="sb-chev" />
        ) : (
          <LuChevronRight size={14} strokeWidth={2} className="sb-chev" />
        )}
      </button>

      <div className={'sb-sub-wrap ' + (open ? 'sb-sub-open' : '')} aria-hidden={!open}>
        <div className="sb-sub-clip">
          <div className="sb-sub sb-freq-list">
            {visible.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                tabIndex={open ? undefined : -1}
                onClick={() => onLinkClick(item.href)}
                title={[
                  item.group,
                  item.label,
                  item.count + ' visit' + (Number(item.count) === 1 ? '' : 's'),
                  item.lastVisitedAt ? 'last visited ' + visitedLabel(item.lastVisitedAt) : '',
                ].filter(Boolean).join(' · ')}
                className="sb-sub-link sb-freq-link"
              >
                <LuStar size={14} strokeWidth={1.8} className="sb-freq-star" />
                <span className="truncate">{item.label}</span>
                <span className="sb-freq-visits" title={item.count + ' visits'}>
                  {item.count}
                </span>
              </Link>
            ))}

            {!visible.length && (
              <div className="sb-freq-empty">
                <span>{emptyText}</span>
                {error ? (
                  <button
                    type="button"
                    className="sb-freq-retry"
                    onClick={() => setTick((value) => value + 1)}
                  >
                    Retry
                  </button>
                ) : null}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
