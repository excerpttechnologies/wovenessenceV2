import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import LoyaltyPoint from '@/models/LoyaltyPoint';
import ContactType from '@/models/ContactType';
import LoyaltyLedger from '@/models/LoyaltyLedger';
import PosInvoice from '@/models/PosInvoice';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/loyaltypoint/fields';
import { normalizeSchemeRow, validateSchemeRules } from '@/lib/loyalty';

const LOYALTY_POINT = { screen: SCREENS.LOYALTY_POINT, label: 'loyalty point settings' };

/* /api/loyalty-point/<id> - read, update, and safely delete one loyalty scheme. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ doc: null }, 404);
  await dbConnect();

  const doc = await LoyaltyPoint.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.READ, businessId: doc.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (doc.businessId) {
    const scope = await resolveAuthorizedScope(session, { businessId: String(doc.businessId) });
    if (!scope.ok) return scopeErrorResponse(scope);
  }

  return json({ doc: normalizeSchemeRow(doc) });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ error: 'Not found' }, 404);

  const body = await req.json();
  await dbConnect();

  const existing = await LoyaltyPoint.findById(id).lean();
  if (!existing) return json({ error: 'Not found' }, 404);

  const businessId = body.business || existing.businessId;
  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.UPDATE, businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (businessId && isValidObjectId(String(businessId))) {
    const scope = await resolveAuthorizedScope(session, { businessId: String(businessId) });
    if (!scope.ok) return scopeErrorResponse(scope);
  }

  const { errors, doc } = validate(FIELDS, body.data || {});
  validateSchemeRules(doc, errors);
  if (Object.keys(errors).length > 0) return json({ errors }, 422);

  const updated = await LoyaltyPoint.findByIdAndUpdate(
    id,
    { $set: doc },
    { new: true, runValidators: true }
  ).lean();
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id, doc: normalizeSchemeRow(updated) });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  if (!isValidObjectId(id)) return json({ ok: true });
  await dbConnect();

  const existing = await LoyaltyPoint.findById(id).lean();
  if (!existing) return json({ ok: true });

  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.DELETE, businessId: existing.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (existing.businessId) {
    const scope = await resolveAuthorizedScope(session, { businessId: String(existing.businessId) });
    if (!scope.ok) return scopeErrorResponse(scope);
  }

  /* Block deletion when Contact Types or loyalty history depend on this scheme:
     1. Contact Types referencing this loyaltySchemeId.
     2. LoyaltyLedger entries referencing this schemeId.
     3. POS invoices referencing this schemeId.
     4. Legacy pre-migration ledger rows (schemeId: null) on the earliest scheme. */
  const [hasContactType, hasDirectLedger, hasDirectInvoice, hasLegacyLedger, oldestScheme] = await Promise.all([
    ContactType.exists({ loyaltySchemeId: existing._id }),
    LoyaltyLedger.exists({ businessId: existing.businessId, schemeId: existing._id }),
    PosInvoice.exists({ businessId: existing.businessId, loyaltySchemeId: existing._id }),
    LoyaltyLedger.exists({ businessId: existing.businessId, schemeId: null }),
    LoyaltyPoint.findOne({ businessId: existing.businessId }).sort({ createdAt: 1 }).select('_id').lean(),
  ]);

  const isLegacyProtected = Boolean(
    hasLegacyLedger && oldestScheme && String(oldestScheme._id) === String(existing._id)
  );

  if (hasContactType) {
    return json({
      error: 'Cannot delete this loyalty scheme because it is currently assigned to one or more Contact Types. Unassign it or mark it Inactive instead.',
      code: 'LOYALTY_SCHEME_IN_USE',
    }, 409);
  }

  if (hasDirectLedger || hasDirectInvoice || isLegacyProtected) {
    return json({
      error: 'Cannot delete this loyalty scheme because historical loyalty transactions depend on it. Set Active to Inactive instead.',
      code: 'LOYALTY_SCHEME_IN_USE',
    }, 409);
  }

  await LoyaltyPoint.findByIdAndDelete(id);
  return json({ ok: true });
}
