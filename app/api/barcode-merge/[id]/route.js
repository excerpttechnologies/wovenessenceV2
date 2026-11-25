import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeMerge from '@/models/BarcodeMerge';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { finalizeMerge, updateDraftMerge, cancelMerge } from '@/lib/barcodeMerge';
import { resolveAuthorizedScope, scopeErrorResponse, assertDocumentLocationAccess } from '@/lib/locationAccess';

/* /api/barcode-merge/[id] - detail, draft update, finalize and cancel. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid merge id.', code: 'BAD_INPUT' }, 400);

  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
  await dbConnect();

  const sp = new URL(req.url).searchParams;
  const scope = await resolveAuthorizedScope(session, {
    businessId: sp.get('business'),
    locationId: sp.get('location'),
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.READ,
    businessId: scope.businessId || sp.get('business'), label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const merge = await BarcodeMerge.findOne({
    _id: id,
    ...(scope.businessFilter ? { businessId: scope.businessFilter } : {}),
  }).lean();
  if (!merge) return json({ error: 'Merge not found.', code: 'NOT_FOUND' }, 404);
  const locDenied = await assertDocumentLocationAccess(session, merge);
  if (locDenied) return locDenied;

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

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: body.location || null });
  await dbConnect();

  const scope = await resolveAuthorizedScope(session, {
    businessId: body.business,
    locationId: body.location,
  });
  if (!scope.ok) return scopeErrorResponse(scope);

  const target = await BarcodeMerge.findById(id).select('businessId locationId').lean();
  if (!target) return json({ error: 'Merge not found.', code: 'NOT_FOUND' }, 404);
  const locDenied = await assertDocumentLocationAccess(session, target);
  if (locDenied) return locDenied;

  const denied = await screenDenial({
    session, screen: SCREENS.BARCODE_MERGE, action: PERM.UPDATE,
    businessId: target.businessId || scope.businessId || body.business, label: 'barcode merges',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const businessId = scope.businessId || (body.business && isValidObjectId(String(body.business)) ? body.business : null);
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
