import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PosFooterTemplate from '@/models/PosFooterTemplate';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS, reviewUrlError, extraFields } from '@/app/admin/setting/pos-footer/fields';
import { sortedPage } from '@/lib/listSort';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/pos-footer-template - list + create (26-10-2026).

   The list is also the POS invoice print page's footer picker, so READ is
   open to the POS screen as well as to this master. Writing needs this
   master's own permission. */

const POS_FOOTER = { screen: SCREENS.POS_FOOTER, label: 'POS footer templates' };

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  let denied = await screenDenial({ session, ...POS_FOOTER, action: PERM.READ, businessId: sp.get('business') });
  if (denied) denied = await screenDenial({ session, screen: SCREENS.POS, label: 'POS', action: PERM.READ, businessId: sp.get('business') });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  if (sp.get('active') === '1') filter.status = 'Active';

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ templateName: rx }, { reviewText: rx }, { reviewUrl: rx }, { ecommerceName: rx }, { ecommerceUrl: rx }];
  }

  const total = await PosFooterTemplate.countDocuments(filter);
  const rows = (await sortedPage(PosFooterTemplate, filter, sp, {
    page,
    perPage,
    keys: ['templateName', 'reviewText', 'reviewUrl', 'ecommerceName', 'ecommerceUrl', 'instagramUrl', 'communityUrl', 'status'],
    refs: ['businessId'],
  })) ?? await PosFooterTemplate.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const labels = await resolveRefLabels(rows);

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels,
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

  const denied = await screenDenial({ session, ...POS_FOOTER, action: PERM.CREATE, businessId: body.business });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  const urlErr = reviewUrlError(doc);
  if (urlErr) return json({ errors: urlErr }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  const created = await PosFooterTemplate.create(doc);
  /* the e-commerce fields are written straight to the collection too, so a
     dev server still holding the model from before they existed cannot drop
     them (26-10-2026) */
  await PosFooterTemplate.collection.updateOne(
    { _id: created._id },
    { $set: extraFields(doc) },
  );
  return json({ ok: true, id: String(created._id) });
}
