/* Goods Receipt Challan - the printable document.

   ONE layout, used by every GRC print surface in the application:

     - Admin > Purchase > Goods Receipt Challan > Action > GRC Print
       (app/admin/transaction/purchase/grc/print/[id]/page.jsx, through
        components/GrcPrintView.jsx)
     - the "Print GRC" button on the GRC edit screen
     - /api/grc/<id>/print   (the same document as a standalone HTML page)
     - /api/grc/<id>/download (the same document, offered as a download)

   The module is deliberately pure - no database, no server-only import - so
   the client print view and the server routes render byte-for-byte the same
   markup from the same payload. The payload itself is built in
   lib/grcPrintData.js from the GRC's saved businessId / locationId (never
   from the globally selected branch). */

const esc = (value) => String(value ?? '')
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

const num = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

export const grcPrintDate = (value) => {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n) => String(n).padStart(2, '0');
  return pad(date.getDate()) + '-' + pad(date.getMonth() + 1) + '-' + date.getFullYear();
};

/* Money: Indian grouping, always two decimals. */
export const grcPrintMoney = (value) => num(value).toLocaleString('en-IN', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/* Quantities keep their real precision (metres are routinely fractional)
   but do not print a meaningless ".00" after a whole piece. */
export const grcPrintQty = (value) => num(value).toLocaleString('en-IN', {
  minimumFractionDigits: 0,
  maximumFractionDigits: 3,
});

const orDash = (value) => {
  const text = String(value ?? '').trim();
  return text ? text : '-';
};

const joinAddress = (lines) => lines.map((line) => String(line || '').trim()).filter(Boolean);

export const GRC_PRINT_CSS = `
  .grc-print-doc {
    --grc-ink: #000;
    --grc-rule: #000;
    /* app/globals.css forces text-transform: uppercase on <body> for the
       ERP's data-entry screens. A printed challan must show the data as it
       was saved - and must match the standalone /print and /download routes,
       which do not load globals.css. Only the labels below opt in. */
    text-transform: none;
    box-sizing: border-box;
    width: 100%;
    max-width: 210mm;
    margin: 0 auto;
    padding: 10mm 10mm 12mm;
    background: #fff;
    color: var(--grc-ink);
    font-family: Arial, Helvetica, "Segoe UI", sans-serif;
    font-size: 10.5px;
    line-height: 1.35;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
  }
  .grc-print-doc * { box-sizing: border-box; }
  .grc-title {
    margin: 0 0 1.5mm;
    text-align: center;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }
  .grc-branch {
    padding: 0 0 2.5mm;
    margin-bottom: 3mm;
    text-align: center;
    border-bottom: 0.6pt solid var(--grc-rule);
  }
  .grc-branch-name {
    font-size: 15px;
    font-weight: 700;
    line-height: 1.25;
    text-transform: uppercase;
  }
  .grc-branch-line {
    margin-top: 0.7mm;
    font-size: 9.5px;
    line-height: 1.35;
  }
  .grc-branch-contact { margin-top: 0.7mm; font-size: 9.5px; font-weight: 600; }

  .grc-parties {
    display: grid;
    grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
    gap: 6mm;
    padding: 0 0 3mm;
    margin-bottom: 3mm;
    border-bottom: 0.6pt solid var(--grc-rule);
    break-inside: avoid;
    page-break-inside: avoid;
  }
  .grc-party { min-width: 0; }
  .grc-party-label {
    margin-bottom: 0.8mm;
    font-size: 8.5px;
    font-weight: 700;
    letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .grc-supplier-name {
    margin-bottom: 0.8mm;
    font-size: 11px;
    font-weight: 700;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .grc-line {
    margin: 0.35mm 0;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .grc-line b { font-weight: 700; }

  .grc-meta { min-width: 0; }
  .grc-meta-row {
    display: grid;
    grid-template-columns: 32% minmax(0, 1fr);
    gap: 1.5mm;
    margin: 0.5mm 0;
    align-items: start;
  }
  .grc-meta-label { font-weight: 700; }
  .grc-meta-value { min-width: 0; overflow-wrap: anywhere; word-break: break-word; }

  .grc-table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    font-size: 9.5px;
  }
  .grc-table th,
  .grc-table td {
    border: 0.5pt solid var(--grc-rule);
    padding: 1.2mm 1.1mm;
    vertical-align: top;
    line-height: 1.3;
    overflow-wrap: anywhere;
    word-break: break-word;
  }
  .grc-table thead th {
    font-weight: 700;
    text-align: center;
    vertical-align: middle;
    background: #fff;
  }
  .grc-table tbody td { background: #fff; }
  .grc-table .grc-num { text-align: right; overflow-wrap: anywhere; }
  /* A figure too long for its column is shrunk rather than allowed to
     overlap the cell beside it. Never wrapped: a broken amount is worse
     than a small one. */
  .grc-table .grc-num-tight { font-size: 8.3px; }
  .grc-table .grc-num-x { font-size: 7.3px; }
  .grc-table .grc-center { text-align: center; }
  .grc-table .grc-item { text-align: left; }
  .grc-uom { font-size: 0.95em; white-space: nowrap; }
  .grc-table .grc-empty { text-align: center; padding: 8mm 2mm; }
  .grc-total-row td {
    font-weight: 700;
    border-top: 0.9pt solid var(--grc-rule);
  }

  .grc-end {
    break-inside: avoid;
    page-break-inside: avoid;
    break-before: avoid;
    page-break-before: avoid;
    padding-top: 6mm;
  }
  .grc-signatory {
    margin-left: auto;
    width: 62mm;
    text-align: center;
    font-size: 10px;
    line-height: 1.5;
  }
  .grc-signatory-space { height: 14mm; }
  .grc-signatory-company { font-weight: 700; }

  /* ------------------------------------------------------------------ print */
  @media print {
    @page { size: A4 portrait; margin: 10mm 10mm 12mm; }

    html, body {
      width: auto;
      min-width: 0;
      margin: 0;
      padding: 0;
      background: #fff !important;
      color: #000 !important;
    }
    .grc-print-doc {
      width: 100% !important;
      max-width: none !important;
      margin: 0 !important;
      padding: 0 !important;
      font-size: 10px;
    }
    .grc-toolbar, .no-print { display: none !important; }

    .grc-table { break-inside: auto; page-break-inside: auto; }
    .grc-table thead { display: table-header-group; }
    .grc-table tbody tr { break-inside: avoid; page-break-inside: avoid; }
    .grc-table th, .grc-table td { break-inside: avoid; page-break-inside: avoid; }
    .grc-title, .grc-branch, .grc-parties, .grc-end {
      break-inside: avoid;
      page-break-inside: avoid;
    }
  }
`;

function metaRow(label, value) {
  return `
    <div class="grc-meta-row">
      <div class="grc-meta-label">${esc(label)}</div>
      <div class="grc-meta-value">${esc(orDash(value))}</div>
    </div>`;
}

/* A right-aligned money cell. Very large figures drop a size so they stay
   inside their column instead of spilling over the border. */
function moneyCell(value) {
  const text = grcPrintMoney(value);
  const size = text.length >= 16 ? ' grc-num-x' : (text.length >= 13 ? ' grc-num-tight' : '');
  return `<td class="grc-num${size}">${esc(text)}</td>`;
}

function itemRow(item) {
  return `
    <tr>
      <td class="grc-center">${esc(item.sn)}</td>
      <td class="grc-item">${esc(orDash(item.itemName))}</td>
      <td class="grc-center">${esc(orDash(item.batchNo))}</td>
      <td class="grc-center">${esc(grcPrintQty(item.qty))}${item.uom ? ' <span class="grc-uom">(' + esc(item.uom) + ')</span>' : ''}</td>
      ${moneyCell(item.price)}
      ${moneyCell(item.amount)}
      ${moneyCell(item.rsp)}
      <td class="grc-num">${item.gp === null || item.gp === undefined ? '-' : esc(grcPrintMoney(item.gp) + '%')}</td>
    </tr>`;
}

/* The document body. `payload` is the shape built by lib/grcPrintData.js:
   { grc, branch, supplier, items, totals }. */
export function renderGrcPrintBody(payload) {
  const grc = payload?.grc || {};
  const branch = payload?.branch || {};
  const supplier = payload?.supplier || {};
  const items = Array.isArray(payload?.items) ? payload.items : [];
  const totals = payload?.totals || {};

  const branchAddress = joinAddress([
    branch.addressLine1,
    branch.addressLine2,
    [branch.city, branch.state].filter(Boolean).join(', ')
      + (branch.zipCode ? ' - ' + branch.zipCode : ''),
  ]);

  const supplierAddress = joinAddress([
    supplier.addressLine1,
    supplier.addressLine2,
    [supplier.city, supplier.state].filter(Boolean).join(', ')
      + (supplier.zipCode ? ' - ' + supplier.zipCode : ''),
  ]);

  const branchContact = [
    branch.mobile ? 'Tel: ' + branch.mobile : '',
    branch.gstin ? 'GSTIN: ' + branch.gstin : '',
  ].filter(Boolean).join(', ');

  const suppRef = [grc.vendorDocNo, grc.vendorDocDate ? grcPrintDate(grc.vendorDocDate) : '']
    .filter(Boolean).join(' - ');
  const lrRef = [grc.lrNo, grc.lrDate ? grcPrintDate(grc.lrDate) : '']
    .filter(Boolean).join(' - ');

  return `
  <div class="grc-title">Goods Receipt Challan</div>

  <div class="grc-branch">
    <div class="grc-branch-name">${esc(branch.name || branch.businessName || '')}</div>
    ${branchAddress.map((line) => `<div class="grc-branch-line">${esc(line)}</div>`).join('')}
    ${branchContact ? `<div class="grc-branch-contact">${esc(branchContact)}</div>` : ''}
  </div>

  <div class="grc-parties">
    <div class="grc-party">
      <div class="grc-party-label">From:</div>
      <div class="grc-supplier-name">${esc(supplier.name || '')}</div>
      ${supplierAddress.length
        ? `<div class="grc-line"><b>Address:</b> ${supplierAddress.map(esc).join(', ')}</div>`
        : ''}
      ${supplier.mobile ? `<div class="grc-line"><b>Mobile:</b> ${esc(supplier.mobile)}</div>` : ''}
      ${supplier.gstin ? `<div class="grc-line"><b>GSTIN:</b> ${esc(supplier.gstin)}</div>` : ''}
    </div>
    <div class="grc-meta">
      ${metaRow('GRN No:', grc.grcNumber)}
      ${metaRow('Date:', grc.grcDate ? grcPrintDate(grc.grcDate) : '')}
      ${metaRow('Supp Ref No & Dt:', suppRef)}
      ${metaRow('LR No & Dt:', lrRef)}
    </div>
  </div>

  <table class="grc-table">
    <colgroup>
      <col style="width:5%" />
      <col style="width:12%" />
      <col style="width:10%" />
      <col style="width:8%" />
      <col style="width:10%" />
      <col style="width:12%" />
      <col style="width:8%" />
      <col style="width:7%" />
    </colgroup>
    <thead>
      <tr>
        <th>Sn.</th>
        <th>Item Name</th>
        <th>BatchNO.</th>
        <th>Qty</th>
        <th>Final Price</th>
        <th>Amount</th>
        <th>RSP</th>
        <th>GP</th>
      </tr>
    </thead>
    <tbody>
      ${items.length
        ? items.map(itemRow).join('')
        : '<tr><td colspan="8" class="grc-empty">No item detail is recorded against this challan.</td></tr>'}
      <tr class="grc-total-row">
        <td colspan="3" class="grc-center">Gross Total</td>
        <td class="grc-center">${esc(grcPrintQty(totals.qty))}</td>
        <td></td>
        ${moneyCell(totals.amount)}
        <td colspan="2"></td>
      </tr>
    </tbody>
  </table>

  <div class="grc-end">
    <div class="grc-signatory">
      <div>For</div>
      <div class="grc-signatory-space"></div>
      <div class="grc-signatory-company">${esc(branch.name || branch.businessName || '')}</div>
      <div>(Authorised Signatory)</div>
    </div>
  </div>`;
}

/* A complete, standalone HTML document - what /api/grc/<id>/print serves and
   what /api/grc/<id>/download saves. */
export function buildGrcPrintHtml(payload, options = {}) {
  const title = options.title || ('GRC ' + (payload?.grc?.grcNumber || ''));
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(title)}</title>
  <style>
    html, body { margin: 0; padding: 0; background: #fff; color: #000; }
    body { font-family: Arial, Helvetica, "Segoe UI", sans-serif; }
    .grc-screen-shell { min-height: 100vh; background: #eceff1; padding: 16px 0 32px; }
    .grc-toolbar {
      max-width: 210mm; margin: 0 auto 12px; padding: 0 10mm;
      display: flex; justify-content: flex-end; gap: 8px;
    }
    .grc-toolbar button {
      font: inherit; font-size: 13px; padding: 7px 14px; cursor: pointer;
      border: 1px solid #000; background: #fff; color: #000; border-radius: 3px;
    }
    .grc-paper { box-shadow: 0 0 0 1px #d0d0d0; }
    @media print {
      .grc-screen-shell { background: #fff; padding: 0; min-height: 0; }
      .grc-paper { box-shadow: none; }
    }
    ${GRC_PRINT_CSS}
  </style>
</head>
<body>
  <div class="grc-screen-shell">
    <div class="grc-toolbar no-print">
      <button type="button" onclick="window.print()">Print</button>
      <button type="button" onclick="window.close()">Close</button>
    </div>
    <div class="grc-paper">
      <div class="grc-print-doc">${renderGrcPrintBody(payload)}</div>
    </div>
  </div>
</body>
</html>`;
}
