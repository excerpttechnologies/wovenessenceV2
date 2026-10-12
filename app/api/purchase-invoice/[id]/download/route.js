import dbConnect from '@/lib/db';
import PurchaseInvoice from '@/models/PurchaseInvoice';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { Supplier } from '@/lib/contacts';
import PurchaseTerm from '@/models/PurchaseTerm';
import { requireSession } from '@/lib/session';
import { amountInWords } from '@/lib/amountWords';

/* /api/purchase-invoice/<id>/download
   Downloads the purchase invoice as a standalone HTML file that can be
   printed or saved as PDF using the browser's print-to-PDF feature. */

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };
const money = (v) => num(v).toFixed(2);
const inr = (v) => num(v).toLocaleString('en-IN', {
  minimumFractionDigits: 2, maximumFractionDigits: 2,
});

const d = (v) => {
  if (!v) return '';
  const x = new Date(v);
  if (Number.isNaN(x.getTime())) return '';
  const p = (n) => String(n).padStart(2, '0');
  return p(x.getDate()) + '-' + p(x.getMonth() + 1) + '-' + x.getFullYear();
};

function hsnSummary(items) {
  const map = new Map();
  for (const r of items) {
    const key = r.hsn || '-';
    const cur = map.get(key) || {
      hsn: key, taxable: 0, igst: 0, cgst: 0, sgst: 0,
    };
    cur.taxable += num(r.beforeTax);
    cur.igst += num(r.igstAmount);
    cur.cgst += num(r.cgstAmount);
    cur.sgst += num(r.sgstAmount);
    map.set(key, cur);
  }
  const pct = (amt, base) => (base ? Math.round((amt / base) * 10000) / 100 : 0);
  const rows = [...map.values()].map((r) => ({
    ...r,
    igstPct: pct(r.igst, r.taxable),
    cgstPct: pct(r.cgst, r.taxable),
    sgstPct: pct(r.sgst, r.taxable),
  }));
  const total = rows.reduce((a, r) => ({
    taxable: a.taxable + r.taxable,
    igst: a.igst + r.igst,
    cgst: a.cgst + r.cgst,
    sgst: a.sgst + r.sgst,
  }), { taxable: 0, igst: 0, cgst: 0, sgst: 0 });
  return { rows, total };
}

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await dbConnect();

  const inv = await PurchaseInvoice.findById(id).lean();
  if (!inv) return Response.json({ error: 'Not found' }, { status: 404 });

  const [business, location, supplier, term] = await Promise.all([
    inv.businessId ? Business.findById(inv.businessId).lean() : null,
    inv.locationId ? CompanyLocation.findById(inv.locationId).lean() : null,
    inv.supplierId ? Supplier.findById(inv.supplierId).lean() : null,
    inv.purchaseTermId ? PurchaseTerm.findById(inv.purchaseTermId).lean() : null,
  ]);

  const items = Array.isArray(inv.items) ? inv.items : [];
  const hsn = hsnSummary(items);

  const headDiscount = inv.taxableValue * (inv.discountPercent / 100);
  const subTotal = inv.taxableValue - headDiscount - inv.roundOffDiscount;

  const b = business && {
    name: business.name,
    printName: business.businessPrintName || business.name,
    locationName: location?.name || '',
    addressLine1: location?.addressLine1 || business.addressLine1,
    addressLine2: location?.addressLine2 || business.addressLine2,
    city: location?.city || business.city,
    state: location?.state || business.state,
    zipCode: location?.zipCode || business.zipCode,
    mobile: location?.mobile || business.mobile,
    gstin: location?.gstin || business.gstin,
  };

  const s = supplier && {
    name: supplier.businessName
      || [supplier.firstName, supplier.lastName].filter(Boolean).join(' '),
    contactId: supplier.contactId || '',
    addressLine1: supplier.billingAddressLine1 || '',
    addressLine2: supplier.billingAddressLine2 || '',
    city: supplier.billingCity || '',
    state: supplier.billingState || '',
    zipCode: supplier.billingZipCode || '',
    mobile: supplier.billingMobile || '',
    gstin: supplier.gstNo || inv.vendorGstNo || '',
  };

  const invoice = {
    purchaseInvoiceNo: inv.purchaseInvoiceNo || '',
    purchaseDate: inv.purchaseDate || null,
    grcNumber: inv.grcNumber || '',
    grcDate: inv.grcDate || null,
    vendorDocNo: inv.vendorDocNo || '',
    vendorDocDate: inv.vendorDocDate || null,
    purchaseTerm: term?.name || '',
    occasion: inv.occasion || '',
    finYear: inv.finYear || '',
  };

  const totals = {
    taxableValue: num(inv.taxableValue),
    discountPercent: num(inv.discountPercent),
    roundOffDiscount: num(inv.roundOffDiscount),
    igstTotal: num(inv.igstTotal),
    cgstTotal: num(inv.cgstTotal),
    sgstTotal: num(inv.sgstTotal),
    freightBeforeGst: num(inv.freightBeforeGst),
    roundOff: num(inv.roundOff),
    totalQuantity: num(inv.totalQuantity) || items.reduce((a, r) => a + num(r.qty), 0),
    netPurchaseAmt: num(inv.netPurchaseAmt) || num(inv.totalPayable),
  };

  // Generate HTML content
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Purchase Invoice - ${invoice.purchaseInvoiceNo}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; font-size: 13px; color: #000; }
    .invoice-container { max-width: 860px; margin: 0 auto; padding: 20px; }
    .invoice-title { text-align: center; font-size: 18px; font-weight: bold; margin-bottom: 10px; }
    .letterhead { border: 1px solid #000; border-bottom: none; padding: 15px; text-align: center; }
    .letterhead h1 { font-size: 24px; font-weight: bold; margin-bottom: 5px; }
    .letterhead p { margin: 2px 0; }
    .letterhead .gstin { font-weight: bold; margin-top: 5px; }
    .invoice-meta { border: 1px solid #000; border-top: none; border-bottom: none; padding: 15px; display: grid; grid-template-columns: 1fr 1fr; gap: 20px; }
    .supplier-info h2 { font-size: 19px; font-weight: bold; margin-bottom: 5px; }
    .supplier-info p { margin: 2px 0; }
    .supplier-info .gstin { font-weight: bold; }
    .meta-info p { margin: 5px 0; }
    .meta-info b { font-weight: bold; }
    .invoice-table { border: 1px solid #000; border-top: none; border-bottom: none; padding: 15px; }
    table { width: 100%; border-collapse: collapse; margin-top: 10px; }
    th, td { border: 1px solid #000; padding: 8px; text-align: center; }
    th { background-color: #f4f4f4; font-weight: bold; }
    .text-right { text-align: right; }
    .text-center { text-align: center; }
    .summary-section { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 20px; }
    .hsn-summary { margin-top: 10px; }
    .hsn-summary table { margin-top: 10px; }
    .money-section { padding-top: 10px; }
    .money-row { display: flex; justify-content: space-between; margin: 5px 0; }
    .money-row strong { font-weight: bold; }
    .footer { margin-top: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
    .footer-left { flex: 1; }
    .footer-right { white-space: nowrap; }
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm;
      }
      body { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
      .invoice-container { max-width: 100%; padding: 0; }
    }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="invoice-title">PURCHASE INVOICE</div>
    
    <div class="letterhead">
      <h1>${b?.printName || b?.name || ''}</h1>
      ${b?.addressLine1 ? `<p>${b.addressLine1}</p>` : ''}
      ${b?.addressLine2 ? `<p>${b.addressLine2}</p>` : ''}
      <p>${[b?.city, b?.state].filter(Boolean).join(', ')}${b?.zipCode ? ' - ' + b.zipCode : ''}</p>
      ${b?.mobile ? `<p>Tel: ${b.mobile}</p>` : ''}
      ${b?.gstin ? `<p class="gstin">GSTIN: ${b.gstin}</p>` : ''}
    </div>

    <div class="invoice-meta">
      <div class="supplier-info">
        <h2>${s?.name || ''}</h2>
        ${s?.addressLine1 ? `<p>${s.addressLine1}</p>` : ''}
        ${s?.addressLine2 ? `<p>${s.addressLine2}</p>` : ''}
        <p>${[s?.city, s?.state].filter(Boolean).join(', ')}</p>
        ${s?.zipCode ? `<p>PIN - ${s.zipCode}</p>` : ''}
        ${s?.mobile ? `<p>Tel: ${s.mobile}</p>` : ''}
        ${s?.gstin ? `<p class="gstin">GSTIN: ${s.gstin}</p>` : ''}
      </div>
      <div class="meta-info">
        <p><b>Invoice No.:</b> <b>${invoice.purchaseInvoiceNo}</b></p>
        <p><b>Date:</b> <b>${d(invoice.purchaseDate) || '-'}</b></p>
        <p><b>GRC No:</b> <b>${invoice.grcNumber}</b></p>
        <p><b>Sup. Inv No:</b> <b>${invoice.vendorDocNo}</b></p>
        <p><b>Sup. Inv Date:</b> <b>${d(invoice.vendorDocDate) || '-'}</b></p>
      </div>
    </div>

    <div class="invoice-table">
      <table>
        <thead>
          <tr>
            <th style="width: 52px;">Sl No.</th>
            <th style="width: 90px;">Item Code</th>
            <th>Item Name</th>
            <th style="width: 84px;">Bill Sl No.</th>
            <th style="width: 92px;">HSN</th>
            <th style="width: 52px;">Qty</th>
            <th style="width: 74px;">Rate</th>
            <th style="width: 84px;">Discount</th>
            <th style="width: 86px;">Final Rate</th>
            <th style="width: 96px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${items.length === 0 ? '<tr><td colspan="10" style="padding: 20px; text-align: center;">This invoice has no line items.</td></tr>' : ''}
          ${items.map((r, i) => `
            <tr>
              <td class="text-center">${i + 1}</td>
              <td class="text-center">${r.itemCode ?? ''}</td>
              <td class="text-center">${r.itemName ?? ''}</td>
              <td class="text-center">${r.billSlNo ?? i + 1}</td>
              <td class="text-center">${r.hsn ?? ''}</td>
              <td class="text-center">${num(r.qty)}</td>
              <td class="text-right">${money(r.purchaseRate)}</td>
              <td class="text-right">${money(r.discount)}</td>
              <td class="text-right">${money(r.finalRate)}</td>
              <td class="text-right">${money(r.beforeTax)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>

      <div class="summary-section">
        <div class="hsn-summary">
          <div style="text-align: center; font-weight: bold; margin-bottom: 10px;">
            Total Qty: ${num(totals.totalQuantity)}
          </div>
          <table>
            <thead>
              <tr>
                <th>HSN</th>
                <th>Taxable<br />Amount</th>
                <th>IGST<br />%</th>
                <th>Amt</th>
                <th>CGST<br />%</th>
                <th>Amt</th>
                <th>SGST<br />%</th>
                <th>Amt</th>
              </tr>
            </thead>
            <tbody>
              ${hsn.rows.map((r) => `
                <tr>
                  <td class="text-center">${r.hsn}</td>
                  <td class="text-right">${money(r.taxable)}</td>
                  <td class="text-center">${r.igst ? r.igstPct : ''}</td>
                  <td class="text-right">${r.igst ? money(r.igst) : ''}</td>
                  <td class="text-center">${r.cgst ? r.cgstPct : ''}</td>
                  <td class="text-right">${r.cgst ? money(r.cgst) : ''}</td>
                  <td class="text-center">${r.sgst ? r.sgstPct : ''}</td>
                  <td class="text-right">${r.sgst ? money(r.sgst) : ''}</td>
                </tr>
              `).join('')}
              <tr style="font-weight: bold;">
                <td class="text-center">Total</td>
                <td class="text-right">${money(hsn.total.taxable)}</td>
                <td></td>
                <td class="text-right">${hsn.total.igst ? money(hsn.total.igst) : ''}</td>
                <td></td>
                <td class="text-right">${hsn.total.cgst ? money(hsn.total.cgst) : ''}</td>
                <td></td>
                <td class="text-right">${hsn.total.sgst ? money(hsn.total.sgst) : ''}</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div class="money-section">
          <div class="money-row"><span>Gross Total :</span><span>${inr(totals.taxableValue)}</span></div>
          <div class="money-row"><span>Discount :</span><span>${inr(headDiscount)}</span></div>
          <div style="height: 15px;"></div>
          <div class="money-row"><span>Sub Total :</span><span>${inr(subTotal)}</span></div>
          ${totals.igstTotal > 0 ? `<div class="money-row"><span>IGST :</span><span>${inr(totals.igstTotal)}</span></div>` : ''}
          ${totals.cgstTotal > 0 ? `<div class="money-row"><span>CGST :</span><span>${inr(totals.cgstTotal)}</span></div>` : ''}
          ${totals.sgstTotal > 0 ? `<div class="money-row"><span>SGST :</span><span>${inr(totals.sgstTotal)}</span></div>` : ''}
          <div class="money-row"><span>Freight charges BEFORE GST :</span><span>+${inr(totals.freightBeforeGst)}</span></div>
          <div class="money-row"><span>Round Off :</span><span>${inr(totals.roundOff)}</span></div>
          <div class="money-row strong"><span>Net Purchase Amount :</span><span>${inr(totals.netPurchaseAmt)}</span></div>
        </div>
      </div>
    </div>

    <div class="footer">
      <div class="footer-left">
        <b>Amt In Words:</b> ${amountInWords(totals.netPurchaseAmt)}
      </div>
      <div class="footer-right">
        For ${b?.printName || b?.name || ''}
      </div>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="PurchaseInvoice_${invoice.purchaseInvoiceNo || inv.grcNumber || id}.html"`,
    },
  });
}
