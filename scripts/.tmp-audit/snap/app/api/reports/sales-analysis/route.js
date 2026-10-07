import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import CompanyLocation from '@/models/CompanyLocation';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import {
  json, r2, scopeOf, salesDocuments, docValue, docQty,
  linesOf, lineItemCode, lineItemName, lineQty, lineNet,
} from '@/lib/reports';

/* /api/reports/sales-analysis - read-only.

   Three tables on one screen: performance by location, then the top five
   product groups and the top five items by net sales.

   Everything is net of returns, and the basket averages are derived from bill
   count, so a location that sold the same value across fewer bills reads as
   the stronger one.

   ---------------------------------------------------------------------------
   THIS WILL RETURN NO ROWS TODAY, and that is a data-capture gap rather than a
   fault here. The Sell screens go through TransactionFormView's `scan` card,
   which stores only an item code and name on each line - no quantity, rate or
   tax - and the POS till never posts at all. So there is nothing to total.

   The aggregation below is written against the shape a line SHOULD have, and
   reads both the proper field names and the display-label keys the generic
   screens currently write, so it fills in the moment either is populated.
   --------------------------------------------------------------------------- */

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);

  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'From Date and End Date are required.' }, 422);
  }

  const { sales, returns } = await salesDocuments(sp, scope);

  /* one accumulator shape for all three tables */
  const touch = (map, key) => {
    if (!map.has(key)) {
      map.set(key, {
        key, name: '', salesValue: 0, returnValue: 0,
        saleQty: 0, returnQty: 0, billCount: 0,
      });
    }
    return map.get(key);
  };

  const finish = (r, label) => {
    const netSales = r2(r.salesValue - r.returnValue);
    const netQty = r2(r.saleQty - r.returnQty);
    return {
      _id: r.key || '(unassigned)',
      label,
      salesValue: r2(r.salesValue),
      returnValue: r2(r.returnValue),
      netSales,
      saleQty: r2(r.saleQty),
      returnQty: r2(r.returnQty),
      netQty,
      billCount: r.billCount,
      /* a bill count of zero must not divide */
      avgBasketQty: r.billCount ? r2(netQty / r.billCount) : 0,
      avgBasketValue: r.billCount ? r2(netSales / r.billCount) : 0,
    };
  };

  /* ------------------------------------------------- location wise ------ */
  const byLocation = new Map();

  sales.forEach((d) => {
    const row = touch(byLocation, String(d.locationId || ''));
    row.salesValue += docValue(d);
    row.saleQty += docQty(d);
    row.billCount += 1;
  });
  returns.forEach((d) => {
    const row = touch(byLocation, String(d.locationId || ''));
    row.returnValue += docValue(d);
    row.returnQty += docQty(d);
  });

  const locIds = [...byLocation.keys()].filter((id) => id && isValidObjectId(id));
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  const locationRows = [...byLocation.values()]
    .map((r) => finish(r, locName.get(r.key) || '(unassigned)'))
    .sort((a, b) => b.netSales - a.netSales);

  /* ------------------------------------- item wise, then group wise ----- */
  const byItem = new Map();
  const addLines = (docs, isSale) => docs.forEach((d) => {
    linesOf(d).forEach((l) => {
      const code = lineItemCode(l);
      if (!code) return;
      const row = touch(byItem, code);
      if (!row.name) row.name = lineItemName(l);
      if (isSale) {
        row.salesValue += lineNet(l);
        row.saleQty += lineQty(l);
        row.billCount += 1;
      } else {
        row.returnValue += lineNet(l);
        row.returnQty += lineQty(l);
      }
    });
  });
  addLines(sales, true);
  addLines(returns, false);

  const codes = [...byItem.keys()];
  const items = codes.length
    ? await Item.find({
      itemCode: { $in: codes },
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
    }).select('itemCode name subGroupId').lean()
    : [];
  const itemByCode = new Map(items.map((i) => [String(i.itemCode), i]));

  const groupIds = [...new Set(items.map((i) => i.subGroupId).filter(Boolean).map(String))];
  const groups = groupIds.length
    ? await ProductGroup.find({ _id: { $in: groupIds } }).select('name').lean()
    : [];
  const groupName = new Map(groups.map((g) => [String(g._id), g.name || '']));

  const itemRows = [...byItem.values()]
    .map((r) => finish(r, r.name || itemByCode.get(r.key)?.name || r.key))
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, 5);

  /* groups roll up from the item accumulator - one pass, no second query */
  const byGroup = new Map();
  byItem.forEach((r, code) => {
    const item = itemByCode.get(code);
    const label = (item && groupName.get(String(item.subGroupId))) || '(ungrouped)';
    const row = touch(byGroup, label);
    row.salesValue += r.salesValue;
    row.returnValue += r.returnValue;
    row.saleQty += r.saleQty;
    row.returnQty += r.returnQty;
    row.billCount += r.billCount;
  });

  const groupRows = [...byGroup.values()]
    .map((r) => finish(r, r.key))
    .sort((a, b) => b.netSales - a.netSales)
    .slice(0, 5);

  return json({
    tiles: {},
    sections: [
      { rows: locationRows, count: locationRows.length, totals: {} },
      { rows: groupRows, count: groupRows.length, totals: {} },
      { rows: itemRows, count: itemRows.length, totals: {} },
    ],
    total: locationRows.length,
    pages: 1,
    page: 1,
  });
}
