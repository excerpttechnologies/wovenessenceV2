import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { TABS } from '@/app/admin/contact/agent/tabs';

import ContactType from '@/models/ContactType';
import { nextContactId } from '@/lib/contactId';

const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
  ...(s.fields || []),
  ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
]));

/* /api/agent - list + create. */

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

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  /* pinned server-side so the discriminator can't be spoofed */
  filter.contactKind = 'Agent';

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ gstNo: rx }, { businessName: rx }, { shortName: rx }, { firstName: rx }, { middleName: rx }, { lastName: rx }, { userName: rx }, { billingAddressLine1: rx }];
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

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  /* stamped here, never taken from the client */
  doc.contactKind = 'Agent';
  doc.contactId = await nextContactId(Contact, ContactType, doc.typeId);

  const created = await Contact.create(doc);
  return json({ ok: true, id: String(created._id) });
}
