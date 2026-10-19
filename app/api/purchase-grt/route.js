import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grt from '@/models/Grt';
import Grc from '@/models/Grc';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextSeriesNumber } from '@/lib/docnumber';
import { FORM } from '@/app/admin/transaction/purchase/grt/form';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { sortedPage } from '@/lib/listSort';

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

/* /api/purchase-grt - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;
const GRT_PREFIX = 'TFJ/26/';
const GRT_START = 129;

/* Was a scan-for-the-highest-number-then-add-one, which two overlapping saves
   both read the same way and both used. nextSeriesNumber now takes the number
   from an atomic counter, seeded once from the highest already on disk - so
   the existing TFJ/26/xxxx series continues uninterrupted and two concurrent
   returns can no longer be issued the same number. */
async function nextGrtNumber({ businessId, locationId, finYear }) {
  return nextSeriesNumber(Grt, 'grtNo', GRT_PREFIX, {
    scope: { businessId, locationId, finYear },
    pad: 4,
    start: GRT_START,
  });
}

/* Column-header sort (19-10-2026): the GRC No and money columns as the list
   response below fills them in when a GRT does not store them itself. */
const grtSort = (pick) => ({
  select: 'grcNumber itemCount qty taxable gst netAmount items.grcId items.qty items.finalNet items.gst',
  prepare: async (docs) => {
    const ids = [...new Set(docs.filter((r) => !r.grcNumber).map((r) => r.items?.[0]?.grcId).filter((id) => id && isValidObjectId(id)).map(String))];
    const grcs = ids.length ? await Grc.find({ _id: { $in: ids } }).select('grcNumber').lean() : [];
    return new Map(grcs.map((g) => [String(g._id), g.grcNumber || '']));
  },
  value: (row, grcNo) => {
    const items = Array.isArray(row.items) ? row.items : [];
    const taxable = items.reduce((sum, item) => sum + (Number(item.finalNet) || 0) * (Number(item.qty) || 1), 0);
    const gst = items.reduce((sum, item) => sum + (Number(item.finalNet) || 0) * (Number(item.qty) || 1) * ((Number(item.gst) || 0) / 100), 0);
    const full = row.grcNumber && row.itemCount && row.taxable !== undefined;
    if (pick === 'grcNumber') return row.grcNumber || grcNo.get(String(items[0]?.grcId || '')) || '';
    if (pick === 'itemCount') return Number(full ? row.itemCount : (row.itemCount || items.length)) || 0;
    if (pick === 'qty') return Number(full ? row.qty : (row.qty || items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0))) || 0;
    if (pick === 'taxable') return Number(full ? row.taxable : (row.taxable || taxable)) || 0;
    if (pick === 'gst') return Number(full ? row.gst : (row.gst || gst)) || 0;
    return Number(full ? row.netAmount : (row.netAmount || taxable + gst)) || 0;
  },
});

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  /* Roles & Permissions (17-10-2026): GRT -> Read */
  {
    const denied = await screenDenial({ session, screen: SCREENS.GRT, label: 'GRT', action: PERM.READ, businessId: sp.get('business') });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  }

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;
  const sup = sp.get('supplierId'); if (sup && isValidObjectId(sup)) filter.supplierId = sup;

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.grtDate = { ...(filter.grtDate || {}), $gte: new Date(from) };
  if (to) filter.grtDate = { ...(filter.grtDate || {}), $lte: new Date(to + 'T23:59:59') };

  /* "unconverted" upstream documents: a GRC with no purchase invoice yet, a
     GRT with no debit note yet. $eq: null matches missing AND null - passing
     '' here would be cast against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ grtNo: rx }];
  }

  const total = await Grt.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(Grt, filter, sp, {
    page,
    perPage,
    keys: ['grtNo', 'grtDate'],
    refs: ['supplierId'],
    computed: {
      grcNumber: grtSort('grcNumber'),
      qty: grtSort('qty'),
      itemCount: grtSort('itemCount'),
      taxable: grtSort('taxable'),
      gst: grtSort('gst'),
      netAmount: grtSort('netAmount'),
    },
  })) ?? await Grt.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const enrichedRows = await Promise.all(rows.map(async (row) => {
    const items = Array.isArray(row.items) ? row.items : [];
    if (row.grcNumber && row.itemCount && row.taxable !== undefined) return row;
    const taxable = items.reduce((sum, item) => sum + (Number(item.finalNet) || 0) * (Number(item.qty) || 1), 0);
    const gst = items.reduce((sum, item) => {
      const itemTaxable = (Number(item.finalNet) || 0) * (Number(item.qty) || 1);
      return sum + itemTaxable * ((Number(item.gst) || 0) / 100);
    }, 0);
    let grcNumber = row.grcNumber || '';
    const sourceGrcId = items[0]?.grcId;
    if (!grcNumber && sourceGrcId && isValidObjectId(sourceGrcId)) {
      const sourceGrc = await Grc.findById(sourceGrcId).select('grcNumber').lean();
      grcNumber = sourceGrc?.grcNumber || '';
    }
    return { ...row, grcNumber, itemCount: row.itemCount || items.length, qty: row.qty || items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0), taxable: row.taxable || taxable, gst: row.gst || gst, netAmount: row.netAmount || taxable + gst };
  }));

  return json({
    rows: enrichedRows.map((r) => ({ ...r, _id: String(r._id) })),
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

  /* Roles & Permissions (17-10-2026): GRT -> Create */
  {
    const denied = await screenDenial({ session, screen: SCREENS.GRT, label: 'GRT', action: PERM.CREATE, businessId: body.business });
    if (denied) return json({ error: denied.message, code: denied.code }, 403);
  }

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  if (Array.isArray(body.data?.items)) {
    doc.items = body.data.items;
    doc.qty = body.data.items.reduce((sum, item) => sum + (Number(item.qty) || 1), 0);
    doc.itemCount = body.data.items.length;
    doc.taxable = body.data.items.reduce((sum, item) => sum + (Number(item.finalNet) || 0) * (Number(item.qty) || 1), 0);
    doc.gst = body.data.items.reduce((sum, item) => {
      const taxable = (Number(item.finalNet) || 0) * (Number(item.qty) || 1);
      return sum + taxable * ((Number(item.gst) || 0) / 100);
    }, 0);
    doc.netAmount = doc.taxable + doc.gst;
    const sourceGrcId = body.data.items[0]?.grcId;
    if (sourceGrcId && isValidObjectId(sourceGrcId)) {
      const sourceGrc = await Grc.findById(sourceGrcId).select('grcNumber').lean();
      if (sourceGrc?.grcNumber) doc.grcNumber = sourceGrc.grcNumber;
    }
  }
  if (!doc.grtDate) doc.grtDate = new Date();
  if (!Array.isArray(body.data?.items) || body.data.items.length === 0) {
    return json({ errors: { items: 'Select at least one vendor item.' } }, 422);
  }

  /* GRT sequence starts at TFJ/26/0129 and increments from the highest
     number already issued for this business, location and financial year. */
  if (!doc.grtNo) {
    doc.grtNo = await nextGrtNumber({
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await Grt.create(doc);

  return json({ ok: true, id: String(created._id) });
}
