import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import UomConversion from '@/models/UomConversion';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/uom-conversion/[id] - activate/deactivate or remove one factor. */

const json = (d, s = 200) => Response.json(d, { status: s });

export const PATCH = handler(async (req, { params }) => {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid id.', code: 'BAD_INPUT' }, 400);

  const session = await requirePermission(PERMISSIONS.MASTERS_MANAGE, { locationId: null });
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.UOM_CONVERSION, action: PERM.UPDATE,
    businessId: body.business, label: 'UOM conversions',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const set = {};
  if (body.factor !== undefined) {
    const factor = Number(body.factor);
    if (!Number.isFinite(factor) || factor <= 0) return json({ error: 'The factor must be greater than 0.', code: 'INVALID_INPUT' }, 422);
    set.factor = factor;
  }
  if (body.status !== undefined) set.status = String(body.status);
  if (body.notes !== undefined) set.notes = String(body.notes || '');

  const updated = await UomConversion.findByIdAndUpdate(id, { $set: set }, { new: true }).lean();
  if (!updated) return json({ error: 'Conversion not found.', code: 'NOT_FOUND' }, 404);
  return json({ ok: true, row: { ...updated, _id: String(updated._id) } });
});

export const DELETE = handler(async (req, { params }) => {
  const { id } = await params;
  if (!isValidObjectId(String(id))) return json({ error: 'Invalid id.', code: 'BAD_INPUT' }, 400);

  const session = await requirePermission(PERMISSIONS.MASTERS_MANAGE, { locationId: null });
  await dbConnect();

  const row = await UomConversion.findById(id).lean();
  if (!row) return json({ error: 'Conversion not found.', code: 'NOT_FOUND' }, 404);

  const denied = await screenDenial({
    session, screen: SCREENS.UOM_CONVERSION, action: PERM.DELETE,
    businessId: row.businessId, label: 'UOM conversions',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  /* A factor is retired, not erased: splits already finalised stored the
     factor they used on their lines, but the row itself is still history. */
  await UomConversion.updateOne({ _id: id }, { $set: { status: 'Inactive' } });
  return json({ ok: true });
});
