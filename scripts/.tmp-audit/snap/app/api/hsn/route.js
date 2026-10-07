// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import Hsn from '@/models/Hsn';
// import { requireSession } from '@/lib/session';
// import { validate, escapeRegex } from '@/lib/validate';
// import { FIELDS } from '@/app/admin/setting/hsn/fields';

// /* /api/hsn - list + create. */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const PER_PAGE = 10;

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   await dbConnect();

//   const page = Math.max(1, Number(sp.get('page') || 1));
//   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
//   const search = (sp.get('search') || '').trim();

//   const filter = {};
//   const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;

//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     filter.$or = [{ code: rx }, { description: rx }];
//   }

//   const total = await Hsn.countDocuments(filter);
//   const rows = await Hsn.find(filter)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .lean();

//   /* resolve ObjectId columns to their display labels */
//   const labels = {};

//   return json({
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//     labels,
//     total,
//     page,
//     pages: Math.max(1, Math.ceil(total / perPage)),
//     perPage,
//   });
// }

// export async function POST(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const body = await req.json();
//   await dbConnect();

//   const { errors, doc, ok } = validate(FIELDS, body.data || {});
//   if (!ok) return json({ errors }, 422);
//   if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

//   const created = await Hsn.create(doc);
//   return json({ ok: true, id: String(created._id) });
// }










/* FILE: app/api/hsn/route.js */
import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Hsn from '@/models/Hsn';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { FIELDS, ROWS_TABLE } from '@/app/admin/setting/hsn/fields';

/* /api/hsn - list + create. */

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

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ code: rx }, { description: rx }];
  }

  const total = await Hsn.countDocuments(filter);
  const rows = await Hsn.find(filter)
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

  /* the Tax Slabs row table is not a declared field, so validate() drops it -
     carried across explicitly, otherwise every HSN saves with no GST rate */
  if (Array.isArray(body.data?.[ROWS_TABLE.key])) {
    doc[ROWS_TABLE.key] = body.data[ROWS_TABLE.key];
  }
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  const created = await Hsn.create(doc);
  return json({ ok: true, id: String(created._id) });
}



