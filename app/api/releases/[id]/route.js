import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Release from '@/models/Release';
import { handler } from '@/lib/apiError';
import { requireUser, requirePermission, can, PERMISSIONS } from '@/lib/rbac';
import { normaliseRelease, publicRelease } from '@/lib/releases';

/* ==========================================================================
   /api/releases/<id>

     GET     one release. Published rows are readable by any signed-in user;
             a draft is visible only to an administrator.
     PUT     update a release. ADMIN_ALL only.
     DELETE  remove a release. ADMIN_ALL only.

   THE LATEST FLAG. The dashboard announces one release. Keeping that true is
   this route's job as much as the create route's:

     publishing a row with isLatest      -> it becomes the latest
     editing the row that is latest      -> it stays the latest
     the only published row              -> it is the latest
     deleting / drafting the latest      -> the newest published row takes over

   GET also falls back to the newest published row when no row carries the
   flag, so a missing flag can never leave the dashboard with nothing to show.
   ========================================================================== */

const send = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function notFound() {
  const err = new Error('That release no longer exists.');
  err.status = 404;
  err.code = 'NOT_FOUND';
  return err;
}

function duplicateVersion() {
  const err = new Error('A release with that version already exists.');
  err.status = 409;
  err.code = 'DUPLICATE_VERSION';
  return err;
}

/* Give the flag to the newest published row, if there is one. Used after the
   current holder is deleted or turned back into a draft. */
async function promoteNewestPublished(excludeId) {
  const next = await Release.findOne({
    status: 'published',
    ...(excludeId ? { _id: { $ne: excludeId } } : {}),
  }).sort({ releaseDate: -1, createdAt: -1 });

  if (!next) return null;

  await Release.updateMany(
    { _id: { $ne: next._id } },
    { $set: { isLatest: false } }
  );
  next.isLatest = true;
  await next.save();
  return next;
}

export const GET = handler(async (req, ctx) => {
  const session = await requireUser();
  const { id } = await ctx.params;

  if (!isValidObjectId(id)) throw notFound();

  await dbConnect();
  const doc = await Release.findById(id).lean();
  if (!doc) throw notFound();

  /* A draft is work in progress. Answering 404 rather than 403 keeps its
     existence out of a non-administrator's reach. */
  if (doc.status === 'draft' && !can(session, PERMISSIONS.ADMIN_ALL)) {
    throw notFound();
  }

  return send({ release: publicRelease(doc) });
});

export const PUT = handler(async (req, ctx) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const { id } = await ctx.params;

  if (!isValidObjectId(id)) throw notFound();

  const body = await req.json().catch(() => ({}));
  const data = normaliseRelease(body);

  await dbConnect();

  const current = await Release.findById(id);
  if (!current) throw notFound();

  if (await Release.exists({ version: data.version, _id: { $ne: current._id } })) {
    throw duplicateVersion();
  }

  /* Decide the flag before writing, because clearing it on every other row is
     a second write. */
  let makeLatest = false;
  if (data.status === 'published') {
    if (data.isLatest) {
      makeLatest = true;
    } else if (current.isLatest) {
      /* Editing the announcement must not silently un-announce it. */
      makeLatest = true;
    } else {
      const anotherLatest = await Release.exists({
        status: 'published',
        isLatest: true,
        _id: { $ne: current._id },
      });
      /* The only published release is the latest by definition. */
      makeLatest = !anotherLatest;
    }
  }

  const wasLatest = current.isLatest;

  current.version = data.version;
  current.title = data.title;
  current.description = data.description;
  current.releaseDate = data.releaseDate;
  current.status = data.status;
  current.features = data.features;
  current.fixes = data.fixes;
  current.security = data.security;
  current.improvements = data.improvements;
  current.isLatest = makeLatest;
  current.updatedBy = session.email || session.name || '';

  await current.save();

  if (makeLatest) {
    await Release.updateMany(
      { _id: { $ne: current._id } },
      { $set: { isLatest: false } }
    );
  } else if (wasLatest) {
    await promoteNewestPublished(current._id);
  }

  return send({ ok: true, release: publicRelease(current.toObject()) });
});

export const DELETE = handler(async (req, ctx) => {
  await requirePermission(PERMISSIONS.ADMIN_ALL);
  const { id } = await ctx.params;

  if (!isValidObjectId(id)) throw notFound();

  await dbConnect();
  const doc = await Release.findById(id);
  if (!doc) throw notFound();

  const wasLatest = doc.isLatest;
  await doc.deleteOne();

  if (wasLatest) await promoteNewestPublished(doc._id);

  return send({ ok: true, id: String(doc._id) });
});
