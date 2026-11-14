import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import PosInvoice from '@/models/PosInvoice';
import PosReturn from '@/models/PosReturn';
import SalesInvoice from '@/models/SalesInvoice';
import SalesReturn from '@/models/SalesReturn';
import IcItemInvoice from '@/models/IcItemInvoice';
import IcSalesInvoice from '@/models/IcSalesInvoice';
import IcSalesReturn from '@/models/IcSalesReturn';
import Grc from '@/models/Grc';
import Grt from '@/models/Grt';
import CompanyLocation from '@/models/CompanyLocation';
import Hsn from '@/models/Hsn';
import { Customer, Supplier } from '@/lib/contacts';
import {
  json, num, r2, scopeOf, scopeFilter, dateRange, pageOf,
} from '@/lib/reports';

const ALL_TYPES = [
  'POS B2B', 'POS B2C', 'POSR B2B', 'POSR B2C', 'SI B2B', 'SR B2B',
  'ICSI B2B', 'ICSI B2C', 'ICSR B2B', 'ICSR B2C', 'Purchase', 'Purchase Return',
];
const GST_SUMMARY_TYPES = [
  'ICSI B2B', 'ICSI B2C', 'ICSR B2B', 'ICSR B2C',
  'POS B2B', 'POS B2C', 'SI B2B', 'SR B2B',
];
const TAB_GROUPS = {
  POS: ['POS B2B', 'POS B2C'],
  POSR: ['POSR B2B', 'POSR B2C'],
  'SI B2B': ['SI B2B'],
  'SR B2B': ['SR B2B'],
  ICSI: ['ICSI B2B', 'ICSI B2C'],
  ICSR: ['ICSR B2B', 'ICSR B2C'],
};

function valueOf(source, keys) {
  for (const key of keys) {
    if (source?.[key] !== undefined && source[key] !== null && source[key] !== '') return source[key];
  }
  return undefined;
}

function numberOf(source, keys) {
  const value = valueOf(source, keys);
  return value === undefined ? null : num(value);
}

function nameOf(contact) {
  if (!contact) return '';
  return String(contact.businessName || '').trim()
    || [contact.firstName, contact.middleName, contact.lastName]
      .map((part) => String(part || '').trim()).filter(Boolean).join(' ');
}

function dateQuery(scope, params, field) {
  return { ...scopeFilter(scope), ...dateRange(params, field) };
}

function lineRows(document, kind, contactById, locationById, hsnById, hsnByCode) {
  const lines = Array.isArray(document.items) ? document.items : [];
  const isPurchase = kind === 'Purchase' || kind === 'Purchase Return';
  const isPos = kind === 'POS' || kind === 'POSR';
  const isReturn = kind === 'POSR' || kind === 'SR' || kind === 'ICSR' || kind === 'Purchase Return';
  const locationName = locationById.get(String(document.locationId || '')) || '';
  const contactId = String(isPurchase ? document.supplierId || '' : document.customerId || '');
  const contact = contactById.get(contactId);
  const customerName = isPurchase
    ? nameOf(contact) || document.supplierName || ''
    : nameOf(contact) || document.customerName || document.customerSnapshot?.businessName
      || [document.customerSnapshot?.firstName, document.customerSnapshot?.lastName].filter(Boolean).join(' ')
      || document.toBusinessName || document.fromBusinessName || document.customer || '';
  const gstn = String(
    document.customerGstn || document.gstn || document.gstNo
    || document.vendorGstNo || document.customerSnapshot?.gstNo || contact?.gstNo || ''
  ).trim();
  const invoiceDate = document.date || document.returnDate || document.invoiceDate
    || document.grcDate || document.grtDate || document.createdAt || null;
  const invoiceNo = document.invoiceNo || document.salesInvoiceNo || document.salesReturnNo
    || document.invoiceNumber || document.grcNumber || document.grtNo || document.returnCode || '';
  const reportType = kind === 'Purchase' || kind === 'Purchase Return'
    ? kind
    : `${kind} ${gstn ? 'B2B' : 'B2C'}`;
  const docRoundOff = num(document.roundOff);

  return lines.map((line, index) => {
    const rawHsn = valueOf(line, ['hsn', 'HSN', 'hsnCode', 'HSNCODE', 'hsnNo', 'HSN No']);
    const hsnReference = valueOf(line, ['hsnId', 'HSNID', 'hsnMasterId']) || rawHsn;
    const hsnRecord = hsnById.get(String(hsnReference || ''))
      || hsnByCode.get(String(rawHsn || '').trim().toLowerCase());
    const qty = numberOf(line, ['qty', 'QTY', 'Qty', 'Quantity', 'QTY/MTR']) ?? 0;
    const rate = numberOf(line, [
      'rate', 'Rate', 'unitRate', 'unitPrice', 'sellingRate', 'sellingPrice',
      'rsp', 'RSP', 'purchaseRate', 'finalRate', 'finalNet', 'purRate', 'price',
    ]) ?? 0;
    const basicAmount = numberOf(line, [
      'basicAmount', 'BASICAMOUNT', 'basicAmt', 'grossAmount', 'lineAmount',
    ]) ?? r2(qty * rate);
    const taxRate = numberOf(line, [
      'taxRate', 'TAX RATE', 'gst', 'GST', 'gstRate', 'taxPercent', 'taxPercentage',
    ]) ?? 0;

    const igstPercent = numberOf(line, ['igstPct', 'IGSTPER', 'igstPer', 'igstRate']) ?? 0;
    const cgstPercent = numberOf(line, ['cgstPct', 'CGSTPER', 'cgstPer', 'cgstRate']) ?? 0;
    const sgstPercent = numberOf(line, ['sgstPct', 'SGSTPER', 'sgstPer', 'sgstRate']) ?? 0;
    const explicitIgst = numberOf(line, ['igstAmount', 'IGSTAMT', 'igstAmt']);
    const explicitCgst = numberOf(line, ['cgstAmount', 'CGSTAMT', 'cgstAmt']);
    const explicitSgst = numberOf(line, ['sgstAmount', 'SGSTAMT', 'sgstAmt']);
    const explicitTaxable = numberOf(line, [
      'taxableAmount', 'TAXABLE AMOUNT', 'taxableValue', 'taxable', 'beforeTax', 'BASICAMOUNT',
    ]);
    const lineAmount = numberOf(line, ['netAmount', 'NET', 'amount', 'Amount', 'lineTotal', 'total']);

    let taxableAmount;
    let igstAmount = explicitIgst ?? 0;
    let cgstAmount = explicitCgst ?? 0;
    let sgstAmount = explicitSgst ?? 0;

    if (explicitTaxable !== null) {
      taxableAmount = explicitTaxable;
    } else if (explicitIgst !== null || explicitCgst !== null || explicitSgst !== null) {
      taxableAmount = Math.max(0, (lineAmount ?? basicAmount) - igstAmount - cgstAmount - sgstAmount);
    } else if (isPos && taxRate > 0) {
      const inclusiveTotal = lineAmount ?? basicAmount;
      taxableAmount = r2(inclusiveTotal / (1 + taxRate / 100));
      const tax = r2(inclusiveTotal - taxableAmount);
      cgstAmount = r2(tax / 2);
      sgstAmount = r2(tax - cgstAmount);
    } else {
      taxableAmount = basicAmount;
      const rateTotal = igstPercent + cgstPercent + sgstPercent || taxRate;
      const calculatedTax = r2(taxableAmount * rateTotal / 100);
      if (igstPercent || (rateTotal > 0 && kind.startsWith('IC'))) {
        igstAmount = igstPercent ? r2(taxableAmount * igstPercent / 100) : calculatedTax;
      } else if (cgstPercent || sgstPercent) {
        cgstAmount = r2(taxableAmount * cgstPercent / 100);
        sgstAmount = r2(taxableAmount * sgstPercent / 100);
      } else if (rateTotal > 0) {
        cgstAmount = r2(calculatedTax / 2);
        sgstAmount = r2(calculatedTax - cgstAmount);
      }
    }

    const taxTotal = r2(igstAmount + cgstAmount + sgstAmount);
    const subTotal = lineAmount !== null && (isPos || explicitTaxable !== null
      || explicitIgst !== null || explicitCgst !== null || explicitSgst !== null)
      ? lineAmount
      : r2(taxableAmount + taxTotal);
    const roundOff = index === 0 ? docRoundOff : 0;

    return {
      _id: `${String(document._id)}:${index}`,
      _documentId: String(document._id),
      type: reportType,
      invoiceDate,
      customerName,
      gstn,
      invoiceNo,
      return: isReturn ? 'Yes' : 'No',
      branch: locationName,
      hsn: String(hsnRecord?.code || rawHsn || ''),
      itemName: String(valueOf(line, ['itemName', 'Item Name', 'description', 'name', 'printDescription']) || ''),
      itemCode: String(valueOf(line, ['itemCode', 'Item Code', 'code', 'barcodeNo']) || ''),
      itemNameNew: String(valueOf(line, ['itemNameNew', 'ITEMNAMENEW', 'printDescription', 'itemName', 'Item Name']) || ''),
      qty: r2(qty),
      taxRate: r2(taxRate || igstPercent + cgstPercent + sgstPercent),
      rate: r2(rate),
      basicAmount: r2(basicAmount),
      taxableAmount: r2(taxableAmount),
      igstPercent: r2(igstPercent),
      igstAmount: r2(igstAmount),
      cgstPercent: r2(cgstPercent),
      cgstAmount: r2(cgstAmount),
      sgstPercent: r2(sgstPercent),
      sgstAmount: r2(sgstAmount),
      subTotal: r2(subTotal),
      uom: String(valueOf(line, ['uom', 'UOM', 'unit', 'unitName']) || ''),
      net: r2(subTotal + roundOff),
      roundOff: r2(roundOff),
      _typeGroup: kind,
    };
  });
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  const scope = scopeOf(sp);
  if (!scope.businessId) return json({ error: 'Select a business to run the GST report.' }, 422);
  if (!sp.get('fromDate') || !sp.get('toDate')) {
    return json({ error: 'Date From and Date To are required.' }, 422);
  }
  if (Number.isNaN(new Date(sp.get('fromDate')).getTime()) || Number.isNaN(new Date(sp.get('toDate')).getTime())) {
    return json({ error: 'Enter valid report dates.' }, 422);
  }

  await dbConnect();
  const requested = (sp.get('types') || ALL_TYPES.join(',')).split(',').map((type) => type.trim());
  const selectedTypes = new Set(requested.filter((type) => ALL_TYPES.includes(type)));
  if (!selectedTypes.size) return json({ error: 'Select at least one report type.' }, 422);

  const tab = sp.get('tab') || 'All';
  const tabTypes = tab === 'All' ? null : new Set(TAB_GROUPS[tab] || []);
  const wants = (prefix) => [...selectedTypes].some((type) =>
    type === prefix || type.startsWith(`${prefix} `)
  );

  const [
    posDocs, posReturns, salesDocs, salesReturns, icItemDocs, icSalesDocs,
    icReturns, purchaseDocs, purchaseReturns,
  ] = await Promise.all([
    wants('POS') ? PosInvoice.find(dateQuery(scope, sp, 'date')).limit(10000).lean() : [],
    wants('POSR') ? PosReturn.find(dateQuery(scope, sp, 'date')).limit(10000).lean() : [],
    wants('SI') ? SalesInvoice.find(dateQuery(scope, sp, 'createdAt')).limit(10000).lean() : [],
    wants('SR') ? SalesReturn.find(dateQuery(scope, sp, 'returnDate')).limit(10000).lean() : [],
    wants('ICSI') ? IcItemInvoice.find(dateQuery(scope, sp, 'invoiceDate')).limit(10000).lean() : [],
    wants('ICSI') ? IcSalesInvoice.find(dateQuery(scope, sp, 'invoiceDate')).limit(10000).lean() : [],
    wants('ICSR') ? IcSalesReturn.find(dateQuery(scope, sp, 'date')).limit(10000).lean() : [],
    selectedTypes.has('Purchase') ? Grc.find(dateQuery(scope, sp, 'grcDate')).limit(10000).lean() : [],
    selectedTypes.has('Purchase Return') ? Grt.find(dateQuery(scope, sp, 'grtDate')).limit(10000).lean() : [],
  ]);

  const allDocuments = [
    ...posDocs.map((document) => ({ document, kind: 'POS' })),
    ...posReturns.map((document) => ({ document, kind: 'POSR' })),
    ...salesDocs.map((document) => ({ document, kind: 'SI' })),
    ...salesReturns.map((document) => ({ document, kind: 'SR' })),
    ...icItemDocs.map((document) => ({ document, kind: 'ICSI' })),
    ...icSalesDocs.map((document) => ({ document, kind: 'ICSI' })),
    ...icReturns.map((document) => ({ document, kind: 'ICSR' })),
    ...purchaseDocs.map((document) => ({ document, kind: 'Purchase' })),
    ...purchaseReturns.map((document) => ({ document, kind: 'Purchase Return' })),
  ];

  const customerIds = [...new Set(allDocuments
    .filter(({ kind }) => kind !== 'Purchase' && kind !== 'Purchase Return')
    .map(({ document }) => String(document.customerId || '')).filter(isValidObjectId))];
  const supplierIds = [...new Set(allDocuments
    .filter(({ kind }) => kind === 'Purchase' || kind === 'Purchase Return')
    .map(({ document }) => String(document.supplierId || '')).filter(isValidObjectId))];
  const locationIds = [...new Set(allDocuments
    .flatMap(({ document }) => [String(document.locationId || ''), String(document.toLocationId || '')])
    .filter((id) => isValidObjectId(id)))];
  const [customers, suppliers, locations, hsnRecords] = await Promise.all([
    customerIds.length ? Customer.find({ _id: { $in: customerIds } }).select('_id businessName firstName middleName lastName gstNo').lean() : [],
    supplierIds.length ? Supplier.find({ _id: { $in: supplierIds } }).select('_id businessName firstName middleName lastName gstNo').lean() : [],
    locationIds.length ? CompanyLocation.find({ _id: { $in: locationIds } }).select('_id name businessPrintName gstin').lean() : [],
    Hsn.find({ $or: [{ businessId: scope.businessId }, { businessId: null }] })
      .select('_id code').lean(),
  ]);
  const contactById = new Map([
    ...customers.map((contact) => [String(contact._id), contact]),
    ...suppliers.map((contact) => [String(contact._id), contact]),
  ]);
  const locationById = new Map(locations.map((location) => [
    String(location._id), location.name || location.businessPrintName || '',
  ]));
  const hsnById = new Map(hsnRecords.map((record) => [String(record._id), record]));
  const hsnByCode = new Map(hsnRecords.map((record) => [
    String(record.code || '').trim().toLowerCase(), record,
  ]));

  const rows = allDocuments.flatMap(({ document, kind }) =>
    lineRows({
      ...document,
      customerGstn: document.customerGstn
        || locationById.get(String(document.toLocationId || ''))?.gstin,
    }, kind, contactById, locationById, hsnById, hsnByCode)
  ).filter((row) => {
    const typeAllowed = selectedTypes.has(row.type);
    const tabAllowed = !tabTypes || tabTypes.has(row.type);
    return typeAllowed && tabAllowed;
  }).sort((a, b) => new Date(b.invoiceDate || 0) - new Date(a.invoiceDate || 0));

  const term = (sp.get('search') || '').trim().toLowerCase();
  const filtered = term ? rows.filter((row) => [
    row.type, row.customerName, row.gstn, row.invoiceNo, row.branch,
    row.itemName, row.itemCode, row.itemNameNew,
  ].some((value) => String(value || '').toLowerCase().includes(term))) : rows;
  if (sp.get('summary') === '1') {
    const summaryRows = GST_SUMMARY_TYPES.filter((type) => selectedTypes.has(type)).map((type) => {
      const typeRows = rows.filter((row) => row.type === type);
      const documents = new Set(typeRows.map((row) => row._documentId));
      return {
        _id: type,
        type,
        records: documents.size,
        subTotal: r2(typeRows.reduce((sum, row) => sum + row.subTotal, 0)),
        taxableAmount: r2(typeRows.reduce((sum, row) => sum + row.taxableAmount, 0)),
        igstAmount: r2(typeRows.reduce((sum, row) => sum + row.igstAmount, 0)),
        cgstAmount: r2(typeRows.reduce((sum, row) => sum + row.cgstAmount, 0)),
        sgstAmount: r2(typeRows.reduce((sum, row) => sum + row.sgstAmount, 0)),
      };
    });
    const totals = summaryRows.reduce((sum, row) => ({
      records: sum.records + row.records,
      subTotal: r2(sum.subTotal + row.subTotal),
      taxableAmount: r2(sum.taxableAmount + row.taxableAmount),
      igstAmount: r2(sum.igstAmount + row.igstAmount),
      cgstAmount: r2(sum.cgstAmount + row.cgstAmount),
      sgstAmount: r2(sum.sgstAmount + row.sgstAmount),
    }), {
      records: 0, subTotal: 0, taxableAmount: 0,
      igstAmount: 0, cgstAmount: 0, sgstAmount: 0,
    });
    return json({ rows: summaryRows, total: summaryRows.length, totals });
  }

  const uniqueDocuments = new Set(filtered.map((row) => row._documentId));
  const totals = filtered.reduce((sum, row) => {
    sum.taxableAmount += row.taxableAmount;
    sum.igstAmount += row.igstAmount;
    sum.cgstAmount += row.cgstAmount;
    sum.sgstAmount += row.sgstAmount;
    sum.subTotal += row.subTotal;
    sum.net += row.net;
    sum.roundOff += row.roundOff;
    return sum;
  }, {
    invoices: uniqueDocuments.size,
    lines: filtered.length,
    taxableAmount: 0,
    igstAmount: 0,
    cgstAmount: 0,
    sgstAmount: 0,
    subTotal: 0,
    net: 0,
    roundOff: 0,
  });
  Object.keys(totals).forEach((key) => {
    if (key !== 'invoices' && key !== 'lines') totals[key] = r2(totals[key]);
  });

  const { page, perPage } = pageOf(sp);
  const resultRows = sp.get('export') === '1'
    ? filtered
    : filtered.slice((page - 1) * perPage, page * perPage);
  return json({
    rows: resultRows,
    total: filtered.length,
    pages: Math.max(1, Math.ceil(filtered.length / perPage)),
    page,
    perPage,
    totals,
  });
}
