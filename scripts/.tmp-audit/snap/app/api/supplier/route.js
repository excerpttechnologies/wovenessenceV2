import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { TABS } from '@/app/admin/contact/supplier/tabs';
import { normalizeGstin, isValidGstin, GSTIN_FORMAT_MESSAGE } from '@/lib/gstin';
import {
  findSupplierGstConflict, gstConflictResponse, isSupplierGstKeyError, supplierSummary,
} from '@/lib/supplierGst';

import ContactType from '@/models/ContactType';
import { nextContactId } from '@/lib/contactId';

const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
  ...(s.fields || []),
  ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
]));

/* /api/supplier - list + create. */

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
  const gstNo = normalizeGstin(sp.get('gstNo'));

  /* GST NO duplicate check - the supplier form asks this when the GST field
     loses focus. It answers only whether ANOTHER supplier holds the number,
     and names that supplier the way the list already does.
       excludeId  the supplier being edited; its own number is not a duplicate
       business   the scope on the add form */
  if (gstNo) {
    if (!isValidGstin(gstNo)) {
      return json({ errors: { gstNo: GSTIN_FORMAT_MESSAGE }, valid: false, exists: false }, 422);
    }
    const excludeId = sp.get('excludeId');
    let businessId = sp.get('business');
    /* editing: the supplier's own business decides the scope, exactly as the
       PUT that follows will */
    if (excludeId && isValidObjectId(excludeId)) {
      const self = await Contact.findById(excludeId, { businessId: 1 }).lean();
      if (self?.businessId) businessId = String(self.businessId);
    }
    const conflict = await findSupplierGstConflict({ gstNo, businessId, excludeId });
    return json({ valid: true, gstNo, exists: Boolean(conflict), supplier: supplierSummary(conflict) });
  }

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  /* pinned server-side so the discriminator can't be spoofed */
  filter.contactKind = 'Supplier';

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ gstNo: rx }, { businessName: rx }, { shortName: rx }, { firstName: rx }, { middleName: rx }, { lastName: rx }, { userName: rx }, { billingAddressLine1: rx }];
  }

  const total = await Contact.countDocuments(filter);
  const rows = await Contact.find(filter)
    .sort({ _id: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: await resolveRefLabels(rows),
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

  const validationFields = body.allowBlankFirstName === true
    ? FIELDS.map((f) => (f.k === 'firstName' ? { ...f, req: false } : f))
    : FIELDS;
  const { errors, doc } = validate(validationFields, body.data || {});
  /* GST NO: normalised before anything compares it, and format-checked before
     the database is asked about it */
  doc.gstNo = normalizeGstin(doc.gstNo);
  if (doc.gstNo && !isValidGstin(doc.gstNo)) errors.gstNo = GSTIN_FORMAT_MESSAGE;
  if (Object.keys(errors).length) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  /* stamped here, never taken from the client */
  doc.contactKind = 'Supplier';
  /* Checked here even though the form checked on blur: the form's answer can
     be seconds old, and a request need not come from the form at all. */
  const conflict = await findSupplierGstConflict({ gstNo: doc.gstNo, businessId: doc.businessId });
  if (conflict) return gstConflictResponse(conflict);
  doc.contactId = await nextContactId(Contact, ContactType, doc.typeId);

  try {
    const created = await Contact.create(doc);
    return json({ ok: true, id: String(created._id) });
  } catch (err) {
    /* two saves of the same new GSTIN at the same instant both pass the check
       above; the unique index lets one through and refuses the other */
    if (isSupplierGstKeyError(err)) {
      return gstConflictResponse(await findSupplierGstConflict({ gstNo: doc.gstNo, businessId: doc.businessId }));
    }
    throw err;
  }
}
