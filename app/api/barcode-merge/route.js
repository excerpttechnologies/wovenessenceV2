import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeMerge from '@/models/BarcodeMerge';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { createMerge, mergeListFilter } from '@/lib/barcodeMerge';

/* /api/barcode-merge - list merges and create one. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 20;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.READ,
    businessId: sp.get('business'), label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Number(sp.get('perPage') || PER_PAGE));
  const filter = mergeListFilter(sp);

  const total = await BarcodeMerge.countDocuments(filter);
  const rows = await BarcodeMerge.find(filter)
    .select('-snapshot -audit -sources')
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      mergedBarcodeId: r.mergedBarcodeId ? String(r.mergedBarcodeId) : '',
      itemId: r.itemId ? String(r.itemId) : '',
      supplierId: r.supplierId ? String(r.supplierId) : '',
    })),
    total, page, pages: Math.max(1, Math.ceil(total / perPage)), perPage,
  });
}

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, {
    locationId: body.location || null,
  });
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.CREATE,
    businessId: body.business, label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = body.business && isValidObjectId(String(body.business))
    ? body.business
    : session?.businessId || null;

  const result = await createMerge({ businessId, body, session });
  return json({ ok: true, ...result }, 201);
});
