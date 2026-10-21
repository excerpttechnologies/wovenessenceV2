import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import IcAutoPurchaseReceived from '@/models/IcAutoPurchaseReceived';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import Grc from '@/models/Grc';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { escapeRegex } from '@/lib/validate';
import { nextDocNumber, nextSeriesNumber } from '@/lib/docnumber';

/* /api/ic-auto-purchase-received

   GET  - the receipts this branch has already accepted.
   POST - accept a pending inter company sales invoice into stock.

   Accepting does three things in order:
     1. creates a real Goods Receipt Challan in THIS branch's scope, carrying
        the invoice's lines, so the goods enter the normal purchase flow
     2. writes the receipt record the lower list shows
     3. stamps receivedId on the invoice, which removes it from the pending
        list and blocks the sender from deleting it

   The invoice is claimed with a guarded update, the way Dispatch claims a
   consignment: two people hitting Receive at once must not produce two GRCs
   for one invoice. If the claim doesn't land, everything created here is
   rolled back and the caller gets a 409. */

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
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ recNo: rx }, { grcNo: rx }, { invoiceNo: rx }];
  }

  const total = await IcAutoPurchaseReceived.countDocuments(filter);
  const rows = await IcAutoPurchaseReceived.find(filter)
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

  const invoiceId = body.icSalesInvoiceId;
  if (!invoiceId || !isValidObjectId(invoiceId)) {
    return json({ error: 'Pick an invoice to receive.' }, 422);
  }

  const businessId = isValidObjectId(body.business) ? body.business : null;
  const locationId = isValidObjectId(body.location) ? body.location : null;
  const finYear = body.finYear || '';
  if (!businessId) return json({ error: 'No business selected.' }, 422);

  const invoice = await IcSalesInvoice.findById(invoiceId).lean();
  if (!invoice) return json({ error: 'Invoice not found' }, 404);
  if (invoice.receivedId) return json({ error: 'This invoice has already been received.' }, 409);

  /* it must actually be addressed to the branch doing the receiving */
  if (String(invoice.toBusinessId) !== String(businessId)) {
    return json({ error: 'This invoice is not addressed to the selected business.' }, 403);
  }

  const items = Array.isArray(invoice.items) ? invoice.items : [];

  /* ------------------------------------------------------------ 1. GRC -- */
  const grcPayload = {
    businessId,
    locationId,
    finYear,
    grcDate: new Date(),
    vendorDocNo: invoice.invoiceNo || '',
    taxable: invoice.taxableValue || 0,
    totalQuantity: invoice.totalQty || 0,
    gst: (invoice.igstTotal || 0) + (invoice.cgstTotal || 0) + (invoice.sgstTotal || 0),
    netAmount: invoice.netValue || 0,
    items,
  };
  grcPayload.grcNumber = await nextDocNumber(Grc, 'grcNumber', 'Goods Receipt Challan', {
    businessId, locationId, finYear,
  });
  const grc = await Grc.create(grcPayload);

  /* ------------------------------------------------------- 2. receipt -- */
  const [start] = String(finYear).split('-');
  const yy = (start || String(new Date().getFullYear())).slice(2);

  let received;
  try {
    received = await IcAutoPurchaseReceived.create({
      businessId,
      locationId,
      finYear,
      recNo: await nextSeriesNumber(IcAutoPurchaseReceived, 'recNo', 'REC/' + yy + '/', {
        scope: { businessId, finYear },
      }),
      date: new Date(),
      icSalesInvoiceId: invoice._id,
      invoiceNo: invoice.invoiceNo || '',
      grcId: grc._id,
      grcNo: grc.grcNumber,
      fromBusinessId: invoice.businessId,
      fromLocationId: invoice.locationId,
      totalQty: invoice.totalQty || 0,
      netValue: invoice.netValue || 0,
      items,
    });
  } catch (e) {
    await Grc.findByIdAndDelete(grc._id);
    return json({ error: 'Could not record the receipt.' }, 500);
  }

  /* --------------------------------------------------------- 3. claim -- */
  const claim = await IcSalesInvoice.updateMany(
    { _id: invoice._id, $or: [{ receivedId: null }, { receivedId: { $exists: false } }] },
    { $set: { receivedId: received._id } }
  );

  if (claim.modifiedCount !== 1) {
    /* someone received it between the read and the write - undo both */
    await IcAutoPurchaseReceived.findByIdAndDelete(received._id);
    await Grc.findByIdAndDelete(grc._id);
    return json({ error: 'This invoice was received by someone else. Refresh and try again.' }, 409);
  }

  return json({ ok: true, id: String(received._id), recNo: received.recNo, grcNo: grc.grcNumber });
}
