import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import DocSetup from '@/models/DocSetup';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/docsetup/fields';
import { buildSample, validateSetup } from '@/lib/docSetup';

/* /api/doc-setup - list + create. */

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
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ documentName: rx }, { description: rx }, { prefix: rx }, { suffix: rx }, { sample: rx }, { finYear: rx }];
  }

  const total = await DocSetup.countDocuments(filter);
  const rows = await DocSetup.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* resolve ObjectId columns to their display labels */
  const labels = {};

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels,
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
  if (body.finYear) doc.finYear = body.finYear;

  const bad = validateSetup(doc);
  if (bad) return json({ errors: bad }, 422);

  /* One setup per business + type + year. The unique index enforces it, but
     catching it here produces a message naming the clash instead of a raw
     duplicate-key error. */
  const clash = await DocSetup.findOne({
    businessId: doc.businessId, documentType: doc.documentType, finYear: doc.finYear,
  }).select('documentName').lean();
  if (clash) {
    return json({
      errors: { documentType: `"${doc.documentType}" is already configured for this business and year (${clash.documentName}).` },
    }, 422);
  }

  doc.sample = buildSample(doc);
  const created = await DocSetup.create(doc);
  return json({ ok: true, id: String(created._id) });
}
