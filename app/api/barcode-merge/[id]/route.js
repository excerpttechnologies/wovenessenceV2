import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeMerge from '@/models/BarcodeMerge';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { finalizeMerge, updateDraftMerge, cancelMerge } from '@/lib/barcodeMerge';

/* /api/barcode-merge/[id] - detail, draft update, finalize and cancel. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid merge id.', code: 'BAD_INPUT' }, 400);

  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.READ,
    businessId: sp.get('business'), label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const merge = await BarcodeMerge.findOne({
    _id: id,
    ...(sp.get('business') && isValidObjectId(sp.get('business')) ? { businessId: sp.get('business') } : {}),
  }).lean();
  if (!merge) return json({ error: 'Merge not found.', code: 'NOT_FOUND' }, 404);

  const sourceIds = (merge.sources || []).map((s) => s.barcodeId).filter(Boolean);
  const sourceRows = sourceIds.length
    ? await BarcodeLabel.find({ _id: { $in: sourceIds } }).lean()
    : [];

  const merged = merge.mergedBarcodeId
    ? await BarcodeLabel.findById(merge.mergedBarcodeId).lean()
    : null;

  return json({
    merge: {
      ...merge,
      _id: String(merge._id),
      mergedBarcodeId: merge.mergedBarcodeId ? String(merge.mergedBarcodeId) : '',
      itemId: merge.itemId ? String(merge.itemId) : '',
      supplierId: merge.supplierId ? String(merge.supplierId) : '',
      sources: (merge.sources || []).map((s) => ({
        ...s,
        barcodeId: s.barcodeId ? String(s.barcodeId) : '',
        grcId: s.grcId ? String(s.grcId) : '',
        splitId: s.splitId ? String(s.splitId) : '',
      })),
    },
    sourceRows: sourceRows.map((r) => ({ ...r, _id: String(r._id) })),
    merged: merged ? { ...merged, _id: String(merged._id) } : null,
  });
}

export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid merge id.', code: 'BAD_INPUT' }, 400);

  const body = await req.json().catch(() => ({}));

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: null });
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.UPDATE,
    businessId: body.business, label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = body.business && isValidObjectId(String(body.business)) ? body.business : null;
  const action = String(body.action || '').toLowerCase();

  if (action === 'cancel') {
    const result = await cancelMerge({ id, businessId, session, reason: body.reason || '' });
    return json({ ok: true, ...result });
  }
  if (action === 'finalize') {
    const result = await finalizeMerge({ id, businessId, session });
    return json({ ok: true, ...result });
  }

  const result = await updateDraftMerge({ id, businessId, body, session });
  return json({ ok: true, ...result });
});
