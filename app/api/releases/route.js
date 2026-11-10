import dbConnect from '@/lib/db';
import Release from '@/models/Release';
import { handler } from '@/lib/apiError';
import { requireUser, requirePermission, can, PERMISSIONS } from '@/lib/rbac';
import { normaliseRelease, publicRelease } from '@/lib/releases';

/* ==========================================================================
   /api/releases

     GET   published releases, newest first, plus the one the dashboard
           announces. Signed-in users only.
     POST  create a release. Requires the existing administrative permission
           (ADMIN_ALL) - the same gate /api/role-permission uses.

   The dashboard never writes here. Publishing is a deliberate act on
   /admin/setting/releases; nothing in the codebase creates a release as a
   side effect of a deployment.
   ========================================================================== */

const send = (data, status = 200) => Response.json(data, {
  status,
  headers: { 'Cache-Control': 'no-store' },
});

function limitOf(value) {
  const n = Number.parseInt(value, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 100);
}

export const GET = handler(async (req) => {
  const session = await requireUser();
  const sp = new URL(req.url).searchParams;

  await dbConnect();

  /* Drafts are an administrative view. Asking for them without ADMIN_ALL is
     not an error - the request simply gets the published list, so a stale
     bookmark cannot reveal work in progress. */
  const includeDrafts = sp.get('includeDrafts') === '1'
    && can(session, PERMISSIONS.ADMIN_ALL);

  const filter = includeDrafts ? {} : { status: 'published' };
  const releases = await Release.find(filter)
    .sort({ isLatest: -1, releaseDate: -1, createdAt: -1 })
    .limit(limitOf(sp.get('limit')))
    .lean();

  /* isLatest is sorted first, so the limited window always contains it when
     one exists. Falling back to the newest published row keeps the panel
     working even if the flag was never set. */
  const latest = releases.find((row) => row.isLatest) || releases[0] || null;

  return send({
    latest: publicRelease(latest),
    releases: releases.map(publicRelease),
  });
});

export const POST = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.ADMIN_ALL);
  const body = await req.json().catch(() => ({}));
  const data = normaliseRelease(body);

  await dbConnect();

  if (await Release.exists({ version: data.version })) {
    const err = new Error('A release with that version already exists.');
    err.status = 409;
    err.code = 'DUPLICATE_VERSION';
    throw err;
  }

  const publishedExists = await Release.exists({ status: 'published' });

  /* A draft is never the announced release. A published release becomes the
     latest automatically when it is the first one, or when the author asks
     for it explicitly. */
  const makeLatest = data.status === 'published' && (data.isLatest || !publishedExists);

  const created = await Release.create({
    ...data,
    isLatest: false,
    createdBy: session.email || session.name || '',
    updatedBy: session.email || session.name || '',
  });

  if (makeLatest) {
    await Release.updateMany(
      { _id: { $ne: created._id } },
      { $set: { isLatest: false } }
    );
    created.isLatest = true;
    await created.save();
  }

  return send({ ok: true, release: publicRelease(created.toObject()) }, 201);
});
