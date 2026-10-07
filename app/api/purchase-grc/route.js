import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Delivery from '@/models/Delivery';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { Supplier } from '@/lib/contacts';
import { grcMoney, headerGstIsAmount } from '@/lib/grcMoney';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { itemPriceErrors } from '@/lib/purchasePrice';
import { FORM } from '@/app/admin/transaction/purchase/grc/form';

/* header fields AND the totals rows - the totals card holds real stored
   numbers (taxable value, round off, net value, the editable discounts).
   Leaving them out meant validate() silently dropped them on every save. */
const FIELDS = (FORM.cards || []).flatMap((c) => {
  if (c.type === 'fields') return c.fields || [];
  if (c.type === 'source' && c.sourceKey) return [{ k: c.sourceKey, label: c.label, type: 'ref', req: c.req }];
  /* The Voucher Section's columns are stored inside voucherRows, so they are
     NOT header fields - except the ones marked `header: true` (Round Off),
     which the Edit screen reads off the header for Net Purchases Value. */
  if (c.type === 'voucher') return (c.fields || []).filter((f) => f.header);
  if (c.type === 'totals') {
    return (c.rows || []).flatMap((r) => [
      ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
      ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
    ]);
  }
  return [];
});

/* /api/purchase-grc - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  if (sp.get('availableLr') === '1') {
    const deliveryFilter = {};
    const business = sp.get('business');
    const location = sp.get('location');
    if (business && isValidObjectId(business)) deliveryFilter.businessId = business;
    if (location && isValidObjectId(location)) deliveryFilter.locationId = location;
    if (sp.get('finYear')) deliveryFilter.finYear = sp.get('finYear');
    if (sp.get('supplierId') && isValidObjectId(sp.get('supplierId'))) deliveryFilter.supplierId = sp.get('supplierId');
    const used = await Grc.find({
      ...(deliveryFilter.businessId ? { businessId: deliveryFilter.businessId } : {}),
      ...(deliveryFilter.locationId ? { locationId: deliveryFilter.locationId } : {}),
      ...(deliveryFilter.finYear ? { finYear: deliveryFilter.finYear } : {}),
      lrTransactionId: { $ne: null },
    }).select('lrTransactionId').lean();
    deliveryFilter._id = { $nin: used.map((r) => r.lrTransactionId) };
    const rows = await Delivery.find(deliveryFilter).sort({ createdAt: -1 }).limit(500).lean();

    /* ---- attach the vendor each LR belongs to -------------------------

       The LR dropdown shows "LR/26/011 | 64187 | G524 | KARNATAKA Saree
       Centre, MYSORE", so it needs the vendor's number and name. The
       delivery stores only supplierId, and that stays the case - the name is
       NOT copied onto the delivery, because a vendor renamed tomorrow would
       leave every stored copy wrong.

       Resolved in ONE query for the whole page rather than one per row: 500
       LRs would otherwise be 500 lookups. */
    const supplierIds = [...new Set(
      rows.map((r) => r.supplierId).filter((s) => s && isValidObjectId(String(s))).map(String)
    )];
    const suppliers = supplierIds.length
      ? await Supplier.find({ _id: { $in: supplierIds } })
        .select('contactId businessName firstName middleName lastName').lean()
      : [];

    const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

    /* businessName is empty on a vendor entered as a person, so fall back to
       the personal name - the same rule /api/options and lib/refLabels use. */
    const vendorNameOf = (s) => String(s.businessName || '').trim()
      || [s.firstName, s.middleName, s.lastName].map((p) => String(p || '').trim()).filter(Boolean).join(' ');

    return json({
      rows: rows.map((r) => {
        const s = supplierById.get(String(r.supplierId));
        return {
          ...r,
          _id: String(r._id),
          /* nested, so the caller can read the vendor as one thing; the
             delivery's own supplierId is untouched and still the reference */
          supplier: s
            ? { vendorNo: String(s.contactId || ''), vendorName: vendorNameOf(s) }
            : null,
        };
      }),
    });
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
  if (from) filter.grcDate = { ...(filter.grcDate || {}), $gte: new Date(from) };
  if (to) filter.grcDate = { ...(filter.grcDate || {}), $lte: new Date(to + 'T23:59:59') };

  /* "unconverted" upstream documents: a GRC with no purchase invoice yet, a
     GRT with no debit note yet. $eq: null matches missing AND null - passing
     '' here would be cast against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ grcNumber: rx }];
  }

  const total = await Grc.countDocuments(filter);
  const rows = await Grc.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const labels = await resolveRefLabels(rows);

  /* ---- the money the list shows: TAXABLE + GST = NET AMOUNT -------------

     Worked out in lib/grcMoney.js, the one place the save route, this list,
     the GRC screen and the print view all read their arithmetic from, in the
     order the business rule states: the net amount the header stores, then
     the GST AMOUNT, then taxable = net amount - GST. Nothing is written back:
     the stored header - its prices, quantities, GST rates and net amount -
     is left exactly as it is.

     Barcode rows are read only for the headers that need them: one whose GST
     is already an amount (every header the current save route writes, and
     every imported one) resolves from itself, so the usual page costs no
     extra query at all. A pre-2026-09-17 header, which holds a sum of GST
     PERCENTAGES rather than an amount, has its GST worked out from the GST
     RATE ITS OWN ROWS CARRY - never a rate assumed here. */
  const needRows = rows.filter((r) => !headerGstIsAmount(r)).map((r) => String(r._id));
  const rowsByGrc = new Map();
  if (needRows.length) {
    const labelRows = await BarcodeLabel.find({ grcId: { $in: needRows } })
      .select('grcId gst qty qtyNum finalNet purRate').lean();
    labelRows.forEach((row) => {
      const key = String(row.grcId);
      if (!rowsByGrc.has(key)) rowsByGrc.set(key, []);
      rowsByGrc.get(key).push(row);
    });
  }

  const pricedRows = rows.map((r) => {
    const money = grcMoney(r, rowsByGrc.get(String(r._id)));
    return {
      ...r,
      _id: String(r._id),
      supplierName: labels[String(r.supplierId)] || '',
      /* all three from the same resolution, so the columns add up */
      taxable: money.taxable,
      netAmount: money.netAmount,
      gst: money.gst,
      /* the name the GST column reads; `gst` above carries the same amount */
      gstAmount: money.gst,
    };
  });

  return json({
    rows: pricedRows,
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
  /* coerce() spells an empty number as null; Round Off's own default is 0, and
     "no adjustment" is 0, not "unknown". Keeps the stored shape honest. */
  if (doc.roundOff == null) doc.roundOff = 0;
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
  if (body.finYear) doc.finYear = body.finYear;

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;
  if (Array.isArray(body.data?.voucherRows)) doc.voucherRows = body.data.voucherRows;

  /* A priced GRC line must carry a real price - the rule Barcode Generation
     applies (lib/purchasePrice.js), refused here before anything is written
     so it cannot be sent round the screens. */
  const priceProblems = itemPriceErrors(doc.items);
  if (priceProblems.length) {
    return json({
      errors: { items: priceProblems[0].problem },
      error: priceProblems[0].problem,
      details: priceProblems.slice(0, 5).map((p) => `${p.ref}: ${p.problem}`),
    }, 422);
  }

  /* ---- the vendor and the LR are re-established from the DATABASE --------

     Everything below re-reads what the browser sent and checks it against the
     masters. The form is a convenience; it is not a source of truth, and a
     request that names a vendor and an LR belonging to someone else has to be
     refused whether it came from a mistake or a hand-rolled POST.

     The order matters: each check produces a message naming the field the
     operator has to correct. */

  if (!doc.supplierId || !isValidObjectId(String(doc.supplierId))) {
    return json({ errors: { supplierId: 'Choose a vendor.' } }, 422);
  }
  if (!doc.lrTransactionId || !isValidObjectId(String(doc.lrTransactionId))) {
    return json({ errors: { lrTransactionId: 'Choose an LR / Transaction.' } }, 422);
  }

  /* the vendor must exist, be a supplier, and belong to this business - not
     another company's vendor list */
  const supplier = await Supplier.findById(doc.supplierId)
    .select('contactKind businessName firstName lastName contactId gstNo businessId').lean();
  if (!supplier) {
    return json({ errors: { supplierId: 'That vendor no longer exists.' } }, 422);
  }
  if (supplier.contactKind !== 'Supplier') {
    return json({ errors: { supplierId: 'That contact is not a vendor.' } }, 422);
  }
  if (doc.businessId && supplier.businessId && String(supplier.businessId) !== String(doc.businessId)) {
    return json({ errors: { supplierId: 'That vendor belongs to a different business.' } }, 422);
  }

  const delivery = await Delivery.findById(doc.lrTransactionId)
    .select('supplierId transactionNo invPmNumber businessId freightAmount').lean();
  if (!delivery) return json({ errors: { lrTransactionId: 'Selected LR / Transaction was not found.' } }, 422);

  if (String(delivery.supplierId) !== String(doc.supplierId)) {
    return json({ errors: { lrTransactionId: 'Selected LR does not belong to this vendor.' } }, 422);
  }
  if (doc.businessId && delivery.businessId && String(delivery.businessId) !== String(doc.businessId)) {
    return json({ errors: { lrTransactionId: 'That LR belongs to a different business.' } }, 422);
  }

  /* One LR, one GRC. Scoped to the business so two companies cannot block
     each other, and `$ne: null` so a row that somehow has no LR does not
     match every incoming request and refuse them all. */
  const duplicate = await Grc.findOne({
    lrTransactionId: doc.lrTransactionId,
    ...(doc.businessId ? { businessId: doc.businessId } : {}),
  }).select('grcNumber').lean();
  if (duplicate) {
    return json({
      errors: {
        lrTransactionId: 'This LR already has a GRC'
          + (duplicate.grcNumber ? ' (' + duplicate.grcNumber + ')' : '') + '.',
      },
    }, 422);
  }

  /* Copied off the delivery rather than trusted from the form, so the GRC
     always agrees with the LR it was raised against. */
  doc.lrTransactionNo = delivery.transactionNo || '';
  if (!doc.vendorDocNo) doc.vendorDocNo = delivery.invPmNumber || '';
  /* the vendor's GST is a snapshot of the master at the time of receipt */
  if (!doc.vendorGstNo) doc.vendorGstNo = supplier.gstNo || '';

  /* The invoice number is mandatory, but it is checked HERE - after the LR
     has been read - rather than up front. Requiring it before the LR was
     resolved rejected every GRC whose invoice the system was about to supply
     itself, which is the opposite of "Auto fetched from LR". It is only a
     real error when the LR carries no invoice number either. */
  if (!String(doc.vendorDocNo || '').trim()) {
    return json({
      errors: {
        vendorDocNo: 'LR ' + (delivery.transactionNo || '') +
          ' has no invoice number recorded, so enter it here.',
      },
    }, 422);
  }

  /* document number from the Doc Setup master */
  if (!doc.grcNumber) {
    doc.grcNumber = await nextDocNumber(Grc, 'grcNumber', "Goods Receipt Challan", {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await Grc.create(doc);

  return json({ ok: true, id: String(created._id), grcNumber: created.grcNumber });
}
