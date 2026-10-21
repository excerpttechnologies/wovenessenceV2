import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransferLocation from '@/models/StockTransferLocation';
import StockTransferPacket from '@/models/StockTransferPacket';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FIELDS, linesFromPackets, locationTotals } from '@/app/admin/transaction/stocktransfers/transferstocklocation/fields';

/* /api/stock-transfer-location - list + create.

   Creating a transfer CLAIMS the packets it consolidates: each gets its
   stockTransferLocationId stamped, which removes it from the next transfer's
   picker. The claim is re-checked at write time and rolled back on a clash -
   the same guard IcSalesInvoice puts around delivery challans, for the same
   reason: the list the browser fetched may be seconds stale. */

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
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  const fl = sp.get('fromLocationId'); if (fl && isValidObjectId(fl)) filter.fromLocationId = fl;
  const tl = sp.get('toLocationId'); if (tl && isValidObjectId(tl)) filter.toLocationId = tl;

  /* Transfer Stock Received reads this endpoint from the RECEIVING side:
     transfers addressed to me that I have not accepted into stock yet. The
     source constraint is dropped - the whole point is that someone ELSE
     raised these. */
  const inbox = sp.get('inbox');
  if (inbox && isValidObjectId(inbox)) {
    delete filter.fromLocationId;
    filter.toLocationId = inbox;
  }

  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.stlDate = { ...(filter.stlDate || {}), $gte: new Date(from) };
  if (to) filter.stlDate = { ...(filter.stlDate || {}), $lte: new Date(to + 'T23:59:59') };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ packetNo: rx }, { fromGstn: rx }, { toGstn: rx }];
  }

  const total = await StockTransferLocation.countDocuments(filter);
  const rows = await StockTransferLocation.find(filter)
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

  if (String(doc.fromLocationId) === String(doc.toLocationId)) {
    return json({
      errors: { toLocationId: 'The destination must be a different location from the source.' },
    }, 422);
  }

  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  const ids = (body.data?.packetIds || []).filter((v) => isValidObjectId(v));
  if (!ids.length) {
    return json({ errors: { packetIds: 'Select at least one stock transfer packet' } }, 422);
  }

  /* Only packets nobody has consolidated can be pulled in, and only ones that
     actually run between the two locations chosen on this form. Re-checked
     here rather than trusted from the picker. */
  const available = await StockTransferPacket.find({
    _id: { $in: ids },
    fromLocationId: doc.fromLocationId,
    toLocationId: doc.toLocationId,
    $or: [{ stockTransferLocationId: null }, { stockTransferLocationId: { $exists: false } }],
  }).lean();

  if (available.length !== ids.length) {
    const free = new Set(available.map((p) => String(p._id)));
    const taken = ids.filter((i) => !free.has(String(i)));
    return json({
      errors: {
        packetIds:
          taken.length + ' of the selected packets are already on another transfer. Refresh and try again.',
      },
    }, 422);
  }

  /* lines are copied across as stored - they were computed and validated when
     each packet was raised */
  const items = linesFromPackets(available);
  const totals = locationTotals(items);

  doc.packetIds = available.map((p) => p._id);
  doc.items = items;
  doc.totalQty = totals.totalQty;
  doc.taxableValue = totals.taxableValue;
  doc.igstTotal = totals.igstTotal;
  doc.cgstTotal = totals.cgstTotal;
  doc.sgstTotal = totals.sgstTotal;
  doc.roundOff = totals.roundOff;
  doc.netValue = totals.netValue;

  /* address block, copied at issue time so a later edit to a location never
     rewrites an issued transfer */
  const [from, to] = await Promise.all([
    CompanyLocation.findById(doc.fromLocationId).lean(),
    CompanyLocation.findById(doc.toLocationId).lean(),
  ]);
  const addr = (l) => [l?.addressLine1, l?.addressLine2, l?.city].filter(Boolean).join(', ');

  doc.fromGstn = from?.gstin || '';
  doc.fromAddress = addr(from);
  doc.fromState = from?.state || '';
  doc.toGstn = to?.gstin || '';
  doc.toAddress = addr(to);
  doc.toState = to?.state || '';

  if (!doc.stlDate) doc.stlDate = new Date();

  if (!doc.packetNo) {
    doc.packetNo = await nextDocNumber(StockTransferLocation, 'packetNo', 'Stock Transfer Location', {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await StockTransferLocation.create(doc);

  /* claim them - guarded again so a concurrent transfer can't double-book */
  const claim = await StockTransferPacket.updateMany(
    {
      _id: { $in: doc.packetIds },
      $or: [{ stockTransferLocationId: null }, { stockTransferLocationId: { $exists: false } }],
    },
    { $set: { stockTransferLocationId: created._id } }
  );

  if (claim.modifiedCount !== doc.packetIds.length) {
    /* someone got there first between the check and the write - undo */
    await StockTransferPacket.updateMany(
      { stockTransferLocationId: created._id },
      { $set: { stockTransferLocationId: null } }
    );
    await StockTransferLocation.findByIdAndDelete(created._id);
    return json({
      errors: { packetIds: 'A packet was taken by another transfer. Refresh and try again.' },
    }, 409);
  }

  return json({ ok: true, id: String(created._id), packetNo: created.packetNo });
}
