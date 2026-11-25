import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { Supplier } from '@/lib/contacts';
import CityGroup from '@/models/CityGroup';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import {
  json, num, r2, requireReportScope, salesDocuments, lineQty, lineItemCode, lineItemName, lineTax,
} from '@/lib/reports';

const text = (value) => String(value ?? '').trim();
const keyOf = (value) => text(value).toLowerCase();
const ID_FIELDS = ['supplierId', 'groupId', 'subGroupId', 'itemId', 'cityGroupId'];

function firstNumber(row, keys) {
  for (const key of keys) {
    if (row?.[key] !== undefined && row[key] !== null && row[key] !== '') {
      return num(row[key]);
    }
  }
  return null;
}

function lineId(line) {
  return text(line.itemId?._id ?? line.itemId ?? line.item?._id ?? line.item);
}

function barcodeOf(line) {
  return text(line.barcodeNo ?? line.barcode ?? line.barcodeGenerated ?? line['Barcode No']);
}

function quantityOf(line) {
  return Math.abs(lineQty(line) || num(line.quantity ?? line.Quantity));
}

function amountOf(line, quantity) {
  const amount = firstNumber(line, [
    'netAmount', 'lineTotal', 'Net Amount', 'beforeTax', 'Before Tax', 'amount', 'Amount',
  ]);
  if (amount !== null) return Math.abs(amount);
  const rate = firstNumber(line, ['rate', 'rsp', 'sellingPrice', 'price', 'Rate']) || 0;
  return Math.abs(quantity * rate);
}

function discountOf(line, quantity) {
  const amount = firstNumber(line, ['discountAmount', 'discAmount', 'Disc Amt', 'discount', 'Disc']);
  if (amount !== null) return Math.abs(amount);
  const percent = firstNumber(line, ['discountPct', 'discountPercent', 'Disc %']) || 0;
  const rate = firstNumber(line, ['rate', 'rsp', 'sellingPrice', 'price', 'Rate']) || 0;
  return Math.abs(quantity * rate * percent / 100);
}

function supplierName(supplier) {
  return text(supplier?.businessName)
    || [supplier?.firstName, supplier?.middleName, supplier?.lastName].map(text).filter(Boolean).join(' ');
}

function dimensionsOf(entry, analysisType) {
  if (analysisType === 'item') {
    return {
      key: entry.itemId || entry.itemCode || `unknown:${entry.itemName}`,
      name: entry.itemName || entry.itemCode || 'Unassigned item',
      code: entry.itemCode,
    };
  }
  if (analysisType === 'group') {
    return {
      key: entry.groupId || `unknown:${entry.groupName}`,
      name: entry.groupName || 'Unassigned group',
    };
  }
  if (analysisType === 'subGroup') {
    return {
      key: entry.subGroupId || `unknown:${entry.subGroupName}`,
      name: entry.subGroupName || 'Unassigned subgroup',
    };
  }
  return {
    key: entry.supplierId || `unknown:${entry.supplierName}`,
    name: entry.supplierName || 'Unassigned supplier',
  };
}

function makeEntry(document, line, type, index) {
  const quantity = quantityOf(line);
  const rate = firstNumber(line, ['rate', 'rsp', 'sellingPrice', 'price', 'Rate']) || 0;
  return {
    document,
    line,
    type,
    index,
    itemId: lineId(line),
    itemCode: lineItemCode(line) || text(line.code ?? line['Item Code']),
    itemName: lineItemName(line) || text(line.name ?? line['Item Name']),
    barcodeNo: barcodeOf(line),
    quantity,
    amount: amountOf(line, quantity),
    discount: discountOf(line, quantity),
    tax: Math.abs(lineTax(line) || num(line.taxAmount ?? line['Tax Amount'] ?? line.gstAmount)),
    rate,
  };
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const scope = await requireReportScope(session, sp);
  if (!scope.ok) return scope.response;
  if (!scope.businessId) return json({ error: 'Select a business to run this report.' }, 422);
  const denied = await screenDenial({ session, screen: SCREENS.PERFORMANCE_LOG_REPORT, action: PERM.READ, businessId: scope.businessId, label: 'the performance log report' });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const fromDate = text(sp.get('fromDate'));
  const toDate = text(sp.get('toDate'));
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (Number.isNaN(new Date(fromDate).getTime()) || Number.isNaN(new Date(toDate).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }
  if (fromDate > toDate) return json({ error: 'Date From must be on or before Date To.' }, 422);

  const analysisType = text(sp.get('analysisType')) || 'supplier';
  const performanceType = text(sp.get('performanceType')) || 'salesValue';
  const mode = text(sp.get('mode')) || 'summary';
  if (!['supplier', 'item', 'group', 'subGroup'].includes(analysisType)) {
    return json({ error: 'Select a valid analysis type.' }, 422);
  }
  if (!['salesValue', 'salesRet', 'profitPct', 'retProfitPct'].includes(performanceType)) {
    return json({ error: 'Select a valid performance type.' }, 422);
  }
  if (!['summary', 'detailed'].includes(mode)) return json({ error: 'Select a valid report mode.' }, 422);

  const picks = Object.fromEntries(ID_FIELDS.map((field) => [field, text(sp.get(field))]));
  for (const [field, value] of Object.entries(picks)) {
    if (value && !isValidObjectId(value)) return json({ error: `${field} selection is invalid.` }, 422);
  }

  await dbConnect();
  const { sales, returns } = await salesDocuments(sp, scope);
  const salesEntries = sales.flatMap((document) => (
    (Array.isArray(document.items) ? document.items : [])
      .map((line, index) => makeEntry(document, line, 'sale', index))
  ));
  const returnEntries = returns.flatMap((document) => (
    (Array.isArray(document.items) ? document.items : [])
      .map((line, index) => makeEntry(document, line, 'return', index))
  ));
  const allEntries = [...salesEntries, ...returnEntries];
  const itemIds = [...new Set(allEntries.map((entry) => entry.itemId).filter(isValidObjectId))];
  const barcodes = [...new Set(allEntries.map((entry) => entry.barcodeNo).filter(Boolean))];
  const codes = [...new Set(allEntries.flatMap((entry) => [entry.itemCode, entry.itemName]).filter(Boolean))];

  const labelOr = [];
  if (itemIds.length) labelOr.push({ _id: { $in: itemIds } }, { itemId: { $in: itemIds } });
  if (barcodes.length) {
    labelOr.push(
      { barcodeNo: { $in: barcodes } },
      { barcodeGenerated: { $in: barcodes } },
      { oldBarcode: { $in: barcodes } }
    );
  }
  if (codes.length) labelOr.push({ itemCode: { $in: codes } }, { itemName: { $in: codes } });

  const labels = await BarcodeLabel.find({
    businessId: String(scope.businessId),
    $or: labelOr.length ? labelOr : [{ _id: null }],
  }).select('_id itemId itemCode itemName barcodeNo barcodeGenerated oldBarcode supplierId finalNet purRate').lean();

  const labelById = new Map();
  const labelByCode = new Map();
  const labelByBarcode = new Map();
  labels.forEach((label) => {
    [label._id, label.itemId].filter(Boolean).forEach((id) => {
      if (!labelById.has(String(id))) labelById.set(String(id), label);
    });
    [label.itemCode, label.itemName].map(keyOf).filter(Boolean).forEach((code) => {
      if (!labelByCode.has(code)) labelByCode.set(code, label);
    });
    [label.barcodeNo, label.barcodeGenerated, label.oldBarcode].filter(Boolean).forEach((barcode) => {
      if (!labelByBarcode.has(String(barcode))) labelByBarcode.set(String(barcode), label);
    });
  });

  const itemQuery = [];
  const canonicalItemIds = [...new Set([
    ...itemIds,
    ...labels.map((label) => text(label.itemId)),
  ].filter(isValidObjectId))];
  if (canonicalItemIds.length) itemQuery.push({ _id: { $in: canonicalItemIds } });
  if (codes.length) itemQuery.push({ itemCode: { $in: codes } }, { name: { $in: codes } });
  const itemDocs = itemQuery.length
    ? await Item.find({ businessId: String(scope.businessId), $or: itemQuery })
      .select('_id itemCode name subGroupId').lean()
    : [];
  const itemById = new Map(itemDocs.map((item) => [String(item._id), item]));
  const itemByCode = new Map();
  itemDocs.forEach((item) => {
    if (item.itemCode) itemByCode.set(keyOf(item.itemCode), item);
    if (item.name && !itemByCode.has(keyOf(item.name))) itemByCode.set(keyOf(item.name), item);
  });

  const subgroupIds = [...new Set(itemDocs.map((item) => text(item.subGroupId)).filter(isValidObjectId))];
  const subgroups = subgroupIds.length
    ? await ProductGroup.find({ _id: { $in: subgroupIds } }).select('_id name parentId').lean()
    : [];
  const groupIds = [...new Set(subgroups.map((group) => text(group.parentId)).filter(isValidObjectId))];
  const groups = groupIds.length
    ? await ProductGroup.find({ _id: { $in: groupIds } }).select('_id name').lean()
    : [];
  const subgroupById = new Map(subgroups.map((group) => [String(group._id), group]));
  const groupById = new Map(groups.map((group) => [String(group._id), group]));

  const supplierIds = [...new Set([
    ...allEntries.map((entry) => text(entry.line.supplierId ?? entry.line.SupplierId)),
    ...labels.map((label) => text(label.supplierId)),
  ].filter(isValidObjectId))];
  const suppliers = supplierIds.length
    ? await Supplier.find({
      _id: { $in: supplierIds },
      businessId: scope.businessId,
    }).select('_id businessName firstName middleName lastName billingCity shippingCity').lean()
    : [];
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplier]));

  let allowedCityNames = null;
  if (picks.cityGroupId) {
    const cityGroup = await CityGroup.findOne({
      _id: picks.cityGroupId,
      businessId: scope.businessId,
    }).select('cities').lean();
    allowedCityNames = new Set((cityGroup?.cities || []).map(keyOf));
  }

  const costByCode = new Map();
  labels.forEach((label) => {
    const code = keyOf(label.itemCode);
    const rate = num(label.finalNet) || num(label.purRate);
    if (!code || !rate) return;
    const current = costByCode.get(code) || { sum: 0, count: 0 };
    current.sum += rate;
    current.count += 1;
    costByCode.set(code, current);
  });

  const entries = allEntries.map((entry) => {
    const label = labelById.get(entry.itemId)
      || labelByBarcode.get(entry.barcodeNo)
      || labelByCode.get(keyOf(entry.itemCode))
      || labelByCode.get(keyOf(entry.itemName));
    const item = itemById.get(entry.itemId)
      || (label?.itemId ? itemById.get(String(label.itemId)) : null)
      || itemByCode.get(keyOf(entry.itemCode))
      || itemByCode.get(keyOf(entry.itemName));
    const subgroupId = text(item?.subGroupId);
    const subgroup = subgroupById.get(subgroupId);
    const group = subgroup ? groupById.get(text(subgroup.parentId)) : null;
    const supplierId = text(entry.line.supplierId ?? entry.line.SupplierId ?? label?.supplierId);
    const supplier = supplierById.get(supplierId);
    const city = text(supplier?.billingCity || supplier?.shippingCity);
    const labelRate = num(label?.finalNet) || num(label?.purRate);
    const averageCost = costByCode.get(keyOf(entry.itemCode));

    return {
      ...entry,
      itemId: text(item?._id || label?.itemId || entry.itemId),
      itemCode: text(item?.itemCode || label?.itemCode || entry.itemCode),
      itemName: text(entry.itemName || item?.name || label?.itemName || entry.itemCode),
      subgroupId,
      subgroupName: text(subgroup?.name),
      groupId: text(subgroup?.parentId || (item?.subGroupId && !subgroup ? item.subGroupId : '')),
      groupName: text(group?.name || (subgroup && !subgroup.parentId ? subgroup.name : '')),
      supplierId,
      supplierName: supplierName(supplier),
      city,
      cost: entry.quantity * (labelRate || (averageCost?.count ? averageCost.sum / averageCost.count : 0)),
    };
  }).filter((entry) => {
    if (picks.supplierId && entry.supplierId !== picks.supplierId) return false;
    if (picks.itemId && entry.itemId !== picks.itemId) return false;
    if (picks.subGroupId && entry.subgroupId !== picks.subGroupId) return false;
    if (picks.groupId && entry.groupId !== picks.groupId) return false;
    if (picks.itemCode && !keyOf(entry.itemCode).includes(keyOf(picks.itemCode))) return false;
    if (sp.get('city') && keyOf(entry.city) !== keyOf(sp.get('city'))) return false;
    if (allowedCityNames && !allowedCityNames.has(keyOf(entry.city))) return false;
    return true;
  });

  const performanceEntries = performanceType === 'salesRet' || performanceType === 'retProfitPct'
    ? entries.filter((entry) => entry.type === 'return')
    : entries.filter((entry) => entry.type === 'sale');
  const visibleEntries = mode === 'detailed'
    ? performanceEntries.map((entry) => {
      const dimension = dimensionsOf(entry, analysisType);
      const profit = entry.amount - entry.cost - entry.tax;
      const returnProfit = entry.amount - entry.cost - entry.tax;
      return {
        _id: `${entry.type}:${entry.document._id}:${entry.index}`,
        dimensionName: dimension.name,
        itemCode: entry.itemCode,
        itemName: entry.itemName,
        supplierName: entry.supplierName,
        city: entry.city,
        date: entry.document.date || entry.document.returnDate || entry.document.createdAt || null,
        documentNo: text(entry.document.invoiceNo || entry.document.salesInvoiceNo || entry.document.salesReturnNo || entry.document.returnNo),
        totalCost: r2(entry.cost),
        discount: r2(entry.discount),
        tax: r2(entry.tax),
        totalLanding: r2(entry.cost + entry.tax),
        salesAmount: entry.type === 'sale' ? r2(entry.amount) : 0,
        returnAmount: entry.type === 'return' ? r2(entry.amount) : 0,
        profitAmount: entry.type === 'sale' ? r2(profit) : 0,
        saleQty: entry.type === 'sale' ? r2(entry.quantity) : 0,
        returnQty: entry.type === 'return' ? r2(entry.quantity) : 0,
        netProfit: entry.type === 'sale' ? r2(profit) : 0,
        performanceValue: performanceType === 'salesRet'
          ? r2(entry.amount)
          : performanceType === 'profitPct'
            ? (entry.amount ? r2((profit / entry.amount) * 100) : 0)
            : performanceType === 'retProfitPct'
              ? (entry.amount ? r2((returnProfit / entry.amount) * 100) : 0)
              : r2(entry.amount),
      };
    })
    : (() => {
      const grouped = new Map();
      performanceEntries.forEach((entry) => {
        const dimension = dimensionsOf(entry, analysisType);
        const row = grouped.get(dimension.key) || {
          _id: dimension.key,
          dimensionName: dimension.name,
          itemCode: dimension.code || '',
          supplierName: entry.supplierName,
          city: entry.city,
          totalCost: 0,
          returnCost: 0,
          discount: 0,
          returnDiscount: 0,
          tax: 0,
          returnTax: 0,
          salesAmount: 0,
          returnAmount: 0,
          saleQty: 0,
          returnQty: 0,
        };
        if (entry.type === 'sale') {
          row.totalCost += entry.cost;
          row.discount += entry.discount;
          row.tax += entry.tax;
          row.salesAmount += entry.amount;
          row.saleQty += entry.quantity;
        } else {
          row.returnAmount += entry.amount;
          row.returnQty += entry.quantity;
          row.returnCost += entry.cost;
          row.returnDiscount += entry.discount;
          row.returnTax += entry.tax;
        }
        grouped.set(dimension.key, row);
      });

      return [...grouped.values()].map((row) => {
        const isReturnType = performanceType === 'salesRet' || performanceType === 'retProfitPct';
        const totalCost = r2(isReturnType ? row.returnCost : row.totalCost);
        const tax = r2(isReturnType ? row.returnTax : row.tax);
        const totalLanding = r2(totalCost + tax);
        const salesAmount = r2(isReturnType ? 0 : row.salesAmount);
        const returnAmount = r2(row.returnAmount);
        const profitAmount = isReturnType
          ? r2(returnAmount - totalLanding)
          : r2(salesAmount - totalLanding);
        const returnProfit = r2(returnAmount - row.returnCost - row.returnTax);
        const performanceValue = performanceType === 'salesRet'
          ? returnAmount
          : performanceType === 'profitPct'
            ? (salesAmount ? r2((profitAmount / salesAmount) * 100) : 0)
            : performanceType === 'retProfitPct'
              ? (returnAmount ? r2((returnProfit / returnAmount) * 100) : 0)
              : salesAmount;
        return {
          ...row,
          totalCost,
          discount: r2(isReturnType ? row.returnDiscount : row.discount),
          tax,
          totalLanding,
          salesAmount,
          returnAmount,
          profitAmount,
          saleQty: r2(isReturnType ? row.returnQty : row.saleQty),
          returnQty: r2(row.returnQty),
          netProfit: profitAmount,
          performanceValue,
        };
      }).filter((row) => (
        performanceType === 'salesRet' || performanceType === 'retProfitPct'
          ? row.returnAmount > 0
          : row.salesAmount > 0
      ));
    })();

  visibleEntries.sort((a, b) => b.performanceValue - a.performanceValue
    || a.dimensionName.localeCompare(b.dimensionName));

  return json({
    rows: visibleEntries,
    total: visibleEntries.length,
    mode,
    analysisType,
    performanceType,
    sourceSales: sales.length,
    sourceReturns: returns.length,
  });
}
