// import dbConnect from '@/lib/db';
// import Business from '@/models/Business';
// import { requireSession } from '@/lib/session';
// import { validate } from '@/lib/validate';
// import { FIELDS } from '@/app/admin/setting/business/fields';

// /* /api/business/<id> - read one, update, delete. */

// const json = (d, s = 200) => Response.json(d, { status: s });

// export async function GET(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   const doc = await Business.findById(id).lean();
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

//   const updated = await Business.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
//   if (!updated) return json({ error: 'Not found' }, 404);

//   return json({ ok: true, id });
// }

// export async function DELETE(req, { params }) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const { id } = await params;
//   await dbConnect();

//   await Business.findByIdAndDelete(id);
//   return json({ ok: true });
// }





import dbConnect from '@/lib/db';
import Business from '@/models/Business';
import { requireSession } from '@/lib/session';
import { validate } from '@/lib/validate';
import { FIELDS } from '@/app/admin/setting/business/fields';

/* /api/business/<id> - read one, update, delete. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  const doc = await Business.findById(id).lean();
  if (!doc) return json({ doc: null }, 404);
  return json({ doc: { ...doc, _id: String(doc._id) } });
}

export async function PUT(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);

  /* isMainBranch and parentBusinessId are not in FIELDS, so validate() never
     emits them and this update leaves whatever is stored untouched. That is
     what keeps the main store from being demoted - or a sub-branch promoted -
     through the edit form. */
  const updated = await Business.findByIdAndUpdate(id, doc, { new: true, runValidators: true });
  if (!updated) return json({ error: 'Not found' }, 404);

  return json({ ok: true, id });
}

export async function DELETE(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { id } = await params;
  await dbConnect();

  /* The main store is the parent of every other branch and the anchor for the
     seeded reference data, so deleting it would orphan the lot. */
  const target = await Business.findById(id).select('isMainBranch').lean();
  if (!target) return json({ ok: true });
  if (target.isMainBranch) {
    return json(
      { error: 'The main branch cannot be deleted. Only sub-branches can be removed.' },
      409
    );
  }

  await Business.findByIdAndDelete(id);
  return json({ ok: true });
}