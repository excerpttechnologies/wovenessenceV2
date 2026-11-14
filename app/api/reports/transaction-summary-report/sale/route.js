import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { Customer, Supplier } from '@/lib/contacts';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import {
  json, num, r2, scopeOf, salesDocuments, lineQty, lineItemCode, lineItemName,
} from '@/lib/reports';

const lineRate = (item) => num(
  item.rsp ?? item.rate ?? item.sellingPrice ?? item.price ?? item['Rate']
);
const lineValue = (item, qty, rate) => r2(
  num(item.netAmount ?? item['Net Amount']) || num(item.amount ?? item.Amount) || qty * rate
);
const contactName = (contact) => String(contact?.businessName || '').trim()
  || [contact?.firstName, contact?.middleName, contact?.lastName]
    .map((part) => String(part || '').trim()).filter(Boolean).join(' ');

function itemBarcode(item) {
  return String(item.barcodeNo ?? item.barcode ?? item.barcodeGenerated ?? '').trim();
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to view sale lines.' }, 422);
  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }
  if (Number.isNaN(new Date(sp.get('fromDate')).getTime()) || Number.isNaN(new Date(sp.get('toDate')).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }

  await dbConnect();
  const { sales } = await salesDocuments(sp, scope);
  const customerIds = [...new Set(sales.map((document) => String(document.customerId || '')))]
    .filter(isValidObjectId);
  const customers = customerIds.length
    ? await Customer.find({ _id: { $in: customerIds } })
      .select('_id businessName firstName middleName lastName').lean()
    : [];
  const customerById = new Map(customers.map((customer) => [String(customer._id), contactName(customer)]));

  const flattened = sales.flatMap((document) => {
    const items = Array.isArray(document.items) ? document.items : [];
    return items.map((item, index) => {
      const qty = lineQty(item);
      const rate = lineRate(item);
      const snapshot = document.customerSnapshot || {};
      return {
        _id: `${String(document._id)}-${index}`,
        number: document.salesInvoiceNo || document.invoiceNo || document.invoiceNumber || '',
        date: document.date || document.createdAt || null,
        customer: customerById.get(String(document.customerId || ''))
          || contactName(snapshot) || document.customerName || 'Walk-in Customer',
        supplier: '',
        supplierId: String(item.supplierId || ''),
        itemName: lineItemName(item),
        itemCode: lineItemCode(item) || String(item.code || '').trim(),
        barcodeNo: itemBarcode(item),
        qty: r2(qty),
        rate: r2(rate),
        value: lineValue(item, qty, rate),
        imageUrl: String(item.imageUrl ?? item.productImage ?? ''),
      };
    });
  });

  const itemCodes = [...new Set(flattened.map((line) => line.itemCode).filter(Boolean))];
  const barcodes = [...new Set(flattened.map((line) => line.barcodeNo).filter(Boolean))];
  const labelRows = itemCodes.length || barcodes.length
    ? await BarcodeLabel.find({
      businessId: String(scope.businessId),
      $or: [
        ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
        ...(barcodes.length ? [{ barcodeNo: { $in: barcodes } }] : []),
      ],
    }).select('itemCode barcodeNo supplierId imageUrl').lean()
    : [];

  const labelsByBarcode = new Map();
  const labelsByCode = new Map();
  labelRows.forEach((label) => {
    if (label.barcodeNo) labelsByBarcode.set(String(label.barcodeNo), label);
    if (label.itemCode && !labelsByCode.has(String(label.itemCode))) labelsByCode.set(String(label.itemCode), label);
  });

  const supplierIds = [...new Set([
    ...flattened.map((line) => line.supplierId),
    ...labelRows.map((label) => String(label.supplierId || '')),
  ])].filter(isValidObjectId);
  const suppliers = supplierIds.length
    ? await Supplier.find({ _id: { $in: supplierIds } })
      .select('_id businessName firstName middleName lastName').lean()
    : [];
  const supplierById = new Map(suppliers.map((supplier) => [String(supplier._id), contactName(supplier)]));

  const rows = flattened.map((line) => {
    const label = (line.barcodeNo && labelsByBarcode.get(line.barcodeNo))
      || labelsByCode.get(line.itemCode);
    return {
      ...line,
      supplier: supplierById.get(line.supplierId || String(label?.supplierId || '')) || '',
      imageUrl: line.imageUrl || label?.imageUrl || '',
    };
  });
  const totals = rows.reduce((sum, line) => ({
    qty: sum.qty + line.qty,
    value: sum.value + line.value,
  }), { qty: 0, value: 0 });

  return json({
    rows,
    totals: {
      documents: sales.length,
      lines: rows.length,
      qty: r2(totals.qty),
      value: r2(totals.value),
    },
  });
}
