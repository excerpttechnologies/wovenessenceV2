import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import User, { ROLES } from '@/models/User';
import Role from '@/models/Role';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import PosCounter from '@/models/PosCounter';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { escapeRegex } from '@/lib/validate';
import { hashPassword } from '@/lib/auth';
import { sortedPage } from '@/lib/listSort';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';

/* /api/user - the accounts that can sign in, and what each may do.

   Passwords are never returned, and are only written when one is supplied, so
   editing a user's details or locations does not silently reset their password. */

const PER_PAGE = 15;

export const GET = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const allBusinesses = sp.get('allBusinesses') === '1';
  const requestedBiz = allBusinesses ? '' : (sp.get('business') || '');
  const scope = await resolveAuthorizedScope(session, { businessId: requestedBiz });
  if (!scope.ok) return scopeErrorResponse(scope);

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  if (scope.access.unrestricted) {
    if (!allBusinesses && requestedBiz && isValidObjectId(requestedBiz)) {
      if (sp.get('includeSuperAdmin') === '1') {
        filter.$or = [{ businessId: requestedBiz }, { role: ROLES.SUPER_ADMIN }];
      } else {
        filter.businessId = requestedBiz;
      }
    }
  } else {
    if (scope.businessFilter) filter.businessId = scope.businessFilter;
  }

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    const searchCond = { $or: [{ name: rx }, { email: rx }, { role: rx }] };
    if (filter.$or) {
      filter.$and = [{ $or: filter.$or }, searchCond];
      delete filter.$or;
    } else {
      filter.$or = searchCond.$or;
    }
  }

  const total = await User.countDocuments(filter);
  const rows = (await sortedPage(User, filter, sp, {
    page,
    perPage,
    keys: ['name', 'email', 'role', 'isActive', 'createdAt'],
    computed: {
      access: (d) => (d.role === ROLES.SUPER_ADMIN ? Number.MAX_SAFE_INTEGER : ((d.locationIds || []).length || 0)),
    },
    select: '-password',
  })) ?? await User.find(filter)
    .select('-password')
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const bizIds = [...new Set(rows.map((r) => r.businessId).filter((v) => isValidObjectId(String(v || ''))).map(String))];
  const locIds = [...new Set(rows.flatMap((r) => (r.locationIds || []).map(String)).filter((v) => isValidObjectId(v)))];
  const counterIds = [...new Set(rows.map((r) => r.counterId).filter((v) => isValidObjectId(String(v || ''))).map(String))];

  const [bizDocs, locDocs, counterDocs] = await Promise.all([
    bizIds.length ? Business.find({ _id: { $in: bizIds } }).select('name businessPrintName').lean() : [],
    locIds.length ? CompanyLocation.find({ _id: { $in: locIds } }).select('name businessId').lean() : [],
    counterIds.length ? PosCounter.find({ _id: { $in: counterIds } }).select('counterName').lean() : [],
  ]);

  const bizMap = new Map(bizDocs.map((b) => [String(b._id), String(b.name || b.businessPrintName || '').trim()]));
  const locMap = new Map(locDocs.map((l) => [String(l._id), String(l.name || '').trim()]));
  const counterMap = new Map(counterDocs.map((c) => [String(c._id), String(c.counterName || '').trim()]));

  return json({
    rows: rows.map((r) => {
      const bId = r.businessId ? String(r.businessId) : '';
      const lIds = (r.locationIds || []).map(String).filter((id) => isValidObjectId(id));
      const cId = r.counterId ? String(r.counterId) : '';
      const locationNames = lIds.map((id) => locMap.get(id)).filter(Boolean);
      const isSuperAdmin = r.role === ROLES.SUPER_ADMIN;
      const needsAssignment = !isSuperAdmin && (!bId || !lIds.length);
      const accessLabel = isSuperAdmin
        ? 'All businesses & locations'
        : locationNames.length
          ? locationNames.join(', ')
          : lIds.length
            ? `${lIds.length} location(s)`
            : 'Not assigned';
      return {
        ...r,
        _id: String(r._id),
        businessId: bId,
        businessName: isSuperAdmin ? (bizMap.get(bId) || 'All Businesses') : (bizMap.get(bId) || ''),
        locationIds: lIds,
        locationNames,
        locationCount: lIds.length,
        counterId: cId,
        counterName: counterMap.get(cId) || '',
        needsAssignment,
        access: accessLabel,
      };
    }),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
});

export const POST = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const body = await req.json().catch(() => ({}));
  const data = body?.data || {};
  await dbConnect();

  const scope = await resolveAuthorizedScope(session, {});
  const rawBiz = 'businessId' in data ? data.businessId : body.business;
  const requestedBiz = isValidObjectId(rawBiz) ? String(rawBiz) : '';
  const roleValue = data.role || ROLES.LOCATION_USER;

  const errors = validate(data, {
    isNew: true,
    allowedRoles: await allowedRoleNames(requestedBiz || null),
  });

  const assignErrors = await validateAssignment({
    role: roleValue,
    businessId: requestedBiz,
    locationIds: data.locationIds,
    counterId: data.counterId,
    enforceAssignment: true,
    access: scope.access,
  });
  Object.assign(errors, assignErrors);
  if (Object.keys(errors).length) return json({ errors }, 422);

  const email = String(data.email).toLowerCase().trim();
  if (await User.exists({ email })) {
    return json({ errors: { email: 'An account with that email already exists.' } }, 422);
  }

  const isSuper = roleValue === ROLES.SUPER_ADMIN;
  const cleanLocIds = isSuper ? [] : toIds(data.locationIds);
  const cleanBiz = requestedBiz ? requestedBiz : null;

  const created = await User.create({
    name: String(data.name).trim(),
    email,
    password: hashPassword(data.password),
    role: roleValue,
    isActive: data.isActive !== false && data.isActive !== 'false',
    businessId: cleanBiz,
    locationIds: cleanLocIds,
    allow: toList(data.allow),
    deny: toList(data.deny),
  });

  if (roleValue === ROLES.CASHIER && isValidObjectId(data.counterId)) {
    await User.collection.updateOne({ _id: created._id }, { $set: { counterId: new Types.ObjectId(String(data.counterId)) } });
  }

  return json({ ok: true, id: String(created._id) }, 201);
});

/* ------------------------------------------------------------- shared ---- */

export async function allowedRoleNames(businessId) {
  const built = Object.values(ROLES);
  if (!businessId || !isValidObjectId(businessId)) return built;
  const rows = await Role.find({ businessId }).select('name').lean();
  return [...built, ...rows.map((r) => r.name).filter(Boolean)];
}

export async function validateAssignment({
  role,
  businessId,
  locationIds,
  counterId,
  enforceAssignment = true,
  access = null,
}) {
  const errors = {};
  const isSuper = role === ROLES.SUPER_ADMIN;

  if (isSuper) {
    if (access && !access.unrestricted) {
      errors.role = 'Only Super Admin can assign the Super Admin role.';
    }
    if (businessId && !(await Business.exists({ _id: businessId }))) {
      errors.businessId = 'Selected business does not exist.';
    }
    return errors;
  }

  if (!enforceAssignment) return errors;

  if (!businessId || !isValidObjectId(businessId)) {
    errors.businessId = 'Business is required.';
    return errors;
  }
  const bizExists = await Business.exists({ _id: businessId });
  if (!bizExists) {
    errors.businessId = 'Selected business does not exist.';
    return errors;
  }
  if (access && access.isRestricted && !access.allowedBusinessIdSet.has(String(businessId))) {
    errors.businessId = 'You cannot assign a business outside your authorized scope.';
    return errors;
  }

  const locIds = toIds(locationIds);
  if (!locIds.length) {
    errors.locationIds = 'Select at least one location.';
    return errors;
  }

  const locDocs = await CompanyLocation.find({ _id: { $in: locIds } })
    .select('_id businessId')
    .lean();
  if (locDocs.length !== locIds.length) {
    errors.locationIds = 'One or more selected locations do not exist.';
    return errors;
  }

  const mismatch = locDocs.some((l) => String(l.businessId || '') !== String(businessId));
  if (mismatch) {
    errors.locationIds = 'Every selected location must belong to the selected business.';
    return errors;
  }

  if (access && access.isRestricted) {
    const unauthorizedLoc = locIds.some((id) => !access.allowedLocationIdSet.has(id));
    if (unauthorizedLoc) {
      errors.locationIds = 'You cannot assign locations outside your authorized scope.';
      return errors;
    }
  }

  if (role === ROLES.CASHIER) {
    if (!counterId || !isValidObjectId(counterId)) {
      errors.counterId = 'Select a cash counter.';
    } else {
      const counter = await PosCounter.findById(counterId).select('businessId locationId').lean();
      if (!counter) {
        errors.counterId = 'Selected cash counter does not exist.';
      } else if (counter.businessId && String(counter.businessId) !== String(businessId)) {
        errors.counterId = 'Cash counter does not belong to the selected business.';
      } else if (counter.locationId && !locIds.includes(String(counter.locationId))) {
        errors.counterId = 'Cash counter does not belong to the selected location.';
      }
    }
  }

  return errors;
}

export function validate(data, { isNew, allowedRoles }) {
  const errors = {};
  if (!String(data.name || '').trim()) errors.name = 'Name is required';

  const email = String(data.email || '').trim();
  if (!email) errors.email = 'Email is required';
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) errors.email = 'That is not a valid email address';

  /* Required on create, optional on edit - a blank password when editing
     means "leave it as it is", not "set it to empty". */
  if (isNew && !String(data.password || '')) errors.password = 'Password is required';
  else if (data.password && String(data.password).length < 8) {
    errors.password = 'Use at least 8 characters';
  }

  /* Defaults to the built-ins when the caller did not look custom roles up,
     so an older call site cannot accidentally widen what is accepted. */
  const allowed = allowedRoles && allowedRoles.length ? allowedRoles : Object.values(ROLES);
  if (data.role && !allowed.includes(data.role)) {
    errors.role = 'Choose one of: ' + allowed.join(', ');
  }
  return errors;
}

export function toIds(v) {
  const list = Array.isArray(v) ? v : (v ? [v] : []);
  return [...new Set(list.map(String).filter((x) => isValidObjectId(x)))];
}

export function toList(v) {
  const list = Array.isArray(v) ? v : (v ? [v] : []);
  return list.map(String).filter(Boolean);
}
