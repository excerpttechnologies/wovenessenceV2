import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import UomConversion from '@/models/UomConversion';
import Item from '@/models/Item';
import { requireSession } from '@/lib/session';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { categoryOf } from '@/lib/uomConversion';

/* /api/uom-conversion - the approved PCS <-> MTR factors.

   The split/merge services never call this HTTP route; they read the model
   directly. This route exists for the configuration screen. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 20;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.UOM_CONVERSION, action: PERM.READ,
    businessId: sp.get('business'), label: 'UOM conversions',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  const business = sp.get('business');
  if (business && isValidObjectId(business)) filter.businessId = business;
  const status = sp.get('status');
  if (status) filter.status = status;
  const search = String(sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [{ name: rx }, { itemCode: rx }, { fromUom: rx }, { toUom: rx }];
  }

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(200, Number(sp.get('perPage') || PER_PAGE));
  const total = await UomConversion.countDocuments(filter);
  const rows = await UomConversion.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
    total, page, pages: Math.max(1, Math.ceil(total / perPage)), perPage,
  });
}

export const POST = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.MASTERS_MANAGE, { locationId: null });
  const body = await req.json().catch(() => ({}));
  await dbConnect();

  const denied = await screenDenial({
    session, screen: SCREENS.UOM_CONVERSION, action: PERM.CREATE,
    businessId: body.business, label: 'UOM conversions',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const fromUom = String(body.fromUom || '').trim();
  const toUom = String(body.toUom || '').trim();
  const factor = Number(body.factor);

  if (!fromUom || !toUom) return json({ error: 'Both units are required.', code: 'INVALID_INPUT' }, 422);
  if (categoryOf(fromUom) === categoryOf(toUom)) {
    return json({
      error: 'Choose one piece unit and one metre unit. Two units of the same kind do not need a conversion.',
      code: 'INVALID_INPUT',
    }, 422);
  }
  if (!Number.isFinite(factor) || factor <= 0) {
    return json({ error: 'The factor must be greater than 0.', code: 'INVALID_INPUT' }, 422);
  }

  let itemId = body.itemId && isValidObjectId(String(body.itemId)) ? body.itemId : null;
  let itemCode = '';
  if (itemId) {
    const item = await Item.findById(itemId).select('itemCode name').lean();
    if (!item) return json({ error: 'Item not found.', code: 'INVALID_INPUT' }, 404);
    itemCode = item.itemCode || '';
  } else if (String(body.itemCode || '').trim()) {
    /* the screen offers a code, not an id, so a business-wide factor is easy
       to add for one item without a second lookup endpoint */
    const item = await Item.findOne({
      itemCode: String(body.itemCode).trim(),
      ...(body.business && isValidObjectId(String(body.business)) ? { businessId: body.business } : {}),
    }).select('itemCode name').lean();
    if (!item) return json({ error: 'Item code ' + String(body.itemCode).trim() + ' was not found.', code: 'INVALID_INPUT' }, 404);
    itemId = item._id;
    itemCode = item.itemCode || '';
  }

  const duplicate = await UomConversion.findOne({
    ...(body.business && isValidObjectId(String(body.business)) ? { businessId: body.business } : {}),
    itemId: itemId || null,
    fromUom,
    toUom,
    status: { $ne: 'Inactive' },
  }).lean();
  if (duplicate) {
    return json({
      error: 'A conversion from ' + fromUom + ' to ' + toUom + ' already exists' + (itemCode ? ' for ' + itemCode : ' for this business') + '.',
      code: 'DUPLICATE',
    }, 409);
  }

  const created = await UomConversion.create({
    businessId: body.business && isValidObjectId(String(body.business)) ? body.business : null,
    name: String(body.name || (itemCode ? itemCode + ' ' : '') + '1 ' + fromUom + ' = ' + factor + ' ' + toUom).trim(),
    itemId,
    itemCode,
    fromUom,
    toUom,
    factor,
    status: String(body.status || 'Active'),
    notes: String(body.notes || ''),
    createdBy: session?.id || null,
    createdByName: session?.name || '',
  });

  return json({ ok: true, id: String(created._id) }, 201);
});
