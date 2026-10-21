import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Transporter from '@/models/Transporter';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS } from '@/app/admin/transport/transporter/fields';

/* /api/transporter - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ transporterName: rx }, { transporterCode: rx }];
  }

  const total = await Transporter.countDocuments(filter);
  const rows = await Transporter.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: {},
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
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;

  const created = await Transporter.create(doc);
  return json({ ok: true, id: String(created._id) });
}
