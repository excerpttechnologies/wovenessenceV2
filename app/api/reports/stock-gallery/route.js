import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { imageUrl } from '@/lib/inventory';
import { requireSession } from '@/lib/session';
import { json, num, r2, scopeOf, pageOf } from '@/lib/reports';
import { supplierKeysForFilters, loadSupplierMap } from '@/lib/stockPosition';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { escapeRegex } from '@/lib/validate';

/* /api/reports/stock-gallery

   The gallery's data: one CARD per item that is in stock, built from the same
   grain as Master Stock Report - one barcode row is one unit of stock
   (lib/barcodeLabel.js), and only rows still IN_STOCK count.

   Each card is the aggregate of that item's units:
     QOH           = SUM(qtyNum, falling back to qty)
     Stock Value   = SUM(unit qty x unit cost)   - cost per UNIT, not an average
                     of the item, so a mixed-rate item is valued correctly
     Purchase Rate = Stock Value / QOH
     RSP           = the highest retail price among the units
     Age           = the oldest unit (stockAge when the import supplied it,
                     else counted from stockDate)

   Images: the unit's own photo (barcodeLabel.imageUrl / filePath) through
   lib/inventory.js imageUrl(), then the Item master's image, then a
   placeholder rendered by the screen. Nothing is invented - an item with no
   photo has none, and /api/reports/master-stock-report/missing-images exists
   precisely because many do not.

   `?units=1&itemCode=...` answers the detail drawer instead: the individual
   barcode units behind one card, which is what a person opens a card to see.

   PAGINATION IS SERVER-SIDE, like Master Stock Report: count, then read the
   page. The aggregation runs once, with the sort and window inside it. */

const s = (v) => String(v ?? '').trim();

const many = (sp, key) => String(sp.get(key) || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

/* String-typed prices and quantities - see lib/stockPosition.js for why
   $convert with onError is used instead of $toDouble. */
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
/* stockAge was supplied by the opening import; a unit without one is aged
   from its stock date. Both are real dates on the row - neither is guessed. */
const UNIT_AGE = {
  $cond: [
    { $ne: [{ $ifNull: ['$stockAge', null] }, null] },
    '$stockAge',
    {
      $cond: [
        { $ne: [{ $ifNull: ['$stockDate', null] }, null] },
        { $floor: { $divide: [{ $subtract: ['$$NOW', '$stockDate'] }, 86400000] } },
        null,
      ],
    },
  ],
};

const CODE_EXPR = {
  $cond: [
    { $gt: [{ $strLenCP: { $ifNull: ['$itemCode', ''] } }, 0] },
    '$itemCode',
    { $ifNull: ['$itemName', ''] },
  ],
};

/* the sorts the screen offers, resolved to aggregation sorts. A name outside
   this map is ignored, never passed through to $sort. */
const SORTS = {
  value: { value: -1, _id: 1 },
  qoh: { qoh: -1, _id: 1 },
  name: { itemName: 1, _id: 1 },
  rsp: { rsp: -1, _id: 1 },
  rate: { avgRate: -1, _id: 1 },
  age: { age: -1, _id: 1 },
};

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);

  const denied = await screenDenial({
    session,
    screen: SCREENS.STOCK_GALLERY_VIEW,
    label: 'the stock gallery',
    action: PERM.READ,
    businessId: scope.businessId,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  if (sp.get('allLocations') === '1') scope.locationId = null;

  /* ------------------------------------------------------------- scope --- */
  const filter = { status: BARCODE_STATUS.IN_STOCK };
  /* barcodeLabel keeps its scope as plain strings and a blank one belongs to
     the business as a whole - the same inclusion Master Stock Report makes,
     or imported stock would disappear from the gallery. */
  if (scope.businessId) filter.businessId = String(scope.businessId);
  if (scope.finYear) filter.finYear = { $in: [scope.finYear, '', null] };
  if (scope.locationId) filter.locationId = { $in: [String(scope.locationId), '', null] };

  const and = [];

  /* SUPPLIER: the row carries only the vendor key, in either spelling. */
  const supplierKeys = await supplierKeysForFilters({
    businessId: scope.businessId,
    supplierPicks: many(sp, 'supplierId'),
    city: s(sp.get('city')),
    cityGroupIds: many(sp, 'cityGroupId'),
    agentPicks: many(sp, 'agentId'),
  });
  if (supplierKeys) and.push({ supplierId: { $in: supplierKeys } });

  /* ITEM picks: id, code or name, because which one a row carries depends on
     which import wrote it. */
  const itemPicks = many(sp, 'itemId').filter((v) => isValidObjectId(v));
  if (itemPicks.length) {
    const items = await Item.find({ _id: { $in: itemPicks } }).select('itemCode name').lean();
    const keys = [...new Set(items.flatMap((i) => [s(i.itemCode), s(i.name)]).filter(Boolean))];
    and.push(keys.length
      ? { $or: [
        { itemId: { $in: items.map((i) => i._id) } },
        { itemCode: { $in: keys } },
        { itemName: { $in: keys } },
      ] }
      : { _id: null });
  }

  /* GROUP / SUBGROUP: one collection with parentId (models/ProductGroup.js),
     so a group is its own id plus every child's id. Items inside those are
     resolved once and matched on id, code and name. */
  const groupPicks = many(sp, 'groupId').filter((v) => isValidObjectId(v));
  if (groupPicks.length) {
    const kids = await ProductGroup.find({ parentId: { $in: groupPicks } }).select('_id').lean();
    const groupIds = [...new Set([...groupPicks, ...kids.map((k) => String(k._id))])]
      .map((v) => new Types.ObjectId(v));
    const items = await Item.find({ subGroupId: { $in: groupIds } }).select('itemCode name').lean();
    const keys = [...new Set(items.flatMap((i) => [s(i.itemCode), s(i.name)]).filter(Boolean))];
    and.push(keys.length
      ? { $or: [
        { itemId: { $in: items.map((i) => i._id) } },
        { itemCode: { $in: keys } },
        { itemName: { $in: keys } },
      ] }
      : { _id: null });
  }

  const search = s(sp.get('search'));
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    and.push({ $or: [{ itemCode: rx }, { itemName: rx }, { barcodeNo: rx }] });
  }

  if (and.length) filter.$and = and;

  /* --------------------------------------------------- unit detail mode --- */
  if (sp.get('units') === '1') {
    const code = s(sp.get('itemCode'));
    const itemId = s(sp.get('itemId'));
    if (!code && !isValidObjectId(itemId)) {
      return json({ error: 'Item Code is required.' }, 422);
    }
    const uFilter = { ...filter };
    if (isValidObjectId(itemId)) {
      uFilter.$and = [...(filter.$and || []), { $or: [{ itemId }, { itemCode: code }] }];
    } else {
      uFilter.$and = [...(filter.$and || []), { itemCode: code }];
    }
    const units = await BarcodeLabel.find(uFilter)
      .sort({ stockDate: -1, _id: -1 })
      .limit(200)
      .select('barcodeNo itemCode itemName qty qtyNum purRate finalNet retailPrice stockAge stockDate imageUrl filePath locationId supplierId')
      .lean();
    return json({
      units: units.map((u) => ({
        barcodeNo: s(u.barcodeNo),
        itemCode: s(u.itemCode),
        itemName: s(u.itemName),
        qty: num(u.qtyNum) || num(u.qty),
        cost: num(u.finalNet) || num(u.purRate),
        rsp: num(u.retailPrice),
        age: u.stockAge ?? null,
        stockDate: u.stockDate || null,
        imageUrl: imageUrl(u.imageUrl || u.filePath || '', u.barcodeNo),
      })),
      note: units.length === 200 ? 'Showing the first 200 units.' : '',
    });
  }

  /* --------------------------------------------------------- the cards --- */
  const exprs = [];
  /* ranges are inclusive and compare the CONVERTED number; a blank bound is
     no bound. The non-null guard keeps an unpriced unit out of a "Max" filter
     - null sorts below every number in BSON. */
  const range = (field, minKey, maxKey) => {
    const lo = Number(s(sp.get(minKey)));
    const hi = Number(s(sp.get(maxKey)));
    const hasLo = s(sp.get(minKey)) !== '' && Number.isFinite(lo);
    const hasHi = s(sp.get(maxKey)) !== '' && Number.isFinite(hi);
    if (!hasLo && !hasHi) return;
    exprs.push({ $ne: [field, null] });
    if (hasLo) exprs.push({ $gte: [field, lo] });
    if (hasHi) exprs.push({ $lte: [field, hi] });
  };
  range('$qoh', 'qohMin', 'qohMax');
  range('$rsp', 'rspMin', 'rspMax');
  range('$avgRate', 'rateMin', 'rateMax');
  range('$age', 'ageMin', 'ageMax');

  const allowed = perPage;
  const sort = SORTS[s(sp.get('sort'))] || SORTS.value;

  const pipeline = [
    { $match: filter },
    {
      $group: {
        /* one card per item: the real reference when the row has it, else the
           code the row carries */
        _id: { $ifNull: ['$itemId', CODE_EXPR] },
        itemCode: { $first: '$itemCode' },
        itemName: { $first: '$itemName' },
        qoh: { $sum: UNIT_QTY },
        value: { $sum: { $multiply: [UNIT_QTY, UNIT_COST] } },
        rate: { $max: UNIT_COST },
        rsp: { $max: toNum('$retailPrice') },
        age: { $max: UNIT_AGE },
        supplierKey: { $max: '$supplierId' },
        image: { $max: '$imageUrl' },
        filePath: { $max: '$filePath' },
        barcodeNo: { $max: '$barcodeNo' },
        itemId: { $max: '$itemId' },
      },
    },
    {
      $addFields: {
        avgRate: { $cond: [{ $gt: ['$qoh', 0] }, { $divide: ['$value', '$qoh'] }, 0] },
      },
    },
    ...(exprs.length ? [{ $match: { $expr: exprs.length === 1 ? exprs[0] : { $and: exprs } } }] : []),
    {
      $facet: {
        rows: [{ $sort: sort }, { $skip: (page - 1) * allowed }, { $limit: allowed }],
        total: [{ $count: 'n' }],
        summary: [{
          $group: { _id: null, qoh: { $sum: '$qoh' }, value: { $sum: '$value' } },
        }],
      },
    },
  ];

  const [facet] = await BarcodeLabel.aggregate(pipeline).allowDiskUse(true);
  const total = facet?.total?.[0]?.n || 0;
  const summary = facet?.summary?.[0] || { qoh: 0, value: 0 };
  const raw = facet?.rows || [];

  /* ---- one batched pass for the names, groups, suppliers and images ---- */
  const ids = raw.filter((r) => r.itemId).map((r) => String(r.itemId));
  const codes = [...new Set(raw.flatMap((r) => [s(r.itemCode), s(r.itemName)]).filter(Boolean))];

  const itemOr = [];
  if (ids.length) itemOr.push({ _id: { $in: [...new Set(ids)] } });
  if (codes.length) itemOr.push({ itemCode: { $in: codes } }, { name: { $in: codes } });
  const itemDocs = itemOr.length
    ? await Item.find({ $or: itemOr }).select('itemCode name image subGroupId').lean()
    : [];

  const itemById = new Map();
  const itemByCode = new Map();
  itemDocs.forEach((i) => {
    itemById.set(String(i._id), i);
    if (s(i.itemCode)) itemByCode.set(s(i.itemCode), i);
    if (s(i.name)) itemByCode.set(s(i.name), i);
  });

  const subGroupIds = [...new Set(itemDocs.map((i) => i.subGroupId).filter(Boolean).map(String))];
  const subGroups = subGroupIds.length
    ? await ProductGroup.find({ _id: { $in: subGroupIds } }).select('name parentId').lean()
    : [];
  const parentIds = [...new Set(subGroups.map((g) => g.parentId).filter(Boolean).map(String))];
  const parents = parentIds.length
    ? await ProductGroup.find({ _id: { $in: parentIds } }).select('name').lean()
    : [];
  const parentName = new Map(parents.map((p) => [String(p._id), s(p.name)]));
  const groupById = new Map(subGroups.map((g) => [
    String(g._id),
    { group: g.parentId ? (parentName.get(String(g.parentId)) || '') : '', subGroup: s(g.name) },
  ]));

  const vendors = await loadSupplierMap(raw.map((r) => s(r.supplierKey)), scope.businessId);

  const cards = raw.map((r) => {
    const item = (r.itemId && itemById.get(String(r.itemId)))
      || (s(r.itemCode) && itemByCode.get(s(r.itemCode)))
      || (s(r.itemName) && itemByCode.get(s(r.itemName)))
      || null;
    const groups = item?.subGroupId ? groupById.get(String(item.subGroupId)) : null;
    const vendor = vendors.get(s(r.supplierKey)) || null;
    const qoh = r2(r.qoh);
    const value = r2(r.value);
    return {
      itemId: item ? String(item._id) : '',
      itemCode: s(item?.itemCode) || s(r.itemCode) || s(r.itemName),
      itemName: s(r.itemName) || s(item?.name) || s(r.itemCode) || s(r.itemName),
      groupName: groups?.group || '',
      subGroupName: groups?.subGroup || '',
      supplier: vendor?.name || (s(r.supplierKey) ? s(r.supplierKey) : ''),
      qoh,
      purchaseRate: qoh > 0 ? r2(value / qoh) : r2(r.rate),
      rsp: r2(r.rsp),
      stockValue: value,
      age: r.age === null || r.age === undefined ? null : Math.max(0, Math.round(r.age)),
      imageUrl: imageUrl(s(r.image) || s(r.filePath), s(r.barcodeNo)) || imageUrl(s(item?.image)),
    };
  });

  return json({
    tiles: {
      totalProducts: total,
      totalQty: r2(summary.qoh),
      totalValue: r2(summary.value),
    },
    sections: [{ key: 'items', rows: cards, count: total }],
    total,
    pages: Math.max(1, Math.ceil(total / allowed)),
    page,
    perPage: allowed,
  });
}
