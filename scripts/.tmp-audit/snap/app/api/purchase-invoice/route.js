// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import PurchaseInvoice from '@/models/PurchaseInvoice';
// import Upstream from '@/models/Grc';
// import { requireSession } from '@/lib/session';
// import { resolveRefLabels } from '@/lib/refLabels';
// import { validate, escapeRegex } from '@/lib/validate';
// import { nextDocNumber } from '@/lib/docnumber';
// import { FORM } from '@/app/admin/transaction/purchase/invoice/form';

// /* header fields AND the totals rows - the totals card holds real stored
//    numbers (taxable value, round off, net value, the editable discounts).
//    Leaving them out meant validate() silently dropped them on every save. */
// const FIELDS = (FORM.cards || []).flatMap((c) => {
//   if (c.type === 'fields') return c.fields || [];
//   if (c.type === 'totals') {
//     return (c.rows || []).flatMap((r) => [
//       ...(r.value ? [{ k: r.value, label: r.label, type: 'number' }] : []),
//       ...(r.input ? [{ k: r.input, label: r.label, type: 'number', def: 0 }] : []),
//     ]);
//   }
//   return [];
// });

// /* /api/purchase-invoice - list + create. */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const PER_PAGE = 10;

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
//   const sup = sp.get('supplierId'); if (sup && isValidObjectId(sup)) filter.supplierId = sup;

//   const from = sp.get('startDate');
//   const to = sp.get('endDate');
//   if (from) filter.purchaseDate = { ...(filter.purchaseDate || {}), $gte: new Date(from) };
//   if (to) filter.purchaseDate = { ...(filter.purchaseDate || {}), $lte: new Date(to + 'T23:59:59') };

//   /* "unconverted" upstream documents: a GRC with no purchase invoice yet, a
//      GRT with no debit note yet. $eq: null matches missing AND null - passing
//      '' here would be cast against an ObjectId path and throw. */
//   const unconverted = sp.get('unconverted');
//   if (unconverted) filter[unconverted] = { $eq: null };

//   const search = (sp.get('search') || '').trim();
//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     filter.$or = [{ purchaseInvoiceNo: rx }];
//   }

//   const total = await PurchaseInvoice.countDocuments(filter);
//   const rows = await PurchaseInvoice.find(filter)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .lean();

//   return json({
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//     labels: await resolveRefLabels(rows),
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

//   if (Array.isArray(body.data?.items)) doc.items = body.data.items;

//   /* document number from the Doc Setup master */
//   if (!doc.purchaseInvoiceNo) {
//     doc.purchaseInvoiceNo = await nextDocNumber(PurchaseInvoice, 'purchaseInvoiceNo', "Purchase Invoice", {
//       businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
//     });
//   }

//   const created = await PurchaseInvoice.create(doc);

//   /* stamp the upstream document so it stops appearing as unconverted */
//   const sourceIds = Array.isArray(body.data?.sourceIds)
//     ? body.data.sourceIds
//     : (body.data?.sourceIds ? [body.data.sourceIds] : []);

//   if (sourceIds.length) {
//     await Upstream.updateMany(
//       { _id: { $in: sourceIds.filter(Boolean) } },
//       { $set: { purchaseInvoiceId: created._id } }
//     );
//   }

//   return json({ ok: true, id: String(created._id) });
// }




/* FILE: app/api/purchase-invoice/route.js */
import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Upstream from '@/models/Grc';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextDocNumber } from '@/lib/docnumber';
import { FORM } from '@/app/admin/transaction/purchase/invoice/form';

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

/* the form computes these; they are not header form fields, so they are
   allowed through explicitly rather than by validate() */
const TOTAL_KEYS = [
  'taxableValue', 'discountPercent', 'roundOffDiscount',
  'igstTotal', 'cgstTotal', 'sgstTotal',
  'freightBeforeGst', 'roundOff', 'totalQuantity',
  'netPurchaseAmt', 'totalPayable',
];

function applyTotals(doc, body) {
  TOTAL_KEYS.forEach((k) => {
    if (body.data?.[k] !== undefined) doc[k] = Number(body.data[k]) || 0;
  });
}

/* A GRC has no line items of its own - its Taxable / Total Quantity / GST /
   Net Amount columns are the figures from the invoice raised against it.
   Written here on save so the GRC list, GRC Print and Barcode Print all read
   real numbers. Split across several GRCs, each gets a pro-rata share. */
async function pushTotalsToGrc(Grc, grcIds, doc, share = 1) {
  if (!grcIds.length) return;
  const gst = (doc.igstTotal || 0) + (doc.cgstTotal || 0) + (doc.sgstTotal || 0);

  await Grc.updateMany(
    { _id: { $in: grcIds } },
    { $set: {
      taxable: Number(((doc.taxableValue || 0) * share).toFixed(2)),
      totalQuantity: Number(((doc.totalQuantity || 0) * share).toFixed(2)),
      gst: Number((gst * share).toFixed(2)),
      netAmount: Number(((doc.netPurchaseAmt || 0) * share).toFixed(2)),
      items: doc.items || [],
    } }
  );
}

/* /api/purchase-invoice - list + create. */

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
  const sup = sp.get('supplierId'); if (sup && isValidObjectId(sup)) filter.supplierId = sup;

  const from = sp.get('startDate');
  const to = sp.get('endDate');
  if (from) filter.purchaseDate = { ...(filter.purchaseDate || {}), $gte: new Date(from) };
  if (to) filter.purchaseDate = { ...(filter.purchaseDate || {}), $lte: new Date(to + 'T23:59:59') };

  /* "unconverted" upstream documents: a GRC with no purchase invoice yet, a
     GRT with no debit note yet. $eq: null matches missing AND null - passing
     '' here would be cast against an ObjectId path and throw. */
  const unconverted = sp.get('unconverted');
  if (unconverted) filter[unconverted] = { $eq: null };

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ purchaseInvoiceNo: rx }];
  }

  const total = await PurchaseInvoice.countDocuments(filter);
  const rows = await PurchaseInvoice.find(filter)
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

  if (Array.isArray(body.data?.items)) doc.items = body.data.items;
  applyTotals(doc, body);

  /* document number from the Doc Setup master */
  if (!doc.purchaseInvoiceNo) {
    doc.purchaseInvoiceNo = await nextDocNumber(PurchaseInvoice, 'purchaseInvoiceNo', "Purchase Invoice", {
      businessId: doc.businessId, locationId: doc.locationId, finYear: doc.finYear,
    });
  }

  const created = await PurchaseInvoice.create(doc);

  /* stamp the upstream document so it stops appearing as unconverted */
  const sourceIds = Array.isArray(body.data?.sourceIds)
    ? body.data.sourceIds
    : (body.data?.sourceIds ? [body.data.sourceIds] : []);

  const ids = sourceIds.filter(Boolean);
  if (ids.length) {
    await Upstream.updateMany(
      { _id: { $in: ids } },
      { $set: { purchaseInvoiceId: created._id } }
    );
    await pushTotalsToGrc(Upstream, ids, doc, 1 / ids.length);
  }

  return json({ ok: true, id: String(created._id) });
}