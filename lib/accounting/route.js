import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { scopeOf } from '@/lib/reports';

/* ==========================================================================
   Shared plumbing for /api/accounting/* and the accounting reports.

   Every route here starts the same way - signed in, allowed to see this
   accounting screen, and posting to the business selected in the top bar -
   so it starts here rather than in twelve copies.

   The scope comes from the REQUEST, matching the rest of the project (see
   lib/reports.js scopeOf); the permission is judged against that business.
   ========================================================================== */

export const json = (data, status = 200) => Response.json(data, { status });

/* Returns a Response when the request must stop, null when it may continue.
   `action` is one of ACTIONS; `screen` is the SCREENS href of the screen.

   `businessId` is for a WRITE, whose scope arrives in the body rather than
   the query string: judging a create against an empty business would fall
   through to "may this role do it anywhere", which is wider than the saved
   matrix intends. */
export async function guard(req, screen, action, businessId) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const queryScope = scopeOf(sp);
  const scope = { ...queryScope, businessId: businessId || queryScope.businessId };

  const denied = await screenDenial({
    session,
    screen,
    action,
    businessId: scope.businessId,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return null;
}

/* The session plus the scope, for routes that already passed a guard. */
export async function sessionAndScope(req) {
  const session = await requireSession();
  const scope = scopeOf(new URL(req.url).searchParams);
  return { session, scope };
}

/* A body's scope wins over the query string on writes: the form sends both,
   and the body is the one it just built. Falls back to the query. */
export function writeScope(body, sp) {
  const query = scopeOf(sp);
  const pick = (value, fallback) => (value === undefined || value === null || value === ''
    ? fallback
    : value);
  return {
    businessId: pick(body?.business, query.businessId),
    locationId: pick(body?.location, query.locationId),
    finYear: pick(body?.finYear, query.finYear),
  };
}

export { SCREENS, ACTIONS };
