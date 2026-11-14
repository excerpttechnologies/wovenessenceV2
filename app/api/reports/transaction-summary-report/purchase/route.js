import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import Grc from '@/models/Grc';
import { Supplier } from '@/lib/contacts';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { json, num, r2, scopeOf, scopeFilter, dateRange } from '@/lib/reports';

function itemValue(item, qty, rate) {
  return r2(num(item.netAmount) || num(item.amount) || num(item.Amount) || qty * rate);
}

function supplierName(supplier) {
  if (!supplier) return '';
  return String(supplier.businessName || '').trim()
    || [supplier.firstName, supplier.middleName, supplier.lastName]
      .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to view purchase lines.' }, 422);

  const fromDate = sp.get('fromDate');
  const toDate = sp.get('toDate');
  if (!fromDate || !toDate) return json({ error: 'Date From and Date To are required.' }, 422);
  if (Number.isNaN(new Date(fromDate).getTime()) || Number.isNaN(new Date(toDate).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }

  await dbConnect();
  const documents = await Grc.find({
    ...scopeFilter(scope),
    ...dateRange(sp, 'grcDate'),
  }).select('grcNumber grcDate supplierId items').sort({ grcDate: -1, grcNumber: 1 }).limit(5000).lean();

  const supplierIds = [...new Set(documents.map((document) => String(document.supplierId || '')))]
    .filter(isValidObjectId);
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds } })
      .select('_id businessName firstName middleName lastName').lean()
    : [];
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), supplierName(supplier)]));

  const lines = documents.flatMap((document) => (Array.isArray(document.items) ? document.items : [])
    .map((item, index) => {
      const qty = num(item.qty ?? item.Qty ?? item.Quantity ?? item['QTY/MTR']);
      const rate = num(item.purchaseRate ?? item.finalPrice ?? item['Purchase Rate'] ?? item['Final Price']);
      return {
        _id: `${String(document._id)}-${index}`,
        number: document.grcNumber || '',
        date: document.grcDate || document.createdAt || null,
        party: supplierById.get(String(document.supplierId || '')) || '',
        itemName: String(item.itemName ?? item['Item Name'] ?? ''),
        itemCode: String(item.itemCode ?? item.batchNo ?? item.BatchNO ?? item['Item Code'] ?? ''),
        qty: r2(qty),
        rate: r2(rate),
        value: itemValue(item, qty, rate),
        imageUrl: String(item.imageUrl ?? item.productImage ?? ''),
      };
    }));

  const codes = [...new Set(lines.map((line) => line.itemCode).filter(Boolean))];
  if (codes.length) {
    const imageFilter = { businessId: String(scope.businessId), itemCode: { $in: codes }, imageUrl: { $ne: '' } };
    const images = await BarcodeLabel.find(imageFilter).select('itemCode imageUrl').lean();
    const imageByCode = new Map();
    images.forEach((image) => {
      if (image.imageUrl && !imageByCode.has(image.itemCode)) imageByCode.set(image.itemCode, image.imageUrl);
    });
    lines.forEach((line) => {
      if (!line.imageUrl) line.imageUrl = imageByCode.get(line.itemCode) || '';
    });
  }

  const documentCount = documents.length;
  const totals = lines.reduce((sum, line) => ({
    qty: sum.qty + line.qty,
    value: sum.value + line.value,
  }), { qty: 0, value: 0 });

  return json({
    rows: lines,
    totals: {
      documents: documentCount,
      lines: lines.length,
      qty: r2(totals.qty),
      value: r2(totals.value),
    },
  });
}
