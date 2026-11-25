import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { Supplier } from '@/lib/contacts';
import { imageUrl } from '@/lib/inventory';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import {
  json, num, r2, scopeOf, pageOf, salesDocuments, lineQty, lineItemCode, lineItemName,
} from '@/lib/reports';

const text = (value) => String(value ?? '').trim();
const keyOf = (value) => text(value).toLowerCase();
const lineBarcode = (line) => text(line.barcodeNo ?? line.barcode ?? line.barcodeGenerated);
const lineItemId = (line) => text(line.itemId?._id ?? line.itemId ?? line.item?._id ?? line.item);
const lineImage = (line) => text(line.imageUrl ?? line.productImage ?? line.image);
const lineRate = (line) => num(line.rsp ?? line.rate ?? line.sellingPrice ?? line.price ?? line.Rate);
const lineAmount = (line, qty) => r2(
  num(line.netAmount ?? line['Net Amount']) || num(line.amount ?? line.Amount) || qty * lineRate(line)
);
const contactName = (contact) => text(contact?.businessName)
  || [contact?.firstName, contact?.middleName, contact?.lastName]
    .map(text).filter(Boolean).join(' ');

function range(sp, prefix) {
  const rawMin = text(sp.get(`${prefix}Min`));
  const rawMax = text(sp.get(`${prefix}Max`));
  const min = rawMin === '' ? null : Number(rawMin);
  const max = rawMax === '' ? null : Number(rawMax);
  if ((min !== null && (!Number.isFinite(min) || min < 0))
    || (max !== null && (!Number.isFinite(max) || max < 0))) {
    throw new Error(`${prefix.toUpperCase()} values must be non-negative numbers.`);
  }
  if (min !== null && max !== null && min > max) {
    throw new Error(`${prefix.toUpperCase()} start must be less than or equal to end.`);
  }
  return { min, max };
}

function matchesRange(value, bounds) {
  if (bounds.min === null && bounds.max === null) return true;
  if (value === null || value === undefined) return false;
  return (bounds.min === null || value >= bounds.min)
    && (bounds.max === null || value <= bounds.max);
}

function quantityOf(label) {
  return num(label.qtyNum) || num(label.qty);
}

function ageOf(label) {
  if (label.stockAge !== null && label.stockAge !== undefined && label.stockAge !== '') {
    return Math.max(0, num(label.stockAge));
  }
  if (!label.stockDate) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(label.stockDate).getTime()) / 86400000));
}

function labelsForEntry(entry, labelMaps) {
  const found = new Map();
  const add = (labels) => {
    (Array.isArray(labels) ? labels : [labels]).filter(Boolean)
      .forEach((label) => found.set(String(label._id), label));
  };
  add(labelMaps.byId.get(entry.itemId));
  add(labelMaps.byCode.get(keyOf(entry.itemCode)));
  add(labelMaps.byCode.get(keyOf(entry.itemName)));
  add(labelMaps.byBarcode.get(entry.barcodeNo));
  entry.extraBarcodes.forEach((barcode) => add(labelMaps.byBarcode.get(barcode)));
  return [...found.values()];
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to run this report.' }, 422);
  await dbConnect();
  const denied = await screenDenial({ session, screen: SCREENS.SALES_IMAGE_REPORT, action: PERM.READ, businessId: scope.businessId, label: 'the sales image report' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const fromDate = text(sp.get('fromDate'));
  const toDate = text(sp.get('toDate'));
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (Number.isNaN(new Date(fromDate).getTime()) || Number.isNaN(new Date(toDate).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }
  if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

  let qohRange;
  let rspRange;
  let rateRange;
  try {
    qohRange = range(sp, 'qoh');
    rspRange = range(sp, 'rsp');
    rateRange = range(sp, 'rate');
  } catch (error) {
    return json({ error: error.message }, 422);
  }

  const groupId = text(sp.get('groupId'));
  const subGroupId = text(sp.get('subGroupId'));
  const itemId = text(sp.get('itemId'));
  const supplierId = text(sp.get('supplierId'));
  for (const [label, value] of [
    ['Group', groupId], ['Subgroup', subGroupId], ['Item', itemId], ['Supplier', supplierId],
  ]) {
    if (value && !isValidObjectId(value)) return json({ error: `${label} selection is invalid.` }, 422);
  }
  const ageRange = text(sp.get('age'));
  const ageRanges = { '0-30': [0, 30], '31-60': [31, 60], '61-90': [61, 90], '91+': [91, Infinity] };
  if (ageRange && !ageRanges[ageRange]) return json({ error: 'Select a valid age range.' }, 422);
  const sellQtyText = text(sp.get('sellQty'));
  const sellQty = sellQtyText ? Number(sellQtyText) : null;
  if (sellQty !== null && (!Number.isFinite(sellQty) || sellQty < 0)) {
    return json({ error: 'Sell quantity must be a non-negative number.' }, 422);
  }

  await dbConnect();
  const { sales } = await salesDocuments(sp, scope);
  const soldLines = sales.flatMap((document) => (
    (Array.isArray(document.items) ? document.items : []).map((line) => ({
      document,
      line,
      itemId: lineItemId(line),
      itemCode: lineItemCode(line) || text(line.code),
      itemName: lineItemName(line),
      barcodeNo: lineBarcode(line),
    }))
  ));

  const rawItemIds = [...new Set(soldLines.map((row) => row.itemId).filter(isValidObjectId))];
  const barcodes = [...new Set(soldLines.map((row) => row.barcodeNo).filter(Boolean))];
  const codes = [...new Set(soldLines.flatMap((row) => [row.itemCode, row.itemName]).filter(Boolean))];
  const labelOr = [];
  if (rawItemIds.length) {
    labelOr.push({ _id: { $in: rawItemIds } }, { itemId: { $in: rawItemIds } });
  }
  if (barcodes.length) {
    labelOr.push(
      { barcodeNo: { $in: barcodes } },
      { barcodeGenerated: { $in: barcodes } },
      { oldBarcode: { $in: barcodes } }
    );
  }
  if (codes.length) labelOr.push({ itemCode: { $in: codes } }, { itemName: { $in: codes } });

  const labelFilter = {
    businessId: String(scope.businessId),
    ...(scope.finYear ? { finYear: { $in: [scope.finYear, '', null] } } : {}),
    ...(scope.locationId ? { locationId: { $in: [String(scope.locationId), '', null] } } : {}),
    $or: labelOr.length ? labelOr : [{ _id: null }],
  };
  const labels = await BarcodeLabel.find(labelFilter)
    .select('_id itemId itemCode itemName barcodeNo barcodeGenerated oldBarcode supplierId status qty qtyNum retailPrice finalNet purRate stockAge stockDate imageUrl filePath')
    .lean();

  const labelMaps = { byId: new Map(), byCode: new Map(), byBarcode: new Map() };
  const indexAll = (map, key, label) => {
    if (!key) return;
    const list = map.get(String(key)) || [];
    list.push(label);
    map.set(String(key), list);
  };
  labels.forEach((label) => {
    indexAll(labelMaps.byId, label._id, label);
    indexAll(labelMaps.byId, label.itemId, label);
    indexAll(labelMaps.byCode, keyOf(label.itemCode), label);
    indexAll(labelMaps.byCode, keyOf(label.itemName), label);
    [label.barcodeNo, label.barcodeGenerated, label.oldBarcode].filter(Boolean)
      .forEach((barcode) => indexAll(labelMaps.byBarcode, barcode, label));
  });

  const canonicalItemIds = [...new Set([
    ...rawItemIds,
    ...labels.map((label) => text(label.itemId)),
  ].filter(isValidObjectId))];
  const itemQuery = [];
  if (canonicalItemIds.length) itemQuery.push({ _id: { $in: canonicalItemIds } });
  if (codes.length) itemQuery.push({ itemCode: { $in: codes } }, { name: { $in: codes } });
  const itemDocs = itemQuery.length
    ? await Item.find({
      businessId: String(scope.businessId),
      $or: itemQuery,
    }).select('_id itemCode name image rsp subGroupId').lean()
    : [];
  const itemById = new Map(itemDocs.map((item) => [String(item._id), item]));
  const itemByCode = new Map();
  itemDocs.forEach((item) => {
    if (item.itemCode) itemByCode.set(keyOf(item.itemCode), item);
    if (item.name && !itemByCode.has(keyOf(item.name))) itemByCode.set(keyOf(item.name), item);
  });

  const labelById = new Map(labels.map((label) => [String(label._id), label]));
  const labelByBarcode = new Map();
  labels.forEach((label) => {
    [label.barcodeNo, label.barcodeGenerated, label.oldBarcode].filter(Boolean)
      .forEach((barcode) => labelByBarcode.set(String(barcode), label));
  });
  const itemForLine = (row) => {
    const label = labelById.get(row.itemId)
      || labelByBarcode.get(row.barcodeNo)
      || labelMaps.byCode.get(keyOf(row.itemCode))?.[0]
      || labelMaps.byCode.get(keyOf(row.itemName))?.[0];
    return itemById.get(row.itemId)
      || (label?.itemId ? itemById.get(String(label.itemId)) : null)
      || itemByCode.get(keyOf(row.itemCode))
      || itemByCode.get(keyOf(row.itemName))
      || null;
  };

  let selectedSubgroupIds = [];
  if (groupId) {
    const children = await ProductGroup.find({ parentId: groupId }).select('_id').lean();
    selectedSubgroupIds = [groupId, ...children.map((child) => String(child._id))];
  }
  const filteredItemDocs = itemDocs.filter((item) => {
    if (itemId && String(item._id) !== itemId) return false;
    if (subGroupId && String(item.subGroupId || '') !== subGroupId) return false;
    if (selectedSubgroupIds.length && !selectedSubgroupIds.includes(String(item.subGroupId || ''))) return false;
    return true;
  });
  const allowedItemIds = new Set(filteredItemDocs.map((item) => String(item._id)));
  const itemFilterRequired = Boolean(itemId || subGroupId || groupId);

  const matchingSoldLines = soldLines.map((row) => {
    const item = itemForLine(row);
    const itemLabel = labelById.get(row.itemId)
      || labelByBarcode.get(row.barcodeNo)
      || labelMaps.byCode.get(keyOf(row.itemCode))?.[0]
      || labelMaps.byCode.get(keyOf(row.itemName))?.[0];
    return {
      ...row,
      itemId: String(item?._id || itemLabel?.itemId || row.itemId),
      itemCode: text(item?.itemCode) || row.itemCode || text(itemLabel?.itemCode),
      itemName: row.itemName || text(item?.name) || text(itemLabel?.itemName),
      resolvedItem: item,
    };
  }).filter((row) => {
    const item = row.resolvedItem;
    if (itemId && String(item?._id || '') !== itemId) return false;
    if (itemFilterRequired && item) return allowedItemIds.has(String(item._id));
    if (itemFilterRequired && !item) return false;
    return true;
  });

  const groupIds = [...new Set(filteredItemDocs.map((item) => String(item.subGroupId || '')).filter(isValidObjectId))];
  const subgroupDocs = groupIds.length
    ? await ProductGroup.find({ _id: { $in: groupIds } }).select('_id name parentId').lean()
    : [];
  const parentIds = [...new Set(subgroupDocs.map((group) => String(group.parentId || '')).filter(isValidObjectId))];
  const parentDocs = parentIds.length
    ? await ProductGroup.find({ _id: { $in: parentIds } }).select('_id name').lean()
    : [];
  const parentNameById = new Map(parentDocs.map((group) => [String(group._id), text(group.name)]));
  const subgroupById = new Map(subgroupDocs.map((group) => [String(group._id), {
    name: text(group.name),
    parentName: parentNameById.get(String(group.parentId || '')) || '',
  }]));
  const supplierIds = [...new Set([
    ...matchingSoldLines.map((row) => text(row.line.supplierId)),
    ...labels.map((label) => text(label.supplierId)),
  ])].filter(isValidObjectId);
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds } })
      .select('_id businessName firstName middleName lastName').lean()
    : [];
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), contactName(supplier)]));

  const grouped = new Map();
  matchingSoldLines.forEach((row) => {
    const item = (isValidObjectId(row.itemId) && itemById.get(row.itemId))
      || itemByCode.get(row.itemCode)
      || itemByCode.get(row.itemName);
    const resolvedId = item ? String(item._id) : '';
    const code = text(item?.itemCode) || row.itemCode || row.itemName;
    const name = row.itemName || text(item?.name) || row.itemCode || 'Unnamed item';
    const key = resolvedId || code || name;
    const qty = r2(lineQty(row.line));
    const labelsForLine = {
      ...row,
      itemId: resolvedId,
      itemCode: code,
      itemName: name,
      extraBarcodes: [row.barcodeNo].filter(Boolean),
    };
    const relatedLabels = labelsForEntry(labelsForLine, labelMaps);
    const supplierKey = text(row.line.supplierId) || text(relatedLabels.find((label) => label.supplierId)?.supplierId);
    const existing = grouped.get(key) || {
      itemId: resolvedId,
      itemCode: code,
      itemName: name,
      image: lineImage(row.line),
      barcodeNo: row.barcodeNo,
      labels: new Map(),
      supplierKey,
      supplierKeys: new Set(),
      saleQty: 0,
      saleAmount: 0,
      saleLines: 0,
      subgroupId: String(item?.subGroupId || ''),
    };
    if (!existing.image) existing.image = lineImage(row.line);
    if (!existing.barcodeNo) existing.barcodeNo = row.barcodeNo;
    if (!existing.supplierKey) existing.supplierKey = supplierKey;
    if (supplierKey) existing.supplierKeys.add(supplierKey);
    relatedLabels.forEach((label) => {
      if (label.supplierId) existing.supplierKeys.add(String(label.supplierId));
    });
    relatedLabels.forEach((label) => existing.labels.set(String(label._id), label));
    existing.saleQty += qty;
    existing.saleAmount += lineAmount(row.line, qty);
    existing.saleLines += 1;
    grouped.set(key, existing);
  });

  let rows = [...grouped.values()].map((entry) => {
    const labelsForItem = [...entry.labels.values()];
    const stockLabels = labelsForItem.filter((label) => label.status === BARCODE_STATUS.IN_STOCK);
    const qoh = r2(stockLabels.reduce((sum, label) => sum + quantityOf(label), 0));
    const stockRSP = stockLabels.map((label) => num(label.retailPrice)).filter((value) => value > 0);
    const allRates = labelsForItem.map((label) => num(label.finalNet) || num(label.purRate)).filter((value) => value > 0);
    const stockCosts = stockLabels.map((label) => ({
      rate: num(label.finalNet) || num(label.purRate),
      qty: quantityOf(label),
    })).filter((value) => value.rate > 0);
    const costQty = stockCosts.reduce((sum, value) => sum + value.qty, 0);
    const purchaseRate = costQty
      ? stockCosts.reduce((sum, value) => sum + value.rate * value.qty, 0) / costQty
      : (allRates.length ? allRates.reduce((sum, value) => sum + value, 0) / allRates.length : null);
    const item = filteredItemDocs.find((doc) => String(doc._id) === entry.itemId);
    const subgroup = subgroupById.get(entry.subgroupId);
    const ages = stockLabels.map(ageOf).filter((value) => value !== null);
    const age = ages.length ? Math.max(...ages) : null;
    const rsp = stockRSP.length
      ? Math.max(...stockRSP)
      : (num(item?.rsp) || null);
    const supplierName = supplierById.get(entry.supplierKey) || '';
    const label = labelsForItem.find((value) => (
      value.barcodeNo === entry.barcodeNo
      || value.barcodeGenerated === entry.barcodeNo
      || value.oldBarcode === entry.barcodeNo
    )) || labelsForItem[0];
    return {
      _id: entry.itemId || entry.itemCode || entry.itemName,
      itemId: entry.itemId,
      itemCode: entry.itemCode,
      itemName: entry.itemName,
      supplierId: entry.supplierKey,
      supplierIds: [...entry.supplierKeys],
      imageUrl: imageUrl(
        entry.image || label?.imageUrl || label?.filePath || '',
        entry.barcodeNo || label?.barcodeNo || label?.barcodeGenerated || label?.oldBarcode
      ) || imageUrl(item?.image || ''),
      groupName: subgroup?.parentName || '',
      subgroupName: subgroup?.name || '',
      supplier: supplierName,
      saleQty: r2(entry.saleQty),
      saleAmount: r2(entry.saleAmount),
      saleLines: entry.saleLines,
      qoh,
      rsp,
      purchaseRate: purchaseRate === null ? null : r2(purchaseRate),
      age,
    };
  });

  if (supplierId) rows = rows.filter((row) => row.supplierIds.includes(supplierId));
  rows = rows.filter((row) => (
    matchesRange(row.qoh, qohRange)
    && matchesRange(row.rsp, rspRange)
    && matchesRange(row.purchaseRate, rateRange)
    && (!sellQtyText || row.saleQty === sellQty)
    && (!ageRange || (row.age !== null && row.age >= ageRanges[ageRange][0] && row.age <= ageRanges[ageRange][1]))
  ));
  rows.sort((a, b) => b.saleQty - a.saleQty || a.itemName.localeCompare(b.itemName));

  const totals = rows.reduce((sum, row) => ({
    saleQty: sum.saleQty + row.saleQty,
    saleAmount: sum.saleAmount + row.saleAmount,
  }), { saleQty: 0, saleAmount: 0 });
  const { page, perPage } = pageOf(sp);
  const total = rows.length;

  return json({
    rows: rows.slice((page - 1) * perPage, page * perPage),
    total,
    pages: Math.max(1, Math.ceil(total / perPage)),
    page,
    perPage,
    sourceDocuments: sales.length,
    sourceLines: soldLines.length,
    totals: {
      items: total,
      saleQty: r2(totals.saleQty),
      saleAmount: r2(totals.saleAmount),
    },
  });
}
