import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import StockTransferReceived from '@/models/StockTransferReceived';
import StockTransferLocation from '@/models/StockTransferLocation';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';

/* /api/stock-transfer-received

   GET  - the transfers this location has already accepted.
   POST - accept a pending Stock Transfer Location into stock.

   Accepting is all-or-nothing: the whole transfer is taken in one action, so
   receivedQty equals sentQty and pendingQty is zero. The three figures are
   stored anyway, so switching this to partial receipt later needs no
   migration - only a quantity on the request and a different guard here.

   The transfer is claimed with a guarded update, the way Dispatch claims a
   consignment: two people hitting Receive at once must not produce two
   receipts for one transfer. If the claim doesn't land, the receipt created
   here is rolled back and the caller gets a 409. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;
const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

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

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ strCode: rx }, { packetNo: rx }];
  }

  const total = await StockTransferReceived.countDocuments(filter);
  const rows = await StockTransferReceived.find(filter)
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

  const transferId = body.stockTransferLocationId;
  if (!transferId || !isValidObjectId(transferId)) {
    return json({ error: 'Pick a transfer to receive.' }, 422);
  }

  const businessId = isValidObjectId(body.business) ? body.business : null;
  const locationId = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';
  if (!businessId) return json({ error: 'No business selected.' }, 422);
  if (!locationId) return json({ error: 'No location selected.' }, 422);

  const transfer = await StockTransferLocation.findById(transferId).lean();
  if (!transfer) return json({ error: 'Transfer not found' }, 404);
  if (transfer.receivedId) return json({ error: 'This transfer has already been received.' }, 409);

  /* it must actually be addressed to the location doing the receiving */
  if (String(transfer.toLocationId) !== String(locationId)) {
    return json({ error: 'This transfer is not addressed to the selected location.' }, 403);
  }

  const items = Array.isArray(transfer.items) ? transfer.items : [];
  const sentQty = num(transfer.totalQty);

  let received;
  try {
    received = await StockTransferReceived.create({
      businessId,
      locationId,
      finYear,
      strCode: await nextDocNumber(StockTransferReceived, 'strCode', 'Stock Transfer Received', {
        businessId, locationId, finYear,
      }),
      strDate: new Date(),

      stockTransferLocationId: transfer._id,
      packetNo: transfer.packetNo || '',

      fromLocationId: transfer.fromLocationId,
      fromGstn: transfer.fromGstn || '',
      toLocationId: transfer.toLocationId,
      toGstn: transfer.toGstn || '',
      toStockPointId: transfer.toStockPointId || null,

      /* all-or-nothing */
      sentQty,
      receivedQty: sentQty,
      pendingQty: 0,

      netValue: num(transfer.netValue),
      items,
    });
  } catch {
    return json({ error: 'Could not record the receipt.' }, 500);
  }

  const claim = await StockTransferLocation.updateMany(
    { _id: transfer._id, $or: [{ receivedId: null }, { receivedId: { $exists: false } }] },
    { $set: { receivedId: received._id } }
  );

  if (claim.modifiedCount !== 1) {
    /* someone received it between the read and the write - undo */
    await StockTransferReceived.findByIdAndDelete(received._id);
    return json({ error: 'This transfer was received by someone else. Refresh and try again.' }, 409);
  }

  return json({ ok: true, id: String(received._id), strCode: received.strCode });
}
