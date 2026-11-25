import dbConnect from '@/lib/db';
import DebitNote from '@/models/DebitNote';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/debitnote/form';
import { assertDocumentLocationAccess } from '@/lib/locationAccess';

/* header fields AND the totals rows - the totals card holds real stored
   numbers (taxable value, round off, net value, the editable discounts).
   Leaving them out meant validate() silently dropped them on every save. */
const FIELDS = (FORM.cards || []).flatMap((c) => {
  if (c.type === 'fields') return c.fields || [];
  if (c.type === 'totals') {
    return (c.rows || []).flatMap((r) => [
      ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
      ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
    ]);
  }
  return [];
});

/* /api/purchase-debitnote/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await DebitNote.findById(id).lean();
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

  const existing = await DebitNote.findById(id).select('businessId locationId').lean();
  if (!existing) return json({ error: 'Not found' }, 404);
  const locDenied = await assertDocumentLocationAccess(session, existing);
  if (locDenied) return locDenied;

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;

  /* never overwrite the document number on edit */
  delete doc.debitNoteNo;

  const updated = await DebitNote.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await DebitNote.findById(id).select('businessId locationId').lean();
  if (existing) {
    const locDenied = await assertDocumentLocationAccess(session, existing);
    if (locDenied) return locDenied;
  }

  await DebitNote.findByIdAndDelete(id);
  return json({ ok: true });
}
