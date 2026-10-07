import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import IcDeliveryChallan from '@/models/IcDeliveryChallan';
import Business from '@/models/Business';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FIELDS, linesFromChallans, invoiceTotals } from '@/app/admin/transaction/intercompanysell/salesinvoice/fields';

/* /api/ic-sales-invoice - list + create.

   Creating an invoice CLAIMS the delivery challans it consumes: each gets
   its icSalesInvoiceId stamped, which removes it from the next invoice's
   picker. The claim is re-checked at write time and rolled back on a clash -
   the same guard the Dispatch module puts around consignments, for the same
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
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
  const y = sp.get('finYear'); if (y) filter.finYear = y;

  const tb = sp.get('toBusinessId'); if (tb && isValidObjectId(tb)) filter.toBusinessId = tb;
  const tl = sp.get('toLocationId'); if (tl && isValidObjectId(tl)) filter.toLocationId = tl;

  /* Auto Purchases Received reads this endpoint from the RECEIVING side:
     invoices addressed to me, that I have not accepted into stock yet. */
  const inbox = sp.get('inbox');
  if (inbox && isValidObjectId(inbox)) {
    delete filter.businessId;
    delete filter.locationId;
    filter.toBusinessId = inbox;
  }

  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.invoiceDate = { ...(filter.invoiceDate || {}), $gte: new Date(from) };
  if (to) filter.invoiceDate = { ...(filter.invoiceDate || {}), $lte: new Date(to + 'T23:59:59') };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ invoiceNo: rx }, { customerName: rx }, { irn: rx }];
  }

  const total = await IcSalesInvoice.countDocuments(filter);
  const rows = await IcSalesInvoice.find(filter)
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

  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  const ids = (body.data?.icDeliveryChallanIds || []).filter((v) => isValidObjectId(v));
  if (!ids.length) {
    return json({ errors: { icDeliveryChallanIds: 'Select at least one delivery challan' } }, 422);
  }

  /* Only challans nobody has invoiced can be pulled in. Re-checked here
     rather than trusted from the picker. */
  const available = await IcDeliveryChallan.find({
    _id: { $in: ids },
    toBusinessId: doc.toBusinessId,
    toLocationId: doc.toLocationId,
    $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }],
  }).lean();

  if (available.length !== ids.length) {
    const free = new Set(available.map((c) => String(c._id)));
    const taken = ids.filter((i) => !free.has(String(i)));
    return json({
      errors: {
        icDeliveryChallanIds:
          taken.length + ' of the selected challans are already on another invoice. Refresh and try again.',
      },
    }, 422);
  }

  /* lines are copied across as stored - they were computed and validated
     when each challan was raised */
  const items = linesFromChallans(available);
  const totals = invoiceTotals(items);

  doc.icDeliveryChallanIds = available.map((c) => c._id);
  doc.items = items;
  doc.taxableValue = totals.taxableValue;
  doc.igstTotal = totals.igstTotal;
  doc.cgstTotal = totals.cgstTotal;
  doc.sgstTotal = totals.sgstTotal;
  doc.roundOff = totals.roundOff;
  doc.totalQty = totals.totalQty;
  doc.netValue = totals.netValue;

  /* the buyer block on the printed invoice, copied at issue time so a later
     edit to that business never rewrites an issued document */
  const dest = await Business.findById(doc.toBusinessId).lean();
  doc.customerName = dest?.name || '';
  doc.customerGstn = dest?.gstin || available[0]?.customerGstn || '';
  doc.customerAddress = [dest?.addressLine1, dest?.addressLine2, dest?.city]
    .filter(Boolean).join(', ') || available[0]?.customerAddress || '';

  if (!doc.invoiceDate) doc.invoiceDate = new Date();

  if (!doc.invoiceNo) {
    doc.invoiceNo = await nextDocNumber(IcSalesInvoice, 'invoiceNo', 'Inter Company Sales Invoice', {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await IcSalesInvoice.create(doc);

  /* claim them - guarded again so a concurrent invoice can't double-book */
  const claim = await IcDeliveryChallan.updateMany(
    {
      _id: { $in: doc.icDeliveryChallanIds },
      $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }],
    },
    { $set: { icSalesInvoiceId: created._id } }
  );

  if (claim.modifiedCount !== doc.icDeliveryChallanIds.length) {
    /* someone got there first between the check and the write - undo */
    await IcDeliveryChallan.updateMany(
      { icSalesInvoiceId: created._id },
      { $set: { icSalesInvoiceId: null } }
    );
    await IcSalesInvoice.findByIdAndDelete(created._id);
    return json({
      errors: { icDeliveryChallanIds: 'A challan was taken by another invoice. Refresh and try again.' },
    }, 409);
  }

  return json({ ok: true, id: String(created._id), invoiceNo: created.invoiceNo });
}
