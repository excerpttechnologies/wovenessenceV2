import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Item from '@/models/Item';
import { requireSession } from '@/lib/session';
import { json, scopeOf, pageOf } from '@/lib/reports';
import {
  stockPosition, stockTotals, supplierKeysForFilters, loadSupplierMap,
} from '@/lib/stockPosition';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { escapeRegex } from '@/lib/validate';

/* /api/reports/supplier-batch-wise

   The last screen of Supplier Summary -> Bill-wise -> Batch-wise: one row per
   ITEM CODE on the chosen bill.

   BATCH NUMBER: this database has no batch master and no lot table. What a
   unit carries is barcodeLabel.batchNo (and batchUnique), written when the
   unit was generated - one barcode can stand for a whole received batch
   (batchType 'batch') or for a single piece. So Batch No shows that field,
   and a unit that has none shows blank rather than an invented number. See
   SUPPLIER_STOCK_REPORTS_REQUIREMENTS.md §2 and §12 (decision 7 of the
   original prompt is answered here: there is nothing to fake).

   Quantities come from lib/stockPosition.js at item grain over the units of
   that one bill, so they agree with Bill-wise and Summary to the piece.

   Purchase Rate is the weighted cost of what was received on this bill in
   the window (received value / received quantity), which is the rate the
   units were actually bought at - not today's price. */

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
    screen: SCREENS.SUPPLIER_BATCH_WISE_REPORT,
    label: 'the supplier batch-wise report',
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
  if (!supplierPicks.length) return json({ error: 'Select a supplier.' }, 422);

  const billPicks = many(sp, 'billNo');
  if (!billPicks.length) return json({ error: 'Select a bill number.' }, 422);

  const supplierKeys = await supplierKeysForFilters({
    businessId: scope.businessId,
    supplierPicks,
    city: s(sp.get('city')),
    cityGroupIds: many(sp, 'cityGroupId'),
    agentPicks: many(sp, 'agentId'),
  });

  /* the chosen bill number(s), resolved on Grc - the only collection where a
     bill number means anything */
  const grcFilter = {};
  if (scope.businessId) grcFilter.businessId = scope.businessId;
  if (scope.locationId) grcFilter.locationId = scope.locationId;
  const supplierIds = (supplierKeys || []).filter((k) => isValidObjectId(k));
  if (supplierKeys && !supplierIds.length) {
    return json({
      tiles: { totalItemCodes: 0, openingQty: 0, purchaseQty: 0, soldQty: 0, closingQty: 0, closingValue: 0 },
      sections: [{ key: 'items', rows: [], count: 0, totals: {} }],
      total: 0, pages: 1, page, perPage,
      note: 'No supplier matches those filters.',
    });
  }
  if (supplierIds.length) grcFilter.supplierId = { $in: supplierIds };
  grcFilter.$or = billPicks.map((v) => ({
    grcNumber: { $regex: '^\\s*' + escapeRegex(v) + '\\s*$', $options: 'i' },
  }));
  const grcNos = [...new Set((await Grc.distinct('grcNumber', grcFilter)).map(s).filter(Boolean))];
  if (!grcNos.length) {
    return json({
      tiles: { totalItemCodes: 0, openingQty: 0, purchaseQty: 0, soldQty: 0, closingQty: 0, closingValue: 0 },
      sections: [{ key: 'items', rows: [], count: 0, totals: {} }],
      total: 0, pages: 1, page, perPage,
      note: 'No bill matches that number for this supplier.',
    });
  }

  /* ITEM filters. The picker sends Item ids; a stock row carries the item's
     code (or, on imported rows, its name), so the picks are resolved to both
     spellings first - the same two-keyed handling Master Stock Report uses. */
  const patterns = [];
  const itemPicks = many(sp, 'itemId').filter((v) => isValidObjectId(v));
  if (itemPicks.length) {
    const items = await Item.find({ _id: { $in: itemPicks } }).select('itemCode name').lean();
    const keys = [...new Set(items.flatMap((i) => [s(i.itemCode), s(i.name)]).filter(Boolean))];
    if (!keys.length) {
      return json({
        tiles: { totalItemCodes: 0, openingQty: 0, purchaseQty: 0, soldQty: 0, closingQty: 0, closingValue: 0 },
        sections: [{ key: 'items', rows: [], count: 0, totals: {} }],
        total: 0, pages: 1, page, perPage,
        note: 'No item matches that choice on this bill.',
      });
    }
    keys.forEach((k) => patterns.push(new RegExp('^\\s*' + escapeRegex(k) + '\\s*$', 'i')));
  }
  /* item code typed: partial match, so "TS" finds TS001 and TS0012 */
  many(sp, 'itemSearch').forEach((v) => patterns.push(new RegExp(escapeRegex(v), 'i')));

  const { rows, coverage } = await stockPosition({
    businessId: scope.businessId,
    locationId: scope.locationId,
    finYear: scope.finYear,
    from,
    to,
    supplierKeys,
    grcNos,
    itemCodePatterns: patterns.length ? patterns : null,
    groupBy: 'item',
  });

  const vendors = await loadSupplierMap(rows.map((r) => r.supplierKey), scope.businessId);

  const shaped = rows.map((r) => {
    const vendor = vendors.get(r.supplierKey) || null;
    return {
      ...r,
      supplier: vendor?.name || (r.supplierKey ? r.supplierKey : 'Not Recorded'),
      supplierId: vendor?.id || '',
      batchNo: r.batchNo || '',
    };
  }).sort((a, b) => (
    (b.closingValue - a.closingValue)
    || String(a.itemCode).localeCompare(String(b.itemCode), undefined, { numeric: true })
    || String(a.batchNo).localeCompare(String(b.batchNo))
  ));

  const totals = stockTotals(shaped);
  const tiles = {
    totalItemCodes: shaped.length,
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

  /* the bill's own date, for the page only */
  const dates = new Map();
  if (grcNos.length) {
    const gfilter = { grcNumber: { $in: grcNos } };
    if (scope.businessId) gfilter.businessId = scope.businessId;
    const docs = await Grc.find(gfilter).select('grcNumber grcDate').lean();
    docs.forEach((d) => { if (!dates.has(d.grcNumber)) dates.set(d.grcNumber, d.grcDate || null); });
  }

  const rowsOut = visible.map((r) => ({
    ...r,
    billNo: r.grcNo,
    billDate: dates.get(r.grcNo) || null,
  }));

  return json({
    tiles,
    sections: [{
      key: 'items',
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
