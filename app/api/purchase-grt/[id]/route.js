import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grt from '@/models/Grt';
import DebitNote from '@/models/DebitNote';
import StockMovement from '@/models/StockMovement';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { FORM } from '@/app/admin/transaction/purchase/grt/form';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { validateGrtReturnItems } from '@/lib/grtReturnable';

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
  if (!isValidObjectId(id)) return json({ error: 'Invalid GRT ID' }, 400);
  const body = await req.json();
  await dbConnect();

  const existing = await Grt.findById(id).lean();
  if (!existing) return json({ error: 'GRT not found' }, 404);
  if (existing.debitNoteId) {
    return json({ error: 'Cannot edit this GRT because a Debit Note has already been generated from it.' }, 409);
  }

  const no = await grtDenied(session, id, [PERM.UPDATE]);
  if (no) return no;

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  if (Array.isArray(body.data?.items)) {
    const check = await validateGrtReturnItems({
      items: body.data.items,
      businessId: existing.businessId || body.business,
      supplierId: doc.supplierId || existing.supplierId,
      excludeGrtId: id,
    });
    if (!check.ok) {
      return json({ errors: { items: check.error }, error: check.error }, 422);
    }
    doc.items = check.items;
    doc.qty = check.items.reduce((sum, item) => sum + (Number(item.qty) || 0), 0);
    doc.itemCount = check.items.length;
    doc.taxable = check.items.reduce((sum, item) => sum + (Number(item.finalNet || item.purRate) || 0) * (Number(item.qty) || 0), 0);
    doc.gst = check.items.reduce((sum, item) => {
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
  if (!isValidObjectId(id)) {
    return json({ error: 'Invalid GRT ID.' }, 400);
  }
  await dbConnect();

  const existing = await Grt.findById(id).lean();
  if (!existing) {
    return json({ error: 'GRT record not found.' }, 404);
  }

  const no = await grtDenied(session, id, [PERM.DELETE]);
  if (no) return no;

  const sp = new URL(req.url).searchParams;
  const reqBusiness = sp.get('business');
  const reqLocation = sp.get('location');
  const reqFinYear = sp.get('finYear');
  if (reqBusiness && isValidObjectId(reqBusiness) && existing.businessId && String(existing.businessId) !== reqBusiness) {
    return json({ error: 'GRT does not belong to the selected company.' }, 403);
  }
  if (reqLocation && isValidObjectId(reqLocation) && existing.locationId && String(existing.locationId) !== reqLocation) {
    return json({ error: 'GRT does not belong to the selected location.' }, 403);
  }
  if (reqFinYear && existing.finYear && String(existing.finYear) !== reqFinYear) {
    return json({ error: 'GRT does not belong to the selected financial year.' }, 403);
  }

  /* Protect finalized/posted GRTs or records converted into a Debit Note. */
  const docStatus = String(existing.status || '').trim().toUpperCase();
  if (['POSTED', 'FINALIZED', 'APPROVED', 'LOCKED'].includes(docStatus)) {
    return json({
      error: `Cannot delete GRT "${existing.grtNo || id}" because it is ${docStatus.toLowerCase()}.`,
    }, 409);
  }

  if (existing.debitNoteId) {
    const dn = await DebitNote.findById(existing.debitNoteId).select('debitNoteNo').lean().catch(() => null);
    return json({
      error: `Cannot delete GRT "${existing.grtNo || id}" because Debit Note${dn?.debitNoteNo ? ' "' + dn.debitNoteNo + '"' : ''} has already been created from it.`,
    }, 409);
  }

  if (existing.grtNo) {
    const dnRx = { $regex: `(^|,\\s*)${escapeRegex(String(existing.grtNo).trim())}(\\s*,|$)`, $options: 'i' };
    const linkedDn = await DebitNote.findOne({
      ...(existing.businessId ? { businessId: existing.businessId } : {}),
      grtNo: dnRx,
    }).select('debitNoteNo').lean();
    if (linkedDn) {
      return json({
        error: `Cannot delete GRT "${existing.grtNo}" because it is referenced by Debit Note "${linkedDn.debitNoteNo || linkedDn._id}".`,
      }, 409);
    }
  }

  const movement = await StockMovement.findOne({
    refModel: { $in: ['grt', 'GRT'] },
    refId: existing._id,
  }).select('_id type').lean();
  if (movement) {
    return json({
      error: `Cannot delete GRT "${existing.grtNo || id}" because stock movement entries already exist for it.`,
    }, 409);
  }

  await Grt.findByIdAndDelete(id);
  return json({ ok: true, id, grtNo: existing.grtNo || '' });
}
