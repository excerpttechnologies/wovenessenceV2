import dbConnect from '@/lib/db';
import SalesPerson, { clearOtherDefaults } from '@/models/SalesPerson';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/staff-management/staff/salesperson/fields';

/* /api/sales-person/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  /* Next 15 hands `params` over as a Promise - destructuring it directly
     yields undefined, so every lookup here would silently miss. */
  const { id } = await params;
  await dbConnect();

  const doc = await SalesPerson.findById(id).lean();
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

  const updated = await SalesPerson.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  if (doc.isDefault === 'Yes') await clearOtherDefaults(updated);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await SalesPerson.findByIdAndDelete(id);
  return json({ ok: true });
}
