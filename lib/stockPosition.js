import { isValidObjectId, Types } from 'mongoose';
import StockMovement from '@/models/StockMovement';
import Contact from '@/models/Contact';
import { Supplier } from '@/lib/contacts';
import { num, r2 } from '@/lib/reports';

/* ==========================================================================
   THE STOCK POSITION - one calculation, three reports.

   Supplier Summary, Supplier Bill-wise and Supplier Batch-wise all ask the
   same question at a different grain: how much of a supplier's stock did we
   open with, receive, return, sell, return to stock, transfer, adjust - and
   what is left, worth what. Writing that three times is how three reports end
   up disagreeing, so it is written once here and called with a grain.

   WHY THE MOVEMENT LEDGER AND NOT THE BARCODE ROWS

   A barcode row tells you where a unit is NOW. It cannot say where the unit
   was on 01-10, which is exactly what "opening stock" means. models/
   StockMovement.js is append-only and carries `at`, so a sum of signed `qty`
   up to a date IS the position on that date:

     closing  = SUM(qty) where at <  toDate
     opening  = SUM(qty) where at <  fromDate
     movement = the difference, split by type

   `qty` is signed at write time (lib/inventory.js:591 - out is negative), so
   nothing here re-derives a sign from the type and nothing double counts: a
   transfer writes one out row and one in row, both of which are counted.

   SUPPLIER ATTRIBUTION

   StockMovement has no supplierId - the supplier belongs to the UNIT, not to
   the movement. So each movement is joined to its barcode row once
   (`$lookup` on barcodeId) and the supplier key is read from there. That is
   also where cost comes from: finalNet when it carries a figure, else
   purRate, the same rule as app/api/reports/master-stock-report/route.js.

   closingValue is therefore the sum of qty x the unit's own cost, i.e. the
   value of the units actually left - not closingQty x an average that never
   existed.

   LIMIT: the ledger begins when it was installed. scripts/backfillMovement
   History.mjs reconstructs the movements the older documents imply, and
   `coverage` below says so out loud when a window reaches back further than
   the ledger does, rather than reporting a confident zero.
   ========================================================================== */

const s = (v) => String(v ?? '').trim();

/* String-typed prices and quantities. $convert with onError/onNull, never
   $toDouble: the schema stores '' and $toDouble throws on it, aborting the
   pipeline and printing 0.00 for a warehouse that is not empty. */
const toNum = (input) => ({
  $convert: { input, to: 'double', onError: 0, onNull: 0 },
});

/* KEYS AS STRINGS, always. barcodeLabel.supplierId is a plain String on the
   imported rows and an ObjectId on the generated ones, and grcNo / itemCode /
   batchNo are the same mixture. A group key that keeps the difference splits
   one supplier into two rows; a $in against the picked ids that keeps it
   matches only half the rows - a supplier filter returning an EMPTY report
   for a supplier whose stock is sitting right there. */
const strOf = (input) => ({
  $convert: { input, to: 'string', onError: '', onNull: '' },
});

/* cost per unit: finalNet when > 0, else purRate (lib/grcMoney.js rowRate) */
const UNIT_COST = {
  $let: {
    vars: { fn: toNum('$unit.finalNet'), pr: toNum('$unit.purRate') },
    in: { $cond: [{ $gt: ['$$fn', 0] }, '$$fn', '$$pr'] },
  },
};

const isType = (type) => ({ $eq: ['$type', type] });

/* IN THE WINDOW *AND* IN THE SELECTED FINANCIAL YEAR.

   The financial year narrows which movements count as THIS period's activity.
   It must NOT narrow the opening balance: stock received in an earlier year
   and still on the shelf is exactly what "opening" means. Filtering it out
   turned a warehouse holding 51,596 units into a report reading 0 opening and
   -24 closing, because on this database the imported opening rows are dated
   2024-01-01 and carry finYear 2024-2025. */
const IN_WINDOW = { $and: [{ $eq: ['$inWindow', true] }, '$fyOk'] };

/* what closing counts: everything before the window (whatever year it was
   recorded in) plus this year's in-window movements - the same movements
   opening and the buckets count, so every row still ties out */
const IN_CLOSING = { $or: [{ $eq: ['$inWindow', false] }, '$fyOk'] };

/* one bucket = a type (or a family of types) counted inside the window.
   `sign` is +1 for stock coming in, -1 for stock going out: the reports show
   every column as a positive quantity and keep the direction in the column
   heading, while `closing` stays a plain signed sum. */
const bucketSum = (cond, sign = 1) => ({
  $sum: {
    $cond: [
      { $and: [IN_WINDOW, cond] },
      sign === 1 ? '$qty' : { $multiply: ['$qty', -1] },
      0,
    ],
  },
});

const anyType = (types) => ({ $in: ['$type', types] });

/* ------------------------------------------------------------------ keys --- */

const supplierNameOf = (row) => s(row?.businessName)
  || [row?.firstName, row?.middleName, row?.lastName]
    .map((p) => s(p)).filter(Boolean).join(' ')
  || '';

/* The vendor filter set a report screen sends, resolved to the KEYS stock
   rows actually carry.

   barcodeLabel.supplierId is a plain String and holds either the contact's
   _id or its contactId code ("G1000") depending on which screen wrote the
   row - the same two-keyed problem Master Stock Report documents. So each
   chosen vendor contributes BOTH spellings, and a picker choice finds all of
   its units however they were keyed.

   Returns null when no vendor filter is applied (meaning: every supplier),
   and [] when a filter was applied that reaches no vendor (meaning: no rows -
   never "drop the filter and return the warehouse"). */
export async function supplierKeysForFilters({
  businessId, supplierPicks = [], city = '', cityGroupIds = [], agentPicks = [],
}) {
  const picks = supplierPicks.map(s).filter(Boolean);
  const cities = s(city);
  const groups = cityGroupIds.map(s).filter((v) => isValidObjectId(v));
  const agents = agentPicks.map(s).filter((v) => isValidObjectId(v));

  if (!picks.length && !cities && !groups.length && !agents.length) return null;

  const and = [];

  if (picks.length) {
    const ids = picks.filter((v) => isValidObjectId(v));
    const codes = picks.filter((v) => !isValidObjectId(v));
    and.push({
      $or: [
        ...(ids.length ? [{ _id: { $in: ids.map((v) => new Types.ObjectId(v)) } }] : []),
        ...(codes.length ? [{ contactId: { $in: codes } }] : []),
      ],
    });
  }

  /* City Groups hold a LIST of city names (models/CityGroup.js), and the
     supplier keeps its city as free text - so a group narrows to the vendors
     whose billing or shipping city is one of the group's cities. */
  let cityNames = cities ? [cities] : [];
  if (groups.length) {
    const { default: CityGroup } = await import('@/models/CityGroup');
    const docs = await CityGroup.find({ _id: { $in: groups } }).select('cities').lean();
    cityNames = [...new Set([
      ...cityNames,
      ...docs.flatMap((g) => (Array.isArray(g.cities) ? g.cities : [])),
    ].map(s).filter(Boolean))];
  }
  if (cities || groups.length) {
    const rxs = cityNames.map((c) => new RegExp('^\\s*' + c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$', 'i'));
    /* a city filter that resolves to no city name matches no vendor, rather
       than quietly dropping the filter and returning every supplier */
    and.push(rxs.length
      ? { $or: [{ billingCity: { $in: rxs } }, { shippingCity: { $in: rxs } }] }
      : { _id: null });
  }

  if (agents.length) {
    and.push({ agentId: { $in: agents.map((v) => new Types.ObjectId(v)) } });
  }

  const filter = {};
  if (businessId) filter.businessId = businessId;
  if (and.length) filter.$and = and;

  const vendors = await Supplier.find(filter).select('contactId').lean();
  const masterKeys = vendors.flatMap((v) => [String(v._id), s(v.contactId)]).filter(Boolean);

  /* A PICKED SUPPLIER ALWAYS FILTERS.

     The stock row carries the supplier key, and resolving that key through
     the master only ADDS spellings (id and contact code). If the master is
     scoped to another branch - imported stock was keyed before the branches
     were separated - or the document is simply missing, resolution finds
     nothing, and returning only the resolved set would show an EMPTY report
     for a supplier whose units are sitting right there. The picks themselves
     are therefore keys as well, unless a city / city group / agent filter
     narrowed the master, where that narrowing is the whole point. */
  const narrowed = Boolean(cities) || groups.length > 0 || agents.length > 0;
  return [...new Set([...masterKeys, ...(narrowed ? [] : picks)])];
}

/* key -> { name, code, id } for the supplier keys a page of rows carries.
   Batched: one query for the ids and one for the codes, never one per row. */
export async function loadSupplierMap(keys, businessId) {
  const list = [...new Set(keys.map(s).filter(Boolean))];
  const map = new Map();
  if (!list.length) return map;

  const ids = list.filter((v) => isValidObjectId(v));
  const codes = list.filter((v) => !isValidObjectId(v));
  const or = [];
  if (ids.length) or.push({ _id: { $in: ids.map((v) => new Types.ObjectId(v)) } });
  if (codes.length) or.push({ contactId: { $in: codes } });

  const filter = { $or: or };
  if (businessId) filter.businessId = businessId;

  const SELECT = 'contactId businessName firstName middleName lastName';

  let rows = await Supplier.find(filter).select(SELECT).lean();
  /* keys can belong to a supplier document in another branch (imported stock
     was keyed before the branches were split), and with contact storage
     split the supplier collection is not where every contact lives - try
     unscoped, then the shared contact collection, rather than showing a
     hexadecimal id where a name belongs */
  if (!rows.length) rows = await Supplier.find({ $or: or }).select(SELECT).lean();
  if (!rows.length && Supplier !== Contact) {
    rows = await Contact.find({ $or: or }).select(SELECT).lean();
  }

  rows.forEach((r) => {
    const info = {
      id: String(r._id),
      code: s(r.contactId),
      name: supplierNameOf(r),
    };
    map.set(String(r._id), info);
    if (info.code) map.set(info.code, info);
  });
  return map;
}

/* --------------------------------------------------------------- position --- */

const DIMENSION_KEY = {
  /* per supplier */
  supplier: { s: '$_id.s' },
  /* per bill (a GRC) of a supplier */
  bill: { s: '$_id.s', g: '$_id.g' },
  /* per item code (and batch, when the units carry one) on a bill */
  item: { s: '$_id.s', g: '$_id.g', c: '$_id.c', n: '$_id.n', bt: '$_id.bt' },
};

/**
 * Stock position at supplier / bill / item grain.
 *
 * @param {object}  o
 * @param {string}  o.businessId
 * @param {string} [o.locationId]      movement must be at (or from) it
 * @param {string} [o.finYear]
 * @param {string}  o.from             YYYY-MM-DD
 * @param {string}  o.to               YYYY-MM-DD (inclusive)
 * @param {string[]|null} [o.supplierKeys]
 * @param {string[]|null} [o.grcNos]
 * @param {string[]|null} [o.itemCodes]
 * @param {RegExp[]|null} [o.itemCodePatterns]
 * @param {'supplier'|'bill'|'item'} [o.groupBy]
 * @returns {Promise<{ rows: object[], coverage: object|null }>}
 */
export async function stockPosition({
  businessId, locationId, finYear, from, to,
  supplierKeys = null, grcNos = null,
  itemCodes = null, itemCodePatterns = null,
  groupBy = 'supplier',
}) {
  const fromDate = from ? new Date(from) : new Date(0);
  const toDate = to ? new Date(to + 'T23:59:59.999') : new Date();

  const match = { at: { $lt: toDate } };
  if (businessId) match.businessId = new Types.ObjectId(String(businessId));
  /* finYear is deliberately NOT part of this match - see IN_WINDOW. It is
     applied per movement below, so the opening balance still carries stock
     received in an earlier year. */

  const and = [];
  if (locationId && isValidObjectId(String(locationId))) {
    const loc = new Types.ObjectId(String(locationId));
    and.push({ $or: [{ fromLocationId: loc }, { toLocationId: loc }] });
  }
  if (and.length) match.$and = and;

  if (supplierKeys && !supplierKeys.length) {
    return { rows: [], coverage: null };
  }
  if (grcNos && !grcNos.length) {
    return { rows: [], coverage: null };
  }

  /* a movement with no unit behind it has no supplier, no bill and no item to
     report on - it cannot belong to a supplier summary. Those rows are
     counted in `coverage` instead of being attributed to nobody. */
  const afterUnit = { 'unit._id': { $ne: null } };
  if (supplierKeys) afterUnit.supKey = { $in: supplierKeys };
  if (grcNos) afterUnit.grcKey = { $in: grcNos };
  if (itemCodes && itemCodes.length) afterUnit.codeKey = { $in: itemCodes };
  if (itemCodePatterns && itemCodePatterns.length) afterUnit.codeKey = { $in: itemCodePatterns };

  const pipeline = [
    { $match: match },
    /* THE UNIT behind the movement: its supplier, its bill, its item, its
       cost. Joined on barcodeNo FIRST, because the ledger's barcodeId points
       at the row that existed when the movement was written, and a re-created
       barcode (migration, re-import) leaves that id pointing at nothing while
       the NUMBER still matches. On this database 20,273 imported transfer
       rows resolve by number and 0 by id. The id is the fallback, for a
       movement written before barcodeNo was denormalised. */
    /* TWO INDEXED LOOKUPS, not one $expr join: an $expr lookup cannot use the
       barcodeNo index, so it scans the whole barcode collection once per
       movement - 21,248 movements x 55,165 rows, which does not finish. Both
       lookups below are index-backed (barcodeNo carries
       {barcodeNo:1, businessId:1}, and _id is always indexed). */
    {
      $lookup: {
        from: 'barcodeLabel',
        localField: 'barcodeNo',
        foreignField: 'barcodeNo',
        as: 'uByNo',
      },
    },
    {
      $lookup: {
        from: 'barcodeLabel',
        localField: 'barcodeId',
        foreignField: '_id',
        as: 'uById',
      },
    },
    {
      $addFields: {
        /* the NUMBER wins when both answer - it is the one a re-created
           barcode still shares, and the movement's id may no longer exist */
        unit: {
          $ifNull: [
            {
              $cond: [
                { $ne: [{ $ifNull: ['$barcodeNo', ''] }, ''] },
                { $arrayElemAt: ['$uByNo', 0] },
                null,
              ],
            },
            { $arrayElemAt: ['$uById', 0] },
          ],
        },
      },
    },
    {
      $addFields: {
        inWindow: { $gte: ['$at', fromDate] },
        /* this movement's year: a blank/absent finYear belongs to whichever
           year the document was in (back-filled rows), the same allowance
           app/api/reports/master-stock-report/route.js makes */
        fyOk: finYear ? { $in: ['$finYear', [finYear, '', null]] } : true,
        supKey: strOf('$unit.supplierId'),
        grcKey: strOf('$unit.grcNo'),
        /* itemCode off the unit, falling back to the movement's own copy for
           a movement whose barcode row has since been purged */
        codeKey: {
          $cond: [
            { $gt: [{ $strLenCP: strOf('$unit.itemCode') }, 0] },
            strOf('$unit.itemCode'),
            strOf('$itemCode'),
          ],
        },
        nameKey: { $ifNull: ['$unit.itemName', '$itemName'] },
        batchKey: strOf('$unit.batchNo'),
        unitCost: UNIT_COST,
      },
    },
    ...(Object.keys(afterUnit).length ? [{ $match: afterUnit }] : []),
    /* one row per UNIT first, so a unit's cost is applied to that unit's own
       quantity and never smeared across the group */
    {
      $group: {
        _id: {
          b: '$barcodeId', s: '$supKey', g: '$grcKey',
          c: '$codeKey', n: '$nameKey', bt: '$batchKey',
        },
        unitCost: { $max: '$unitCost' },
        /* opening = everything dated before the window, PLUS an OPENING_STOCK
           entry wherever it falls: that type IS the opening balance a stock
           import created, so counting it as this month's buying would report
           the warehouse's opening as a purchase. */
        opening: {
          $sum: {
            $cond: [
              { $or: [{ $eq: ['$inWindow', false] }, isType('OPENING_STOCK')] },
              '$qty',
              0,
            ],
          },
        },
        purchase: bucketSum(isType('GRC_IN')),
        purchaseReturn: bucketSum(isType('GRC_VOID'), -1),
        sold: bucketSum(isType('POS_OUT'), -1),
        salesReturn: bucketSum(isType('POS_RETURN_IN')),
        transferIn: bucketSum(anyType(['TRANSFER_IN', 'TRANSFER_RETURN_IN'])),
        transferOut: bucketSum(anyType(['TRANSFER_OUT', 'TRANSFER_RETURN_OUT', 'ECOM_OUT']), -1),
        adjustment: bucketSum(anyType(['ADJUST_IN', 'ADJUST_OUT', 'ORIGIN_CORRECTION'])),
        closing: { $sum: { $cond: [IN_CLOSING, '$qty', 0] } },
        closingValue: {
          $sum: {
            $cond: [IN_CLOSING, { $multiply: ['$qty', '$unitCost'] }, 0],
          },
        },
        purchaseValue: {
          $sum: {
            $cond: [
              { $and: [IN_WINDOW, isType('GRC_IN')] },
              { $multiply: ['$qty', '$unitCost'] },
              0,
            ],
          },
        },
      },
    },
    {
      $group: {
        _id: DIMENSION_KEY[groupBy] || DIMENSION_KEY.supplier,
        opening: { $sum: '$opening' },
        purchase: { $sum: '$purchase' },
        purchaseReturn: { $sum: '$purchaseReturn' },
        sold: { $sum: '$sold' },
        salesReturn: { $sum: '$salesReturn' },
        transferIn: { $sum: '$transferIn' },
        transferOut: { $sum: '$transferOut' },
        adjustment: { $sum: '$adjustment' },
        closing: { $sum: '$closing' },
        closingValue: { $sum: '$closingValue' },
        purchaseValue: { $sum: '$purchaseValue' },
        /* how many distinct item codes the group covers - the Bill-wise
           report's Item Count. Kept only where a bill is the grain. */
        ...(groupBy === 'bill' ? { itemCodes: { $addToSet: '$_id.c' } } : {}),
      },
    },
  ];

  const raw = await StockMovement.aggregate(pipeline).allowDiskUse(true);

  const rows = raw.map((r) => {
    const purchase = r2(r.purchase);
    const purchaseValue = r2(r.purchaseValue);
    /* Every movement type is counted into exactly one bucket, so this is 0 -
       except for a type this code does not know (a new movement kind, or a
       row another module wrote). Folding it into Adjustment keeps
       opening + in - out = closing true rather than leaving a row that does
       not add up, and unclassifiedQty says how much of it is unexplained. */
    const known = r2(
      num(r.opening) + num(r.purchase) - num(r.purchaseReturn) - num(r.sold)
      + num(r.salesReturn) + num(r.transferIn) - num(r.transferOut) + num(r.adjustment),
    );
    const other = r2(num(r.closing) - known);
    return {
      supplierKey: s(r._id.s),
      grcNo: s(r._id.g),
      itemCode: s(r._id.c),
      itemName: s(r._id.n),
      batchNo: s(r._id.bt),
      openingQty: r2(r.opening),
      purchaseQty: purchase,
      purchaseReturnQty: r2(r.purchaseReturn),
      soldQty: r2(r.sold),
      salesReturnQty: r2(r.salesReturn),
      transferInQty: r2(r.transferIn),
      transferOutQty: r2(r.transferOut),
      adjustmentQty: r2(num(r.adjustment) + other),
      unclassifiedQty: other,
      closingQty: r2(r.closing),
      closingValue: r2(r.closingValue),
      /* weighted cost of what was bought in the window; 0 when nothing was */
      purchaseRate: purchase > 0 ? r2(purchaseValue / purchase) : 0,
      itemCount: Array.isArray(r.itemCodes) ? r.itemCodes.filter(Boolean).length : 0,
    };
  }).filter((r) => (
    r.openingQty || r.purchaseQty || r.purchaseReturnQty || r.soldQty
    || r.salesReturnQty || r.transferInQty || r.transferOutQty
    || r.adjustmentQty || r.closingQty || r.closingValue
  ));

  return { rows, coverage: await coverageFor(match, fromDate) };
}

/* Says out loud when the requested window starts before the ledger does.
   An empty month there is unrecorded, not a month with no trade. */
async function coverageFor(match, fromDate) {
  if (!match || !fromDate) return null;

  const [first, orphan] = await Promise.all([
    StockMovement.findOne(match).sort({ at: 1 }).select('at').lean(),
    /* movements whose unit cannot be found - the same two indexed lookups as
       the main pipeline, then the ones that resolved to nothing */
    StockMovement.aggregate([
      { $match: match },
      {
        $lookup: {
          from: 'barcodeLabel',
          localField: 'barcodeNo',
          foreignField: 'barcodeNo',
          as: 'uByNo',
        },
      },
      {
        $lookup: {
          from: 'barcodeLabel',
          localField: 'barcodeId',
          foreignField: '_id',
          as: 'uById',
        },
      },
      {
        $addFields: {
          unit: {
            $ifNull: [
              {
                $cond: [
                  { $ne: [{ $ifNull: ['$barcodeNo', ''] }, ''] },
                  { $arrayElemAt: ['$uByNo', 0] },
                  null,
                ],
              },
              { $arrayElemAt: ['$uById', 0] },
            ],
          },
        },
      },
      { $match: { 'unit._id': null } },
      { $group: { _id: null, n: { $sum: 1 }, qty: { $sum: '$qty' } } },
    ]),
  ]);

  const notes = [];
  if (first?.at && first.at > fromDate) {
    notes.push('Stock movements are only recorded from '
      + new Date(first.at).toISOString().slice(0, 10)
      + '. Quantities before that date cannot be reported and are not shown as zero.');
  }
  if (orphan?.[0]?.n) {
    notes.push(orphan[0].n + ' movement(s) totalling ' + r2(orphan[0].qty)
      + ' qty carry no barcode number that matches a stock unit, so no supplier or bill can be'
      + ' attached to them; they are left out rather than attributed to nobody.');
  }
  return notes.length ? { note: notes.join(' ') } : null;
}

/* Totals over the WHOLE result, for the columns that add up. A per-unit rate
   does not, so it is not totalled. */
export function stockTotals(rows) {
  const t = {
    openingQty: 0, purchaseQty: 0, purchaseReturnQty: 0, soldQty: 0,
    salesReturnQty: 0, transferInQty: 0, transferOutQty: 0,
    adjustmentQty: 0, closingQty: 0, closingValue: 0, itemCount: 0,
  };
  rows.forEach((r) => {
    Object.keys(t).forEach((k) => { t[k] += num(r[k]); });
  });
  Object.keys(t).forEach((k) => { t[k] = r2(t[k]); });
  return t;
}
