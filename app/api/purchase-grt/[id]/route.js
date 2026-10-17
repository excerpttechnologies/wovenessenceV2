import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grt from '@/models/Grt';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/grt/form';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

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

/* /api/purchase-grt/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

/* Roles & Permissions (17-10-2026), Purchase > GRT: judged against the
   record's own business. A missing record answers exactly as before
   (404 / ok), so no check runs for it. Returns a 403 Response or null. */
async function grtDenied(session, id, actions) {
  const rec = isValidObjectId(id) ? await Grt.findById(id).select('businessId').lean() : null;
  if (!rec) return null;
  const denied = await screenDenialAnyAction({ session, screens: [SCREENS.GRT], actions, businessId: rec.businessId, label: 'GRT' });
  return denied ? json({ error: denied.message, code: denied.code }, 403) : null;
}

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Grt.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  /* read while viewing or editing the GRT */
  const no = await grtDenied(session, id, [PERM.READ, PERM.UPDATE]);
  if (no) return no;
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const no = await grtDenied(session, id, [PERM.UPDATE]);
  if (no) return no;

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (Array.isArray(body.data?.items)) {
    doc.items = body.data.items;
    doc.qty = body.data.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    doc.itemCount = body.data.items.length;
    doc.taxable = body.data.items.reduce((sum, item) => sum + (Number(item.finalNet || item.purRate) || 0) * (Number(item.qty) || 0), 0);
    doc.gst = body.data.items.reduce((sum, item) => {
      const taxable = (Number(item.finalNet || item.purRate) || 0) * (Number(item.qty) || 0);
      return sum + taxable * ((Number(item.gst) || 0) / 100);
    }, 0);
    doc.netAmount = doc.taxable + doc.gst;
  }

  /* never overwrite the document number on edit */
  delete doc.grtNo;

  const updated = await Grt.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const no = await grtDenied(session, id, [PERM.DELETE]);
  if (no) return no;

  await Grt.findByIdAndDelete(id);
  return json({ ok: true });
}
