import dbConnect from '@/lib/db';
import PosFooterTemplate from '@/models/PosFooterTemplate';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS, reviewUrlError, extraFields } from '@/app/admin/setting/pos-footer/fields';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/pos-footer-template/<id> - read one, update, delete (26-10-2026).
   The edit form of the master; answers to this master alone. */

const POS_FOOTER = { screen: SCREENS.POS_FOOTER, label: 'POS footer templates' };

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await PosFooterTemplate.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  const denied = await screenDenial({ session, ...POS_FOOTER, action: PERM.READ, businessId: doc.businessId });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const target = await PosFooterTemplate.findById(id).select('businessId').lean();
  if (!target) return json({ error: 'Not found' }, 404);

  const denied = await screenDenial({ session, ...POS_FOOTER, action: PERM.UPDATE, businessId: target.businessId });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  const urlErr = reviewUrlError(doc);
  if (urlErr) return json({ errors: urlErr }, 422);

  const updated = await PosFooterTemplate.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);
  /* written straight too - see the note in ../route.js POST */
  await PosFooterTemplate.collection.updateOne(
    { _id: updated._id },
    { $set: extraFields(doc) },
  );

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const target = await PosFooterTemplate.findById(id).select('businessId').lean();
  if (!target) return json({ ok: true });

  const denied = await screenDenial({ session, ...POS_FOOTER, action: PERM.DELETE, businessId: target.businessId });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  await PosFooterTemplate.findByIdAndDelete(id);
  return json({ ok: true });
}
