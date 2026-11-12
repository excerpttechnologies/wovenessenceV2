import { Types, isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import CompanyLocation from '@/models/CompanyLocation';
import { json, num, r2, scopeOf, pageOf, paged } from '@/lib/reports';

/* /api/reports/item-stock - read-only.

   Opening, inward, outward and closing stock for a window.

   Every stock event is recorded in the movement ledger (models/StockMovement.js)
   as it happens, so:

     opening  net of every movement BEFORE the window
     inward   positive movements inside it
     outward  negative movements inside it
     closing  opening + inward - outward

   ---------------------------------------------------------------- location --
   A MOVEMENT BELONGS TO THE LOCATION IT MOVED. The ledger signs quantity
   relative to the business: an inbound event is positive and stored on
   toLocationId, an outbound event is negative and stored on fromLocationId.
   A transfer writes BOTH ends (an out row and an in row), and the out row also
   carries toLocationId. Earlier this route decided "is it this location?" by
   testing either end, so when a location filter was applied the transfer-out
   row counted as an INWARD at the destination as well as the transfer-in row -
   both branches' stock was wrong, and an item's Location column was just the
   first barcode row's currentLocationId rather than where the stock is.

   Now the location and the sign are read from the event type:
     inbound  -> toLocationId,   +qty
     outbound -> fromLocationId, -qty
   so a specific location shows its own open / in / out / close, and All
   Locations (no location) nets an internal transfer to zero because both of
   its rows are counted. */

const INBOUND = [
  MOVEMENT_TYPES.GRC_IN,
  MOVEMENT_TYPES.TRANSFER_IN,
  MOVEMENT_TYPES.POS_RETURN_IN,
  MOVEMENT_TYPES.TRANSFER_RETURN_IN,
  MOVEMENT_TYPES.ADJUST_IN,
];
const OUTBOUND = [
  MOVEMENT_TYPES.GRC_VOID,
  MOVEMENT_TYPES.TRANSFER_OUT,
  MOVEMENT_TYPES.TRANSFER_RETURN_OUT,
  MOVEMENT_TYPES.POS_OUT,
  MOVEMENT_TYPES.ECOM_OUT,
  MOVEMENT_TYPES.ADJUST_OUT,
];
/* ORIGIN_CORRECTION is audit-only and moves no quantity, so it is excluded
   from every figure here. */

/* the location a movement affected, and its signed quantity */
const LOC_OF = { $cond: [{ $in: ['$type', INBOUND] }, '$toLocationId', '$fromLocationId'] };
const SIGNED_OF = {
  $cond: [
    { $in: ['$type', INBOUND] },
    { $abs: '$qty' },
    { $multiply: [{ $abs: '$qty' }, -1] },
  ],
};

export const GET = handler(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  /* The report's own Location filter offers "All Locations"; choosing it must
     override the location in the top bar, not fall back to it. */
  if (sp.get('allLocations') === '1') scope.locationId = null;

  const { page, perPage } = pageOf(sp);
  const tab = ['detailed', 'itemwise', 'movementwise'].includes(sp.get('tab'))
    ? sp.get('tab') : 'groupwise';

  const from = sp.get('fromDate');
  const to = sp.get('toDate');
  if (!from || !to) return json({ error: 'Date From and Date To are required.' }, 422);

  const start = new Date(from);
  const end = new Date(to + 'T23:59:59.999');
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
    return json({ error: 'Date From and Date To must be valid dates.' }, 422);
  }

  /* AGGREGATION DOES NOT CAST. scopeOf() hands back ids as strings; Mongoose
     casts those for find(), but not inside an aggregation pipeline's $match.
     Cast explicitly. */
  const base = { type: { $in: [...INBOUND, ...OUTBOUND] } };
  if (scope.businessId) base.businessId = toId(scope.businessId);

  /* A location is affected when it is the inbound destination or the outbound
     source - never merely the other end of a transfer. */
  if (scope.locationId) {
    const loc = toId(scope.locationId);
    base.$or = [
      { type: { $in: INBOUND }, toLocationId: loc },
      { type: { $in: OUTBOUND }, fromLocationId: loc },
    ];
  }

  const [openingRows, windowRows] = await Promise.all([
    StockMovement.aggregate([
      { $match: { ...base, at: { $lt: start } } },
      {
        $group: {
          _id: { code: '$itemCode', loc: LOC_OF },
          qty: { $sum: SIGNED_OF },
          name: { $first: '$itemName' },
          uom: { $first: '$uom' },
        },
      },
    ]),
    StockMovement.aggregate([
      { $match: { ...base, at: { $gte: start, $lte: end } } },
      {
        $group: {
          _id: { code: '$itemCode', loc: LOC_OF, type: '$type' },
          qty: { $sum: SIGNED_OF },
          name: { $first: '$itemName' },
          uom: { $first: '$uom' },
          events: { $sum: 1 },
        },
      },
    ]),
  ]);

  /* ------------------------------------------------------ assemble ------ */
  /* one row per ITEM + LOCATION - that is what makes the location filter and
     the All Locations consolidation agree with each other */
  const byItemLoc = new Map();
  const touch = (code, loc, name, uom) => {
    if (!code) return null;
    const key = String(loc || '') + '|' + code;
    if (!byItemLoc.has(key)) {
      byItemLoc.set(key, {
        key,
        code: String(code),
        locId: loc ? String(loc) : '',
        name: name || '',
        uom: uom || '',
        open: 0, inward: 0, outwardAbs: 0,
        received: 0, transferredIn: 0, transferredOut: 0,
        sold: 0, returned: 0, adjusted: 0, events: 0,
      });
    }
    const row = byItemLoc.get(key);
    if (!row.name && name) row.name = name;
    if (!row.uom && uom) row.uom = uom;
    return row;
  };

  openingRows.forEach((r) => {
    const row = touch(r._id?.code, r._id?.loc, r.name, r.uom);
    if (row) row.open = r2(r.qty);
  });

  windowRows.forEach((r) => {
    const row = touch(r._id?.code, r._id?.loc, r.name, r.uom);
    if (!row) return;
    const qty = num(r.qty);
    const abs = Math.abs(qty);
    const type = String(r._id?.type || '');
    row.events += r.events || 0;

    if (qty >= 0) row.inward = r2(row.inward + abs);
    else row.outwardAbs = r2(row.outwardAbs + abs);

    switch (type) {
      case MOVEMENT_TYPES.GRC_IN:
        row.received = r2(row.received + abs); break;
      case MOVEMENT_TYPES.TRANSFER_IN:
        row.transferredIn = r2(row.transferredIn + abs); break;
      case MOVEMENT_TYPES.TRANSFER_OUT:
      case MOVEMENT_TYPES.ECOM_OUT:
        row.transferredOut = r2(row.transferredOut + abs); break;
      case MOVEMENT_TYPES.POS_OUT:
        row.sold = r2(row.sold + abs); break;
      case MOVEMENT_TYPES.POS_RETURN_IN:
      case MOVEMENT_TYPES.TRANSFER_RETURN_IN:
      case MOVEMENT_TYPES.TRANSFER_RETURN_OUT:
        row.returned = r2(row.returned + abs); break;
      case MOVEMENT_TYPES.GRC_VOID:
        /* stock returned to a supplier (or a receipt reversed) */
        row.returned = r2(row.returned + abs); break;
      case MOVEMENT_TYPES.ADJUST_IN:
      case MOVEMENT_TYPES.ADJUST_OUT:
        row.adjusted = r2(row.adjusted + (qty >= 0 ? abs : -abs)); break;
      default:
    }
  });

  /* ------------------------------- opening stock not in the ledger -----
     Barcode rows that came in through an opening-stock workbook
     (source hsr_stock_correct / WHSTK_EXCEL) never wrote a movement ledger
     row, so a ledger-only report left real stock out of every figure - 495
     such rows here. They are included as OPENING stock, which is what an
     opening-stock import is, read from the barcode rows themselves and only
     where the row has no ledger entry at all, so nothing is counted twice. */
  const fallbackRows = await BarcodeLabel.aggregate([
    {
      $match: {
        ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
        status: BARCODE_STATUS.IN_STOCK,
        itemCode: { $nin: ['', null] },
        ...(scope.locationId ? { currentLocationId: toId(scope.locationId) } : {}),
      },
    },
    {
      $lookup: {
        from: 'stockmovement',
        localField: '_id',
        foreignField: 'barcodeId',
        pipeline: [{ $limit: 1 }, { $project: { _id: 1 } }],
        as: 'ledger',
      },
    },
    { $match: { ledger: { $size: 0 } } },
    {
      $group: {
        _id: { code: '$itemCode', loc: '$currentLocationId' },
        qty: {
          $sum: {
            $convert: {
              input: { $ifNull: ['$qtyNum', '$qty'] },
              to: 'double', onError: 1, onNull: 1,
            },
          },
        },
        name: { $first: '$itemName' },
        uom: { $first: '$uom' },
      },
    },
  ]);

  fallbackRows.forEach((r) => {
    const row = touch(r._id?.code, r._id?.loc, r.name, r.uom);
    if (row) row.open = r2(row.open + num(r.qty));
  });

  /* --------------------------------------- valuation and item details --- */
  const codes = [...new Set([...byItemLoc.values()].map((r) => r.code))];

  /* Per-unit purchase rate per item code, for valuing what is left.

     purRate is the rate PER UNIT and the only price field that holds one
     consistently. finalNet is the LINE total on most rows - one row here is
     577 pieces at 78, stored as 41,461.68 - so averaging it as a rate, which
     this report used to do ($avg of finalNet per item code), multiplies each
     unit by the whole lot's value and valued closing stock at nearly three
     times cost (241,434,268.54 across All Locations against 168,417 units).
     finalNet is still read, but only divided by the row's own quantity, and
     only when purRate is blank.

     Weighted by quantity so a 577-piece lot is not outweighed by a 1-piece
     one, and keyed by item code AND location: an item's rate is the rate the
     branch holding it paid. Valuing every branch's rows at one blended rate
     made All Locations disagree with the sum of the individual locations
     (125,500,622.23 against 101,199,163.65), so each row is valued where it
     sits and a code with no barcode row at that location falls back to the
     code's rate across locations. */
  const QTY_OF = { $max: [0, { $convert: { input: { $ifNull: ['$qtyNum', '$qty'] }, to: 'double', onError: 1, onNull: 1 } }] };
  const rateRows = codes.length
    ? await BarcodeLabel.aggregate([
      {
        /* Every location's barcode rows, deliberately not narrowed to the
           reported one. Warehouse carries 68,838.78 units per the ledger but
           only 24,379.95 sit on its barcode rows, so a location-scoped rate
           table valued the difference at zero (12,159,230.51 for stock worth
           far more). rateByLoc still prefers the row's own location; the rest
           fall back to the code's business-wide rate. Both the branch run and
           the All Locations run now read the same table, which is what makes
           All Locations equal the sum of the branches. */
        $match: {
          itemCode: { $in: codes },
          ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
        },
      },
      {
        $project: {
          itemCode: 1,
          qty: QTY_OF,
          unit: {
            $let: {
              vars: {
                rate: { $convert: { input: { $ifNull: ['$purRate', ''] }, to: 'double', onError: 0, onNull: 0 } },
                net: { $convert: { input: { $ifNull: ['$finalNet', ''] }, to: 'double', onError: 0, onNull: 0 } },
              },
              in: {
                $cond: [
                  { $gt: ['$$rate', 0] },
                  '$$rate',
                  { $cond: [{ $gt: [QTY_OF, 0] }, { $divide: ['$$net', QTY_OF] }, 0] },
                ],
              },
            },
          },
        },
      },
      {
        $group: {
          _id: { code: '$itemCode', loc: '$currentLocationId' },
          qty: { $sum: '$qty' },
          value: { $sum: { $multiply: ['$qty', '$unit'] } },
        },
      },
      {
        $project: {
          qty: 1,
          value: 1,
          rate: { $cond: [{ $gt: ['$qty', 0] }, { $divide: ['$value', '$qty'] }, 0] },
        },
      },
    ]).catch(() => [])
    : [];
  const rateByLoc = new Map();
  const rateByCode = new Map();
  rateRows.forEach((r) => {
    const code = String(r._id?.code || '');
    if (!code) return;
    rateByLoc.set(String(r._id?.loc || '') + '|' + code, num(r.rate));
    const acc = rateByCode.get(code) || { qty: 0, value: 0 };
    acc.qty += num(r.qty);
    acc.value += num(r.value);
    rateByCode.set(code, acc);
  });
  const rateFor = (code, locId) => {
    const own = rateByLoc.get(String(locId || '') + '|' + code);
    if (own) return own;
    const acc = rateByCode.get(code);
    return acc && acc.qty > 0 ? acc.value / acc.qty : 0;
  };

  const items = codes.length
    ? await Item.find({
      itemCode: { $in: codes },
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
    }).select('itemCode name subGroupId').lean()
    : [];
  const itemByCode = new Map(items.map((i) => [String(i.itemCode), i]));

  /* Not every code the ledger carries has an Item master row - 145 items here
     cover 27,197 item codes - so the group the stock itself records is read
     from the barcode rows as well, and only for codes the item master does not
     resolve. Without this every one of those codes fell into "(ungrouped)" and
     the whole report showed two groups. */
  const bcGroupRows = codes.length
    ? await BarcodeLabel.aggregate([
      {
        $match: {
          itemCode: { $in: codes },
          groupId: { $nin: ['', null] },
          ...(scope.businessId ? { businessId: String(scope.businessId) } : {}),
        },
      },
      { $group: { _id: '$itemCode', gid: { $first: '$groupId' } } },
    ])
    : [];
  const bcGroupByCode = new Map(
    bcGroupRows
      .filter((r) => isValidObjectId(String(r.gid || '')))
      .map((r) => [String(r._id), String(r.gid)])
  );

  const groupIds = [...new Set([
    ...items.map((i) => i.subGroupId).filter(Boolean).map(String),
    ...bcGroupByCode.values(),
  ])];
  const groups = groupIds.length
    ? await ProductGroup.find({ _id: { $in: groupIds } }).select('name parentId').lean()
    : [];
  const groupById = new Map(groups.map((g) => [String(g._id), g]));
  const groupName = new Map(groups.map((g) => [String(g._id), g.name || '']));
  /* An id that no longer exists in the Product Group master is not a group - the
     row keeps its id for filtering but is presented (and counted) as ungrouped. */
  const masterGroup = (id) => (id && groupById.has(String(id)) ? String(id) : '');

  const locIds = [...new Set([...byItemLoc.values()].map((r) => r.locId).filter(Boolean))];
  const locs = locIds.length
    ? await CompanyLocation.find({ _id: { $in: locIds } }).select('name').lean()
    : [];
  const locName = new Map(locs.map((l) => [String(l._id), l.name || '']));

  /* ------------------------------------------- item group / search ----- */
  /* A group picker lists both levels (ProductGroup.parentId is the hierarchy),
     so a chosen parent also covers its children. */
  const wantedGroupIds = String(sp.get('subGroupId') || '')
    .split(',').map((v) => v.trim()).filter((v) => isValidObjectId(v));
  let allowedGroups = null;
  if (wantedGroupIds.length) {
    const children = await ProductGroup
      .find({ parentId: { $in: wantedGroupIds.map(toId) } })
      .select('_id').lean();
    allowedGroups = new Set([
      ...wantedGroupIds,
      ...children.map((c) => String(c._id)),
    ]);
  }

  const search = String(sp.get('itemSearch') || '').trim().toLowerCase();

  /* --------------------------------------------------------- finish ----- */
  const finished = [...byItemLoc.values()]
    .map((r) => {
      const item = itemByCode.get(r.code);
      const rate = rateFor(r.code, r.locId);
      /* Prefer the item's group when it still exists in the master; otherwise
         fall back to a valid group recorded on its barcode rows. */
      const gid = masterGroup(item?.subGroupId)
        || masterGroup(bcGroupByCode.get(r.code));
      const closeQty = r2(r.open + r.inward - r.outwardAbs);
      return {
        key: r.key,
        code: r.code,
        itemName: item?.name || r.name || r.code,
        group: groupName.get(gid) || '(ungrouped)',
        groupId: gid,
        location: locName.get(r.locId) || '(unassigned)',
        locationId: r.locId,
        uom: r.uom || '',
        open: r2(r.open),
        inward: r2(r.inward),
        /* outward prints negative, as the deployed tile does */
        outward: r2(-r.outwardAbs),
        outwardAbs: r2(r.outwardAbs),
        received: r.received,
        transferredIn: r.transferredIn,
        transferredOut: r.transferredOut,
        sold: r.sold,
        returned: r.returned,
        adjusted: r.adjusted,
        events: r.events,
        closeQty,
        closeValue: r2(closeQty * rate),
        rate: r2(rate),
      };
    })
    .filter((r) => {
      if (allowedGroups) {
        if (!r.groupId || !allowedGroups.has(r.groupId)) return false;
      }
      if (search) {
        const hay = (r.code + ' ' + r.itemName).toLowerCase();
        if (!hay.includes(search)) return false;
      }
      return true;
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
          open: 0, inward: 0, outwardAbs: 0, received: 0, transferredIn: 0,
          transferredOut: 0, sold: 0, returned: 0, adjusted: 0,
          closeQty: 0, closeValue: 0,
        });
      }
      const row = acc.get(key);
      ['open', 'inward', 'outwardAbs', 'received', 'transferredIn', 'transferredOut',
        'sold', 'returned', 'adjusted', 'closeQty', 'closeValue'].forEach((k) => {
        row[k] = num(row[k]) + num(r[k]);
      });
    });
    return [...acc.values()].map((r) => {
      const out = { ...r, outward: r2(-r.outwardAbs) };
      ['open', 'inward', 'outwardAbs', 'received', 'transferredIn', 'transferredOut',
        'sold', 'returned', 'adjusted', 'closeQty', 'closeValue'].forEach((k) => {
        out[k] = r2(out[k]);
      });
      return out;
    });
  };

  let list;
  if (tab === 'itemwise') {
    /* consolidated across locations - one row per item, no duplicate codes */
    const byCode = new Map();
    finished.forEach((r) => {
      if (!byCode.has(r.code)) {
        byCode.set(r.code, {
          ...r,
          _id: r.code,
          location: '',
          locationId: '',
          open: 0, inward: 0, outwardAbs: 0, received: 0, transferredIn: 0,
          transferredOut: 0, sold: 0, returned: 0, adjusted: 0, events: 0,
          closeQty: 0, closeValue: 0,
        });
      }
      const row = byCode.get(r.code);
      ['open', 'inward', 'outwardAbs', 'received', 'transferredIn', 'transferredOut',
        'sold', 'returned', 'adjusted', 'events'].forEach((k) => {
        row[k] = num(row[k]) + num(r[k]);
      });
    });
    list = [...byCode.values()].map((r) => {
      const closeQty = r2(r.open + r.inward - r.outwardAbs);
      return {
        ...r,
        open: r2(r.open),
        inward: r2(r.inward),
        outward: r2(-r.outwardAbs),
        outwardAbs: r2(r.outwardAbs),
        closeQty,
        closeValue: r2(closeQty * r.rate),
        received: r2(r.received),
        transferredIn: r2(r.transferredIn),
        transferredOut: r2(r.transferredOut),
        sold: r2(r.sold),
        returned: r2(r.returned),
        adjusted: r2(r.adjusted),
      };
    }).sort((a, b) => b.closeValue - a.closeValue || a.code.localeCompare(b.code));
  } else if (tab === 'detailed') {
    list = finished
      .map((r) => ({ ...r, _id: r.key }))
      .sort((a, b) => a.location.localeCompare(b.location)
        || a.group.localeCompare(b.group)
        || a.code.localeCompare(b.code));
  } else if (tab === 'movementwise') {
    /* Barcode-level: every event in the window, newest first. */
    const events = await StockMovement.find({ ...base, at: { $gte: start, $lte: end } })
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

    const allowedCodes = allowedGroups
      ? new Set(finished.map((r) => r.code))
      : null;

    list = events
      .filter((e) => {
        if (allowedCodes && !allowedCodes.has(String(e.itemCode || ''))) return false;
        if (search) {
          const hay = (String(e.itemCode || '') + ' ' + String(e.itemName || '')).toLowerCase();
          if (!hay.includes(search)) return false;
        }
        return true;
      })
      .map((e) => ({
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
      (r) => r.locationId + '|' + r.group,
      (r) => ({ location: r.location, group: r.group })
    ).sort((a, b) => a.location.localeCompare(b.location) || a.group.localeCompare(b.group));
  }

  /* Count distinct master groups represented by the rows after the report's
     date, location, group, and item-search filters have been applied. */
  const groupCount = new Set(
    finished
      .map((row) => row.groupId)
      .filter((groupId) => groupId && groupById.has(groupId))
  ).size;
  const p = paged(list, page, perPage);

  return json({
    tiles: {
      totalGroups: groupCount,
      openQty: sum(finished, 'open'),
      inwardQty: sum(finished, 'inward'),
      outwardQty: r2(-sum(finished, 'outwardAbs')),
      closeQty: sum(finished, 'closeQty'),
      closeValue: sum(finished, 'closeValue'),
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
        outward: r2(-sum(list, 'outwardAbs')), closeQty: sum(list, 'closeQty'),
        closeValue: sum(list, 'closeValue'),
      },
    }],
    total: p.total,
    pages: p.pages,
    page,
    perPage,
  });
});

function toId(v) {
  return new Types.ObjectId(String(v));
}
