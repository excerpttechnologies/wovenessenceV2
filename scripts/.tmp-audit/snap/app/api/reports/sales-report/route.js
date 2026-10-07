import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Contact from '@/models/Contact';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import {
  json, r2, scopeOf, pageOf, paged, salesDocuments, costByItemCode,
  linesOf, lineItemCode, lineItemName, lineQty, lineNet, lineTax,
} from '@/lib/reports';

/* /api/reports/sales-report - read-only.

   Sales performance with cost and profit, one row per supplier (or per item,
   depending on Report Type).

   WHERE COST COMES FROM: a sales line carries no cost, so it is resolved from
   what the goods were received at - BarcodeLabel.finalNet, falling back to
   purRate. That is the only record of a purchase rate per item in this
   project. The same rows carry supplierId, which is also the only link from a
   sold item back to the vendor it came from, so the supplier grouping is
   derived the same way.

   ---------------------------------------------------------------------------
   THIS WILL RETURN NO ROWS TODAY. The Sell screens store only an item code and
   name per line - no quantity, rate or tax - and the POS till never posts, so
   there is nothing to price, cost or total. Every figure below is computed
   properly against the shape a line should have, and reads both the proper
   field names and the display-label keys the generic screens currently write,
   so the report fills in the moment the capture gap is closed.
   --------------------------------------------------------------------------- */

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

  const reportType = sp.get('reportType') === 'item' ? 'item' : 'summary';
  const wantSupplier = sp.get('supplierId');

  const { sales } = await salesDocuments(sp, scope);
  const lines = sales.flatMap((d) => linesOf(d));

  const codes = [...new Set(lines.map(lineItemCode).filter(Boolean))];

  /* cost, and the vendor each item was received from - both off the barcode
     rows, resolved once for every code on the report */
  const [costs, barcodeRows] = await Promise.all([
    costByItemCode(codes, scope.businessId),
    codes.length
      ? BarcodeLabel.find({
        itemCode: { $in: codes },
        ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
      }).select('itemCode supplierId').lean()
      : [],
  ]);

  const supplierByCode = new Map();
  barcodeRows.forEach((b) => {
    const code = String(b.itemCode || '');
    if (code && b.supplierId && !supplierByCode.has(code)) {
      supplierByCode.set(code, String(b.supplierId));
    }
  });

  const supplierIds = [...new Set(supplierByCode.values())].filter((id) => isValidObjectId(id));
  const suppliers = supplierIds.length
    ? await Contact.find({ _id: { $in: supplierIds } })
      .select('businessName firstName lastName gstNo billingMobile').lean()
    : [];
  const supplierById = new Map(suppliers.map((s) => [String(s._id), s]));

  /* ------------------------------------------------------------ group up */
  const acc = new Map();

  lines.forEach((l) => {
    const code = lineItemCode(l);
    const supplierId = supplierByCode.get(code) || '';

    /* the Supplier filter narrows to one vendor's items */
    if (wantSupplier && isValidObjectId(wantSupplier) && supplierId !== String(wantSupplier)) return;

    const key = reportType === 'item' ? code : supplierId;
    if (!acc.has(key)) {
      acc.set(key, { key, code, name: '', supplierId, qty: 0, amount: 0, tax: 0, cost: 0 });
    }

    const row = acc.get(key);
    const qty = lineQty(l);
    if (!row.name) row.name = lineItemName(l);
    row.qty += qty;
    row.amount += lineNet(l);
    row.tax += lineTax(l);
    row.cost += (costs.get(code) || 0) * qty;
  });

  const rows = [...acc.values()].map((r) => {
    const s = supplierById.get(r.supplierId);
    const supplierName = s
      ? (s.businessName || [s.firstName, s.lastName].filter(Boolean).join(' ') || '')
      : '';
    const amount = r2(r.amount);
    const cost = r2(r.cost);
    const profit = r2(amount - cost);

    return {
      _id: r.key || '(unknown)',
      /* an item-wise row names the item; a summary row names the vendor */
      supplierName: reportType === 'item' ? (r.name || r.code) : supplierName,
      saleQty: r2(r.qty),
      saleAmount: amount,
      saleTax: r2(r.tax),
      totalCost: cost,
      totalProfit: profit,
      profitPct: amount ? r2((profit / amount) * 100) : 0,
      supplierGstNo: s?.gstNo || '',
      supplierMobile: s?.billingMobile || '',
    };
  })
    /* A line with no quantity, no value and no cost contributes nothing, and
       an unattributed line groups under an empty supplier - together they
       produce one blank row of zeroes that reads as a broken report rather
       than an empty one. Until the Sell screens capture quantities and rates
       every line looks like that, so drop them and let the table say "No data
       found". */
    .filter((r) => r.saleQty || r.saleAmount || r.totalCost)
    .sort((a, b) => b.saleAmount - a.saleAmount);

  const sum = (k) => r2(rows.reduce((a, r) => a + r[k], 0));
  const p = paged(rows, page, perPage);

  const totals = {
    saleQty: sum('saleQty'),
    saleAmount: sum('saleAmount'),
    saleTax: sum('saleTax'),
    totalCost: sum('totalCost'),
    totalProfit: sum('totalProfit'),
  };

  return json({
    /* the five stat tiles above the table */
    tiles: {
      totalSaleQty: totals.saleQty,
      totalSaleAmount: totals.saleAmount,
      totalSaleTax: totals.saleTax,
      totalCost: totals.totalCost,
      totalProfit: totals.totalProfit,
    },
    sections: [{ rows: p.rows, count: p.total, totals }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
}
