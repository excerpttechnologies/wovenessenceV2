import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import { requireSession } from '@/lib/session';
import { json, scopeOf, pageOf } from '@/lib/reports';
import {
  stockPosition, stockTotals, supplierKeysForFilters, loadSupplierMap,
} from '@/lib/stockPosition';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { escapeRegex } from '@/lib/validate';

/* /api/reports/supplier-bill-wise

   One row per GOODS RECEIPT (the supplier's bill) for the chosen supplier -
   the middle screen of Supplier Summary -> Bill-wise -> Batch-wise.

   A "bill" here is a Grc, identified by its grcNumber. The SUPPLIER's own
   bill number (Grc.vendorDocNo) is a different string and is not what this
   report's Bill No column shows - see SUPPLIER_STOCK_REPORTS_REQUIREMENTS.md
   §12, decision 1. Showing one and calling it the other is how two people
   end up arguing about the same bill.

   Quantities come from lib/stockPosition.js at bill grain, so the same unit
   is counted once and only once: a barcode's GRC_IN lands on its own bill,
   its POS_OUT lands on the same bill, and an item code received on two bills
   can no longer have one sale subtracted from both (the bug the old
   Supplier Bill Report has - its route now reads the same service).

   Item Count is the number of distinct item codes on the bill, taken from
   the units themselves rather than from Grc.items, which is Mixed and empty
   on the GRCs Barcode Generation wrote.

   Supplier is REQUIRED: a supplier list of every bill would be the whole
   purchase book, which is what the Purchase register is for. */

const s = (v) => String(v ?? '').trim();

const many = (sp, key) => String(sp.get(key) || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const EXPORT_CAP = 20000;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  const denied = await screenDenial({
    session,
    screen: SCREENS.SUPPLIER_BILL_WISE_REPORT,
    label: 'the supplier bill-wise report',
    action: PERM.READ,
    businessId: scope.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (sp.get('allLocations') === '1') scope.locationId = null;

  const from = s(sp.get('fromDate'));
  const to = s(sp.get('toDate'));
  if (!from || !to) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }
  const fromD = new Date(from);
  const toD = new Date(to);
  if (Number.isNaN(fromD.getTime()) || Number.isNaN(toD.getTime())) {
    return json({ error: 'Enter valid From and To dates.' }, 422);
  }
  if (fromD > toD) {
    return json({ error: 'Date From cannot be after Date To.' }, 422);
  }

  const supplierPicks = many(sp, 'supplierId');
  if (!supplierPicks.length) {
    return json({ error: 'Select a supplier.' }, 422);
  }

  const supplierKeys = await supplierKeysForFilters({
    businessId: scope.businessId,
    supplierPicks,
    city: s(sp.get('city')),
    cityGroupIds: many(sp, 'cityGroupId'),
    agentPicks: many(sp, 'agentId'),
  });
  if (supplierKeys && !supplierKeys.length) {
    return json({
      tiles: { totalBills: 0, openingQty: 0, purchaseQty: 0, soldQty: 0, closingQty: 0, closingValue: 0 },
      sections: [{ key: 'bills', rows: [], count: 0, totals: {} }],
      total: 0, pages: 1, page, perPage,
      note: 'No supplier matches those filters.',
    });
  }

  /* BILL NUMBERS. Grc is where a bill number is defined, and a bill filter
     is a search over that column - "contains", so a half-typed number still
     finds it. The matching numbers are resolved first and the stock engine
     is given the exact list. */
  const billPicks = many(sp, 'billNo');
  let grcNos = null;
  if (billPicks.length) {
    const grcFilter = {};
    if (scope.businessId) grcFilter.businessId = scope.businessId;
    if (scope.locationId) grcFilter.locationId = scope.locationId;
    const supplierIds = (supplierKeys || []).filter((k) => isValidObjectId(k));
    if (supplierIds.length) grcFilter.supplierId = { $in: supplierIds };
    grcFilter.$or = billPicks.map((v) => ({
      grcNumber: { $regex: escapeRegex(v), $options: 'i' },
    }));
    grcNos = [...new Set((await Grc.distinct('grcNumber', grcFilter)).map(s).filter(Boolean))];
  }

  const { rows, coverage } = await stockPosition({
    businessId: scope.businessId,
    locationId: scope.locationId,
    finYear: scope.finYear,
    from,
    to,
    supplierKeys,
    grcNos,
    groupBy: 'bill',
  });

  const vendors = await loadSupplierMap(rows.map((r) => r.supplierKey), scope.businessId);

  const shaped = rows.map((r) => {
    const vendor = vendors.get(r.supplierKey) || null;
    return {
      ...r,
      supplier: vendor?.name || (r.supplierKey ? r.supplierKey : 'Not Recorded'),
      supplierId: vendor?.id || '',
    };
  }).sort((a, b) => (
    (b.closingValue - a.closingValue)
    || String(a.grcNo).localeCompare(String(b.grcNo), undefined, { numeric: true })
  ));

  const totals = stockTotals(shaped);
  const tiles = {
    totalBills: shaped.length,
    openingQty: totals.openingQty,
    purchaseQty: totals.purchaseQty,
    soldQty: totals.soldQty,
    closingQty: totals.closingQty,
    closingValue: totals.closingValue,
  };

  const exporting = sp.get('export') === '1';
  const capped = exporting && shaped.length > EXPORT_CAP;
  const visible = exporting
    ? shaped.slice(0, EXPORT_CAP)
    : shaped.slice((page - 1) * perPage, page * perPage);

  /* BILL DATE for the rows on screen only - a GRC's own date, not the date of
     the first movement, so a back-dated bill reads as back-dated. One query
     for the page, never one per row. */
  const nos = [...new Set(visible.map((r) => r.grcNo).filter(Boolean))];
  const dates = new Map();
  if (nos.length) {
    const grcFilter = { grcNumber: { $in: nos } };
    if (scope.businessId) grcFilter.businessId = scope.businessId;
    const docs = await Grc.find(grcFilter).select('grcNumber grcDate vendorDocNo').lean();
    docs.forEach((d) => {
      if (!dates.has(d.grcNumber)) dates.set(d.grcNumber, d.grcDate || null);
    });
  }

  const rowsOut = visible.map((r) => ({
    ...r,
    billNo: r.grcNo,
    billDate: dates.get(r.grcNo) || null,
  }));

  return json({
    tiles,
    sections: [{
      key: 'bills',
      rows: rowsOut,
      count: shaped.length,
      totals,
    }],
    total: shaped.length,
    pages: Math.max(1, Math.ceil(shaped.length / perPage)),
    page,
    perPage,
    ...(coverage ? { coverage } : {}),
    ...(capped
      ? { note: `Exported the first ${EXPORT_CAP} of ${shaped.length} rows. Narrow the dates to take the rest.` }
      : {}),
  });
}
