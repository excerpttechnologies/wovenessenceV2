import { Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireUser } from '@/lib/rbac';
import { handler } from '@/lib/apiError';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement from '@/models/StockMovement';
import CompanyLocation from '@/models/CompanyLocation';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import { json, num, r2, scopeOf, pageOf } from '@/lib/reports';

const toId = (value) => new Types.ObjectId(String(value));

export const GET = handler(async (req) => {
  await requireUser();
  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const scope = scopeOf(sp);
  const { page, perPage } = pageOf(sp);
  const asOnDate = sp.get('asOnDate');
  if (!scope.businessId) return json({ error: 'Select a business to run the Stock Summary Report.' }, 422);
  if (sp.get('options') === '1') {
    const groups = await ProductGroup.find({ businessId: scope.businessId })
      .select('_id name parentId')
      .sort({ name: 1 })
      .lean();
    return json({
      groups: groups.map((group) => ({
        value: String(group._id),
        label: group.name || '',
        parentId: group.parentId ? String(group.parentId) : '',
      })),
    });
  }
  if (!asOnDate || Number.isNaN(new Date(asOnDate).getTime())) {
    return json({ error: 'Enter a valid As on Date.' }, 422);
  }

  const businessId = String(scope.businessId);
  const end = new Date(`${asOnDate}T23:59:59.999`);
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  const isCurrentStock = end >= todayStart;
  const [allLabels, lastMovements, locations] = await Promise.all([
    BarcodeLabel.find({
      businessId,
      ...(isCurrentStock ? { status: BARCODE_STATUS.IN_STOCK } : {}),
      ...(isCurrentStock && scope.locationId ? { currentLocationId: toId(scope.locationId) } : {}),
    })
      .select('_id itemId itemCode itemName groupId qtyNum goodsType finalNet purRate retailPrice wspPrice wsp currentLocationId status createdAt barcodeNo barcodeGenerated printDescription customFields.ecomId customFields.consignment customFields.attribute')
      .lean(),
    isCurrentStock ? Promise.resolve([]) : StockMovement.aggregate([
      {
        $match: {
          businessId: toId(scope.businessId),
          at: { $lte: end },
          barcodeId: { $ne: null },
        },
      },
      { $sort: { at: -1, _id: -1 } },
      {
        $group: {
          _id: '$barcodeId',
          status: { $first: '$statusAfter' },
          locationId: { $first: { $ifNull: ['$toLocationId', '$fromLocationId'] } },
        },
      },
    ]),
    CompanyLocation.find({
      ...(scope.businessId ? { businessId: scope.businessId } : {}),
    }).select('_id name businessPrintName').sort({ name: 1 }).lean(),
  ]);
  const movementByBarcode = new Map(lastMovements.map((movement) => [
    String(movement._id),
    { status: movement.status, locationId: movement.locationId ? String(movement.locationId) : '' },
  ]));

  const historicalCandidates = isCurrentStock ? allLabels : allLabels.filter((label) => {
    if (label.createdAt && new Date(label.createdAt) > end) return false;
    const movement = movementByBarcode.get(String(label._id));
    return movement
      ? movement.status === BARCODE_STATUS.IN_STOCK
      : label.status === BARCODE_STATUS.IN_STOCK;
  });

  const locationNames = new Map(locations.map((location) => [
    String(location._id), location.name || location.businessPrintName || '',
  ]));
  const groups = await ProductGroup.find({ businessId: scope.businessId })
    .select('_id name parentId')
    .lean();
  const groupById = new Map(groups.map((group) => [String(group._id), group]));
  const classify = (label, item) => {
    const itemSubGroup = item?.subGroupId ? groupById.get(String(item.subGroupId)) : null;
    const labelGroup = label.groupId ? groupById.get(String(label.groupId)) : null;
    const subGroup = itemSubGroup || (labelGroup?.parentId ? labelGroup : null);
    const group = subGroup?.parentId
      ? groupById.get(String(subGroup.parentId))
      : subGroup || labelGroup;
    return { group, subGroup };
  };
  const itemIds = [...new Set(historicalCandidates.map((label) => label.itemId).filter(Boolean).map(String))];
  const itemCodes = [...new Set(historicalCandidates.map((label) => String(label.itemCode || '')).filter(Boolean))];
  const itemFilter = {
    ...(scope.businessId ? { businessId: scope.businessId } : {}),
    $or: [
      ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
      ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
    ],
  };
  const items = itemFilter.$or.length
    ? await Item.find(itemFilter).select('_id name itemCode subGroupId').lean()
    : [];
  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const itemByCode = new Map(items.map((item) => [String(item.itemCode || ''), item]));

  const filtersGroup = sp.get('group') || '';
  const filtersSubGroup = sp.get('subGroup') || '';
  const filtersStockType = sp.get('stockType') || '';
  const tab = ['subgroup', 'item'].includes(sp.get('tab')) ? sp.get('tab') : 'group';
  const eligible = historicalCandidates.filter((label) => {
    const locationId = movementByBarcode.get(String(label._id))?.locationId
      || String(label.currentLocationId || '');
    const item = itemById.get(String(label.itemId || ''))
      || itemByCode.get(String(label.itemCode || ''));
    const { group, subGroup } = classify(label, item);
    if (scope.locationId && locationId !== String(scope.locationId)) return false;
    if (filtersGroup && String(group?._id || '') !== filtersGroup) return false;
    if (filtersSubGroup && (!subGroup?.parentId || String(subGroup._id) !== filtersSubGroup)) return false;
    if (filtersStockType && String(label.goodsType || '') !== filtersStockType) return false;
    return true;
  });

  const grouped = new Map();
  const itemRows = eligible.map((label) => {
    const item = itemById.get(String(label.itemId || ''))
      || itemByCode.get(String(label.itemCode || ''));
    const { group, subGroup } = classify(label, item);
    const locationId = movementByBarcode.get(String(label._id))?.locationId
      || String(label.currentLocationId || '');
    const qty = num(label.qtyNum) || 1;
    const cp = num(label.finalNet) || num(label.purRate);
    const rsp = num(label.retailPrice);
    const wsp = num(label.wspPrice) || num(label.wsp);
    const customFields = label.customFields && typeof label.customFields === 'object'
      ? label.customFields : {};
    return {
      _id: String(label._id),
      location: locationNames.get(locationId) || '(unassigned)',
      group: group?.name || (subGroup && !subGroup.parentId ? subGroup.name : '(ungrouped)'),
      subGroup: subGroup?.parentId ? subGroup.name : '',
      itemCode: item?.itemCode || label.itemCode || '',
      ecomId: label.ecomId || customFields.ecomId || label.barcodeGenerated || label.barcodeNo || '',
      itemName: item?.name || label.itemName || '',
      printDescription: label.printDescription || '',
      consignment: label.consignment || customFields.consignment || 'No',
      qty: r2(qty),
      cpValue: r2(qty * cp),
      rspValue: r2(qty * rsp),
      wspValue: r2(qty * wsp),
      attribute: label.attribute || customFields.attribute || label.goodsType || '-',
    };
  });

  eligible.forEach((label) => {
    const item = itemById.get(String(label.itemId || ''))
      || itemByCode.get(String(label.itemCode || ''));
    const { group, subGroup } = classify(label, item);
    const locationId = movementByBarcode.get(String(label._id))?.locationId
      || String(label.currentLocationId || '');
    const dimension = tab === 'group' ? String(group?._id || '(ungrouped)')
      : tab === 'subgroup' ? String(subGroup?._id || '(ungrouped)')
        : String(item?.itemCode || label.itemCode || '(no item code)');
    const key = `${locationId}|${dimension}`;
    if (!grouped.has(key)) {
      grouped.set(key, {
        _id: key,
        location: locationNames.get(locationId) || '(unassigned)',
        group: group?.name || (subGroup && !subGroup.parentId ? subGroup.name : '(ungrouped)'),
        subGroup: subGroup?.parentId ? subGroup.name : '',
        itemCode: item?.itemCode || label.itemCode || '',
        itemName: item?.name || label.itemName || '',
        qty: 0,
        cpValue: 0,
        rspValue: 0,
        wspValue: 0,
      });
    }
    const row = grouped.get(key);
    const qty = num(label.qtyNum) || 1;
    const cp = num(label.finalNet) || num(label.purRate);
    const rsp = num(label.retailPrice);
    const wsp = num(label.wspPrice) || num(label.wsp);
    row.qty += qty;
    row.cpValue += qty * cp;
    row.rspValue += qty * rsp;
    row.wspValue += qty * wsp;
  });

  const groupedRows = [...grouped.values()].map((row) => ({
    ...row,
    qty: r2(row.qty),
    cpValue: r2(row.cpValue),
    rspValue: r2(row.rspValue),
    wspValue: r2(row.wspValue),
  })).sort((a, b) => a.location.localeCompare(b.location)
    || a.group.localeCompare(b.group)
    || a.subGroup.localeCompare(b.subGroup)
    || a.itemCode.localeCompare(b.itemCode));
  const rows = (tab === 'item' ? itemRows : groupedRows).sort((a, b) =>
    a.location.localeCompare(b.location)
    || a.group.localeCompare(b.group)
    || a.subGroup.localeCompare(b.subGroup)
    || a.itemCode.localeCompare(b.itemCode)
  );
  const totals = rows.reduce((sum, row) => ({
    qty: sum.qty + row.qty,
    cpValue: sum.cpValue + row.cpValue,
    rspValue: sum.rspValue + row.rspValue,
    wspValue: sum.wspValue + row.wspValue,
  }), { qty: 0, cpValue: 0, rspValue: 0, wspValue: 0 });

  const stockTypes = [...new Set(allLabels.map((label) => String(label.goodsType || '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));
  const p = rows.slice((page - 1) * perPage, page * perPage);
  return json({
    rows: p,
    total: rows.length,
    pages: Math.max(1, Math.ceil(rows.length / perPage)),
    page,
    perPage,
    totals: Object.fromEntries(Object.entries(totals).map(([key, value]) => [key, r2(value)])),
    groups: groups.map((group) => ({
      value: String(group._id),
      label: group.name || '',
      parentId: group.parentId ? String(group.parentId) : '',
    })),
    stockTypes,
  });
});
