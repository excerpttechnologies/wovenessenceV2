import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Grc from '@/models/Grc';
import Grt from '@/models/Grt';
import { Supplier } from '@/lib/contacts';
import CompanyLocation from '@/models/CompanyLocation';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf, linesOf, lineQty,
} from '@/lib/reports';
import { supplierKeysForFilters } from '@/lib/stockPosition';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { escapeRegex } from '@/lib/validate';

/* /api/reports/supplier-bill - read-only.

   One row per goods receipt: what the supplier billed, how much came in, how
   much went back, and what is still on the shelf from it.

   WHAT WAS WRONG BEFORE (fixed here)

   The old route attributed sales to a bill by ITEM CODE: it collected the
   codes a GRC brought in, then subtracted every sale of those codes. If the
   same code arrived on two bills in the window, each bill had ALL of those
   sales taken off - the same units counted twice - so Close Qty and Close
   Bal were both wrong, and their totals wrong with them. Nothing on screen
   said so.

   A barcode row IS one unit of stock, and it carries the GRC that brought it
   in (barcodeLabel.grcId) plus its own lifecycle state. So the position of a
   bill is read from its own units:

     Purchase Qty = every unit the bill brought in
     Return Qty   = the units returned to the vendor (status VOID)
     Close Qty    = the units still IN_STOCK
     Sold / Out   = the rest (sold, or in transit on a transfer)
     Close Bal    = the cost of the remaining units, at each unit's own cost

   No item code is consulted, so a code received twice is counted once per
   bill, and a sale only ever comes off the bill whose unit was sold.

   Purchase Qty still falls back to Grc.totalQuantity when a GRC has no
   barcode rows at all (older receipts), and Return Qty still comes from Grt
   by GRC NUMBER - Grt stores grcNumber as a string and carries no reference
   to the GRC document.

   PAGINATION is database-side now: count, then read the page. The old route
   read up to 5,000 GRCs and paged them in memory, which silently dropped
   everything past 5,000 and made the totals cover only what it had read. */

const s = (v) => String(v ?? '').trim();

const many = (sp, key) => String(sp.get(key) || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

/* String-typed quantities and prices - $convert, never $toDouble, which
   throws on the '' the barcode form stores. */
const toNum = (input) => ({
  $convert: { input, to: 'double', onError: 0, onNull: 0 },
});
const UNIT_QTY = { $cond: [{ $gt: [toNum('$qtyNum'), 0] }, toNum('$qtyNum'), toNum('$qty')] };
const UNIT_COST = {
  $let: {
    vars: { fn: toNum('$finalNet'), pr: toNum('$purRate') },
    in: { $cond: [{ $gt: ['$$fn', 0] }, '$$fn', '$$pr'] },
  },
};

const nameOf = (c) => (c
  ? (s(c.businessName) || [c.firstName, c.lastName].filter(Boolean).join(' ') || '')
  : '');

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  const denied = await screenDenial({
    session,
    screen: SCREENS.SUPPLIER_BILL_REPORT,
    label: 'the supplier bill report',
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
  if (Number.isNaN(new Date(from).getTime()) || Number.isNaN(new Date(to).getTime())) {
    return json({ error: 'Enter valid From and To dates.' }, 422);
  }

  /* ---- filters, all server-side ---------------------------------------- */
  const filter = { ...scopeFilter(scope), ...dateRange(sp, 'grcDate') };

  /* supplier / city / city group all reach a vendor's id the same way the
     stock reports do - see supplierKeysForFilters. Grc.supplierId is an
     ObjectId, so only the id spelling of each key applies here. */
  const supplierPicks = many(sp, 'supplierId');
  const city = s(sp.get('city'));
  const cityGroupIds = many(sp, 'cityGroupId');
  if (supplierPicks.length || city || cityGroupIds.length) {
    const keys = await supplierKeysForFilters({
      businessId: scope.businessId,
      supplierPicks,
      city,
      cityGroupIds,
      agentPicks: [],
    });
    const ids = (keys || []).filter((k) => isValidObjectId(k));
    if (!ids.length) {
      return json({
        tiles: {},
        sections: [{ rows: [], count: 0, totals: {} }],
        total: 0, pages: 1, page, perPage,
        note: 'No supplier matches those filters.',
      });
    }
    filter.supplierId = { $in: ids };
  }

  const purchaseGroupId = s(sp.get('purchaseGroupId'));
  if (purchaseGroupId && isValidObjectId(purchaseGroupId)) filter.purchaseGroupId = purchaseGroupId;

  const agentPicks = many(sp, 'agentId').filter((v) => isValidObjectId(v));
  if (agentPicks.length) filter.agentId = { $in: agentPicks };

  /* bill number: "contains", so a half-typed GRC number still finds it */
  const billPicks = many(sp, 'billNo');
  if (billPicks.length) {
    filter.$or = billPicks.map((v) => ({
      grcNumber: { $regex: escapeRegex(v), $options: 'i' },
    }));
  }

  /* ---- SERVER-SIDE pagination: count, then read only this page ---------- */
  const total = await Grc.countDocuments(filter);
  const grcs = await Grc.find(filter)
    .sort({ grcDate: -1, _id: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* the same filter without the window, so the totals cover the WHOLE result
     and not the page - capped where a year of receipts would be absurd */
  const SET_CAP = 20000;
  const setDocs = await Grc.find(filter)
    .select('grcNumber totalQuantity netAmount totalAmount taxable')
    .limit(SET_CAP + 1)
    .lean();
  const truncated = setDocs.length > SET_CAP;
  const allDocs = truncated ? setDocs.slice(0, SET_CAP) : setDocs;
  const allIds = allDocs.map((g) => String(g._id));

  const [suppliers, locs, grts, stats] = await Promise.all([
    (async () => {
      const ids = [...new Set(grcs.map((g) => g.supplierId).filter(Boolean).map(String))];
      return ids.length
        ? Supplier.find({ _id: { $in: ids } })
          .select('businessName firstName lastName billingCity').lean()
        : [];
    })(),
    (async () => {
      const ids = [...new Set(grcs.map((g) => g.locationId).filter(Boolean).map(String))];
      return ids.length
        ? CompanyLocation.find({ _id: { $in: ids } }).select('name').lean()
        : [];
    })(),
    (async () => {
      const nos = [...new Set(allDocs.map((g) => s(g.grcNumber)).filter(Boolean))];
      return nos.length
        ? Grt.find({ grcNumber: { $in: nos }, ...scopeFilter(scope) })
          .select('grcNumber qty items').lean()
        : [];
    })(),
    barcodeStats(allIds),
  ]);

  const supplierById = new Map(suppliers.map((v) => [String(v._id), v]));
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  /* returns per GRC number */
  const returnedByGrcNo = new Map();
  grts.forEach((t) => {
    const key = s(t.grcNumber);
    const qty = num(t.qty) || linesOf(t).reduce((a, l) => a + lineQty(l), 0);
    returnedByGrcNo.set(key, r2((returnedByGrcNo.get(key) || 0) + qty));
  });

  /* one row's numbers, from its own units; the header total is the fallback
     for a GRC that never had barcode rows written against it */
  const rowOf = (g) => {
    const st = stats.get(String(g._id)) || null;
    const billValue = r2(num(g.netAmount) || num(g.totalAmount) || num(g.taxable));
    const purchaseQty = st && st.barcodeQty > 0
      ? r2(st.barcodeQty)
      : r2(num(g.totalQuantity));
    const returnQty = st && st.barcodeQty > 0
      ? r2(st.voidQty)
      : (returnedByGrcNo.get(s(g.grcNumber)) || 0);
    const closeQty = st && st.barcodeQty > 0
      ? r2(st.closeQty)
      : r2(Math.max(0, purchaseQty - returnQty));
    /* at each remaining unit's own cost when the units are known, else at
       the average rate this bill came in at */
    const closeBal = st && st.barcodeQty > 0
      ? r2(st.closeBal)
      : r2(closeQty * (purchaseQty ? billValue / purchaseQty : 0));
    const outQty = r2(purchaseQty - returnQty - closeQty);

    return {
      _id: String(g._id),
      location: locName.get(String(g.locationId)) || '',
      supplier: (nameOf(supplierById.get(String(g.supplierId))) || '') ,
      grcNo: s(g.grcNumber),
      date: g.grcDate || g.createdAt || null,
      billValue,
      purchaseQty,
      returnQty,
      saleQty: outQty,
      closeQty,
      closeBal,
    };
  };

  const rows = grcs.map(rowOf);
  const totals = allDocs.reduce((a, g) => {
    const r = rowOf(g);
    a.billValue += r.billValue;
    a.purchaseQty += r.purchaseQty;
    a.returnQty += r.returnQty;
    a.saleQty += r.saleQty;
    a.closeQty += r.closeQty;
    a.closeBal += r.closeBal;
    return a;
  }, { billValue: 0, purchaseQty: 0, returnQty: 0, saleQty: 0, closeQty: 0, closeBal: 0 });
  Object.keys(totals).forEach((k) => { totals[k] = r2(totals[k]); });

  return json({
    tiles: {},
    sections: [{
      key: 'bills',
      rows,
      count: total,
      totals,
    }],
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
    ...(truncated
      ? { note: `Totals cover the first ${SET_CAP} bills. Narrow the dates to total the rest.` }
      : {}),
  });
}

/* Quantity and cost per GRC, from its own barcode units. Grouped by grcId so
   every unit lands on the bill that brought it in exactly once. */
async function barcodeStats(grcIds) {
  if (!grcIds.length) return new Map();

  const rows = await BarcodeLabel.aggregate([
    { $match: { grcId: { $in: grcIds } } },
    {
      $group: {
        _id: '$grcId',
        barcodeQty: { $sum: UNIT_QTY },
        voidQty: {
          $sum: { $cond: [{ $eq: ['$status', BARCODE_STATUS.VOID] }, UNIT_QTY, 0] },
        },
        closeQty: {
          $sum: { $cond: [{ $eq: ['$status', BARCODE_STATUS.IN_STOCK] }, UNIT_QTY, 0] },
        },
        closeBal: {
          $sum: {
            $cond: [
              { $eq: ['$status', BARCODE_STATUS.IN_STOCK] },
              { $multiply: [UNIT_QTY, UNIT_COST] },
              0,
            ],
          },
        },
      },
    },
  ]).allowDiskUse(true);

  return new Map(rows.map((r) => [String(r._id), {
    barcodeQty: num(r.barcodeQty),
    voidQty: num(r.voidQty),
    closeQty: num(r.closeQty),
    closeBal: num(r.closeBal),
  }]));
}
