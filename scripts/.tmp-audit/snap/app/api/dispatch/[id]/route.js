// import dbConnect from '@/lib/db';
// import Dispatch from '@/models/Dispatch';
// import { requireSession } from '@/lib/session';
// import { validate } from '@/lib/validate';
// import { FIELDS } from '@/app/admin/transport/dispatch/fields';

// /* /api/dispatch/<id> - read one, update, delete. */

// const json = (d, s = 200) => Response.json(d, { status: s });

// export async function GET(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   const doc = await Dispatch.findById(id).lean();
//   if (!doc) return json({ doc: null }, 404);
//   return json({ doc: { ...doc, _id: String(doc._id) } });
// }

// export async function PUT(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   const body = await req.json();
//   await dbConnect();

//   const { errors, doc, ok } = validate(FIELDS, body.data || {});
//   if (!ok) return json({ errors }, 422);

//   const updated = await Dispatch.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
//   if (!updated) return json({ error: 'Not found' }, 404);

//   return json({ ok: true, id });
// }

// export async function DELETE(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   await Dispatch.findByIdAndDelete(id);
//   return json({ ok: true });
// }








import dbConnect from '@/lib/db';
import Dispatch from '@/models/Dispatch';
import Delivery from '@/models/Delivery';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { EDIT_FIELDS } from '@/app/admin/transport/dispatch/fields';

/* /api/dispatch/<id> - read one, update, delete.

   Update covers vehicle / driver / route / party / status only. Deleting a
   dispatch RELEASES its consignments so they can be loaded onto another
   one - otherwise a deleted dispatch would strand them permanently. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Dispatch.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  /* EDIT_FIELDS excludes deliveryIds, so validate() never emits it and the
     claimed consignments, docNo and the summed totals are all left alone. */
  const { errors, doc, ok } = validate(EDIT_FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  const updated = await Dispatch.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const existing = await Dispatch.findById(id).lean();
  if (!existing) return json({ ok: true });

  /* release first, then remove: if the delete failed after the release the
     consignments would simply look available again, which is recoverable -
     the other order strands them */
  await Delivery.updateMany({ dispatchId: existing._id }, { $set: { dispatchId: null } });
  await Dispatch.findByIdAndDelete(id);

  return json({ ok: true });
}