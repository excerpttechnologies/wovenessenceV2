import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import UserActivity from '@/models/UserActivity';
import { handler } from '@/lib/apiError';
import { requireUser, can, PERMISSIONS } from '@/lib/rbac';
import { effectivePermissions } from '@/lib/screenPermission';
import {
  canonicalHref, isAdminOnlyHref, isFrequentHref, navEntry,
} from '@/lib/navRegistry';

/* ==========================================================================
   /api/user-activity

     GET   ?business=<id>&limit=<n>
           The signed-in account's most-opened sidebar pages for one business,
           already filtered by what its role may still open.

     POST  { href, businessId }
           Record one visit. One upsert per navigation, fire-and-forget from
           the sidebar.

   WHY THE BROWSER SENDS THE BUSINESS. The top-bar selector lives in the
   client, and a page visit belongs to the branch the operator was working in
   at the time. The server validates the id and then checks the role's matrix
   for that business before writing.

   THE HREF IS NEVER TRUSTED. lib/navRegistry.js maps it to a sidebar leaf
   (or returns nothing), so a forged request cannot create a shortcut to an
   arbitrary URL, a detail page, or a screen that is not in the menu.

   ADMIN-ONLY SCREENS. Release management is marked adminOnly in config/nav.js.
   The activity API applies the same rule, so a shortcut cannot surface a
   screen the account cannot administer even if the row was written before the
   role changed.
   ========================================================================== */

const send = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

const ACTIONS = ['create', 'read', 'update', 'download', 'delete'];

function businessOf(value) {
  const id = String(value || '').trim();
  return isValidObjectId(id) ? id : '';
}

function limitOf(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 8;
  return Math.min(Math.max(n, 1), 30);
}

/* A screen is useful to this account when its role holds ANY action on it.
   Requiring `read` specifically would hide a create-only screen from the
   person who opens it every day; requiring nothing would surface a page the
   role has been stripped of. */
function permitted(session, perms, href) {
  if (isAdminOnlyHref(href) && !can(session, PERMISSIONS.ADMIN_ALL)) return false;
  if (!perms?.governed) return true;

  const held = perms.screens?.[href];
  return Array.isArray(held) && held.some((action) => ACTIONS.includes(action));
}

function shape(row) {
  const entry = navEntry(row.href);
  if (!entry) return null;
  return {
    href: row.href,
    label: entry.label,
    group: entry.group,
    count: Number(row.count || 0),
    lastVisitedAt: row.lastVisitedAt || null,
  };
}

export const GET = handler(async (req) => {
  const session = await requireUser();
  const sp = new URL(req.url).searchParams;
  const businessId = businessOf(sp.get('business'));

  /* No business, no ranking. Returning an empty list is safer than answering
     with another branch's history. */
  if (!businessId || !isValidObjectId(session.id)) {
    return send({ items: [] });
  }

  await dbConnect();

  const perms = await effectivePermissions({ session, businessId });
  const limit = limitOf(sp.get('limit'));

  /* Read a wider window than requested, because some rows are filtered out
     below (a screen removed from the menu, a role change, an admin-only
     screen). The ordering index covers this query. */
  const rows = await UserActivity.find({
    userId: session.id,
    businessId,
  })
    .sort({ count: -1, lastVisitedAt: -1 })
    .limit(Math.min(limit * 6, 120))
    .lean();

  const items = [];
  for (const row of rows) {
    if (!isFrequentHref(row.href)) continue;
    if (!permitted(session, perms, row.href)) continue;

    const item = shape(row);
    if (!item) continue;
    items.push(item);
    if (items.length >= limit) break;
  }

  return send({ items });
});

export const POST = handler(async (req) => {
  const session = await requireUser();
  const body = await req.json().catch(() => ({}));
  const businessId = businessOf(body.businessId);

  if (!businessId) {
    const err = new Error('Choose a business before recording activity.');
    err.status = 422;
    err.code = 'VALIDATION';
    throw err;
  }

  const href = canonicalHref(body.href);
  if (!href || !isFrequentHref(href)) {
    const err = new Error('That page is not a trackable sidebar screen.');
    err.status = 422;
    err.code = 'VALIDATION';
    throw err;
  }

  await dbConnect();

  /* The permission check is what makes the POST safe: a row can only be
     created for a screen this account may actually open. */
  const perms = await effectivePermissions({ session, businessId });
  if (!permitted(session, perms, href)) {
    const err = new Error('Your role is not allowed to open that screen.');
    err.status = 403;
    err.code = 'FORBIDDEN';
    throw err;
  }

  if (!isValidObjectId(session.id)) {
    const err = new Error('Sign in to continue.');
    err.status = 401;
    err.code = 'UNAUTHENTICATED';
    throw err;
  }

  const filter = { userId: session.id, businessId, href };
  const update = {
    $inc: { count: 1 },
    $set: { lastVisitedAt: new Date() },
  };

  let row;
  try {
    row = await UserActivity.findOneAndUpdate(filter, update, {
      upsert: true,
      new: true,
      setDefaultsOnInsert: true,
    }).lean();
  } catch (err) {
    /* Two concurrent visits can both decide to insert. The unique index
       rejects one; retrying as a plain update increments the row that won. */
    if (err?.code !== 11000) throw err;
    row = await UserActivity.findOneAndUpdate(filter, update, { new: true }).lean();
  }

  return send({
    ok: true,
    activity: {
      href,
      count: Number(row?.count || 0),
      lastVisitedAt: row?.lastVisitedAt || null,
    },
  });
});
