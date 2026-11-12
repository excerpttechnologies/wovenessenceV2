import { NAV } from '@/config/nav';

/* ==========================================================================
   One registry of the sidebar's pages, derived from config/nav.js.

   The "Frequently Visited Pages" section and /api/user-activity both need to
   answer the same two questions:

     which sidebar page does this URL belong to?
     what is that page called?

   Answering them from NAV means adding a screen to the sidebar automatically
   makes it trackable. Nothing here is a second hand-maintained menu.

   The registry is deliberately importable from the server too. The
   Roles & Permissions API already imports NAV through the same file, so this
   does not introduce a new server dependency. */

const SKIP_HREFS = new Set(['/logout', '/login']);

/* The dashboard is the fixed first row of the rail. Counting it would put it
   at the top of every user's shortcut list and push the operational pages the
   section exists for out of view. It is still a normal page - it simply is not
   a shortcut to itself. */
const FREQUENT_EXCLUDED = new Set(['/admin']);

/* Detail and creation URLs that do not sit under their list's href. POS is the
   one such case: the list lives at /admin/transaction/sell/pos and the till at
   /admin/pos/add. Mapping it means opening the till counts as visiting POS
   rather than creating an untrackable entry of its own. */
const ALIASES = {
  '/admin/pos': '/admin/transaction/sell/pos',
  '/admin/pos/add': '/admin/transaction/sell/pos',
};

function normalisePath(value) {
  let path = String(value || '').split('?')[0].split('#')[0];
  if (!path) return '';
  /* Keep the root slash but drop any trailing one, so /x/ and /x are one
     page. */
  if (path.length > 1 && path.endsWith('/')) path = path.slice(0, -1);
  return path;
}

const leaves = [];
const byHref = new Map();

function addLeaf(href, label, group, extra = {}) {
  const clean = normalisePath(href);
  if (!clean || SKIP_HREFS.has(clean) || byHref.has(clean)) return;
  const entry = { href: clean, label: label || clean, group: group || '', ...extra };
  byHref.set(clean, entry);
  leaves.push(entry);
}

function addFrom(items, group) {
  (items || []).forEach((child) => {
    if (!child || child.adminOnly) return;
    if (child.href) {
      addLeaf(child.href, child.label, group, { adminOnly: Boolean(child.adminOnly) });
    }
    if (Array.isArray(child.children) && child.children.length) {
      addFrom(child.children, group);
    }
  });
}

NAV.forEach((item) => {
  if (item.adminOnly) return;
  if (item.href && !Array.isArray(item.children)) {
    addLeaf(item.href, item.label, 'General');
    return;
  }
  addFrom(item.children, item.label);
});

export const NAV_LEAVES = leaves;
export const NAV_BY_HREF = byHref;
export const NAV_HREFS = new Set(byHref.keys());

export function navEntry(href) {
  return byHref.get(normalisePath(href)) || null;
}

export function navLabel(href) {
  return navEntry(href)?.label || String(href || '');
}

export function isFrequentHref(href) {
  const clean = normalisePath(href);
  return Boolean(clean) && !FREQUENT_EXCLUDED.has(clean) && byHref.has(clean);
}

/* Release management is an administrator screen. It is marked adminOnly in
   config/nav.js so the rail and the permission matrix can hide it; the
   activity API applies the same rule so a shortcut cannot surface a screen the
   account cannot administer. */
export function isAdminOnlyHref(href) {
  return Boolean(navEntry(href)?.adminOnly);
}

/* The canonical sidebar page for a browser path, or '' when the path is not a
   trackable ERP screen (login, logout, an error page, a static route). */
export function canonicalHref(pathname) {
  const clean = normalisePath(pathname);
  if (!clean) return '';

  const alias = ALIASES[clean];
  if (alias) return isFrequentHref(alias) ? alias : '';

  let best = '';
  NAV_HREFS.forEach((href) => {
    if (clean === href || clean.startsWith(href + '/')) {
      if (href.length > best.length) best = href;
    }
  });

  if (!best || FREQUENT_EXCLUDED.has(best)) return '';
  return best;
}
