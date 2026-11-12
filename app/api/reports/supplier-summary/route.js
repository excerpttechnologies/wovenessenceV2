import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { json, scopeOf, pageOf } from '@/lib/reports';
import {
  stockPosition, stockTotals, supplierKeysForFilters, loadSupplierMap,
} from '@/lib/stockPosition';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/reports/supplier-summary

   Supplier Summary Report - one row per supplier over a date window.

   Every quantity comes from lib/stockPosition.js, the one service the three
   supplier reports share, which reads the append-only movement ledger:

     opening = SUM(qty) before fromDate
     closing = SUM(qty) before toDate
     the columns in between are the movement types counted inside the window

   so a row always satisfies opening + in - out = closing. Nothing here
   re-derives stock from purchases and sales: a transfer, an adjustment and a
   vendor return are each their own movement, and counting invoices minus
   sales would miss all three.

   Filters: dates (required), location, supplier, city, city group, agent.
   City / city group / agent reach the supplier through the Supplier master
   the same way Master Stock Report does, because a stock row carries only
   the vendor key, never its city or agent.

   NOT IMPLEMENTED, deliberately: an "Inter Company Sales" switch. Inter
   company receipts live in IcPurchaseReceived / IcAutoPurchaseReturn, which
   are separate document families from Grc; deciding whether a branch
   transfer counts as a purchase is a business rule this database does not
   answer (SUPPLIER_STOCK_REPORTS_REQUIREMENTS.md §12, decision 7). Making
   the switch up would change every quantity on the screen arbitrarily. */

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
    screen: SCREENS.SUPPLIER_SUMMARY_REPORT,
    label: 'the supplier summary report',
    action: PERM.READ,
    businessId: scope.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  /* "All Locations" on the report's own filter means the top-bar location
     must not be applied on top of it (app/api/reports/item-stock does the
     same, and ReportView sends the flag). */
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

  const supplierKeys = await supplierKeysForFilters({
    businessId: scope.businessId,
    supplierPicks: many(sp, 'supplierId'),
    city: s(sp.get('city')),
    cityGroupIds: many(sp, 'cityGroupId'),
    agentPicks: many(sp, 'agentId'),
  });

  const { rows, coverage } = await stockPosition({
    businessId: scope.businessId,
    locationId: scope.locationId,
    finYear: scope.finYear,
    from,
    to,
    supplierKeys,
    groupBy: 'supplier',
  });

  const vendors = await loadSupplierMap(rows.map((r) => r.supplierKey), scope.businessId);

  const shaped = rows.map((r) => {
    const vendor = vendors.get(r.supplierKey) || null;
    return {
      ...r,
      supplier: vendor?.name || (r.supplierKey ? r.supplierKey : 'Not Recorded'),
      supplierCode: vendor?.code || '',
      supplierId: vendor?.id || '',
    };
  }).sort((a, b) => (
    (b.closingValue - a.closingValue)
    || String(a.supplier).localeCompare(String(b.supplier))
    || String(a.supplierKey).localeCompare(String(b.supplierKey))
  ));

  const totals = stockTotals(shaped);
  const tiles = {
    totalSuppliers: shaped.length,
    openingQty: totals.openingQty,
    purchaseQty: totals.purchaseQty,
    soldQty: totals.soldQty,
    closingQty: totals.closingQty,
    closingValue: totals.closingValue,
  };

  /* an export carries the whole filtered result, not the page on screen */
  const exporting = sp.get('export') === '1';
  const capped = exporting && shaped.length > EXPORT_CAP;
  const visible = exporting
    ? shaped.slice(0, EXPORT_CAP)
    : shaped.slice((page - 1) * perPage, page * perPage);

  return json({
    tiles,
    sections: [{
      key: 'suppliers',
      rows: visible,
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
