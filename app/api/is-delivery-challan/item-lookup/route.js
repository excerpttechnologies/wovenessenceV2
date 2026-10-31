import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { resolveGstRate } from '@/lib/storeGst';
import { escapeRegex } from '@/lib/validate';

/* /api/is-delivery-challan/item-lookup?business=&location=&barcode=

   What the challan form gets back when a barcode is typed: the item behind
   it, its HSN/UOM, how much of it this store actually holds, and the GST
   percentage the HSN master gives for that value. The rate is the same one
   the POST will resolve, so the totals the operator watches are the totals
   that get saved.

   Scoped to the SOURCE STORE - quantity at another store is not stock this
   document can ship. */

const SCREEN = { screen: SCREENS.IS_DELIVERY_CHALLAN, label: 'inter store delivery challans' };
const json = (d, s = 200) => Response.json(d, { status: s });

const rateOf = (row) => Number(
  row?.rsp || row?.wsp || row?.dp || row?.mrp || row?.rate || row?.saleRate || row?.purchaseRate || 0
) || 0;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const business = sp.get('business');
  const location = sp.get('location');
  const barcode = (sp.get('barcode') || '').trim();

  if (!barcode) return json({ found: null });

  await dbConnect();

  /* a lookup on an Add form must work for a role that may create but was not
     given Read */
  const denied = await screenDenialAnyAction({
    session, screens: [SCREEN.screen], label: SCREEN.label,
    actions: [PERM.READ, PERM.CREATE], businessId: business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const rx = new RegExp('^\\s*' + escapeRegex(barcode) + '\\s*$', 'i');

  const rows = await BarcodeLabel.find({
    $and: [
      { $or: [{ barcodeNo: rx }, { barcodeGenerated: rx }] },
      { status: BARCODE_STATUS.IN_STOCK },
      {
        $or: [
          { businessId: String(business || '') },
          { businessId: '' },
          { businessId: { $exists: false } },
        ],
      },
      ...(isValidObjectId(location)
        ? [{
          $or: [
            { locationId: String(location) },
            { locationId: '' },
            { locationId: { $exists: false } },
          ],
        }]
        : []),
    ],
  }).sort({ createdAt: 1 }).lean();

  if (!rows.length) return json({ found: null });

  const first = rows[0];
  const availableQty = Math.round(
    rows.reduce((a, r) => a + (Number(r.qtyNum) || 0), 0) * 100
  ) / 100;

  const hsn = String(first.hsn || first.hsnCode || '').trim();
  const unitRate = rateOf(first);
  const resolved = await resolveGstRate({ businessId: business, hsnCode: hsn, amount: unitRate });

  return json({
    found: {
      barcodeNo: first.barcodeNo || first.barcodeGenerated || barcode,
      barcodeId: String(first._id),
      itemCode: first.itemCode || '',
      itemName: first.printDescription || first.supplierDescription || '',
      hsn,
      uom: first.uom || first.uomType || '',
      availableQty,
      unitRate,
      gstPct: resolved.gstPct,
    },
  });
}
