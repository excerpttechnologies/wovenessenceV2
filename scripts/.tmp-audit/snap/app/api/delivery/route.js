// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import Delivery from '@/models/Delivery';
// import Transporter from '@/models/Transporter';
// import Contact from '@/models/Contact';
// import { requireSession } from '@/lib/session';
// import { validate, escapeRegex } from '@/lib/validate';
// import { FIELDS, DERIVED_FIELDS, freightBreakdown } from '@/app/admin/transport/delivery/fields';

// /* /api/delivery - Delivery / LR transactions: list + create. */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const PER_PAGE = 100;

// /* LR/<financial year short>/<running number>, e.g. LR/26/003.
//    Scoped by business and financial year so two tenants never interleave. */
// async function nextTransactionNo({ businessId, finYear }) {
//   const [start] = String(finYear || '').split('-');
//   const yy = (start || String(new Date().getFullYear())).slice(2);
//   const prefix = 'LR/' + yy + '/';

//   const used = await Delivery.countDocuments({
//     transactionNo: { $regex: '^' + escapeRegex(prefix) },
//     ...(businessId ? { businessId } : {}),
//     ...(finYear ? { finYear } : {}),
//   });

//   return prefix + String(used + 1).padStart(3, '0');
// }

// /* The list shows transporter and supplier names, not ids. */
// async function resolveNames(rows) {
//   const labels = {};
//   const tIds = [...new Set(rows.map((r) => r.transporterId).filter(Boolean).map(String))];
//   const sIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean).map(String))];

//   const [transporters, suppliers] = await Promise.all([
//     tIds.length ? Transporter.find({ _id: { $in: tIds } }).lean() : [],
//     sIds.length ? Contact.find({ _id: { $in: sIds } }).lean() : [],
//   ]);

//   transporters.forEach((t) => { labels[String(t._id)] = t.transporterName || t.transporterCode || ''; });
//   suppliers.forEach((c) => {
//     labels[String(c._id)] = c.businessName
//       || [c.firstName, c.lastName].filter(Boolean).join(' ')
//       || '';
//   });

//   return labels;
// }

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   await dbConnect();

//   const page = Math.max(1, Number(sp.get('page') || 1));
//   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

//   const filter = {};
//   const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
//   const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;
//   const y = sp.get('finYear'); if (y) filter.finYear = y;

//   /* the Filter card above the list */
//   const from = sp.get('startDate');
//   const to = sp.get('endDate');
//   if (from) filter.transactionDate = { ...(filter.transactionDate || {}), $gte: new Date(from) };
//   if (to) filter.transactionDate = { ...(filter.transactionDate || {}), $lte: new Date(to + 'T23:59:59') };

//   const search = (sp.get('search') || '').trim();
//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     /* "Search transaction, LR or supplier" - supplier is matched by resolving
//        names to ids first, since the name lives on the contact */
//     const supplierIds = await Contact.find({
//       $or: [{ businessName: rx }, { firstName: rx }, { lastName: rx }],
//     }).select('_id').lean();

//     filter.$or = [
//       { transactionNo: rx },
//       { lrNumber: rx },
//       { invPmNumber: rx },
//       ...(supplierIds.length ? [{ supplierId: { $in: supplierIds.map((s) => s._id) } }] : []),
//     ];
//   }

//   const total = await Delivery.countDocuments(filter);
//   const rows = await Delivery.find(filter)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .lean();

//   return json({
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//     labels: await resolveNames(rows),
//     total,
//     page,
//     pages: Math.max(1, Math.ceil(total / perPage)),
//     perPage,
//   });
// }

// export async function POST(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const body = await req.json();
//   await dbConnect();

//   const { errors, doc, ok } = validate(FIELDS, body.data || {});
//   if (!ok) return json({ errors }, 422);

//   if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
//   if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;
//   if (body.finYear) doc.finYear = body.finYear;

//   /* recomputed here rather than trusted from the dialog */
//   const totals = freightBreakdown(doc);
//   DERIVED_FIELDS.forEach((f) => { doc[f.k] = totals[f.k]; });

//   doc.transactionNo = await nextTransactionNo({
//     businessId: doc.businessId, finYear: doc.finYear,
//   });

//   const created = await Delivery.create(doc);
//   return json({ ok: true, id: String(created._id), transactionNo: created.transactionNo });
// }










import { isValidObjectId } from 'mongoose';
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Delivery from '@/models/Delivery';
import Transporter from '@/models/Transporter';
import Contact from '@/models/Contact';
import Dispatch from '@/models/Dispatch';
import Grc from '@/models/Grc';
import { requireSession } from '@/lib/session';
import { validate, escapeRegex } from '@/lib/validate';
import { nextSeriesNumber, previewSeriesNumber, raiseSeriesFloor } from '@/lib/docnumber';
import { FIELDS, DERIVED_FIELDS, freightBreakdown } from '@/app/admin/transport/delivery/fields';

/* /api/delivery - Delivery / LR transactions: list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 100;

/* LR/<financial year short>/<running number>, e.g. LR/26/003.
   Scoped by business and financial year so two tenants never interleave. */
function seriesPrefix(finYear) {
  const [start] = String(finYear || '').split('-');
  return 'LR/' + (start || String(new Date().getFullYear())).slice(2) + '/';
}

function seriesScope({ businessId, locationId, finYear }) {
  return {
    ...(businessId ? { businessId } : {}),
    ...(locationId ? { locationId } : {}),
    ...(finYear ? { finYear } : {}),
  };
}

/* CONSUMES a number. Only the create path may call this.

   highest-so-far, not a count: deleting one transaction must not make the
   next one collide with a number already in use. */
async function nextTransactionNo({ businessId, locationId, finYear }, session = null) {
  return nextSeriesNumber(Delivery, 'transactionNo', seriesPrefix(finYear), {
    scope: seriesScope({ businessId, locationId, finYear }),
  }, session);
}

/* Shows a number without consuming one - see previewSeriesNumber. What comes
   back is a hint for the Add dialog, not a reservation: it is deliberately
   NOT stored, and the number actually saved is reserved at save time. */
async function previewTransactionNo({ businessId, locationId, finYear }) {
  return previewSeriesNumber(Delivery, 'transactionNo', seriesPrefix(finYear), {
    scope: seriesScope({ businessId, locationId, finYear }),
  });
}

/* A Transaction No typed by hand never went through the counter, so push the
   counter past it - otherwise the next auto number walks into a live one. */
async function claimManualTransactionNo({ transactionNo, businessId, locationId, finYear }, session = null) {
  const prefix = seriesPrefix(finYear);
  if (!String(transactionNo || '').startsWith(prefix)) return;

  const n = parseInt(String(transactionNo).slice(prefix.length).match(/^\d+/)?.[0] ?? '', 10);
  if (!Number.isNaN(n)) await raiseSeriesFloor(prefix, { scope: seriesScope({ businessId, locationId, finYear }) }, n, session);
}

/* The list shows transporter and supplier names, not ids. */
async function resolveNames(rows) {
  const labels = {};
  const tIds = [...new Set(rows.map((r) => r.transporterId).filter(Boolean).map(String))];
  const sIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean).map(String))];
  const dIds = [...new Set(rows.map((r) => r.dispatchId).filter(Boolean).map(String))];

  const [transporters, suppliers, dispatches] = await Promise.all([
    tIds.length ? Transporter.find({ _id: { $in: tIds } }).lean() : [],
    sIds.length ? Contact.find({ _id: { $in: sIds } }).select('contactId businessName firstName middleName lastName gstNo').lean() : [],
    dIds.length ? Dispatch.find({ _id: { $in: dIds } }).lean() : [],
  ]);

  dispatches.forEach((d) => { labels[String(d._id)] = d.docNo || ''; });

  transporters.forEach((t) => { labels[String(t._id)] = t.transporterName || t.transporterCode || ''; });
  suppliers.forEach((c) => {
    const name = String(c.businessName || '').trim()
      || [c.firstName, c.lastName].filter(Boolean).map((p) => String(p).trim()).join(' ')
      || '';
    const code = String(c.contactId || '').trim();
    /* Show "KARNATAKA Saree Centre, MYSORE (G524)" — same format the
       supplier dropdown uses, so what the user picks matches what the list shows. */
    labels[String(c._id)] = code ? name + ' (' + code + ')' : name;
  });

  return labels;
}

/* Resolve supplier contact IDs for delivery rows */
async function resolveSupplierContactIds(rows) {
  const supplierContactIds = {};
  const sIds = [...new Set(rows.map((r) => r.supplierId).filter(Boolean).map(String))];

  if (sIds.length === 0) return supplierContactIds;

  const suppliers = await Contact.find({ _id: { $in: sIds } })
    .select('contactId')
    .lean();

  suppliers.forEach((s) => {
    supplierContactIds[String(s._id)] = s.contactId || '';
  });

  return supplierContactIds;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  /* Preview only. This is a GET, and a GET must not move the sequence: the
     dialog asks what the next number looks like, it does not reserve it.
     `preview` is on the response so a caller cannot mistake it for one. */
  if (sp.get('nextNumber') === '1') {
    const businessId = sp.get('business');
    const locationId = sp.get('location');
    return json({
      preview: true,
      transactionNo: await previewTransactionNo({
        businessId: businessId && isValidObjectId(businessId) ? businessId : null,
        locationId: locationId && isValidObjectId(locationId) ? locationId : null,
        finYear: sp.get('finYear') || '',
      }),
    });
  }

  /* Available LR for GRC - returns only deliveries that have NOT yet had a
     GRC raised against them.

     One LR → one GRC is enforced by the POST handler, so the moment a GRC
     is created its lrTransactionId appears in the GRC collection and the
     delivery must leave this dropdown.  Without this exclusion every
     already-converted LR kept showing here, letting the operator attempt to
     raise a second GRC and only finding out at submit time. */
  if (sp.get('availableLr') === '1') {
    const deliveryFilter = {};
    const business = sp.get('business');
    const location = sp.get('location');
    if (business && isValidObjectId(business)) deliveryFilter.businessId = business;
    if (location && isValidObjectId(location)) deliveryFilter.locationId = location;
    if (sp.get('finYear')) deliveryFilter.finYear = sp.get('finYear');

    /* Collect every delivery ID that already has a GRC.  Scoped to the same
       business/location/finYear so two tenants never interfere with each
       other.  $ne: null ensures rows with a null lrTransactionId (which
       should not exist but may in older data) are not accidentally matched. */
    const usedGrcs = await Grc.find({
      ...(deliveryFilter.businessId ? { businessId: deliveryFilter.businessId } : {}),
      ...(deliveryFilter.locationId ? { locationId: deliveryFilter.locationId } : {}),
      ...(deliveryFilter.finYear   ? { finYear:   deliveryFilter.finYear }   : {}),
      lrTransactionId: { $ne: null },
    }).select('lrTransactionId').lean();

    const usedIds = usedGrcs.map((g) => g.lrTransactionId).filter(Boolean);
    if (usedIds.length) deliveryFilter._id = { $nin: usedIds };

    const rows = await Delivery.find(deliveryFilter)
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    /* Attach supplier details to each delivery */
    const supplierIds = [...new Set(
      rows.map((r) => r.supplierId).filter((s) => s && isValidObjectId(String(s))).map(String)
    )];
    const suppliers = supplierIds.length
      ? await Contact.find({ _id: { $in: supplierIds } })
        .select('contactId businessName firstName middleName lastName gstNo').lean()
      : [];

    const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

    const vendorNameOf = (s) => String(s.businessName || '').trim()
      || [s.firstName, s.middleName, s.lastName].map((p) => String(p || '').trim()).filter(Boolean).join(' ');

    return json({
      rows: rows.map((r) => {
        const s = supplierById.get(String(r.supplierId));
        return {
          ...r,
          _id: String(r._id),
          supplierId: String(r.supplierId || ''),
          /* flat fields so populate maps can reference them directly */
          supplierGstNo: String(s?.gstNo || ''),
          supplier: s
            ? {
                _id: String(s._id),
                contactId: String(s.contactId || ''),
                businessName: vendorNameOf(s),
                gstNo: String(s.gstNo || '')
              }
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

  /* consignments not yet loaded onto a dispatch */
  if (sp.get('unassigned') === '1') {
    filter.$and = [...(filter.$and || []),
      { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] }];
  }

  /* PENDING vs COMPLETED goods received.

     There is no "status" field on a GRC - the model has none and no stored
     document carries one - so completion is not a flag to read, it is the
     RELATIONSHIP: a GRC points back at the LR it received through
     Grc.lrTransactionId.

     This is the app's own existing definition, not a new one. The GRC form's
     LR dropdown is built the same way in app/api/purchase-grc/route.js, which
     offers only deliveries no GRC has claimed:

         lrTransactionId: { $ne: null } ... _id: { $nin: used }

     and that route refuses a second GRC for the same LR ("This LR already has
     a GRC"). One GRC per LR is therefore enforced upstream, which is what
     guarantees a delivery falls in exactly one of the two grids.

     Nothing is written here and no delivery is modified - the classification
     is derived on read, so completing a GRC moves the row between grids on
     the next refresh with no manual step. */
  const status = sp.get('status');
  if (status === 'pending' || status === 'completed') {
    const claimed = await Grc.find({
      ...(filter.businessId ? { businessId: filter.businessId } : {}),
      lrTransactionId: { $ne: null },
    }).select('lrTransactionId').lean();

    const ids = claimed.map((r) => r.lrTransactionId).filter(Boolean);
    filter._id = status === 'completed' ? { $in: ids } : { $nin: ids };
  }

  /* the Filter card above the list */
  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.transactionDate = { ...(filter.transactionDate || {}), $gte: new Date(from) };
  if (to) filter.transactionDate = { ...(filter.transactionDate || {}), $lte: new Date(to + 'T23:59:59') };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    /* "Search transaction, LR or supplier" - supplier is matched by resolving
       names to ids first, since the name lives on the contact */
    const supplierIds = await Contact.find({
      $or: [{ businessName: rx }, { firstName: rx }, { lastName: rx }],
    }).select('_id').lean();

    filter.$or = [
      { transactionNo: rx },
      { lrNumber: rx },
      { invPmNumber: rx },
      ...(supplierIds.length ? [{ supplierId: { $in: supplierIds.map((s) => s._id) } }] : []),
    ];
  }

  const total = await Delivery.countDocuments(filter);
  const rows = await Delivery.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  const supplierContactIds = await resolveSupplierContactIds(rows);

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      supplierContactId: r.supplierContactId || supplierContactIds[String(r.supplierId)] || '',
    })),
    labels: await resolveNames(rows),
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

  /* recomputed here rather than trusted from the dialog */
  const totals = freightBreakdown(doc);
  DERIVED_FIELDS.forEach((f) => { doc[f.k] = totals[f.k]; });

  /* Resolve supplier contactId from supplier master - this is the source of truth */
  if (doc.supplierId && isValidObjectId(doc.supplierId)) {
    const supplier = await Contact.findById(doc.supplierId).select('contactId').lean();
    doc.supplierContactId = supplier?.contactId || '';
  }

  /* Use a MongoDB transaction to ensure atomic counter increment + document creation.
     If the save fails, the counter is not consumed. */
  const mongooseSession = await mongoose.startSession();
  try {
    const result = await mongooseSession.withTransaction(async () => {
      /* THE ONLY PLACE A NUMBER IS CONSUMED.

         Blank means "auto", which is what the dialog now always sends: the number
         is reserved here, atomically, as part of the save. A number typed by hand
         is honoured instead, checked for a clash and then used to push the
         counter forward so auto-numbering cannot come back and reissue it. */
      if (doc.transactionNo) {
        const duplicate = await Delivery.exists({
          transactionNo: doc.transactionNo,
          ...(doc.businessId ? { businessId: doc.businessId } : {}),
          ...(doc.locationId ? { locationId: doc.locationId } : {}),
          ...(doc.finYear ? { finYear: doc.finYear } : {}),
        }).session(mongooseSession);
        if (duplicate) throw { status: 422, errors: { transactionNo: 'Transaction No already exists' } };
        await claimManualTransactionNo({
          transactionNo: doc.transactionNo, businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
        }, mongooseSession);
      } else {
        doc.transactionNo = await nextTransactionNo({
          businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
        }, mongooseSession);
      }

      const created = await Delivery.create([doc], { session: mongooseSession });
      return created[0];
    });

    return json({ ok: true, id: String(result._id), transactionNo: result.transactionNo });
  } catch (err) {
    if (err?.status === 422) {
      return json({ errors: err.errors }, 422);
    }
    console.error('Delivery create error:', err);
    return json({ error: 'Save failed' }, 500);
  } finally {
    await mongooseSession.endSession();
  }
}