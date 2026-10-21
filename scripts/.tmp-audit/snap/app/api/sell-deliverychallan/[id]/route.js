import dbConnect from '@/lib/db';
import DeliveryChallan from '@/models/DeliveryChallan';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { resolveRefLabels } from '@/lib/refLabels';
import { FORM } from '@/app/admin/transaction/sell/deliverychallan/form';

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

/* /api/sell-deliverychallan/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await DeliveryChallan.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);

  /* The printed challan shows the customer, the location and the logistics
     provider by NAME; the document stores only their ids. The list route
     already resolves them this way - the detail route did not, so the print
     view had nothing to print. */
  return json({
    doc: { ...doc, _id: String(doc._id) },
    labels: await resolveRefLabels([doc]),
  });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;

  /* never overwrite the document number on edit */
  delete doc.deliveryChallanNo;

  const updated = await DeliveryChallan.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await DeliveryChallan.findByIdAndDelete(id);
  return json({ ok: true });
}
