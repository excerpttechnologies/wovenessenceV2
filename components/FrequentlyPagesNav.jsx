'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import {
  LuChevronDown, LuChevronRight, LuHistory, LuStar,
} from 'react-icons/lu';
import { useScope } from './ScopeContext';
import {
  canonicalHref, isAdminOnlyHref, isFrequentHref, navEntry,
} from '@/lib/navRegistry';

/* ==========================================================================
   Frequently Visited Pages.

   A short, ranked list of the sidebar screens this account opens most often,
   sitting directly under Dashboard. The ranking is per user and per business,
   stored server-side by /api/user-activity; this component only records a
   visit and renders what the API says the account may still open.

   TRACKING IS DELIBERATELY QUIET. One POST per navigation, guarded by a ref
   keyed on business + canonical page, so React re-renders and Strict Mode
   double effects cannot inflate the count. A detail URL is mapped back to its
   sidebar leaf first (lib/navRegistry.js), so /admin/pos/add counts as POS
   rather than creating a second entry.

   THE DASHBOARD IS EXCLUDED. It is the fixed first row of the rail; counting
   it would put it at the top of every user's shortcuts and push out the
   operational pages this section exists for.
   ========================================================================== */

const OPEN_KEY = 'orbit.freq.open';
const MAX_ITEMS = 8;
const ACTIONS = ['create', 'read', 'update', 'download', 'delete'];

/* The same rule the API applies: an ungoverned role may open everything, a
   governed one needs at least one action on the screen. */
function holdsScreen(perms, href) {
  if (!perms?.governed) return true;
  const held = perms.screens?.[href];
  return Array.isArray(held) && held.some((action) => ACTIONS.includes(action));
}

/* Short, human wording for the tooltip. The rail is too narrow to print a
   timestamp on every row, but the second ranking input should still be
   readable when the pointer rests on a shortcut. */
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

function mergeActivity(list, activity) {
  const entry = navEntry(activity?.href);
  if (!entry) return list;

  const next = list.filter((item) => item.href !== activity.href);
  next.push({
    href: activity.href,
    label: entry.label,
    group: entry.group,
    count: Number(activity.count || 0),
    lastVisitedAt: activity.lastVisitedAt || new Date().toISOString(),
  });

  next.sort((a, b) => {
    const byCount = Number(b.count || 0) - Number(a.count || 0);
    if (byCount) return byCount;
    return new Date(b.lastVisitedAt || 0) - new Date(a.lastVisitedAt || 0);
  });

  return next.slice(0, MAX_ITEMS);
}

export default function FrequentlyPagesNav({ collapsed, onExpandRail }) {
  const pathname = usePathname();
  const {
    user, userReady, business, perms, permsReady,
  } = useScope();

  const [open, setOpen] = useState(true);
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [tick, setTick] = useState(0);

  const mounted = useRef(true);
  const lastTracked = useRef('');
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  useEffect(() => {
    mounted.current = true;
    return () => { mounted.current = false; };
  }, []);

  /* Restore the open state once, after mount. Defaulting to open means the
     section is useful on a first visit; a user who closes it keeps it closed. */
  useEffect(() => {
    try {
      if (localStorage.getItem(OPEN_KEY) === '0') setOpen(false);
    } catch { /* storage unavailable - keep the default */ }
  }, []);

  const persistOpen = (next) => {
    setOpen(next);
    try { localStorage.setItem(OPEN_KEY, next ? '1' : '0'); } catch { /* ignore */ }
  };

  /* ------------------------------------------------------------- read --- */
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

  /* ------------------------------------------------------------ track --- */
  const track = useCallback((value) => {
    if (!userReady || !business || !permsReady) return;

    const href = canonicalHref(value);
    if (!href || !isFrequentHref(href)) return;
    if (isAdminOnlyHref(href) && !isAdmin) return;
    if (!holdsScreen(perms, href)) return;

    const key = business + '|' + href;
    if (lastTracked.current === key) return;
    lastTracked.current = key;

    fetch('/api/user-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ href, businessId: business }),
      /* keepalive lets the request finish if the navigation is a full load */
      keepalive: true,
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        if (!mounted.current || !data?.activity) return;
        setItems((prev) => mergeActivity(prev, data.activity));
      })
      .catch(() => { /* activity is a convenience; never block navigation */ });
  }, [userReady, business, permsReady, isAdmin, perms]);

  useEffect(() => {
    track(pathname);
  }, [pathname, track]);

  /* ------------------------------------------------------------- view --- */
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

    /* On the icon rail the sub-list is hidden by CSS, so the useful action is
       to bring the labels back rather than toggle a list nobody can see. */
    if (mini) {
      persistOpen(true);
      onExpandRail?.();
      return;
    }

    persistOpen(!open);
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
                onClick={() => track(item.href)}
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
