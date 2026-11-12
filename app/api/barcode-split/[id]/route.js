import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeSplit from '@/models/BarcodeSplit';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { finalizeSplit, updateDraftSplit, cancelSplit, genealogyFor } from '@/lib/barcodeSplit';

/* /api/barcode-split/[id] - detail, draft update, finalize and cancel. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid split id.', code: 'BAD_INPUT' }, 400);

  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_SPLIT, action: PERM.READ,
    businessId: sp.get('business'), label: 'barcode splits',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const split = await BarcodeSplit.findOne({
    _id: id,
    ...(sp.get('business') && isValidObjectId(sp.get('business')) ? { businessId: sp.get('business') } : {}),
  }).lean();
  if (!split) return json({ error: 'Split not found.', code: 'NOT_FOUND' }, 404);

  const children = await BarcodeLabel.find({ splitId: split._id })
    .sort({ createdAt: 1 })
    .lean();

  const original = split.originalBarcodeId
    ? await BarcodeLabel.findById(split.originalBarcodeId).lean()
    : null;

  /* Full parent chain and the original's other children - the genealogy
     screen, reachable from any child barcode. */
  let genealogy = null;
  if (original) {
    genealogy = await genealogyFor({ barcodeId: original._id, businessId: split.businessId });
  }

  const history = await BarcodeSplit.find({ originalBarcodeId: split.originalBarcodeId })
    .select('splitNo status totalSplitQty childCount createdAt cancelledAt')
    .sort({ createdAt: -1 })
    .limit(30)
    .lean();

  return json({
    split: {
      ...split,
      _id: String(split._id),
      originalBarcodeId: split.originalBarcodeId ? String(split.originalBarcodeId) : '',
      itemId: split.itemId ? String(split.itemId) : '',
      supplierId: split.supplierId ? String(split.supplierId) : '',
      grcId: split.grcId ? String(split.grcId) : '',
      lines: (split.lines || []).map((l) => ({
        ...l,
        childBarcodeId: l.childBarcodeId ? String(l.childBarcodeId) : '',
      })),
    },
    children: children.map((c) => ({ ...c, _id: String(c._id) })),
    original: original ? { ...original, _id: String(original._id) } : null,
    genealogy: genealogy
      ? {
        unit: { ...genealogy.unit, _id: String(genealogy.unit._id) },
        root: genealogy.root ? { ...genealogy.root, _id: String(genealogy.root._id) } : null,
        ancestry: (genealogy.ancestry || []).map((a) => ({ ...a, _id: String(a._id) })),
        children: (genealogy.children || []).map((c) => ({ ...c, _id: String(c._id) })),
      }
      : null,
    history: history.map((h) => ({ ...h, _id: String(h._id) })),
  });
}

export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid split id.', code: 'BAD_INPUT' }, 400);

  const body = await req.json().catch(() => ({}));

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: null });
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_SPLIT, action: PERM.UPDATE,
    businessId: body.business, label: 'barcode splits',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = body.business && isValidObjectId(String(body.business)) ? body.business : null;
  const action = String(body.action || '').toLowerCase();

  if (action === 'cancel') {
    const result = await cancelSplit({ id, businessId, session, reason: body.reason || '' });
    return json({ ok: true, ...result });
  }
  if (action === 'finalize') {
    const result = await finalizeSplit({ id, businessId, session });
    return json({ ok: true, ...result });
  }

  const result = await updateDraftSplit({ id, businessId, body, session });
  return json({ ok: true, ...result });
});
