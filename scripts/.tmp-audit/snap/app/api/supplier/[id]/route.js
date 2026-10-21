import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { TABS } from '@/app/admin/contact/supplier/tabs';
import { normalizeGstin, isValidGstin, GSTIN_FORMAT_MESSAGE } from '@/lib/gstin';
import { findSupplierGstConflict, gstConflictResponse, isSupplierGstKeyError } from '@/lib/supplierGst';

const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
  ...(s.fields || []),
  ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
]));

/* /api/supplier/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Contact.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc } = validate(FIELDS, body.data || {});
  /* GST NO: normalised before anything compares it, and format-checked before
     the database is asked about it */
  doc.gstNo = normalizeGstin(doc.gstNo);
  if (doc.gstNo && !isValidGstin(doc.gstNo)) errors.gstNo = GSTIN_FORMAT_MESSAGE;
  if (Object.keys(errors).length) return json({ errors }, 422);

  /* Scoped to the business this supplier belongs to, not to whichever
     business the screen happens to be switched to. */
  const current = isValidObjectId(id) ? await Contact.findById(id, { businessId: 1 }).lean() : null;
  if (!current) return json({ error: 'Not found' }, 404);
  const businessId = current.businessId ? String(current.businessId) : body.business;

  /* _id excluded: a supplier's own GST number is never its own duplicate */
  const conflict = await findSupplierGstConflict({ gstNo: doc.gstNo, businessId, excludeId: id });
  if (conflict) return gstConflictResponse(conflict);

  let updated;
  try {
    updated = await Contact.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  } catch (err) {
    /* another save claimed the number between the check and this write */
    if (isSupplierGstKeyError(err)) {
      return gstConflictResponse(await findSupplierGstConflict({ gstNo: doc.gstNo, businessId, excludeId: id }));
    }
    throw err;
  }
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  await Contact.findByIdAndDelete(id);
  return json({ ok: true });
}
