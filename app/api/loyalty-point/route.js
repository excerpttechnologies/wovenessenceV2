import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import LoyaltyPoint from '@/models/LoyaltyPoint';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { validate } from '@/lib/validate';
import { FIELDS, SCHEME_FIELDS } from '@/app/admin/setting/loyaltypoint/fields';
import { normalizeSchemeRow, validateSchemeRules } from '@/lib/loyalty';
import { loyaltySchemeDenial } from '@/lib/loyaltySchemeAccess';

const LOYALTY_POINT = { screen: SCREENS.LOYALTY_POINT, label: 'loyalty point settings' };

/* /api/loyalty-point -
     - Default mode (used by /admin/setting/loyaltypoint): read + upsert the
       business's primary scheme without touching other schemes.
     - ?mode=list / body.mode === 'create' (used by /admin/contact/contact-type):
       list all schemes for the business and create additional schemes. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});

function scopeOf(sp) {
  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  return filter;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const isList = sp.get('mode') === 'list';

  if (isList) {
    const denied = await loyaltySchemeDenial({
      session, action: PERM.READ, businessId: sp.get('business'),
    });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);

    const filter = scopeOf(sp);
    if (!filter.businessId) {
      return json({ rows: [], total: 0 });
    }
    const docs = await LoyaltyPoint.find(filter).sort({ createdAt: -1 }).lean();
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

  if (body.mode === 'create') {
    const denied = await loyaltySchemeDenial({
      session, action: PERM.CREATE, businessId: body.business,
    });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);

    if (!body.business || !isValidObjectId(body.business)) {
      return json({ error: 'Please select a business before creating a loyalty scheme.' }, 422);
    }

    const { errors, doc } = validate(SCHEME_FIELDS, body.data || {});
    validateSchemeRules(doc, errors);
    if (Object.keys(errors).length > 0) return json({ errors }, 422);

    doc.businessId = body.business;
    const created = await LoyaltyPoint.create(doc);
    return json({ ok: true, id: String(created._id), doc: normalizeSchemeRow(created.toObject()) }, 201);
  }

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
