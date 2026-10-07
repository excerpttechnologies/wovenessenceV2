import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { TABS } from '@/app/admin/contact/customer/tabs';

import ContactType from '@/models/ContactType';
import { nextContactId } from '@/lib/contactId';

const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
  ...(s.fields || []),
  ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
]));

/* /api/customer - list + create. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});
const PER_PAGE = 10;
/* The POS quick-add contract. Anything not named here is dropped on save, so
   this list has to stay in step with the dialog in components/PosTill.jsx -
   a field the form offers but this omits saves silently as blank.

   Widened to cover the whole Basic Information tab of the full customer form
   (short name, DOB, gender, and the complete billing block) because the till's
   dialog now mirrors that layout. Still deliberately excludes the Sales and
   Financial tabs and the shipping block - the counter does not collect them. */
const QUICK_FIELDS = FIELDS.filter((field) => [
  'typeId', 'businessType', 'gstNo', 'businessName', 'shortName',
  'prefix', 'firstName', 'middleName', 'lastName', 'dob', 'gender',
  'billingAddressLine1', 'billingAddressLine2', 'billingCity', 'billingState',
  'billingCountry', 'billingDistrict', 'billingTaluk', 'billingZipCode',
  'billingMobile', 'billingAlternateContactNumber', 'billingLandline', 'billingFax',
  'billingEmail', 'billingEmail2', 'billingWebsiteUrl',
].includes(field.k));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  /* pinned server-side so the discriminator can't be spoofed */
  filter.contactKind = 'Customer';

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ gstNo: rx }, { businessName: rx }, { shortName: rx }, { firstName: rx }, { middleName: rx }, { lastName: rx }, { userName: rx }, { billingAddressLine1: rx }, { billingMobile: rx }, { billingAlternateContactNumber: rx }];
  }

  const total = await Contact.countDocuments(filter);
  const rows = await Contact.find(filter)
    .sort({ createdAt: -1 })
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

  /* POS quick-add deliberately omits the full customer page's sales and
     ledger tabs. Keep that smaller contract explicit instead of making those
     fields optional for every customer submission. */
  const fields = body.quick ? QUICK_FIELDS : FIELDS;
  const quickData = body.quick
    ? { priceList: 'ON RSP', openingBalance: 0, ...(body.data || {}) }
    : body.data || {};
  const { errors, doc, ok } = validate(fields, quickData);
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  /* stamped here, never taken from the client */
  doc.contactKind = 'Customer';
  doc.contactId = await nextContactId(Contact, ContactType, doc.typeId);

  const created = await Contact.create(doc);
  return json({
    ok: true,
    id: String(created._id),
    customer: {
      _id: String(created._id),
      businessId: created.businessId ? String(created.businessId) : '',
      contactKind: created.contactKind,
      contactId: created.contactId,
      businessName: created.businessName || '',
      firstName: created.firstName || '',
      lastName: created.lastName || '',
      billingMobile: created.billingMobile || '',
    },
  });
}
