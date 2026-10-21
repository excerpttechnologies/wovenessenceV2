import { requireSession } from '@/lib/session';
import { ROLES } from '@/models/User';

/* ==========================================================================
   Role and location authorisation, enforced on the server.

   Until now the only check any API route made was "is there a valid session".
   Every signed-in account could therefore read and write every branch's
   stock, and the only thing stopping a branch user despatching from head
   office was that the screen did not offer the button - which stops nobody
   who can open dev tools.

   Two questions are answered here:

     can(session, permission)          - is this role allowed to do this at all
     assertLocation(session, locationId) - may it act on THIS location

   The location half matters most for the transfer flow: a destination user
   receiving a transfer must not be able to receive one addressed to a
   different branch by editing the id in the request.

   COMPATIBILITY. An account with no locationIds is unrestricted, and a role
   that is not in the table below falls back to Super Admin's permissions if
   it is the legacy default and to the most restrictive set otherwise. Every
   account that exists today keeps working exactly as it did; restrictions
   only begin once somebody is given locations or a narrower role.
   ========================================================================== */

export const PERMISSIONS = {
  /* purchase / inbound */
  GRC_VIEW: 'grc.view',
  GRC_MANAGE: 'grc.manage',
  BARCODE_GENERATE: 'barcode.generate',
  BARCODE_PRINT: 'barcode.print',

  /* selling */
  POS_SELL: 'pos.sell',
  POS_RETURN: 'pos.return',

  /* stock movement */
  TRANSFER_CREATE: 'transfer.create',
  TRANSFER_DESPATCH: 'transfer.despatch',
  TRANSFER_RECEIVE: 'transfer.receive',
  TRANSFER_RETURN: 'transfer.return',
  TRANSFER_RETURN_RECEIVE: 'transfer.return.receive',

  /* money */
  BILLING_MANAGE: 'billing.manage',

  /* everything else */
  REPORTS_VIEW: 'reports.view',
  MASTERS_MANAGE: 'masters.manage',
  ADMIN_ALL: 'admin.all',
};

const P = PERMISSIONS;

/* What each role may do. Written out rather than inherited so that reading
   one line tells you a role's full reach. */
const ROLE_PERMISSIONS = {
  [ROLES.SUPER_ADMIN]: ['*'],
  [ROLES.ADMIN]: ['*'],

  [ROLES.LOCATION_MANAGER]: [
    P.GRC_VIEW, P.GRC_MANAGE, P.BARCODE_GENERATE, P.BARCODE_PRINT,
    P.POS_SELL, P.POS_RETURN,
    P.TRANSFER_CREATE, P.TRANSFER_DESPATCH, P.TRANSFER_RECEIVE,
    P.TRANSFER_RETURN, P.TRANSFER_RETURN_RECEIVE,
    P.BILLING_MANAGE, P.REPORTS_VIEW,
  ],

  /* A destination branch: receives what is sent to it, sends back what is
     wrong, sells. It cannot despatch a transfer of its own accord, and it
     cannot take a return back in - that is the source's job. */
  [ROLES.LOCATION_USER]: [
    P.GRC_VIEW,
    P.POS_SELL, P.POS_RETURN,
    P.TRANSFER_RECEIVE, P.TRANSFER_RETURN,
    P.REPORTS_VIEW,
  ],

  [ROLES.CASHIER]: [P.POS_SELL, P.POS_RETURN, P.REPORTS_VIEW],
};

/* The permissions a session actually holds. */
export function permissionsOf(session) {
  if (!session) return new Set();

  const role = String(session.role || '').trim();
  /* An unrecognised role that is not the legacy default gets the narrowest
     set - an unknown role must never widen access. */
  const base = ROLE_PERMISSIONS[role]
    || (role ? ROLE_PERMISSIONS[ROLES.CASHIER] : ROLE_PERMISSIONS[ROLES.SUPER_ADMIN]);

  const set = new Set(base);
  (session.allow || []).forEach((p) => set.add(p));
  (session.deny || []).forEach((p) => set.delete(p));
  return set;
}

export function can(session, permission) {
  const set = permissionsOf(session);
  return set.has('*') || set.has(permission);
}

/* True when this session may act on this location. */
export function canUseLocation(session, locationId) {
  if (!session) return false;
  const allowed = (session.locationIds || []).map(String).filter(Boolean);
  if (!allowed.length) return true;              // unrestricted - see COMPATIBILITY above
  if (!locationId) return true;                  // no location named, nothing to check
  return allowed.includes(String(locationId));
}

/* ------------------------------------------------------------ route glue -- */

export class AuthzError extends Error {
  constructor(status, message, code) {
    super(message);
    this.name = 'AuthzError';
    this.status = status;
    this.code = code || (status === 401 ? 'UNAUTHENTICATED' : 'FORBIDDEN');
  }
}

/* The one call a protected route makes.

     const session = await requirePermission(P.TRANSFER_DESPATCH, { locationId: from });

   Throws AuthzError, which apiError() in lib/apiError.js turns into the
   right status code and message. */
export async function requirePermission(permission, { locationId, locationIds } = {}) {
  const session = await requireSession();
  if (!session) throw new AuthzError(401, 'Sign in to continue.');

  if (permission && !can(session, permission)) {
    throw new AuthzError(403,
      'Your role (' + (session.role || 'unknown') + ') is not allowed to do this.');
  }

  const targets = [locationId, ...(locationIds || [])].filter(Boolean);
  for (const t of targets) {
    if (!canUseLocation(session, t)) {
      throw new AuthzError(403, 'Your account is not assigned to that location.', 'WRONG_LOCATION');
    }
  }

  return session;
}

/* Sessions that only need to be signed in keep using requireSession(); this
   is the same thing with the throw built in, for routes that are being
   converted. */
export async function requireUser() {
  const session = await requireSession();
  if (!session) throw new AuthzError(401, 'Sign in to continue.');
  return session;
}

/* Narrows a query to the locations a session may see. Applied to list routes
   so a branch user's list cannot be widened by editing the query string. */
export function locationScope(session, requestedLocationId) {
  const allowed = (session?.locationIds || []).map(String).filter(Boolean);
  if (!allowed.length) {
    return requestedLocationId ? { $in: [String(requestedLocationId)] } : null;
  }
  if (requestedLocationId && allowed.includes(String(requestedLocationId))) {
    return { $in: [String(requestedLocationId)] };
  }
  return { $in: allowed };
}
