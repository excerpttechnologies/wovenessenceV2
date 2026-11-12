'use client';

import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';
import { useScope } from './ScopeContext';
import {
  canonicalHref, isAdminOnlyHref, isFrequentHref,
} from '@/lib/navRegistry';

/* ==========================================================================
   Global navigation tracker.

   Mounted once in app/admin/layout.js, it fires one POST to /api/user-activity
   whenever the authenticated user lands on a trackable ERP page — regardless
   of HOW they arrived:

     • Clicking a sidebar link (now that target="_blank" is removed)
     • Clicking a child / flyout link in the sidebar
     • Clicking a quick-action button (POS, DC, GRC) in the header
     • Clicking any internal <Link> anywhere in the application
     • Clicking a Frequently Visited Pages shortcut
     • Typing a URL directly into the address bar
     • Pressing the browser Back or Forward button
     • Refreshing a page

   DEDUPLICATION. The tracker uses a ref keyed on `businessId + "|" + canonical
   href`. Because the ref is reset every time the pathname OR the business
   changes, the same screen is recorded again when the user switches branches —
   which is a genuinely different context. React Strict Mode double-effects are
   absorbed by the dedup: the second effect fires with the same key and returns
   immediately.

   The FrequentlyPagesNav component still maintains its own lightweight
   optimistic update (mergeActivity) so the sidebar list reorders without a
   round-trip. This tracker provides the authoritative write; that component
   provides the visual update.

   WHAT IS NOT COUNTED
   • The /admin dashboard — excluded in lib/navRegistry.js (FREQUENT_EXCLUDED).
   • Detail and add sub-pages — mapped back to their list page by canonicalHref.
   • Non-ERP paths (login, logout, error pages) — canonicalHref returns ''.
   • Background polls, API requests, modal opens — only pathname changes count.
   • Duplicate hits from rerenders — dedup ref prevents double writes.
   ========================================================================== */

export default function NavTracker() {
  const pathname = usePathname();
  const {
    user, userReady, business, perms, permsReady,
  } = useScope();

  const lastTracked = useRef('');
  const isAdmin = user?.role === 'Super Admin' || user?.role === 'Admin';

  useEffect(() => {
    /* Wait until the session and permission matrix are known. */
    if (!userReady || !business || !permsReady) return;

    const href = canonicalHref(pathname);
    if (!href || !isFrequentHref(href)) return;

    /* Admin-only screens (e.g. Release Notes management) must only be tracked
       for users whose role permits them. The server enforces this too; the
       check here stops pointless requests. */
    if (isAdminOnlyHref(href) && !isAdmin) return;

    /* One write per (business, page) pair per continuous stay. */
    const key = business + '|' + href;
    if (lastTracked.current === key) return;
    lastTracked.current = key;

    fetch('/api/user-activity', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      /* keepalive keeps the request alive if the user immediately navigates
         away again (e.g. POS button → back). */
      keepalive: true,
      body: JSON.stringify({ href, businessId: business }),
    }).catch(() => {
      /* Fire-and-forget. Activity tracking must never interrupt navigation. */
    });
  }, [pathname, userReady, business, permsReady, isAdmin]);

  /* Reset the dedup key when the business changes so that visiting the same
     page in a different branch is recorded as a new visit. */
  useEffect(() => {
    lastTracked.current = '';
  }, [business]);

  /* This component renders nothing — it only produces side-effects. */
  return null;
}
