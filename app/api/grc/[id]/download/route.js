import dbConnect from '@/lib/db';
import Grc from '@/models/Grc';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { Supplier } from '@/lib/contacts';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { amountInWords } from '@/lib/amountWords';
import { grcTotals, grcMoney, rowTaxable } from '@/lib/grcMoney';
import { encodedBarcodeValue } from '@/lib/barcodeValue';
import { screenDenialAnyAction, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';

/* /api/grc/<id>/download
   Downloads the GRC as a standalone HTML file with proper pagination
   that can be printed or saved as PDF using the browser's print-to-PDF feature. */

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

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return Response.json({ error: 'Unauthorized' }, { status: 401 });

  const { id } = await params;
  await dbConnect();

  const grc = await Grc.findById(id).lean();
  if (!grc) return Response.json({ error: 'Not found' }, { status: 404 });

  /* Roles & Permissions (17-10-2026): printing a GRC - GRC Read, Create or
     Update */
  const denied = await screenDenialAnyAction({ session, screens: [SCREENS.GRC], actions: [PERM.READ, PERM.CREATE, PERM.UPDATE], businessId: grc.businessId, label: 'GRC' });
  if (denied) return Response.json({ error: denied.message, code: denied.code }, { status: 403 });

  const [business, location, supplier, barcodeRows] = await Promise.all([
    grc.businessId ? Business.findById(grc.businessId).lean() : null,
    grc.locationId ? CompanyLocation.findById(grc.locationId).lean() : null,
    grc.supplierId ? Supplier.findById(grc.supplierId).lean() : null,
    BarcodeLabel.find({ grcId: id }).sort({ createdAt: 1, _id: 1 }).lean(),
  ]);

  const rows = (barcodeRows || []).map((r) => ({
    ...r,
    grcNumber: grc.grcNumber || '',
    supplierCode: supplier?.contactId || '',
  }));
  const totals = grcTotals(rows);
  const header = grcMoney(grc, rows);
  const hasRows = rows.some((r) => rowTaxable(r) > 0);

  const totalQty = totals.totalQuantity;
  const totalTaxable = hasRows ? totals.taxable : header.taxable;
  const totalGst = hasRows ? totals.gst : header.gst;
  const totalNet = hasRows ? totals.netAmount : header.netAmount;

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
    addressLine1: supplier.billingAddressLine1 || '',
    addressLine2: supplier.billingAddressLine2 || '',
    city: supplier.billingCity || '',
    state: supplier.billingState || '',
    zipCode: supplier.billingZipCode || '',
    mobile: supplier.billingMobile || '',
    gstin: supplier.gstNo || grc.vendorGstNo || '',
  };

  // Generate HTML content with proper pagination CSS
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GRC - ${grc.grcNumber}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { 
      font-family: Arial, sans-serif; 
      font-size: 10px; 
      color: #000; 
      background: #fff;
      padding: 10mm;
    }
    .grc-title { 
      text-align: center; 
      font-size: 14px; 
      font-weight: bold; 
      margin-bottom: 5px; 
    }
    .grc-subtitle { 
      text-align: center; 
      font-size: 9px; 
      color: #666; 
      margin-bottom: 10px; 
    }
    .letterhead { 
      border: 1px solid #000; 
      border-bottom: none; 
      padding: 10px; 
      text-align: center; 
      margin-bottom: 0;
    }
    .letterhead h1 { 
      font-size: 16px; 
      font-weight: bold; 
      margin-bottom: 3px; 
    }
    .letterhead p { 
      margin: 1px 0; 
      font-size: 9px;
    }
    .letterhead .gstin { 
      font-weight: bold; 
      margin-top: 3px; 
    }
    .meta-section { 
      border: 1px solid #000; 
      border-top: none; 
      border-bottom: none; 
      padding: 10px; 
      display: grid; 
      grid-template-columns: 1fr 1fr; 
      gap: 10px; 
      margin-bottom: 0;
    }
    .supplier-info h2 { 
      font-size: 12px; 
      font-weight: bold; 
      margin-bottom: 5px; 
    }
    .supplier-info p { 
      margin: 1px 0; 
      font-size: 9px;
    }
    .supplier-info .gstin { 
      font-weight: bold; 
    }
    .meta-info p { 
      margin: 2px 0; 
      font-size: 9px;
    }
    .meta-info b { 
      font-weight: bold; 
    }
    .fields-grid {
      display: grid;
      grid-template-columns: repeat(4, 1fr);
      gap: 5px;
      margin: 10px 0;
    }
    .field-item { font-size: 9px; }
    .field-label { 
      color: #666; 
      font-size: 8px; 
      text-transform: uppercase; 
      margin-bottom: 2px; 
    }
    .field-value { 
      font-weight: 500; 
    }
    .items-table { 
      border: 1px solid #000; 
      border-top: none; 
      border-bottom: none; 
      padding: 10px; 
      margin-bottom: 0;
    }
    table { 
      width: 100%; 
      border-collapse: collapse; 
      margin-top: 5px; 
      font-size: 8px;
      table-layout: fixed;
    }
    th, td { 
      border: 1px solid #000; 
      padding: 3px 4px; 
      text-align: center; 
      vertical-align: top;
      word-wrap: break-word;
      overflow-wrap: break-word;
      line-height: 1.3;
    }
    th { 
      background-color: #f4f4f4; 
      font-weight: bold; 
      font-size: 8px;
      height: 20px;
    }
    tbody td {
      height: auto;
      min-height: 15px;
    }
    .text-right { text-align: right; }
    .text-left { text-align: left; }
    .text-center { text-align: center; }
    .font-mono { font-family: monospace; }
    .totals-row { 
      background-color: #f4f4f4; 
      font-weight: bold; 
    }
    .totals-section {
      margin-top: 10px;
      padding: 10px;
      border: 1px solid #000;
      border-top: none;
      background: #f9f9f9;
    }
    .totals-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 5px;
    }
    .total-item {
      display: flex;
      justify-content: space-between;
      margin: 2px 0;
      font-size: 9px;
      padding: 2px 0;
    }
    .total-item strong {
      font-weight: bold;
    }
    .footer { 
      margin-top: 15px; 
      display: flex; 
      justify-content: space-between; 
      align-items: flex-start;
      min-height: 30px;
      padding: 10px 0;
      border-top: 2px solid #000;
    }
    .footer-left { 
      flex: 1; 
      font-size: 9px; 
      font-weight: bold;
    }
    .footer-right { 
      white-space: nowrap; 
      font-size: 9px; 
      text-align: right;
      font-weight: bold;
    }
    
    /* Pagination rules */
    @media print {
      @page {
        size: A4 portrait;
        margin: 10mm;
        orphans: 2;
        widows: 2;
      }
      body { 
        -webkit-print-color-adjust: exact; 
        print-color-adjust: exact; 
        background: #fff;
        padding: 0;
        line-height: 1.2;
      }
      
      /* Comprehensive table pagination */
      table {
        border-collapse: collapse;
        break-inside: auto;
        page-break-inside: auto;
        width: 100%;
      }
      
      /* Always repeat table headers on each page */
      thead {
        display: table-header-group;
        break-inside: avoid;
        page-break-inside: avoid;
        break-after: avoid;
        page-break-after: avoid;
      }
      
      /* Prevent table rows from splitting across pages */
      tbody tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        -webkit-region-break-inside: avoid !important;
        /* Webkit specific rules */
        -webkit-column-break-inside: avoid !important;
        /* Firefox specific rules */
        -moz-break-inside: avoid !important;
        /* Ensure proper spacing */
        vertical-align: top;
      }
      
      /* Additional safety for all table rows */
      tr {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        -webkit-region-break-inside: avoid !important;
        -webkit-column-break-inside: avoid !important;
        -moz-break-inside: avoid !important;
      }
      
      /* Prevent individual cells from breaking */
      td, th {
        break-inside: avoid;
        page-break-inside: avoid;
        -webkit-region-break-inside: avoid;
        vertical-align: top;
        word-wrap: break-word;
        overflow-wrap: break-word;
      }
      
      /* Keep table body together when possible */
      tbody {
        break-inside: auto;
        page-break-inside: auto;
      }
      
      /* Footer rows should stay together */
      tfoot {
        display: table-footer-group;
        break-inside: avoid;
        page-break-inside: avoid;
        break-before: avoid;
        page-break-before: avoid;
      }
      
      /* Keep important sections together */
      .letterhead,
      .meta-section,
      .fields-grid {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-after: avoid;
        page-break-after: avoid;
      }
      
      /* Totals section and footer should not split */
      .totals-section,
      .footer {
        break-inside: avoid !important;
        page-break-inside: avoid !important;
        break-before: avoid;
        page-break-before: avoid;
        orphans: 3;
        widows: 3;
      }
      
      /* Items table should allow breaking between rows but not within rows */
      .items-table {
        break-inside: auto;
        page-break-inside: auto;
      }
      
      /* Ensure adequate space for rows */
      .items-table tr {
        min-height: 18px;
      }
      
      /* Force page break if needed before totals - if totals + footer need more space */
      .totals-section {
        margin-top: 15px;
      }
      
      /* Try to keep totals and footer together as a unit */
      .totals-section + .footer {
        break-before: avoid;
        page-break-before: avoid;
      }
      
      /* Ensure minimum space at bottom for totals + footer */
      .items-table + .totals-section {
        margin-top: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="grc-title">GOODS RECEIPT CHALLAN</div>
  <div class="grc-subtitle">GRC No: ${grc.grcNumber}</div>
  
  <div class="letterhead">
    <h1>${b?.printName || b?.name || ''}</h1>
    ${b?.addressLine1 ? `<p>${b.addressLine1}</p>` : ''}
    ${b?.addressLine2 ? `<p>${b.addressLine2}</p>` : ''}
    <p>${[b?.city, b?.state].filter(Boolean).join(', ')}${b?.zipCode ? ' - ' + b.zipCode : ''}</p>
    ${b?.mobile ? `<p>Tel: ${b.mobile}</p>` : ''}
    ${b?.gstin ? `<p class="gstin">GSTIN: ${b.gstin}</p>` : ''}
  </div>

  <div class="meta-section">
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
      <p><b>GRC Date:</b> ${d(grc.grcDate) || '-'}</p>
      <p><b>Vendor Doc No:</b> ${grc.vendorDocNo || '-'}</p>
      <p><b>Vendor Doc Date:</b> ${d(grc.vendorDocDate) || '-'}</p>
      <p><b>Occasion:</b> ${grc.occasion || '-'}</p>
    </div>
  </div>

  <div class="fields-grid">
    <div class="field-item">
      <div class="field-label">Total Quantity</div>
      <div class="field-value">${grc.totalQuantity || 0}</div>
    </div>
    <div class="field-item">
      <div class="field-label">Taxable</div>
      <div class="field-value">${(hasRows ? totalTaxable : header.taxable).toFixed(2)}</div>
    </div>
    <div class="field-item">
      <div class="field-label">GST Amount</div>
      <div class="field-value">${(hasRows ? totalGst : header.gst).toFixed(2)}</div>
    </div>
    <div class="field-item">
      <div class="field-label">Net Amount</div>
      <div class="field-value">${(hasRows ? totalNet : header.netAmount).toFixed(2)}</div>
    </div>
  </div>

  <div class="items-table">
    <h3 style="margin-bottom: 5px; font-size: 10px; font-weight: bold;">Item Details</h3>
    <table>
      <thead>
        <tr>
          <th style="width: 30px;">Sl</th>
          <th style="width: 50px;">Old Barcode</th>
          <th style="width: 60px;">Item Code</th>
          <th style="width: 50px;">Batch</th>
          <th style="width: 100px;">Description</th>
          <th style="width: 35px;">Qty</th>
          <th style="width: 35px;">UOM</th>
          <th style="width: 50px;">HSN</th>
          <th style="width: 45px;">Pur Rate</th>
          <th style="width: 35px;">Disc</th>
          <th style="width: 45px;">Final Net</th>
          <th style="width: 35px;">GST %</th>
          <th style="width: 45px;">Retail</th>
          <th style="width: 45px;">Offer</th>
          <th style="width: 70px;">Barcode</th>
        </tr>
      </thead>
      <tbody>
        ${rows.length === 0 ? '<tr><td colspan="15" style="padding: 15px; text-align: center;">No items in this GRC.</td></tr>' : ''}
        ${rows.map((r, i) => `
          <tr>
            <td class="text-center">${i + 1}</td>
            <td class="text-center">${r.oldBarcode || ''}</td>
            <td class="text-center">${r.itemCode || ''}</td>
            <td class="text-center">${r.batchUnique || ''}</td>
            <td class="text-left">${r.supplierDescription || ''}</td>
            <td class="text-center">${num(r.qty)}</td>
            <td class="text-center">${r.uom || ''}</td>
            <td class="text-center">${r.hsn || ''}</td>
            <td class="text-right">${money(r.purRate)}</td>
            <td class="text-right">${money(r.disc)}</td>
            <td class="text-right">${money(r.finalNet)}</td>
            <td class="text-center">${money(r.gst)}</td>
            <td class="text-right">${money(r.retailPrice)}</td>
            <td class="text-right">${money(r.offerPrice)}</td>
            <td class="text-center font-mono">${encodedBarcodeValue(r)}</td>
          </tr>
        `).join('')}
      </tbody>
      <tfoot>
        <tr class="totals-row">
          <td colspan="5" class="text-right"><strong>Totals</strong></td>
          <td class="text-center"><strong>${totalQty.toFixed(2)}</strong></td>
          <td colspan="9" class="text-right">
            <strong>Taxable ₹ ${totalTaxable.toFixed(2)} · GST ₹ ${totalGst.toFixed(2)} · Net ₹ ${totalNet.toFixed(2)}</strong>
          </td>
        </tr>
      </tfoot>
    </table>
  </div>

  <div class="totals-section">
    <h4 style="font-size: 10px; margin-bottom: 8px; border-bottom: 1px solid #ccc; padding-bottom: 3px;">Summary Totals</h4>
    <div class="totals-grid">
      <div class="total-item">
        <span>Total Quantity:</span><strong>${totalQty.toFixed(2)}</strong>
      </div>
      <div class="total-item">
        <span>Taxable Value:</span><strong>₹ ${totalTaxable.toFixed(2)}</strong>
      </div>
      <div class="total-item">
        <span>GST Amount:</span><strong>₹ ${totalGst.toFixed(2)}</strong>
      </div>
      <div class="total-item">
        <span><strong>Net Amount:</strong></span><strong>₹ ${totalNet.toFixed(2)}</strong>
      </div>
    </div>
    <div style="margin-top: 8px; padding-top: 5px; border-top: 1px solid #000; font-size: 9px;">
      <strong>Amount in Words:</strong> ${amountInWords(totalNet)}
    </div>
  </div>

  <div class="footer">
    <div class="footer-left">
      <div style="margin-bottom: 30px;">
        <div style="border-bottom: 1px solid #000; width: 200px; margin-bottom: 5px;"></div>
        <div>Receiver's Signature</div>
      </div>
    </div>
    <div class="footer-right">
      <div style="text-align: right;">
        <div style="margin-bottom: 30px;">
          <div>For ${b?.printName || b?.name || ''}</div>
          <div style="border-bottom: 1px solid #000; width: 200px; margin: 20px 0 5px auto;"></div>
          <div>Authorized Signatory</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>`;

  return new Response(html, {
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Content-Disposition': `attachment; filename="GRC_${grc.grcNumber || id}.html"`,
    },
  });
}
