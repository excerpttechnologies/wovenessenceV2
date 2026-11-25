import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import CompanyLocation from '@/models/CompanyLocation';
import { AuthzError } from '@/lib/rbac';
import { ROLES } from '@/models/User';

const DEFAULT_LOC_KEYS = [
  'locationId',
  'currentLocationId',
  'fromLocationId',
  'toLocationId',
  'sourceLocationId',
  'destinationLocationId',
];

const DEFAULT_BIZ_KEYS = ['businessId', 'currentBusinessId'];

/**
 * Resolve the effective company & location permissions for an authenticated session.
 *
 * Rules:
 * - Derived strictly from the user's assigned `locationIds` (synced live from DB in `requireSession`),
 *   not merely from the display role name.
 * - When `locationIds` is non-empty: restricted strictly to those `CompanyLocation` records and
 *   their owning `businessId`s. If `locationIds` has 1 valid location, the session is location-locked.
 * - When `locationIds` is empty: preserves unrestricted multi-location access (Super Admin / global admin).
 */
export async function getSessionLocationAccess(session) {
  if (!session) {
    return {
      unrestricted: false,
      isRestricted: true,
      needsAssignment: true,
      isSingleLocation: false,
      isCompanyLocked: false,
      allowedLocations: [],
      allowedLocationIds: [],
      allowedLocationIdSet: new Set(),
      allowedBusinessIds: [],
      allowedBusinessIdSet: new Set(),
      locationById: new Map(),
      defaultLocationId: '',
    };
  }

  if (session._locationAccess) return session._locationAccess;

  const rawLocationIds = [
    ...new Set((session.locationIds || []).map(String).filter((id) => isValidObjectId(id))),
  ];
  const roleStr = String(session.role || '').trim();
  const assignedBizId = session.businessId && isValidObjectId(String(session.businessId))
    ? String(session.businessId)
    : '';
  const isSuperAdmin =
    roleStr === ROLES.SUPER_ADMIN || (!roleStr && !rawLocationIds.length && !assignedBizId);

  if (isSuperAdmin) {
    const access = {
      unrestricted: true,
      isRestricted: false,
      needsAssignment: false,
      isSingleLocation: false,
      isCompanyLocked: false,
      allowedLocations: null,
      allowedLocationIds: null,
      allowedLocationIdSet: null,
      allowedBusinessIds: null,
      allowedBusinessIdSet: null,
      locationById: new Map(),
      defaultLocationId: '',
    };
    session._locationAccess = access;
    return access;
  }

  await dbConnect();
  const docs = rawLocationIds.length
    ? await CompanyLocation.find({ _id: { $in: rawLocationIds } })
        .select('_id name businessId city')
        .sort({ name: 1 })
        .lean()
    : [];

  /* Validate that assigned locations belong to the user's assigned business when set */
  const allowedLocations = docs
    .filter((d) => !assignedBizId || !d.businessId || String(d.businessId) === assignedBizId)
    .map((d) => ({
      locationId: String(d._id),
      name: String(d.name || '').trim() || '(untitled)',
      businessId: d.businessId ? String(d.businessId) : assignedBizId,
      city: String(d.city || '').trim(),
    }));

  const allowedLocationIds = allowedLocations.map((l) => l.locationId);
  const allowedBusinessIds = assignedBizId
    ? [assignedBizId]
    : [...new Set(allowedLocations.map((l) => l.businessId).filter(Boolean))];
  const locationById = new Map(allowedLocations.map((l) => [l.locationId, l]));
  const needsAssignment = allowedBusinessIds.length === 0 || allowedLocationIds.length === 0;

  const access = {
    unrestricted: false,
    isRestricted: true,
    needsAssignment,
    isSingleLocation: needsAssignment ? true : allowedLocationIds.length <= 1,
    isCompanyLocked: needsAssignment ? true : allowedBusinessIds.length <= 1,
    allowedLocations,
    allowedLocationIds,
    allowedLocationIdSet: new Set(allowedLocationIds),
    allowedBusinessIds,
    allowedBusinessIdSet: new Set(allowedBusinessIds),
    locationById,
    defaultLocationId: allowedLocationIds[0] || '',
  };
  session._locationAccess = access;
  return access;
}

/**
 * Validate requested `businessId` and `locationId` against the session's assigned permissions
 * and compute effective MongoDB filters (never widening to all locations when `locationId` is omitted).
 */
export async function resolveAuthorizedScope(
  session,
  {
    businessId = '',
    locationId = '',
    requireLocation = false,
    asObjectId = false,
  } = {}
) {
  const access = await getSessionLocationAccess(session);

  const rawBiz = String(businessId ?? '').trim();
  const rawLoc = String(locationId ?? '').trim();
  const bId = rawBiz && rawBiz !== 'all' && isValidObjectId(rawBiz) ? rawBiz : '';
  const lId = rawLoc && rawLoc !== 'all' && isValidObjectId(rawLoc) ? rawLoc : '';

  if (access.isRestricted && rawBiz && rawBiz !== 'all' && !bId) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_BUSINESS',
      error: 'Invalid or unauthorized company selection.',
    };
  }
  if (access.isRestricted && rawLoc && rawLoc !== 'all' && !lId) {
    return {
      ok: false,
      status: 403,
      code: 'WRONG_LOCATION',
      error: 'Invalid or unauthorized location selection.',
    };
  }

  const toVal = (id) => (asObjectId ? new Types.ObjectId(id) : id);
  const toFilter = (ids) => {
    if (!ids.length) return asObjectId ? { $in: [] } : { $in: [] };
    if (ids.length === 1) return toVal(ids[0]);
    return { $in: ids.map(toVal) };
  };

  if (access.unrestricted) {
    if (requireLocation && !lId) {
      return {
        ok: false,
        status: 422,
        code: 'LOCATION_REQUIRED',
        error: 'Location selection is required.',
      };
    }
    return {
      ok: true,
      access,
      businessId: bId,
      locationId: lId,
      businessIds: bId ? [bId] : null,
      locationIds: lId ? [lId] : null,
      businessFilter: bId ? toVal(bId) : null,
      locationFilter: lId ? toVal(lId) : null,
    };
  }

  if (bId && !access.allowedBusinessIdSet.has(bId)) {
    return {
      ok: false,
      status: 403,
      code: 'FORBIDDEN_BUSINESS',
      error: 'Your account is not authorized to access this company.',
    };
  }

  if (lId && !access.allowedLocationIdSet.has(lId)) {
    return {
      ok: false,
      status: 403,
      code: 'WRONG_LOCATION',
      error: 'Your account is not assigned to this location.',
    };
  }

  if (bId && lId) {
    const locMeta = access.locationById.get(lId);
    if (locMeta?.businessId && locMeta.businessId !== bId) {
      return {
        ok: false,
        status: 403,
        code: 'LOCATION_COMPANY_MISMATCH',
        error: 'Selected location does not belong to the selected company.',
      };
    }
  }

  const effectiveBizIds = bId
    ? [bId]
    : (lId && access.locationById.get(lId)?.businessId
      ? [access.locationById.get(lId).businessId]
      : access.allowedBusinessIds);

  const effectiveLocIds = lId
    ? [lId]
    : access.allowedLocations
        .filter((l) => !bId || l.businessId === bId)
        .map((l) => l.locationId);

  if (!effectiveLocIds.length) {
    return {
      ok: false,
      status: 403,
      code: 'WRONG_LOCATION',
      error: 'Your account has no authorized locations in this company.',
    };
  }

  const resolvedLocationId = lId || (effectiveLocIds.length === 1 ? effectiveLocIds[0] : '');
  const resolvedBusinessId = bId || (effectiveBizIds.length === 1 ? effectiveBizIds[0] : '');

  if (requireLocation && !resolvedLocationId) {
    return {
      ok: false,
      status: 422,
      code: 'LOCATION_REQUIRED',
      error: 'Please select an authorized location.',
    };
  }

  return {
    ok: true,
    access,
    businessId: resolvedBusinessId,
    locationId: resolvedLocationId,
    businessIds: effectiveBizIds,
    locationIds: effectiveLocIds,
    businessFilter: toFilter(effectiveBizIds),
    locationFilter: toFilter(effectiveLocIds),
  };
}

/**
 * Same as `resolveAuthorizedScope`, but throws `AuthzError` (403/422) for `handler()`-wrapped routes.
 */
export async function requireAuthorizedScope(session, options = {}) {
  const res = await resolveAuthorizedScope(session, options);
  if (!res.ok) {
    throw new AuthzError(res.status, res.error, res.code);
  }
  return res;
}

/**
 * Turn `{ status, error, code }` from `resolveAuthorizedScope` into a JSON HTTP Response.
 */
export function scopeErrorResponse(res) {
  return Response.json(
    { error: res.error, code: res.code },
    { status: res.status || 403 }
  );
}

/**
 * Verify that an existing DB document belongs to a company & location the session may access.
 * Returns null if allowed, or an HTTP 403 JSON Response if denied.
 */
export async function assertDocumentLocationAccess(
  session,
  doc,
  { locationKeys = DEFAULT_LOC_KEYS, businessKeys = DEFAULT_BIZ_KEYS } = {}
) {
  if (!doc) return null;
  const access = await getSessionLocationAccess(session);
  if (!access.isRestricted) return null;
  if (access.needsAssignment) {
    return Response.json(
      { error: 'Your account has no location assigned yet. Contact an administrator.', code: 'WRONG_LOCATION' },
      { status: 403 }
    );
  }

  const docLocationIds = locationKeys
    .map((k) => doc[k])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v?._id || v))
    .filter((id) => isValidObjectId(id));

  if (docLocationIds.length > 0) {
    const allowed = docLocationIds.some((id) => access.allowedLocationIdSet.has(id));
    if (!allowed) {
      return Response.json(
        { error: 'Your account is not assigned to this record’s location.', code: 'WRONG_LOCATION' },
        { status: 403 }
      );
    }
    return null;
  }

  const docBusinessIds = businessKeys
    .map((k) => doc[k])
    .filter((v) => v !== undefined && v !== null && v !== '')
    .map((v) => String(v?._id || v))
    .filter((id) => isValidObjectId(id));

  if (docBusinessIds.length > 0) {
    const allowed = docBusinessIds.some((id) => access.allowedBusinessIdSet.has(id));
    if (!allowed) {
      return Response.json(
        { error: 'Your account is not authorized to access this company’s record.', code: 'FORBIDDEN_BUSINESS' },
        { status: 403 }
      );
    }
  }

  return null;
}

/**
 * Helper to apply an authorized location filter onto a Mongo query object.
 * Supports string or ObjectId stored location fields and optional legacy blank-location rows
 * ONLY when requested on unrestricted accounts or explicit opt-in.
 */
export function applyLocationFilter(targetFilter, scope, field = 'locationId', { asString = false, asOid = false } = {}) {
  if (!scope?.locationIds?.length) return targetFilter;
  const vals = scope.locationIds.map((id) => (asOid ? new Types.ObjectId(id) : asString ? String(id) : id));
  targetFilter[field] = vals.length === 1 ? vals[0] : { $in: vals };
  return targetFilter;
}
