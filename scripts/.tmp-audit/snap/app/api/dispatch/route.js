// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import Dispatch from '@/models/Dispatch';
// import { requireSession } from '@/lib/session';
// import { validate, escapeRegex } from '@/lib/validate';
// import { FIELDS } from '@/app/admin/transport/dispatch/fields';

// /* /api/dispatch - list + create. */

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

//   const search = (sp.get('search') || '').trim();
//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     filter.$or = [{ docNo: rx }, { party: rx }, { status: rx }];
//   }

//   const total = await Dispatch.countDocuments(filter);
//   const rows = await Dispatch.find(filter)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .lean();

//   return json({
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//     labels: {},
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

//   const created = await Dispatch.create(doc);
//   return json({ ok: true, id: String(created._id) });
// }







import mongoose, { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Dispatch from '@/models/Dispatch';
import Delivery from '@/models/Delivery';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { nextSeriesNumber } from '@/lib/docnumber';
import { FIELDS } from '@/app/admin/transport/dispatch/fields';

/* /api/dispatch - list + create.

   Creating a dispatch CLAIMS the consignments it carries: each selected
   delivery gets dispatchId set, which removes it from the pool the next
   dispatch can choose from. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

async function nextDocNo({ businessId, finYear }) {
  const [start] = String(finYear || '').split('-');
  const yy = (start || String(new Date().getFullYear())).slice(2);

  return nextSeriesNumber(Dispatch, 'docNo', 'DSP/' + yy + '/', {
    scope: {
      ...(businessId ? { businessId } : {}),
      ...(finYear ? { finYear } : {}),
    },
  });
}

/* Money and parcel counts come from the consignments, never from the form. */
function totalsOf(deliveries) {
  return deliveries.reduce(
    (acc, d) => ({
      amount: acc.amount + (Number(d.value) || 0),
      freightTotal: acc.freightTotal + (Number(d.totalFreight) || 0),
      parcelTotal: acc.parcelTotal + (Number(d.parcelQty) || 0),
    }),
    { amount: 0, freightTotal: 0, parcelTotal: 0 }
  );
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

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ docNo: rx }, { party: rx }, { status: rx }];
  }

  const total = await Dispatch.countDocuments(filter);
  const rows = await Dispatch.find(filter)
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

  const ids = (doc.deliveryIds || []).filter((v) => isValidObjectId(v));
  if (!ids.length) {
    return json({ errors: { deliveryIds: 'Select at least one consignment' } }, 422);
  }

  /* Only consignments nobody has claimed can be loaded. Re-checked here
     rather than trusted from the dropdown: the list the browser fetched may
     be seconds stale, and two users can pick the same LR at once. */
  const available = await Delivery.find({
    _id: { $in: ids },
    $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }],
  }).lean();

  if (available.length !== ids.length) {
    const free = new Set(available.map((d) => String(d._id)));
    const taken = ids.filter((i) => !free.has(String(i)));
    return json({
      errors: {
        deliveryIds:
          taken.length + ' of the selected consignments are already on another dispatch. Refresh and try again.',
      },
    }, 422);
  }

  const totals = totalsOf(available);
  doc.amount = totals.amount;
  doc.freightTotal = totals.freightTotal;
  doc.parcelTotal = totals.parcelTotal;
  doc.deliveryIds = available.map((d) => d._id);

  doc.docNo = await nextDocNo({ businessId: doc.businessId, finYear: doc.finYear });

  const created = await Dispatch.create(doc);

  /* claim them - guarded again so a concurrent dispatch can't double-book */
  const claim = await Delivery.updateMany(
    {
      _id: { $in: doc.deliveryIds },
      $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }],
    },
    { $set: { dispatchId: created._id } }
  );

  if (claim.modifiedCount !== doc.deliveryIds.length) {
    /* someone got there first between the check and the write - undo */
    await Delivery.updateMany({ dispatchId: created._id }, { $set: { dispatchId: null } });
    await Dispatch.findByIdAndDelete(created._id);
    return json({
      errors: { deliveryIds: 'A consignment was taken by another dispatch. Refresh and try again.' },
    }, 409);
  }

  return json({ ok: true, id: String(created._id), docNo: created.docNo });
}