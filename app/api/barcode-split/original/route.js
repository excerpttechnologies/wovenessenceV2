import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import UomConversion from '@/models/UomConversion';
import BarcodeSplit from '@/models/BarcodeSplit';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { findOriginalUnit, originalDetails } from '@/lib/barcodeSplit';

/* GET /api/barcode-split/original?code=8A1235  (or ?barcodeId=...)

   Everything Step 1 of the split screen needs, inherited read-only from the
   original barcode: item, supplier, GRC, prices, stock and the configured
   UOM conversions that apply to this item. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const businessId = sp.get('business');
  await dbConnect();

  /* Reached from the split Add form and from the merge Add form's barcode
     picker, so either screen's create/read permission is enough. */
  const denied = await screenDenialAnyAction({
    session,
    screens: [SCREENS.BARCODE_SPLIT, SCREENS.BARCODE_MERGE],
    actions: [PERM.READ, PERM.CREATE],
    businessId, label: 'barcodes',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const barcodeId = sp.get('barcodeId');
  const code = sp.get('code');

  let unit;
  try {
    unit = await findOriginalUnit({
      businessId: businessId && isValidObjectId(businessId) ? businessId : null,
      barcodeId: barcodeId && isValidObjectId(barcodeId) ? barcodeId : null,
      code,
    });
  } catch (err) {
    if (err?.status === 404) return json({ error: 'Barcode not found in this business.', code: 'BARCODE_NOT_FOUND' }, 404);
    throw err;
  }

  const details = await originalDetails(unit);

  const itemId = details.itemId && isValidObjectId(details.itemId) ? details.itemId : null;
  const conversions = await UomConversion.find({
    ...(businessId && isValidObjectId(businessId) ? { businessId } : {}),
    status: { $ne: 'Inactive' },
    $or: [{ itemId: null }, ...(itemId ? [{ itemId }] : [])],
  }).select('name itemId itemCode fromUom toUom factor').lean();

  const splits = await BarcodeSplit.find({
    originalBarcodeId: unit._id,
    status: { $ne: 'Cancelled' },
  })
    .select('splitNo status totalSplitQty createdAt childCount')
    .sort({ createdAt: -1 })
    .limit(20)
    .lean();

  return json({
    original: details,
    conversions: conversions.map((c) => ({
      _id: String(c._id),
      name: c.name || '',
      itemId: c.itemId ? String(c.itemId) : '',
      itemCode: c.itemCode || '',
      fromUom: c.fromUom || '',
      toUom: c.toUom || '',
      factor: Number(c.factor) || 0,
    })),
    splits: splits.map((s) => ({ ...s, _id: String(s._id) })),
  });
}
