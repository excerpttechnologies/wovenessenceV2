import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Delivery from '@/models/Delivery';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS, DERIVED_FIELDS, freightBreakdown } from '@/app/admin/transport/delivery/fields';

/* /api/delivery/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Delivery.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const totals = freightBreakdown(doc);
  DERIVED_FIELDS.forEach((f) => { doc[f.k] = totals[f.k]; });

  /* Resolve supplier contactId from supplier master - this is the source of truth */
  if (doc.supplierId && isValidObjectId(doc.supplierId)) {
    const Contact = (await import('@/models/Contact')).default;
    const supplier = await Contact.findById(doc.supplierId).select('contactId').lean();
    doc.supplierContactId = supplier?.contactId || '';
  }

  /* transactionNo is issued once on create and never reissued on edit */
  const updated = await Delivery.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await Delivery.findByIdAndDelete(id);
  return json({ ok: true });
}
