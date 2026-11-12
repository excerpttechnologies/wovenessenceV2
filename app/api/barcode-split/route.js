import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeSplit from '@/models/BarcodeSplit';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { createSplit, splitListFilter } from '@/lib/barcodeSplit';

/* /api/barcode-split - list splits and create one (Draft or Finalized). */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 20;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_SPLIT, action: PERM.READ,
    businessId: sp.get('business'), label: 'barcode splits',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Number(sp.get('perPage') || PER_PAGE));
  const filter = splitListFilter(sp);

  const total = await BarcodeSplit.countDocuments(filter);
  const rows = await BarcodeSplit.find(filter)
    .select('-snapshot -audit')
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({
      ...r,
      _id: String(r._id),
      originalBarcodeId: r.originalBarcodeId ? String(r.originalBarcodeId) : '',
      itemId: r.itemId ? String(r.itemId) : '',
      supplierId: r.supplierId ? String(r.supplierId) : '',
      grcId: r.grcId ? String(r.grcId) : '',
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
    session, screen: SCREENS.BARCODE_SPLIT, action: PERM.CREATE,
    businessId: body.business, label: 'barcode splits',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = body.business && isValidObjectId(String(body.business))
    ? body.business
    : session?.businessId || null;

  const result = await createSplit({ businessId, body, session });
  return json({ ok: true, ...result }, 201);
});
