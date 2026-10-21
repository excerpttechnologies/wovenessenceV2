import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import Grc from '@/models/Grc';
import { json, num, r2, scopeOf, pageOf, paged } from '@/lib/reports';

/* /api/reports/barcode-report - read-only.

   Every barcode row generated for one item code, with the rate it was
   received at and the four prices printed on its label.

   Item Code is required: this reads the barcode collection one item at a
   time rather than dumping it, which is what the deployed screen does. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const { businessId, locationId, finYear } = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  const itemCode = String(sp.get('itemCode') || '').trim();
  if (!itemCode) return json({ error: 'Item Code is required.' }, 422);

  /* BarcodeLabel stores its scope as plain strings, and locationId is very
     often blank - the barcode screen does not always set it. Filtering
     strictly on a location would hide real rows, so a chosen location matches
     that location OR an unassigned one. The same compromise the inter company
     item lookup makes, and for the same reason. */
  const filter = { itemCode: { $regex: escapeRegex(itemCode), $options: 'i' } };
  if (businessId) filter.businessId = String(businessId);
  if (finYear) filter.finYear = finYear;
  if (locationId) filter.locationId = { $in: [String(locationId), '', null] };

  const rows = await BarcodeLabel.find(filter).sort({ createdAt: -1 }).limit(5000).lean();

  /* the GRC each barcode was received on */
  const grcIds = [...new Set(
    rows.map((r) => r.grcId).filter((id) => id && isValidObjectId(String(id)))
  )];
  const grcs = grcIds.length
    ? await Grc.find({ _id: { $in: grcIds } }).select('grcNumber').lean()
    : [];
  const grcNoById = new Map(grcs.map((g) => [String(g._id), g.grcNumber || '']));

  const mapped = rows.map((r) => ({
    _id: String(r._id),
    barcodeGenerated: r.barcodeGenerated || '',
    itemCode: r.itemCode || '',
    description: r.printDescription || r.supplierDescription || '',
    qty: num(r.qty),
    uom: r.uom || '',
    hsn: r.hsn || '',
    purRate: num(r.purRate),
    finalNet: num(r.finalNet),
    gst: num(r.gst),
    retailPrice: num(r.retailPrice),
    offerPrice: num(r.offerPrice),
    wspPrice: num(r.wspPrice),
    dpPrice: num(r.dpPrice),
    grcNo: grcNoById.get(String(r.grcId)) || '',
  }));

  const p = paged(mapped, page, perPage);

  return json({
    tiles: {},
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        qty: r2(mapped.reduce((a, r) => a + r.qty, 0)),
        /* value received = line rate x quantity, summed over the whole result
           set rather than the visible page */
        finalNet: r2(mapped.reduce((a, r) => a + r.finalNet * r.qty, 0)),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
