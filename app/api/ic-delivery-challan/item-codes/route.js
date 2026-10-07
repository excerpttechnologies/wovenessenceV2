import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

/* /api/ic-delivery-challan/item-codes?search=&business=&location=

   Suggestions for the "Enter barcode number" box on the Inter Company Sell
   challan.

   Rows are BARCODES, not item codes - one row is one scannable unit, which
   is what the operator types. `barcodeNo` is the field to match on: every
   barcodeLabel row carries it, while barcodeGenerated is set on only a
   fraction of them. The item code is still searched and still returned, so
   somebody who knows the code can find its barcodes by typing it.

   Source is BarcodeLabel - the same collection Inventory > Barcode Item
   lists through /api/inventory-barcode-list - so what is offered here is
   exactly what that screen shows.

   Only IN_STOCK rows count: SOLD / transferred units are still barcode rows,
   but they are not stock this branch can send anywhere. */

const json = (d, s = 200) => Response.json(d, { status: s });
const LIMIT = 25;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  await dbConnect();
  const sp = new URL(req.url).searchParams;

  const search = (sp.get('search') || '').trim();
  const business = sp.get('business');
  const location = sp.get('location');

  const match = { status: BARCODE_STATUS.IN_STOCK };
  if (business && isValidObjectId(business)) match.businessId = String(business);
  if (location && isValidObjectId(location)) match.locationId = String(location);

  /* unanchored: barcodes and item codes are both compound (10-PF-CTNSLK),
     so operators search by the fragment they remember rather than by the
     leading segment */
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    match.$or = [{ barcodeNo: rx }, { barcodeGenerated: rx }, { itemCode: rx }];
  }

  /* GROUPED by barcode.

     The same printed barcode sits on many rows - 8A1000 is on ten of them at
     one branch, one per physical unit received. Listing them raw repeats the
     same number ten times and, worse, gives the dropdown ten children with
     the same React key. One entry per barcode, with the branch's total
     quantity behind it. */
  const rows = await BarcodeLabel.aggregate([
    { $match: match },
    {
      $group: {
        _id: { $ifNull: ['$barcodeNo', '$barcodeGenerated'] },
        qty: { $sum: { $ifNull: ['$qtyNum', { $ifNull: ['$qty', 0] }] } },
        itemCode: { $first: '$itemCode' },
        printDescription: { $first: '$printDescription' },
        supplierDescription: { $first: '$supplierDescription' },
      },
    },
    { $sort: { _id: 1 } },
    { $limit: LIMIT },
  ]);

  return json({
    rows: rows
      .filter((r) => r._id)
      .map((r) => ({
        barcodeNo: r._id,
        itemCode: r.itemCode || '',
        printDescription: r.printDescription || r.supplierDescription || '',
        qty: Math.round((Number(r.qty) || 0) * 100) / 100,
      })),
  });
}
