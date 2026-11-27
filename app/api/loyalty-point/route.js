import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import LoyaltyPoint from '@/models/LoyaltyPoint';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';
import { resolveRefLabels } from '@/lib/refLabels';
import { sortedPage } from '@/lib/listSort';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/loyaltypoint/fields';
import { normalizeSchemeRow, validateSchemeRules, schemeToRules, isSchemeEligibleOnDate } from '@/lib/loyalty';

const LOYALTY_POINT = { screen: SCREENS.LOYALTY_POINT, label: 'loyalty point settings' };
const CONTACT_TYPE = { screen: SCREENS.CONTACT_TYPE, label: 'contact types' };
const CUSTOMER = { screen: SCREENS.CUSTOMER, label: 'customers' };

/* /api/loyalty-point -
     - Default GET / POST (used by /admin/setting/loyaltypoint ListView + Add modal):
       paginated list of loyalty schemes for the business, plus creating new schemes.
     - ?mode=list (used by Contact Type Add/Edit dropdown): unpaginated list of
       loyalty schemes configured under /admin/setting/loyaltypoint.
     - ?mode=customer-list (used by Customer Add/Edit searchable Loyalty Scheme dropdown):
       active, applicable, and date-valid schemes for that business, readable only by
       users with Customer Create/Update (or Loyalty Point Read) permission. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});
const PER_PAGE = 10;

async function listDenial(session, businessId) {
  const lpDenied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.READ, businessId,
  });
  if (!lpDenied) return null;

  for (const action of [PERM.READ, PERM.CREATE, PERM.UPDATE]) {
    const ctDenied = await screenDenial({
      session, ...CONTACT_TYPE, action, businessId,
    });
    if (!ctDenied) return null;
  }
  return lpDenied;
}

async function customerListDenial(session, businessId) {
  const lpDenied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.READ, businessId,
  });
  if (!lpDenied) return null;

  for (const action of [PERM.CREATE, PERM.UPDATE]) {
    const custDenied = await screenDenial({
      session, ...CUSTOMER, action, businessId,
    });
    if (!custDenied) return null;
  }
  return lpDenied;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  if (sp.get('mode') === 'customer-list') {
    const business = (sp.get('business') || '').trim();
    if (!business) return json({ rows: [], total: 0 });
    if (!isValidObjectId(business)) return json({ error: 'Invalid business ID.' }, 400);

    const denied = await customerListDenial(session, business);
    if (denied) return json({ error: denied.message, code: denied.code }, 403);

    const scope = await resolveAuthorizedScope(session, { businessId: business });
    if (!scope.ok) return scopeErrorResponse(scope);

    const now = new Date();
    const docs = await LoyaltyPoint.find({ businessId: business }).sort({ createdAt: -1 }).lean();
    const rows = docs
      .filter((d) => isSchemeEligibleOnDate(schemeToRules(d), now))
      .map(normalizeSchemeRow);
    return json({ rows, total: rows.length });
  }

  if (sp.get('mode') === 'list') {
    const business = (sp.get('business') || '').trim();
    if (!business) return json({ rows: [], total: 0 });
    if (!isValidObjectId(business)) return json({ error: 'Invalid business ID.' }, 400);

    const denied = await listDenial(session, business);
    if (denied) return json({ error: denied.message, code: denied.code }, 403);

    const scope = await resolveAuthorizedScope(session, { businessId: business });
    if (!scope.ok) return scopeErrorResponse(scope);

    const docs = await LoyaltyPoint.find({ businessId: business }).sort({ createdAt: -1 }).lean();
    const rows = docs.map(normalizeSchemeRow);
    return json({ rows, total: rows.length });
  }

  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.READ, businessId: sp.get('business'),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const b = (sp.get('business') || '').trim();
  if (b && isValidObjectId(b)) {
    const scope = await resolveAuthorizedScope(session, { businessId: b });
    if (!scope.ok) return scopeErrorResponse(scope);
  }

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const filter = {};
  if (b && isValidObjectId(b)) filter.businessId = b;
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ loyaltyPointName: rx }, { active: rx }, { loyaltyPointsApplicable: rx }];
  }

  const total = await LoyaltyPoint.countDocuments(filter);
  const rawRows = (await sortedPage(LoyaltyPoint, filter, sp, {
    page,
    perPage,
    keys: [
      'loyaltyPointName',
      'active',
      'loyaltyPointsApplicable',
      'pointsToInr',
      'purchaseAmountForOnePoint',
      'fromDate',
      'toDate',
      'pointsExpireAfter',
      'otpRequired',
      'redeemTiming',
    ],
  })) ?? await LoyaltyPoint.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const rows = rawRows.map(normalizeSchemeRow);

  return json({
    rows,
    labels: await resolveRefLabels(rawRows),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.CREATE, businessId: body.business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (!body.business || !isValidObjectId(body.business)) {
    return json({ error: 'Please select a business before creating a loyalty scheme.' }, 422);
  }

  const scope = await resolveAuthorizedScope(session, { businessId: body.business });
  if (!scope.ok) return scopeErrorResponse(scope);

  const { errors, doc } = validate(FIELDS, body.data || {});
  validateSchemeRules(doc, errors);
  if (Object.keys(errors).length > 0) return json({ errors }, 422);

  doc.businessId = body.business;
  const created = await LoyaltyPoint.create(doc);

  return json({
    ok: true,
    id: String(created._id),
    doc: normalizeSchemeRow(created.toObject()),
  }, 201);
}
