import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransferPacket from '@/models/StockTransferPacket';
import CompanyLocation from '@/models/CompanyLocation';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FIELDS, computeTotals } from '@/app/admin/transaction/stocktransfers/transferstockpacket/fields';

/* /api/stock-transfer-packet - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

/* Totals are RECOMPUTED here from the line items rather than trusted from the
   form. A request carrying its own netValue has that value ignored. */
function applyTotals(doc, body) {
  const items = Array.isArray(body.data?.items) ? body.data.items : [];
  const t = computeTotals(items);

  doc.items = items;
  doc.totalQty = t.totalQty;
  doc.taxableValue = t.taxableValue;
  doc.igstTotal = t.igstTotal;
  doc.cgstTotal = t.cgstTotal;
  doc.sgstTotal = t.sgstTotal;
  doc.netValue = t.netValue;
}

/* Address and GSTIN are copied off the two locations at save time, so a later
   edit to a location never rewrites an issued packet. */
async function stampLocations(doc) {
  const [from, to] = await Promise.all([
    doc.fromLocationId ? CompanyLocation.findById(doc.fromLocationId).lean() : null,
    doc.toLocationId ? CompanyLocation.findById(doc.toLocationId).lean() : null,
  ]);

  const addr = (l) => [l?.addressLine1, l?.addressLine2, l?.city].filter(Boolean).join(', ');

  doc.fromGstn = from?.gstin || '';
  doc.fromAddress = addr(from);
  doc.fromState = from?.state || '';
  doc.toGstn = to?.gstin || '';
  doc.toAddress = addr(to);
  doc.toState = to?.state || '';
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
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  /* the Add Location picker asks for one From -> To pair at a time */
  const fl = sp.get('fromLocationId'); if (fl && isValidObjectId(fl)) filter.fromLocationId = fl;
  const tl = sp.get('toLocationId'); if (tl && isValidObjectId(tl)) filter.toLocationId = tl;

  /* "unconverted" packets: no stock transfer location raised yet.
     $eq: null matches missing AND null - passing '' here would be cast
     against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.stpDate = { ...(filter.stpDate || {}), $gte: new Date(from) };
  if (to) filter.stpDate = { ...(filter.stpDate || {}), $lte: new Date(to + 'T23:59:59') };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ packetNo: rx }, { fromGstn: rx }, { toGstn: rx }];
  }

  const total = await StockTransferPacket.countDocuments(filter);
  const rows = await StockTransferPacket.find(filter)
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

  /* a packet that goes nowhere is a data-entry slip, not a transfer */
  if (String(doc.fromLocationId) === String(doc.toLocationId)) {
    return json({
      errors: { toLocationId: 'The destination must be a different location from the source.' },
    }, 422);
  }

  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  applyTotals(doc, body);
  await stampLocations(doc);

  /* document number from the Doc Setup master */
  if (!doc.packetNo) {
    doc.packetNo = await nextDocNumber(StockTransferPacket, 'packetNo', 'Stock Transfer Packet', {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await StockTransferPacket.create(doc);
  return json({ ok: true, id: String(created._id), packetNo: created.packetNo });
}
