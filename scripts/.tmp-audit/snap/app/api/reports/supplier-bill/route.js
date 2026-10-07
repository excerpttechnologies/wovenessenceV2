import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Grc from '@/models/Grc';
import Grt from '@/models/Grt';
import Contact from '@/models/Contact';
import CompanyLocation from '@/models/CompanyLocation';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, paged,
  salesDocuments, linesOf, lineItemCode, lineQty,
} from '@/lib/reports';

/* /api/reports/supplier-bill - read-only.

   One row per goods receipt: what the supplier billed, how much came in, how
   much went back, and what is still on the shelf from it.

   Purchase Qty prefers the GRC's stored totalQuantity and falls back to
   counting the barcode rows written against it, because a GRC raised through
   Barcode Generation carries its quantity on the barcode rows rather than the
   header.

   Return Qty is matched by GRC NUMBER rather than by id - Grt stores
   grcNumber as a string and carries no reference to the GRC document.

   Net Sale Qty reads 0.00 until the Sell screens capture line quantities, so
   Close Qty currently equals purchases less returns. */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const filter = { ...scopeFilter(scope), ...dateRange(sp, 'grcDate') };

  const supplierId = sp.get('supplierId');
  if (supplierId && isValidObjectId(supplierId)) filter.supplierId = supplierId;

  const purchaseGroupId = sp.get('purchaseGroupId');
  if (purchaseGroupId && isValidObjectId(purchaseGroupId)) filter.purchaseGroupId = purchaseGroupId;

  const grcs = await Grc.find(filter).sort({ grcDate: -1 }).limit(5000).lean();

  /* ------------------------------------------------------- lookups ----- */
  const supplierIds = [...new Set(grcs.map((g) => g.supplierId).filter(Boolean).map(String))];
  const locIds = [...new Set(grcs.map((g) => g.locationId).filter(Boolean).map(String))];
  const grcNos = grcs.map((g) => g.grcNumber).filter(Boolean);
  const grcIds = grcs.map((g) => String(g._id));

  const [suppliers, locs, grts, barcodes] = await Promise.all([
    supplierIds.length
      ? Contact.find({ _id: { $in: supplierIds } })
        .select('businessName firstName lastName billingCity').lean() : [],
    locIds.length
      ? CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean() : [],
    grcNos.length
      ? Grt.find({ grcNumber: { $in: grcNos }, ...scopeFilter(scope) })
        .select('grcNumber qty items').lean() : [],
    grcIds.length
      ? BarcodeLabel.find({ grcId: { $in: grcIds } }).select('grcId qty itemCode').lean() : [],
  ]);

  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  /* returns per GRC number */
  const returnedByGrcNo = new Map();
  grts.forEach((t) => {
    const key = String(t.grcNumber || '');
    const qty = num(t.qty) || linesOf(t).reduce((a, l) => a + lineQty(l), 0);
    returnedByGrcNo.set(key, r2((returnedByGrcNo.get(key) || 0) + qty));
  });

  /* barcode quantity and the item codes each GRC brought in */
  const barcodeQtyByGrc = new Map();
  const codesByGrc = new Map();
  barcodes.forEach((b) => {
    const key = String(b.grcId || '');
    barcodeQtyByGrc.set(key, r2((barcodeQtyByGrc.get(key) || 0) + (num(b.qty) || 1)));
    if (b.itemCode) {
      if (!codesByGrc.has(key)) codesByGrc.set(key, new Set());
      codesByGrc.get(key).add(String(b.itemCode));
    }
  });

  /* quantity sold, per item code, so it can be attributed back to the GRC
     that brought those items in */
  const { sales } = await salesDocuments(sp, scope);
  const soldByCode = new Map();
  sales.forEach((d) => linesOf(d).forEach((l) => {
    const code = lineItemCode(l);
    if (!code) return;
    soldByCode.set(code, r2((soldByCode.get(code) || 0) + lineQty(l)));
  }));

  /* ---------------------------------------------------------- rows ----- */
  const wantCity = String(sp.get('city') || '').trim().toLowerCase();

  let rows = grcs.map((g) => {
    const s = supplierById.get(String(g.supplierId));
    const supplierName = s
      ? (s.businessName || [s.firstName, s.lastName].filter(Boolean).join(' ') || '')
      : '';
    const city = s?.billingCity || '';

    const billValue = r2(num(g.netAmount) || num(g.totalAmount) || num(g.taxable));
    const purchaseQty = r2(num(g.totalQuantity) || barcodeQtyByGrc.get(String(g._id)) || 0);
    const returnQty = returnedByGrcNo.get(String(g.grcNumber || '')) || 0;

    const codes = [...(codesByGrc.get(String(g._id)) || [])];
    const saleQty = r2(codes.reduce((a, c) => a + (soldByCode.get(c) || 0), 0));

    const closeQty = r2(purchaseQty - returnQty - saleQty);
    /* value the remaining stock at the average rate this bill came in at */
    const rate = purchaseQty ? billValue / purchaseQty : 0;

    return {
      _id: String(g._id),
      location: locName.get(String(g.locationId)) || '',
      supplier: supplierName + (city ? ', ' + city.toUpperCase() : ''),
      city,
      grcNo: g.grcNumber || '',
      date: g.grcDate || g.createdAt || null,
      billValue,
      purchaseQty,
      returnQty,
      saleQty,
      closeQty,
      closeBal: r2(closeQty * rate),
    };
  });

  if (wantCity) rows = rows.filter((r) => String(r.city).toLowerCase().includes(wantCity));

  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  const p = paged(rows, page, perPage);

  return json({
    tiles: {},
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: {
        billValue: sum('billValue'), purchaseQty: sum('purchaseQty'),
        returnQty: sum('returnQty'), saleQty: sum('saleQty'),
        closeQty: sum('closeQty'), closeBal: sum('closeBal'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
