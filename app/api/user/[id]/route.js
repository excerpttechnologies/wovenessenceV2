import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import User, { ROLES } from '@/models/User';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { hashPassword } from '@/lib/auth';
import { resolveAuthorizedScope } from '@/lib/locationAccess';
import { validate, validateAssignment, toIds, toList, allowedRoleNames } from '../route';

/* /api/user/<id> - read, update, deactivate one account. */

export const GET = handler(async (req, { params }) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const { id } = await params;
  await dbConnect();
  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const doc = await User.findById(id).select('-password').lean();
  if (!doc) return json({ error: 'User not found.', code: 'NOT_FOUND' }, 404);

  const scope = await resolveAuthorizedScope(session, {});
  if (scope.access.isRestricted) {
    const docBiz = doc.businessId ? String(doc.businessId) : '';
    if (doc.role === ROLES.SUPER_ADMIN || (docBiz && !scope.access.allowedBusinessIdSet.has(docBiz))) {
      return json({ error: 'You are not authorized to view this user.', code: 'FORBIDDEN' }, 403);
    }
  }

  return json({
    doc: {
      ...doc,
      _id: String(doc._id),
      businessId: doc.businessId ? String(doc.businessId) : '',
      locationIds: (doc.locationIds || []).map(String),
      counterId: doc.counterId ? String(doc.counterId) : '',
    },
  });
});

export const PUT = handler(async (req, { params }) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const { id } = await params;
  const body = await req.json().catch(() => ({}));
  const data = body?.data || {};
  await dbConnect();

  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  const existing = await User.findById(id).select('role businessId locationIds counterId').lean();
  if (!existing) return json({ error: 'User not found.', code: 'NOT_FOUND' }, 404);

  const scope = await resolveAuthorizedScope(session, {});
  if (scope.access.isRestricted) {
    const exBiz = existing.businessId ? String(existing.businessId) : '';
    if (existing.role === ROLES.SUPER_ADMIN || (exBiz && !scope.access.allowedBusinessIdSet.has(exBiz))) {
      return json({ error: 'You are not authorized to modify this user.', code: 'FORBIDDEN' }, 403);
    }
  }

  const rawBiz = 'businessId' in data
    ? data.businessId
    : ('business' in body ? body.business : existing.businessId);
  const business = isValidObjectId(rawBiz) ? String(rawBiz) : '';
  const targetRole = data.role || existing.role || ROLES.LOCATION_USER;
  const quickToggleOnly = body?.quick === true;

  const errors = validate(data, {
    isNew: false,
    allowedRoles: await allowedRoleNames(business || null),
  });

  if (!quickToggleOnly) {
    const assignErrors = await validateAssignment({
      role: targetRole,
      businessId: business,
      locationIds: 'locationIds' in data ? data.locationIds : existing.locationIds,
      counterId: 'counterId' in data ? data.counterId : existing.counterId,
      enforceAssignment: true,
      access: scope.access,
    });
    Object.assign(errors, assignErrors);
  } else if (scope.access.isRestricted && targetRole === ROLES.SUPER_ADMIN) {
    errors.role = 'Only Super Admin can assign the Super Admin role.';
  }

  if (Object.keys(errors).length) return json({ errors }, 422);

  const email = String(data.email).toLowerCase().trim();
  const clash = await User.findOne({ email, _id: { $ne: id } }).select('_id').lean();
  if (clash) return json({ errors: { email: 'Another account already uses that email.' } }, 422);

  const active = data.isActive !== false && data.isActive !== 'false';

  if (String(session.id) === String(id)) {
    if (!active) {
      return json({ errors: { isActive: 'You cannot disable your own account.' } }, 422);
    }
    if (targetRole !== session.role && !['Super Admin', 'Admin'].includes(targetRole)) {
      return json({
        errors: { role: 'You cannot remove your own administrator role - ask another administrator to do it.' },
      }, 422);
    }
  }

  const isSuper = targetRole === ROLES.SUPER_ADMIN;
  const nextLocations = isSuper
    ? []
    : toIds('locationIds' in data ? data.locationIds : existing.locationIds);

  const update = {
    name: String(data.name).trim(),
    email,
    role: targetRole,
    isActive: active,
    businessId: business ? business : null,
    locationIds: nextLocations,
    allow: toList(data.allow),
    deny: toList(data.deny),
  };

  if ('counterId' in data) {
    update.counterId = targetRole === ROLES.CASHIER && isValidObjectId(data.counterId)
      ? data.counterId
      : null;
  } else if (targetRole !== ROLES.CASHIER) {
    update.counterId = null;
  }

  /* Only overwrite password when a new one was explicitly supplied */
  if (data.password) update.password = hashPassword(data.password);

  const updated = await User.findByIdAndUpdate(id, update, { new: true }).select('-password').lean();
  if (!updated) return json({ error: 'User not found.', code: 'NOT_FOUND' }, 404);

  if ('counterId' in update) {
    await User.collection.updateOne(
      { _id: updated._id },
      { $set: { counterId: update.counterId ? new Types.ObjectId(String(update.counterId)) : null } }
    );
  }

  return json({ ok: true, id: String(updated._id) });
});

/* Accounts are DEACTIVATED, never deleted: their name is on documents,
   movements and audit rows, and a deleted account would leave those
   unattributable. isActive:false is already what the sign-in check reads. */
export const DELETE = handler(async (req, { params }) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const { id } = await params;
  await dbConnect();
  if (!isValidObjectId(id)) return json({ error: 'Not found', code: 'NOT_FOUND' }, 404);

  if (String(session.id) === String(id)) {
    return json({ error: 'You cannot disable your own account.', code: 'SELF_LOCKOUT' }, 422);
  }

  const doc = await User.findByIdAndUpdate(id, { isActive: false }, { new: true }).select('-password').lean();
  if (!doc) return json({ error: 'User not found.', code: 'NOT_FOUND' }, 404);

  return json({ ok: true, deactivated: true });
});
