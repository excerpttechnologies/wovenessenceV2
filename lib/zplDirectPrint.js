'use client';
import React from 'react';
import GrcZplLabelPreview from '@/components/GrcZplLabelPreview';

/**
 * Direct Print for 90 × 68 MM Barcode Labels.
 * Opens the native browser print dialog formatted at exact 90x68mm dimensions.
 * Routes directly to the connected USB printer (BOXP BP 4304e / Zebra / TSC)
 * without requiring any background daemons, downloads, or network calls.
 */
export async function print90x68LabelsDirect(rows, config = {}) {
  if (typeof window === 'undefined' || !rows || !rows.length) return false;

  return new Promise(async (resolve, reject) => {
    let hiddenContainer = null;
    let iframe = null;

    try {
      hiddenContainer = document.createElement('div');
      hiddenContainer.id = 'zpl-direct-print-hidden-root';
      hiddenContainer.style.position = 'fixed';
      hiddenContainer.style.top = '-99999px';
      hiddenContainer.style.left = '-99999px';
      hiddenContainer.style.opacity = '0';
      hiddenContainer.style.pointerEvents = 'none';
      hiddenContainer.style.zIndex = '-99999';
      document.body.appendChild(hiddenContainer);

      iframe = document.createElement('iframe');
      iframe.id = 'zpl-direct-print-iframe';
      iframe.style.position = 'fixed';
      iframe.style.top = '-99999px';
      iframe.style.left = '-99999px';
      iframe.style.width = '0';
      iframe.style.height = '0';
      iframe.style.border = 'none';
      document.body.appendChild(iframe);

      const { createRoot } = await import('react-dom/client');
      const root = createRoot(hiddenContainer);

      // Expand rows by copies
      const expandedRows = [];
      rows.forEach((r, idx) => {
        const copies = Math.max(1, parseInt(r.copies || 1, 10));
        for (let c = 0; c < copies; c++) {
          expandedRows.push({ ...r, _printKey: `row-${idx}-c-${c}` });
        }
      });

      const elementTree = (
        <div>
          {expandedRows.map((item) => (
            <div
              key={item._printKey}
              className="zpl-print-page"
              style={{
                width: '90mm',
                height: '68mm',
                boxSizing: 'border-box',
                pageBreakAfter: 'always',
                breakAfter: 'page',
                overflow: 'hidden',
                margin: 0,
                padding: 0,
              }}
            >
              <GrcZplLabelPreview row={item} config={config} isPrint={true} />
            </div>
          ))}
        </div>
      );

      root.render(elementTree);

      // Wait for React to mount and JsBarcode to render
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await new Promise((res) => setTimeout(res, 200));

      // Collect all current stylesheets from the host page
      const currentStyles = Array.from(document.querySelectorAll('style, link[rel="stylesheet"]'))
        .map((el) => el.outerHTML)
        .join('\n');

      const doc = iframe.contentDocument || iframe.contentWindow.document;
      doc.open();
      doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Print 90x68mm Labels</title>
  ${currentStyles}
  <style>
    @page {
      size: 90mm 68mm;
      margin: 0 !important;
    }
    * {
      box-sizing: border-box !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      font-family: Arial, Helvetica, sans-serif !important;
      width: 90mm !important;
    }
    .zpl-print-page {
      width: 90mm !important;
      height: 68mm !important;
      box-sizing: border-box !important;
      page-break-after: always !important;
      break-after: page !important;
      overflow: hidden !important;
      margin: 0 !important;
      padding: 0 !important;
    }
    .zpl-print-page:last-child {
      page-break-after: auto !important;
      break-after: auto !important;
    }
    .zpl-label-preview {
      border: none !important;
      box-shadow: none !important;
      width: 90mm !important;
      height: 68mm !important;
      margin: 0 !important;
      padding: 3mm 4mm !important;
    }
    svg {
      display: block !important;
    }
  </style>
</head>
<body>
  ${hiddenContainer.innerHTML}
</body>
</html>`);
      doc.close();

      // Wait for iframe rendering
      await new Promise((res) => requestAnimationFrame(() => requestAnimationFrame(res)));
      await new Promise((res) => setTimeout(res, 150));

      const cleanup = () => {
        setTimeout(() => {
          try {
            if (hiddenContainer && hiddenContainer.parentNode) {
              hiddenContainer.parentNode.removeChild(hiddenContainer);
            }
            if (iframe && iframe.parentNode) {
              iframe.parentNode.removeChild(iframe);
            }
          } catch {
            // ignore
          }
        }, 1500);
      };

      iframe.contentWindow.focus();
      iframe.contentWindow.print();
      cleanup();
      resolve(true);
    } catch (err) {
      if (hiddenContainer && hiddenContainer.parentNode) {
        hiddenContainer.parentNode.removeChild(hiddenContainer);
      }
      if (iframe && iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
      reject(err);
    }
  });
}
