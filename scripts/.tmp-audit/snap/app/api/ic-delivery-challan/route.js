import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FIELDS, TOTAL_KEYS, computeTotals } from '@/app/admin/transaction/intercompanysell/deliverychallan/fields';

/* /api/ic-delivery-challan - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

/* Totals are RECOMPUTED here from the line items rather than trusted from the
   form, the way the Transport module handles freight. A request carrying its
   own taxableValue or netValue has those values ignored. */
function applyTotals(doc, body) {
  const items = Array.isArray(body.data?.items) ? body.data.items : [];
  const t = computeTotals(items, {
    discountPercent: body.data?.discountPercent,
    roundOffDiscountAmt: body.data?.roundOffDiscountAmt,
  });

  doc.items = items;
  doc.discountPercent = Number(body.data?.discountPercent) || 0;
  doc.roundOffDiscountAmt = Number(body.data?.roundOffDiscountAmt) || 0;
  doc.taxableValue = t.taxableValue;
  doc.igstTotal = t.igstTotal;
  doc.cgstTotal = t.cgstTotal;
  doc.sgstTotal = t.sgstTotal;
  doc.roundOff = t.roundOff;
  doc.totalQty = t.totalQty;
  doc.netValue = t.netValue;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  /* the Sales Invoice picker asks for one destination at a time */
  const tb = sp.get('toBusinessId'); if (tb && isValidObjectId(tb)) filter.toBusinessId = tb;
  const tl = sp.get('toLocationId'); if (tl && isValidObjectId(tl)) filter.toLocationId = tl;

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.dcDate = { ...(filter.dcDate || {}), $gte: new Date(from) };
  if (to) filter.dcDate = { ...(filter.dcDate || {}), $lte: new Date(to + 'T23:59:59') };

  /* "unconverted" challans: no inter company sales invoice raised yet.
     $eq: null matches missing AND null - passing '' here would be cast
     against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ dcNo: rx }, { customerGstn: rx }, { customerAddress: rx }];
  }

  const total = await IcDeliveryChallan.countDocuments(filter);
  const rows = await IcDeliveryChallan.find(filter)
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

  if (!Array.isArray(body.data?.items) || body.data.items.length === 0) {
    return json({ errors: { items: 'Add at least one item' } }, 422);
  }

  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  applyTotals(doc, body);

  /* document number from the Doc Setup master */
  if (!doc.dcNo) {
    doc.dcNo = await nextDocNumber(IcDeliveryChallan, 'dcNo', 'Inter Company Delivery Challan', {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await IcDeliveryChallan.create(doc);
  return json({ ok: true, id: String(created._id), dcNo: created.dcNo });
}
