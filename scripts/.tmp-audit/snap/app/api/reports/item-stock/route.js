import { Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import CompanyLocation from '@/models/CompanyLocation';
import { json, num, r2, scopeOf, pageOf, paged } from '@/lib/reports';

/* /api/reports/item-stock - read-only.

   Opening, inward, outward and closing stock for a window.

   WHAT CHANGED, AND WHY.

   This report used to carry a note explaining that the project had no stock
   ledger, so movement was inferred: inward was "barcode rows created inside
   the window", outward was matched from sale documents by item code, and the
   note admitted outward read 0.00 because the till wrote its line item code
   under a different key. Closing stock therefore equalled everything ever
   received, for every item, always.

   There is a ledger now - models/StockMovement.js - and every event that
   moves stock writes to it: goods received, transferred out, received at the
   destination, returned, sold, credited back. So the four figures are no
   longer inferred from anything:

     opening  net of every movement BEFORE the window
     inward   sum of positive movements inside it
     outward  sum of negative movements inside it
     closing  opening + inward - outward

   and closing agrees with the barcode rows that are actually IN_STOCK,
   because both are written by the same transaction.

   The three tabs are unchanged - groupwise, itemwise, detailed - so the
   screen that reads this route did not have to change. `movementwise` is
   added for the requirement's barcode-level view. */

export const GET = handler(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const tab = ['detailed', 'itemwise', 'movementwise'].includes(sp.get('tab'))
    ? sp.get('tab') : 'groupwise';

  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  if (!from || !to) return json({ error: 'Date From and Date To are required.' }, 422);

  const start = new Date(from);
  const end = new Date(to + 'T23:59:59.999');

  /* AGGREGATION DOES NOT CAST.

     scopeOf() hands back ids as strings. Mongoose casts those to ObjectId for
     find(), but NOT inside an aggregation pipeline's $match - it has no schema
     to cast against there. Passing the string matched nothing, and because the
     pipeline then returned an empty array the whole report read as zeros
     rather than failing. Cast explicitly. */
  const base = {};
  if (scope.businessId) base.businessId = toId(scope.businessId);
  if (scope.finYear) base.finYear = scope.finYear;

  /* A movement is counted against a location if either end is it: a transfer
     out reduces the source, the matching transfer in increases the
     destination. With no location chosen the whole business is reported. */
  const atLocation = scope.locationId
    ? { $or: [{ fromLocationId: toId(scope.locationId) }, { toLocationId: toId(scope.locationId) }] }
    : null;

  const withWindow = (range) => ({
    ...base,
    ...(atLocation ? { $and: [atLocation] } : {}),
    ...(range ? { at: range } : {}),
  });

  const [openingRows, windowRows] = await Promise.all([
    /* everything up to the moment the window starts */
    /* Deliberately NOT wrapped in .catch(() => []). A pipeline that fails
       must fail loudly: swallowing it returns zeros, which read exactly like
       a period with no trading. */
    StockMovement.aggregate([
      { $match: withWindow({ $lt: start }) },
      { $group: { _id: '$itemCode', qty: { $sum: signedFor(scope.locationId) }, name: { $first: '$itemName' } } },
    ]),
    StockMovement.aggregate([
      { $match: withWindow({ $gte: start, $lte: end }) },
      {
        $group: {
          _id: { code: '$itemCode', type: '$type' },
          qty: { $sum: signedFor(scope.locationId) },
          name: { $first: '$itemName' },
          events: { $sum: 1 },
        },
      },
    ]),
  ]);

  /* ------------------------------------------------------ assemble ------ */
  const byItem = new Map();
  const touch = (code, name) => {
    if (!code) return null;
    if (!byItem.has(code)) {
      byItem.set(code, {
        code, name: name || '', open: 0, inward: 0, outward: 0,
        received: 0, transferredIn: 0, transferredOut: 0,
        sold: 0, returned: 0, adjusted: 0, events: 0,
      });
    }
    const row = byItem.get(code);
    if (!row.name && name) row.name = name;
    return row;
  };

  openingRows.forEach((r) => {
    const row = touch(r._id, r.name);
    if (row) row.open = r2(r.qty);
  });

  windowRows.forEach((r) => {
    const row = touch(r._id.code, r.name);
    if (!row) return;
    const qty = num(r.qty);
    row.events += r.events || 0;

    if (qty >= 0) row.inward = r2(row.inward + qty);
    else row.outward = r2(row.outward + Math.abs(qty));

    /* the breakdown the requirement asks for: received / transferred /
       returned / sold, each as its own column rather than one net figure */
    switch (r._id.type) {
      case MOVEMENT_TYPES.GRC_IN: row.received = r2(row.received + qty); break;
      case MOVEMENT_TYPES.TRANSFER_IN: row.transferredIn = r2(row.transferredIn + qty); break;
      case MOVEMENT_TYPES.TRANSFER_OUT: case MOVEMENT_TYPES.ECOM_OUT:
        row.transferredOut = r2(row.transferredOut + Math.abs(qty)); break;
      case MOVEMENT_TYPES.POS_OUT: row.sold = r2(row.sold + Math.abs(qty)); break;
      case MOVEMENT_TYPES.POS_RETURN_IN:
      case MOVEMENT_TYPES.TRANSFER_RETURN_IN:
      case MOVEMENT_TYPES.TRANSFER_RETURN_OUT:
        row.returned = r2(row.returned + Math.abs(qty)); break;
      case MOVEMENT_TYPES.ADJUST_IN: case MOVEMENT_TYPES.ADJUST_OUT:
        row.adjusted = r2(row.adjusted + qty); break;
      default:
    }
  });

  /* --------------------------------------- valuation and item details --- */
  const codes = [...byItem.keys()];

  /* Average received rate per item, for valuing what is left. Taken from the
     barcode rows because that is where the purchase price lives. */
  const rateRows = codes.length
    ? await BarcodeLabel.aggregate([
      {
        $match: {
          itemCode: { $in: codes },
          ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
        },
      },
      {
        $group: {
          _id: '$itemCode',
          rate: {
            $avg: {
              $convert: {
                input: { $ifNull: ['$finalNet', '$purRate'] },
                to: 'double', onError: 0, onNull: 0,
              },
            },
          },
          locationId: { $first: '$currentLocationId' },
        },
      },
    ]).catch(() => [])
    : [];
  const rateByCode = new Map(rateRows.map((r) => [String(r._id), r]));

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

  const locIds = [...new Set(rateRows.map((r) => r.locationId).filter(Boolean).map(String))];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  /* --------------------------------------------------------- finish ----- */
  const finished = [...byItem.values()].map((r) => {
    const item = itemByCode.get(r.code);
    const meta = rateByCode.get(r.code);
    const rate = r2(meta?.rate || 0);
    const close = r2(r.open + r.inward - r.outward);
    return {
      code: r.code,
      itemName: item?.name || r.name || r.code,
      group: (item && groupName.get(String(item.subGroupId))) || '(ungrouped)',
      location: locName.get(String(meta?.locationId || '')) || '(unassigned)',
      open: r2(r.open),
      inward: r2(r.inward),
      /* outward prints negative, as the deployed tile does */
      outward: r2(-r.outward),
      received: r.received,
      transferredIn: r.transferredIn,
      transferredOut: r.transferredOut,
      sold: r.sold,
      returned: r.returned,
      adjusted: r.adjusted,
      events: r.events,
      closeQty: close,
      rate,
      closeValue: r2(close * rate),
    };
  });

  const sum = (list, k) => r2(list.reduce((a, x) => a + (Number(x[k]) || 0), 0));

  /* ------------------------------------------------------------ shape --- */
  const roll = (keyOf, extra) => {
    const acc = new Map();
    finished.forEach((r) => {
      const key = keyOf(r);
      if (!acc.has(key)) {
        acc.set(key, {
          _id: key, ...extra(r),
          open: 0, inward: 0, outward: 0, received: 0, transferredIn: 0,
          transferredOut: 0, sold: 0, returned: 0, closeQty: 0, closeValue: 0,
        });
      }
      const row = acc.get(key);
      ['open', 'inward', 'outward', 'received', 'transferredIn', 'transferredOut',
        'sold', 'returned', 'closeQty', 'closeValue'].forEach((k) => { row[k] += r[k]; });
    });
    return [...acc.values()].map((r) => {
      const out = { ...r };
      ['open', 'inward', 'outward', 'received', 'transferredIn', 'transferredOut',
        'sold', 'returned', 'closeQty', 'closeValue'].forEach((k) => { out[k] = r2(out[k]); });
      return out;
    });
  };

  let list;
  if (tab === 'itemwise') {
    list = finished.map((r) => ({ _id: r.code, ...r })).sort((a, b) => b.closeValue - a.closeValue);
  } else if (tab === 'detailed') {
    list = finished
      .map((r) => ({ _id: r.location + ':' + r.code, ...r }))
      .sort((a, b) => a.group.localeCompare(b.group) || b.closeValue - a.closeValue);
  } else if (tab === 'movementwise') {
    /* Barcode-level: every event in the window, newest first. This is the
       "barcode-wise movement" and "transaction history" the requirement
       asks the Item Stock section to be able to show. */
    const events = await StockMovement.find(withWindow({ $gte: start, $lte: end }))
      .sort({ at: -1 })
      .limit(5000)
      .lean();

    const evLocIds = [...new Set(
      events.flatMap((e) => [e.fromLocationId, e.toLocationId]).filter(Boolean).map(String)
    )];
    const evLocs = evLocIds.length
      ? await CompanyLocation.find({ _id: { $in: evLocIds } }).select('name').lean()
      : [];
    const evLocName = new Map(evLocs.map((l) => [String(l._id), l.name || '']));

    list = events.map((e) => ({
      _id: String(e._id),
      at: e.at,
      type: String(e.type).replace(/_/g, ' '),
      barcodeNo: e.barcodeNo,
      code: e.itemCode,
      itemName: e.itemName,
      qty: r2(e.qty),
      from: evLocName.get(String(e.fromLocationId || '')) || '-',
      to: evLocName.get(String(e.toLocationId || '')) || '-',
      refNo: e.refNo || '',
      reason: e.reason || '',
      user: e.userName || e.userEmail || '',
    }));
  } else {
    list = roll(
      (r) => r.location + '|' + r.group,
      (r) => ({ location: r.location, group: r.group })
    ).sort((a, b) => a.location.localeCompare(b.location) || a.group.localeCompare(b.group));
  }

  const groupCount = new Set(finished.map((r) => r.group)).size;
  const p = paged(list, page, perPage);

  return json({
    tiles: {
      totalGroups: groupCount,
      openQty: sum(finished, 'open'),
      inwardQty: sum(finished, 'inward'),
      outwardQty: sum(finished, 'outward'),
      closeQty: sum(finished, 'closeQty'),
      closeValue: sum(finished, 'closeValue'),
      /* the breakdown, so the tiles can answer "where did it go" */
      receivedQty: sum(finished, 'received'),
      transferredInQty: sum(finished, 'transferredIn'),
      transferredOutQty: sum(finished, 'transferredOut'),
      soldQty: sum(finished, 'sold'),
      returnedQty: sum(finished, 'returned'),
    },
    sections: [{
      rows: p.rows,
      count: p.total,
      totals: tab === 'movementwise' ? { qty: sum(list, 'qty') } : {
        open: sum(list, 'open'), inward: sum(list, 'inward'),
        outward: sum(list, 'outward'), closeQty: sum(list, 'closeQty'),
        closeValue: sum(list, 'closeValue'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
});

/* The ledger stores a signed quantity relative to the BUSINESS. When a single
   location is being reported, a transfer between two of its own locations is
   an outward for one and an inward for the other, so the sign has to be taken
   from which end this location is - otherwise an internal transfer would
   cancel itself out and neither branch's stock would move. */
function signedFor(locationId) {
  if (!locationId) return '$qty';
  const id = toId(locationId);
  return {
    $cond: [
      { $eq: ['$toLocationId', id] },
      { $abs: '$qty' },
      { $multiply: [{ $abs: '$qty' }, -1] },
    ],
  };
}

function toId(v) {
  return new Types.ObjectId(String(v));
}
