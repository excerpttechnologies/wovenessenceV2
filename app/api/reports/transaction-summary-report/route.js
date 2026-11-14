import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import CompanyLocation from '@/models/CompanyLocation';
import Grc from '@/models/Grc';
import Grt from '@/models/Grt';
import StockMovement from '@/models/StockMovement';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, salesDocuments,
  linesOf, lineQty, lineNet, docQty, docValue,
} from '@/lib/reports';

const TRANSFER_IN = new Set(['TRANSFER_IN', 'TRANSFER_RETURN_IN']);
const TRANSFER_OUT = new Set(['TRANSFER_OUT', 'TRANSFER_RETURN_OUT', 'ECOM_OUT']);
const DETAIL_CATEGORIES = new Set([
  'purchase', 'purchaseReturn', 'sale', 'saleReturn', 'stockIn', 'stockOut',
]);

function quantity(document) {
  return r2(num(document.totalQuantity) || num(document.totalQty) || num(document.invoiceQty)
    || num(document.qty) || docQty(document));
}

function value(document) {
  return r2(num(document.netAmount) || num(document.netValue) || num(document.totalAmount)
    || num(document.taxableValue) || docValue(document));
}

function returnValue(document) {
  return r2(num(document.refundAmount) || num(document.netValue) || num(document.netAmount)
    || num(document.totalAmount) || num(document.taxableValue)
    || linesOf(document).reduce((sum, line) => sum + lineNet(line), 0));
}

function add(acc, locationId, category, qty, amount, docs = 1) {
  const key = String(locationId || 'unassigned');
  if (!acc.has(key)) {
    acc.set(key, {
      locationId: key === 'unassigned' ? '' : key,
      purchase: { qty: 0, value: 0, docs: 0 },
      purchaseReturn: { qty: 0, value: 0, docs: 0 },
      sale: { qty: 0, value: 0, docs: 0 },
      saleReturn: { qty: 0, value: 0, docs: 0 },
      stockIn: { qty: 0, value: 0, docs: 0 },
      stockOut: { qty: 0, value: 0, docs: 0 },
    });
  }
  const row = acc.get(key);
  row[category].qty += qty;
  row[category].value += amount;
  row[category].docs += docs;
  return row;
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to run this report.' }, 422);

  const fromDate = sp.get('fromDate');
  const toDate = sp.get('toDate');
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (Number.isNaN(new Date(fromDate).getTime()) || Number.isNaN(new Date(toDate).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }

  const filter = scopeFilter(scope);
  const [locations, purchases, purchaseReturns, salesData, movements] = await Promise.all([
    CompanyLocation.find({
      businessId: scope.businessId,
      ...(scope.locationId ? { _id: scope.locationId } : {}),
    }).select('name businessPrintName').sort({ name: 1 }).lean(),
    Grc.find({ ...filter, ...dateRange(sp, 'grcDate') }).limit(5000).lean(),
    Grt.find({ ...filter, ...dateRange(sp, 'grtDate') }).limit(5000).lean(),
    salesDocuments(sp, scope),
    StockMovement.find({
      businessId: scope.businessId,
      ...(scope.finYear ? { finYear: scope.finYear } : {}),
      at: dateRange(sp, 'at').at,
      ...(scope.locationId ? {
        $or: [
          { fromLocationId: scope.locationId },
          { toLocationId: scope.locationId },
        ],
      } : {}),
      type: { $in: [...TRANSFER_IN, ...TRANSFER_OUT] },
    }).limit(20000).lean(),
  ]);

  const grouped = new Map();
  locations.forEach((location) => add(grouped, location._id, 'purchase', 0, 0, 0));

  purchases.forEach((document) => {
    add(grouped, document.locationId, 'purchase', quantity(document), value(document));
  });
  purchaseReturns.forEach((document) => {
    add(grouped, document.locationId, 'purchaseReturn', quantity(document), value(document));
  });
  salesData.sales.forEach((document) => {
    add(grouped, document.locationId, 'sale', docQty(document), docValue(document));
  });
  salesData.returns.forEach((document) => {
    add(grouped, document.locationId, 'saleReturn', docQty(document), returnValue(document));
  });

  const barcodeIds = [...new Set(movements.map((movement) => String(movement.barcodeId || '')))]
    .filter(isValidObjectId);
  const barcodeRows = barcodeIds.length
    ? await BarcodeLabel.find({ _id: { $in: barcodeIds } }).select('_id purRate finalNet').lean()
    : [];
  const costByBarcode = new Map(barcodeRows.map((barcode) => [
    String(barcode._id), num(barcode.finalNet) || num(barcode.purRate),
  ]));
  const movementDocs = new Map();

  movements.forEach((movement) => {
    const incoming = TRANSFER_IN.has(movement.type);
    const locationId = incoming ? movement.toLocationId : movement.fromLocationId;
    const category = incoming ? 'stockIn' : 'stockOut';
    const qty = Math.abs(num(movement.qty));
    const amount = qty * (costByBarcode.get(String(movement.barcodeId || '')) || 0);
    const row = add(grouped, locationId, category, qty, amount, 0);
    const documentKey = `${row.locationId}|${category}|${movement.refModel}|${movement.refId || movement.refNo}`;
    movementDocs.set(documentKey, (movementDocs.get(documentKey) || 0) + 1);
  });

  movementDocs.forEach((_, key) => {
    const [locationId, category] = key.split('|');
    const row = grouped.get(locationId || 'unassigned');
    if (row) row[category].docs += 1;
  });

  const locationIds = [...new Set([...grouped.values()].map((row) => row.locationId).filter(isValidObjectId))];
  const resolvedLocations = locationIds.length
    ? await CompanyLocation.find({ _id: { $in: locationIds } }).select('name businessPrintName').lean()
    : [];
  const nameById = new Map(resolvedLocations.map((location) => [
    String(location._id), location.name || location.businessPrintName || '',
  ]));

  const round = (entry) => ({
    qty: r2(entry.qty),
    value: r2(entry.value),
    docs: entry.docs,
  });
  const rows = [...grouped.values()].map((row) => ({
    _id: row.locationId || 'unassigned',
    locationId: row.locationId,
    locationName: nameById.get(row.locationId) || (row.locationId ? '' : 'Unassigned Location'),
    purchase: round(row.purchase),
    purchaseReturn: round(row.purchaseReturn),
    sale: round(row.sale),
    saleReturn: round(row.saleReturn),
    stockIn: round(row.stockIn),
    stockOut: round(row.stockOut),
  })).sort((a, b) => a.locationName.localeCompare(b.locationName));

  const detailCategory = sp.get('detailCategory') || '';
  if (!detailCategory) return json({ rows });
  if (!DETAIL_CATEGORIES.has(detailCategory)) {
    return json({ error: 'Select a valid transaction category.' }, 422);
  }
  const detailLocation = sp.get('detailLocation') || '';
  if (detailLocation && !isValidObjectId(detailLocation)) {
    return json({ error: 'Select a valid location.' }, 422);
  }

  const detailRows = [];
  const pushDocument = (document, number, date, qty, amount) => {
    if (detailLocation && String(document.locationId || '') !== detailLocation) return;
    detailRows.push({
      _id: String(document._id),
      number: number || '-',
      date: date || document.createdAt || null,
      qty: r2(qty),
      value: r2(amount),
    });
  };

  if (detailCategory === 'purchase') {
    purchases.forEach((document) => pushDocument(
      document, document.grcNumber, document.grcDate, quantity(document), value(document)
    ));
  } else if (detailCategory === 'purchaseReturn') {
    purchaseReturns.forEach((document) => pushDocument(
      document, document.grtNo, document.grtDate, quantity(document), value(document)
    ));
  } else if (detailCategory === 'sale') {
    salesData.sales.forEach((document) => pushDocument(
      document,
      document.invoiceNo || document.salesInvoiceNo,
      document.date || document.createdAt,
      docQty(document),
      docValue(document)
    ));
  } else if (detailCategory === 'saleReturn') {
    salesData.returns.forEach((document) => pushDocument(
      document,
      document.invoiceNo || document.salesReturnNo,
      document.date || document.returnDate,
      docQty(document),
      returnValue(document)
    ));
  } else {
    const incoming = detailCategory === 'stockIn';
    const byDocument = new Map();
    movements.forEach((movement) => {
      const locationId = incoming ? movement.toLocationId : movement.fromLocationId;
      if (detailLocation && String(locationId || '') !== detailLocation) return;
      const key = `${String(locationId || '')}|${movement.refModel}|${String(movement.refId || movement.refNo || movement._id)}`;
      const entry = byDocument.get(key) || {
        _id: key,
        number: movement.refNo || '-',
        date: movement.at || movement.createdAt || null,
        qty: 0,
        value: 0,
      };
      entry.qty += Math.abs(num(movement.qty));
      entry.value += Math.abs(num(movement.qty)) * (costByBarcode.get(String(movement.barcodeId || '')) || 0);
      byDocument.set(key, entry);
    });
    detailRows.push(...[...byDocument.values()].map((entry) => ({
      ...entry, qty: r2(entry.qty), value: r2(entry.value),
    })));
  }

  detailRows.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));
  return json({ rows, detailRows });
}
