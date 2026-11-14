import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { Supplier } from '@/lib/contacts';
import CompanyLocation from '@/models/CompanyLocation';
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

const text = (value) => String(value ?? '').trim();
const barcodeKey = (value) => text(value).toLowerCase();

function qtyOf(line) {
  return lineQty(line) || num(line.quantity ?? line.Quantity);
}

function amountOf(line, qty) {
  const netKeys = ['netAmount', 'Net Amount', 'beforeTax', 'Before Tax'];
  const hasNetAmount = netKeys.some((key) => (
    line?.[key] !== undefined && line[key] !== null && line[key] !== ''
  ));
  if (hasNetAmount) return lineNet(line);
  return num(line.rate ?? line.rsp ?? line.price ?? line.Rate) * qty;
}

function taxOf(line) {
  return lineTax(line)
    || num(line.taxAmount ?? line['Tax Amount'] ?? line.gstAmount ?? line['GST Amount']);
}

function barcodeOf(line) {
  return text(line.barcodeNo ?? line.barcode ?? line.barcodeGenerated ?? line['Barcode No']);
}

function rateOf(barcode) {
  return num(barcode?.finalNet) || num(barcode?.purRate);
}



export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  if (!scope.businessId) {
    return json({ error: 'Select a business to run this report.' }, 422);
  }
  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }

  const { page: requestedPage, perPage } = pageOf(sp);
  if (sp.get('reportType') && sp.get('reportType') !== 'summary') {
    return json({ error: 'Only Sales Summary is supported.' }, 422);
  }
  const supplierFilter = sp.get('supplierId') || '';
  if (supplierFilter && !isValidObjectId(supplierFilter)) {
    return json({ error: 'Supplier is invalid.' }, 422);
  }

  const { sales } = await salesDocuments(sp, scope);
  const entries = sales.flatMap((document) =>
    linesOf(document).map((line) => ({ document, line }))
  );
  const codes = [...new Set(entries.map(({ line }) => lineItemCode(line)).filter(Boolean))];
  const barcodes = [...new Set(entries.map(({ line }) => barcodeOf(line)).filter(Boolean))];
  const barcodeOr = [];
  if (codes.length) barcodeOr.push({ itemCode: { $in: codes } });
  if (barcodes.length) {
    barcodeOr.push(
      { barcodeNo: { $in: barcodes } },
      { barcodeGenerated: { $in: barcodes } },
      { oldBarcode: { $in: barcodes } }
    );
  }

  const barcodeFilter = {
    ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
    $or: barcodeOr.length ? barcodeOr : [{ _id: null }],
  };
  const [barcodeRows, costs] = await Promise.all([
    BarcodeLabel.find(barcodeFilter)
      .select('itemCode barcodeNo barcodeGenerated oldBarcode supplierId finalNet purRate')
      .lean(),
    costByItemCode(codes, scope.businessId),
  ]);

  const barcodeByNumber = new Map();
  const barcodeByCode = new Map();
  barcodeRows.forEach((barcode) => {
    [barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode]
      .map(barcodeKey)
      .filter(Boolean)
      .forEach((key) => { if (!barcodeByNumber.has(key)) barcodeByNumber.set(key, barcode); });
    const code = text(barcode.itemCode);
    if (code && !barcodeByCode.has(code)) barcodeByCode.set(code, barcode);
  });

  const grouped = new Map();
  entries.forEach(({ document, line }) => {
    const code = lineItemCode(line);
    const sourceBarcode = barcodeByNumber.get(barcodeKey(barcodeOf(line)));
    const itemBarcode = sourceBarcode || barcodeByCode.get(code);
    const supplierId = text(line.supplierId || line.SupplierId || itemBarcode?.supplierId);
    if (supplierFilter && supplierId !== supplierFilter) return;

    const locationId = text(document.locationId);
    const key = `${locationId}|${supplierId}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        key,
        locationId,
        supplierId,
        saleQty: 0,
        saleAmount: 0,
        saleTax: 0,
        totalCost: 0,
      });
    }

    const row = grouped.get(key);
    const qty = qtyOf(line);
    row.saleQty += qty;
    row.saleAmount += amountOf(line, qty);
    row.saleTax += taxOf(line);
    row.totalCost += (rateOf(sourceBarcode) || costs.get(code) || rateOf(itemBarcode) || 0) * qty;
  });

  const locationIds = [...new Set([...grouped.values()].map((row) => row.locationId))]
    .filter(isValidObjectId);
  const supplierIds = [...new Set([...grouped.values()].map((row) => row.supplierId))]
    .filter(isValidObjectId);

  const [locations, suppliers] = await Promise.all([
    locationIds.length
      ? CompanyLocation.find({ _id: { $in: locationIds } }).select('name businessPrintName').lean()
      : [],
    supplierIds.length
      ? Supplier.find({ _id: { $in: supplierIds } })
        .select('businessName firstName lastName gstNo billingMobile').lean()
      : [],
  ]);

  const locationById = new Map(locations.map((location) => [String(location._id), location]));
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));
  const search = (sp.get('q') || '').trim().toLowerCase();

  const rows = [...grouped.values()].map((row) => {
    const location = locationById.get(row.locationId);
    const supplier = supplierById.get(row.supplierId);
    const saleAmount = r2(row.saleAmount);
    const totalCost = r2(row.totalCost);
    const totalProfit = r2(saleAmount - totalCost);
    const supplierName = supplier
      ? supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')
      : '';

    return {
      _id: row.key || '(unknown)',
      locationId: row.locationId,
      locationName: location?.name || location?.businessPrintName || '',
      supplierId: row.supplierId,
      supplierName,
      supplierGstNo: supplier?.gstNo || '',
      supplierMobile: supplier?.billingMobile || '',
      saleQty: r2(row.saleQty),
      saleAmount,
      saleTax: r2(row.saleTax),
      totalCost,
      totalProfit,
      profitPct: saleAmount ? r2((totalProfit / saleAmount) * 100) : 0,
    };
  })
    .filter((row) => row.saleQty || row.saleAmount || row.saleTax || row.totalCost)
    .filter((row) => !search || [
      row.locationName, row.supplierName, row.supplierGstNo, row.supplierMobile,
    ].some((value) => value.toLowerCase().includes(search)))
    .sort((a, b) => b.saleAmount - a.saleAmount
      || a.locationName.localeCompare(b.locationName)
      || a.supplierName.localeCompare(b.supplierName));

  const totals = {
    saleQty: r2(rows.reduce((sum, row) => sum + row.saleQty, 0)),
    saleAmount: r2(rows.reduce((sum, row) => sum + row.saleAmount, 0)),
    saleTax: r2(rows.reduce((sum, row) => sum + row.saleTax, 0)),
    totalCost: r2(rows.reduce((sum, row) => sum + row.totalCost, 0)),
    totalProfit: r2(rows.reduce((sum, row) => sum + row.totalProfit, 0)),
  };

  const exportAll = sp.get('export') === '1';
  const pages = Math.max(1, Math.ceil(rows.length / perPage));
  const page = exportAll ? 1 : Math.min(requestedPage, pages);
  const pageRows = exportAll ? rows : paged(rows, page, perPage).rows;
  const pageTotals = {
    saleQty: r2(pageRows.reduce((sum, row) => sum + row.saleQty, 0)),
    saleAmount: r2(pageRows.reduce((sum, row) => sum + row.saleAmount, 0)),
    saleTax: r2(pageRows.reduce((sum, row) => sum + row.saleTax, 0)),
    totalCost: r2(pageRows.reduce((sum, row) => sum + row.totalCost, 0)),
    totalProfit: r2(pageRows.reduce((sum, row) => sum + row.totalProfit, 0)),
  };

  return json({
    tiles: {
      totalSaleQty: totals.saleQty,
      totalSaleAmount: totals.saleAmount,
      totalSaleTax: totals.saleTax,
      totalCost: totals.totalCost,
      totalProfit: totals.totalProfit,
    },
    rows: pageRows,
    total: rows.length,
    pages,
    page,
    perPage,
    totals,
    pageTotals,
    sections: [{ rows: pageRows, count: rows.length, totals: pageTotals }],
  });
}
