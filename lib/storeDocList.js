import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveRefLabels } from '@/lib/refLabels';
import { escapeRegex } from '@/lib/validate';
import { sortedPage } from '@/lib/listSort';

/* ==========================================================================
   THE LIST ENDPOINT for all four Inter Store Sell documents.

   Written once rather than four times because the four lists differ only in
   their model, their date column and what they search - and four copies of a
   filter builder is how one screen quietly stops honouring the financial year
   the others respect.

   Always scoped by businessId from the query string, so one company can never
   read another's documents through a URL. The module's records live in their
   own collections anyway; `module` is applied as a second guard.
   ========================================================================== */

const PER_PAGE = 10;

export async function listStoreDocs(req, {
  Model,
  screen,
  label,
  dateField,
  searchFields = [],
  sortKeys = [],
  refs = [],
  idFields = [],
}) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const denied = await screenDenial({
    session, screen, action: PERM.READ, businessId: sp.get('business'), label,
  });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = { module: 'interStoreSell' };

  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  /* the two stores named on the document */
  const from = sp.get('fromLocationId'); if (from && isValidObjectId(from)) filter.fromLocationId = from;
  const to = sp.get('toLocationId'); if (to && isValidObjectId(to)) filter.toLocationId = to;

  const status = sp.get('status'); if (status) filter.status = status;

  /* "unbilled" / "unreturned" pickers: $eq null matches missing AND null, so
     documents written before a field existed are included */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const startDate = sp.get('startDate');
  const endDate = sp.get('endDate');
  if (dateField && startDate) filter[dateField] = { ...(filter[dateField] || {}), $gte: new Date(startDate) };
  if (dateField && endDate) {
    filter[dateField] = { ...(filter[dateField] || {}), $lte: new Date(endDate + 'T23:59:59') };
  }

  const search = (sp.get('search') || '').trim();
  if (search && searchFields.length) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = searchFields.map((k) => ({ [k]: rx }));
  }

  const total = await Model.countDocuments(filter);

  const rows = (await sortedPage(Model, filter, sp, { page, perPage, keys: sortKeys, refs }))
    ?? await Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();

  /* Summary over the whole filtered set, not the page on screen - counting
     ten rows would give a different figure on every page. Cast the ids by
     hand: aggregate() does not run them through the schema. */
  const matchIds = { ...filter };
  idFields.forEach((k) => {
    if (typeof matchIds[k] === 'string' && isValidObjectId(matchIds[k])) {
      matchIds[k] = new Types.ObjectId(matchIds[k]);
    }
  });

  const [sums] = await Model.aggregate([
    { $match: matchIds },
    {
      $group: {
        _id: null,
        totalQty: { $sum: { $ifNull: ['$totalQty', 0] } },
        netValue: { $sum: { $ifNull: ['$netValue', 0] } },
      },
    },
  ]);

  return Response.json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    labels: await resolveRefLabels(rows),
    summary: {
      count: total,
      totalQty: Math.round(((sums && sums.totalQty) || 0) * 100) / 100,
      netValue: Math.round(((sums && sums.netValue) || 0) * 100) / 100,
    },
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}
