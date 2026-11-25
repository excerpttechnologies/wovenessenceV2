import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS } from '@/lib/screenPermission';
import { scopeOf } from '@/lib/reports';
import { resolveAuthorizedScope } from '@/lib/locationAccess';

/* ==========================================================================
   Shared plumbing for /api/accounting/* and the accounting reports.
   ========================================================================== */

export const json = (data, status = 200) => Response.json(data, { status });

export async function guard(req, screen, action, businessId, locationId = '') {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const queryScope = scopeOf(sp);
  const targetBiz = businessId || queryScope.businessId || '';
  const targetLoc = locationId || queryScope.locationId || '';

  const authScope = await resolveAuthorizedScope(session, {
    businessId: targetBiz,
    locationId: targetLoc,
  });
  if (!authScope.ok) {
    return json({ error: authScope.error, code: authScope.code }, authScope.status || 403);
  }

  const denied = await screenDenial({
    session,
    screen,
    action,
    businessId: authScope.businessId || targetBiz,
    label: 'Accounts',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return null;
}

/* The session plus the scope, for routes that already passed a guard. */
export async function sessionAndScope(req) {
  const session = await requireSession();
  const sp = new URL(req.url).searchParams;
  const raw = scopeOf(sp);
  if (!session) return { session: null, scope: raw };
  const auth = await resolveAuthorizedScope(session, {
    businessId: raw.businessId || '',
    locationId: raw.locationId || '',
  });
  if (!auth.ok) return { session, scope: raw };
  return {
    session,
    scope: {
      ...raw,
      businessId: auth.businessId || raw.businessId,
      locationId: auth.locationId || raw.locationId,
      businessFilter: auth.businessFilter,
      locationFilter: auth.locationFilter,
      locationIds: auth.locationIds,
      access: auth.access,
    },
  };
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
