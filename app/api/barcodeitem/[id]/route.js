import dbConnect from '@/lib/db';
import BarcodeItem from '@/models/BarcodeItem';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';
/* Barcode Item is a filter-only screen - it has no add form, so there are
   no declared fields to validate against. */
const FIELDS = [];

/* /api/barcodeitem/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await BarcodeItem.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  const locDenied = await assertDocumentLocationAccess(session, doc);
  if (locDenied) return locDenied;
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const existing = await BarcodeItem.findById(id).select('businessId locationId').lean();
  if (!existing) return json({ error: 'Not found' }, 404);
  const locDenied = await assertDocumentLocationAccess(session, existing);
  if (locDenied) return locDenied;

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const updated = await BarcodeItem.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await BarcodeItem.findById(id).select('businessId locationId').lean();
  if (existing) {
    const locDenied = await assertDocumentLocationAccess(session, existing);
    if (locDenied) return locDenied;
  }

  await BarcodeItem.findByIdAndDelete(id);
  return json({ ok: true });
}
