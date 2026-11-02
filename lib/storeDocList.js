import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveRefLabels } from '@/lib/refLabels';
import { escapeRegex } from '@/lib/validate';
import { sortedPage } from '@/lib/listSort';
import { groupBusinessIds } from '@/lib/storeLocations';

/* ==========================================================================
   THE LIST ENDPOINT for all four Inter Store Sell documents.

   Written once rather than four times because the four lists differ only in
   their model, their date column and what they search - and four copies of a
   filter builder is how one screen quietly stops honouring the financial year
   the others respect.

   WHICH STORE THE TOP BAR IS ON. Every Inter Store document names TWO stores:
   the one that sent it and the one it went to. The top bar's location is one
   of them, and the operator standing in either store has a reason to see the
   document - the seller to invoice it, the buyer to receive, adjust or return
   it. Filtering on `locationId` alone returned only the sending side, which is
   why selecting the buying store emptied the list.

   ALONG WHICH BRANCH. The two ends of a transfer can sit in different branches
   of the same company (a business row is a branch: Business.parentBusinessId -
   see lib/storeLocations.js). A document's `businessId` is the branch that
   raised it, so the same strict `businessId = top bar` filter hid every
   document the selected branch was the RECEIVING end of. The scope is the
   company group instead: this branch, its main branch and the main branch's
   other children. An unrelated company still cannot be read through a URL.

   The location match itself is NOT relaxed - a document must still name the
   selected store at one of its ends. An operator on a store with no transfers
   gets an empty list, which is the truth.

   `module` is applied as a second guard on top of the group scope: the four
   modules keep their records in their own collections anyway.
   ========================================================================== */

const PER_PAGE = 10;

/* aggregate() does not run a filter through the schema, so ids have to be
   cast by hand - including the ones nested inside $and / $or. */
const castIds = (node) => {
  if (Array.isArray(node)) return node.map(castIds);
  if (!node || typeof node !== 'object') return node;
  if (node instanceof Date || node instanceof RegExp || node instanceof Types.ObjectId) return node;
  const out = {};
  for (const [k, v] of Object.entries(node)) {
    if (typeof v === 'string' && /Id$/.test(k) && isValidObjectId(v)) out[k] = new Types.ObjectId(v);
    else out[k] = castIds(v);
  }
  return out;
};

export async function listStoreDocs(req, {
  Model,
  screen,
  label,
  dateField,
  searchFields = [],
  sortKeys = [],
  refs = [],
  /* the document's two store ends. Challans and invoices are raised BY
     `locationId` and addressed TO `toLocationId`; a debit note and a return
     are the other way round - `locationId` is the store raising them and
     `fromLocationId` the store they belong to. */
  fromField = 'locationId',
  toField = 'toLocationId',
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
  /* $or belongs to the search box below; everything else that needs one is
     collected in $and so the two cannot overwrite each other. */
  const and = [];

  const b = sp.get('business');
  if (b && isValidObjectId(b)) {
    const group = await groupBusinessIds(b);
    const ids = (group.length ? group : [b]).map((id) => new Types.ObjectId(String(id)));
    filter.businessId = { $in: ids };
  }

  const y = sp.get('finYear'); if (y) filter.finYear = y;

  /* the top bar's store, matched against EITHER end of the document */
  const l = sp.get('location');
  if (l && isValidObjectId(l)) {
    const ends = [fromField, toField].filter(Boolean);
    if (ends.length > 1) {
      and.push({ $or: ends.map((f) => ({ [f]: new Types.ObjectId(l) })) });
    } else {
      and.push({ [ends[0]]: new Types.ObjectId(l) });
    }
  }

  /* explicit filters, mapped onto the fields this module actually stores */
  const from = sp.get('fromLocationId');
  if (from && isValidObjectId(from) && fromField) filter[fromField] = new Types.ObjectId(from);
  const to = sp.get('toLocationId');
  if (to && isValidObjectId(to) && toField) filter[toField] = new Types.ObjectId(to);

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
    and.push({ $or: searchFields.map((k) => ({ [k]: rx })) });
  }

  if (and.length) filter.$and = and;

  const total = await Model.countDocuments(filter);

  const rows = (await sortedPage(Model, filter, sp, { page, perPage, keys: sortKeys, refs }))
    ?? await Model.find(filter).sort({ createdAt: -1 }).skip((page - 1) * perPage).limit(perPage).lean();

  /* Summary over the whole filtered set, not the page on screen - counting
     ten rows would give a different figure on every page. */
  const [sums] = await Model.aggregate([
    { $match: castIds(filter) },
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
