import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import LoyaltyPoint from '@/models/LoyaltyPoint';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/loyaltypoint/fields';
import { normalizeSchemeRow } from '@/lib/loyalty';

const LOYALTY_POINT = { screen: SCREENS.LOYALTY_POINT, label: 'loyalty point settings' };
const CONTACT_TYPE = { screen: SCREENS.CONTACT_TYPE, label: 'contact types' };

/* /api/loyalty-point -
     - Default GET / POST (used by /admin/setting/loyaltypoint): read + upsert
       the business's loyalty scheme configuration.
     - ?mode=list (used by Contact Type Add/Edit dropdown): list loyalty
       schemes configured under /admin/setting/loyaltypoint for the business. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

function scopeOf(sp) {
  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  return filter;
}

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

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

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

  /* Only refuses when this role has a saved permission matrix that
     withholds it - see lib/screenPermission.js. */
  const denied = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.READ, businessId: sp.get('business'),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const doc = await LoyaltyPoint.findOne(scopeOf(sp)).sort({ createdAt: 1 }).lean();
  return json({ doc: doc ? normalizeSchemeRow(doc) : null });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  /* Update OR create, ahead of validate() - see the note at the top. */
  let gate = await screenDenial({
    session, ...LOYALTY_POINT, action: PERM.UPDATE, businessId: body.business,
  });
  if (gate) {
    gate = await screenDenial({
      session, ...LOYALTY_POINT, action: PERM.CREATE, businessId: body.business,
    });
  }
  if (gate) return json({ error: gate.message, code: gate.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  const sp = new URLSearchParams({
    business: body.business || '', location: body.location || '', finYear: body.finYear || '',
  });
  const filter = scopeOf(sp);
  const existing = await LoyaltyPoint.findOne(filter).sort({ createdAt: 1 }).select('_id').lean();
  if (existing) {
    await LoyaltyPoint.findByIdAndUpdate(existing._id, { $set: doc }, { new: true });
  } else {
    await LoyaltyPoint.create(doc);
  }

  return json({ ok: true });
}
