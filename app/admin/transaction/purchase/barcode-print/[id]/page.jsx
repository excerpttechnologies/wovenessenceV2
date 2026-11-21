
// 'use client';
// import { useEffect, useState } from 'react';
// import { useParams } from 'next/navigation';

// /* Printable barcode label sheet: one small label per row (item code, price,
//    generated barcode), laid out in a grid so it prints multiple labels per
//    page. Rows that never had a barcode generated are skipped since there's
//    nothing to print for them. */
// export default function GrcBarcodePrintPage() {
//   const { id } = useParams();
//   const [data, setData] = useState(null);
//   const [error, setError] = useState('');

//   useEffect(() => {
//     if (!id) return;
//     fetch(`/api/grc/${id}`)
//       .then((r) => r.json())
//       .then((d) => {
//         if (d.error) setError(d.error);
//         else setData(d);
//       })
//       .catch((e) => setError(e.message || 'Failed to load'));
//   }, [id]);

//   if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
//   if (!data) return <div className="p-6 text-sm text-slate-500">Loading...</div>;

//   const labels = data.rows.filter((r) => r.barcodeGenerated);

//   return (
//     <div className="max-w-5xl mx-auto p-6 print:p-0">
//       <style jsx global>{`
//         @media print {
//           .no-print { display: none !important; }
//           body { background: white; }
//         }
//       `}</style>

//       <div className="no-print flex justify-between items-center mb-4">
//         <span className="text-xs text-slate-500">
//           {labels.length} label(s) &middot; GRC {data.grc.grcNumber}
//         </span>
//         <button
//           onClick={() => window.print()}
//           className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm"
//         >
//           Print Labels
//         </button>
//       </div>

//       {labels.length === 0 ? (
//         <p className="text-sm text-slate-400">
//           No barcodes have been generated for this GRC yet.
//         </p>
//       ) : (
//         <div className="grid grid-cols-3 gap-2 print:grid-cols-3">
//           {labels.map((r) => (
//             <div
//               key={r._id}
//               className="border border-slate-400 rounded p-2 text-center break-inside-avoid"
//             >
//               <div className="text-[10px] font-semibold truncate">{r.itemCode}</div>
//               <div className="text-[9px] text-slate-500 truncate">{r.printDescription}</div>
//               <div className="text-xs font-bold mt-1">
//                 {r.offerPrice ? `₹${r.offerPrice}` : r.retailPrice ? `₹${r.retailPrice}` : ''}
//               </div>
//               <div className="font-mono text-[10px] mt-1 tracking-wide">
//                 {r.barcodeGenerated}
//               </div>
//             </div>
//           ))}
//         </div>
//       )}
//     </div>
//   );
// }




//

'use client';
import { useEffect, useMemo, useRef, useState } from 'react';
import { renderToString } from 'react-dom/server';
import { useParams, useRouter } from 'next/navigation';
import Icon from '@/components/Icon';
import BatchLabelCountDialog from '@/components/BatchLabelCountDialog';
import GrcBarcodeLabelSheet, { Label, labelFor } from '@/components/GrcBarcodeLabel';
import useBarcodeLabelFormat from '@/components/useBarcodeLabelFormat';
import { labelRun, parsePageSize, labelGeometry, BAR_PROFILES } from '@/lib/barcodeLabelGeometry';
import {
  LABEL_MODE,
  resolveLabelMode,
  batchAvailableQty,
  withLabelCounts,
  pendingBatchRows,
  labelKey,
  toLabelData,
} from '@/lib/barcodeLabelPrint';
import GrcZplLabelPreview from '@/components/GrcZplLabelPreview';
import ZplPrinterConfigModal from '@/components/ZplPrinterConfigModal';
import { PrintLabelPicker } from '@/components/GCRBarcodeGeneration';
import {
  generateBatchZpl90x68,
  downloadPrnFile,
  sendToZebraBrowserPrint,
  loadZplConfig,
  DEFAULT_ZPL_CONFIG,
} from '@/lib/zpl90x68';

/* Label rendering (BarcodeSvg, Label, labelFor, GrcBarcodeLabelSheet) lives
   in components/GrcBarcodeLabel.jsx - the single source of truth shared with
   the Barcode Generation print picker, so both screens draw the same sticker
   from the same rows at the same physical size.

   The STOCK those labels are laid out on comes from
   components/useBarcodeLabelFormat.js, the same catalog the picker's own
   format list is built from: the seeded barcode label rows narrowed by
   Settings -> Barcode Label Settings. This page used to read no geometry at
   all, so its labels were laid out at whatever width the page happened to
   give them - about 135mm for a 50mm sticker - while the picker previewed
   the same barcodes at their real size. */

/* =====================================================================================
   PAGE
===================================================================================== */
export default function GrcBarcodePrintPage() {
  const { id } = useParams();
  const router = useRouter();
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  /* The admin's answer for each BATCH barcode, keyed by labelKey (the barcode
     number). MTR and UNIQUE barcodes never get an entry: their count is the
     rule in lib/barcodeLabelPrint.js, not something to type. */
  const [batchCounts, setBatchCounts] = useState({});
  /* The open "Print Batch Labels" dialog - { key, continueToPrint }.
     continueToPrint marks a dialog opened by Print Labels, whose confirm moves
     on to the next pending batch barcode and finally prints; one opened from
     the panel only records the count. */
  const [prompt, setPrompt] = useState(null);
  const [notice, setNotice] = useState('');

  /* The sticker stock, and the paper it is printed on. Label stock is the
     default for 100×40mm label printers with 2-up side-by-side layout. A4 is
     available for desktop printers where labels are cut manually. */
  const { formats, format, formatName, setFormatName } = useBarcodeLabelFormat(true);
  const [paper, setPaper] = useState('stock');
  /* Printer bar profile: 'standard' draws the bars at the full readable size;
     'tsc_te310' is the compact profile for the TSC TE310 (203dpi) - narrower
     symbol, shorter bars, module still at the scannable floor. The SAME
     profile drives the on-screen sheet and the hidden print render, so what
     is previewed is what prints. */
  const [barProfile, setBarProfile] = useState('standard');
  const bar = BAR_PROFILES[barProfile] || null;

  /* 90x68 mm ZPL Printer Integration */
  const [printerMode, setPrinterMode] = useState('browser'); // 'browser' | 'zpl_90x68'
  /* The SAME Print Label Picker the Barcode Generation screen opens -
     selection, batch counts, format/paper choice and the print run all live
     inside it, so this page offers it rather than growing a second one. */
  const [showPicker, setShowPicker] = useState(false);
  const [zplConfig, setZplConfig] = useState(DEFAULT_ZPL_CONFIG);
  const [showZplConfigModal, setShowZplConfigModal] = useState(false);
  const [zplNotice, setZplNotice] = useState('');
  const [zplPreviewIndex, setZplPreviewIndex] = useState(0);

  const idSpacing = 8; // Default 8mm wide spacing between barcode number and reference, centered

  useEffect(() => {
    setZplConfig(loadZplConfig());
  }, []);

  const [directPrinting, setDirectPrinting] = useState(false);

  const handleDownloadZplPrn = () => {
    if (!counted.length) {
      setZplNotice('No labels available to print.');
      return;
    }
    const zpl = generateBatchZpl90x68(counted, zplConfig);
    downloadPrnFile(zpl, `grc_${data?.grc?.grcNumber || 'labels'}_90x68.prn`);
    setZplNotice(`Downloaded 90×68 mm .PRN file with ${counted.length} label(s).`);
  };

  const handleDirectZplPrint = async (event) => {
    if (!totalLabels) {
      setZplNotice('No labels available to print.');
      return;
    }
    setDirectPrinting(true);
    setZplNotice('Connecting to BOXP BP 4304e (USB Spooler)...');
    try {
      const zpl = generateBatchZpl90x68(counted, zplConfig);
      const res = await sendToZebraBrowserPrint(zpl, zplConfig.printerModel || 'BOXP BP 4304e (300 dpi) - ZPL');
      if (res && res.success) {
        setZplNotice(`✅ Successfully sent ${totalLabels} label(s) directly to ${res.printerName || 'BOXP BP 4304e'}!`);
      } else {
        const errMsg = res?.error || 'Printer is not connected or offline.';
        setZplNotice(`❌ Cannot print: ${errMsg}`);
      }
    } catch (err) {
      setZplNotice(`❌ Direct print error: ${err.message}`);
    } finally {
      setDirectPrinting(false);
    }
  };

  const handleBrowserPrintPreview = (event) => {
    if (!totalLabels) {
      setZplNotice('No labels available to print.');
      return;
    }
    setZplNotice('');
    startPrint(event);
  };

  /* PRINTING HAPPENS EXACTLY ONCE PER USER ACTION, AND ONLY WHEN THE SHEET IS
     REALLY THERE.

     window.print() photographs the DOM as it stands at the instant it is
     called. Called straight from a click or confirm handler it would run
     before React had committed the counts that handler just set - so the
     paper would miss the batch labels the admin had only just asked for -
     and before JsBarcode had drawn a single bar.

     The run is therefore staged, exactly as the Barcode Generation picker
     stages it: `printing` mounts the print surface, and the effect below
     waits for the fonts and two frames, counts the barcodes that actually
     drew, and only then opens the dialog.

     printInFlightRef refuses a second request while one is pending, so a
     double Enter in the batch dialog, or a double click that lands before the
     print, cannot queue a second print dialog. */
  const [printing, setPrinting] = useState(false);
  const printInFlightRef = useRef(false);
  /* how many labels this run was asked for, frozen at the click */
  const wantedRef = useRef(0);

  useEffect(() => {
    if (!id) return;
    fetch(`/api/grc/${id}`)
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      })
      .catch((e) => setError(e.message || 'Failed to load'));
  }, [id]);

  /* Rows without any barcode number are skipped: there is nothing to encode.
     labelKey is the same key batchCounts is kept under. */
  const printable = useMemo(() => (data?.rows || []).filter((row) => labelKey(row)), [data]);

  /* Every printable row with its sticker count (`copies`) from the shared
     rule - MTR 2, UNIQUE 1, BATCH the admin's validated answer or 0.

     THE SHEET is rendered from this one list, on screen and on paper, so it
     holds exactly the copies that will print. Every copy of a row is built
     from that row's own barcode record: a second metre sticker or a twentieth
     batch sticker is a print copy of the same record, never a new barcode,
     and nothing here writes or reserves anything. A BATCH row with no valid
     count yet has copies 0 and is simply not on the sheet until it has one. */
  const counted = useMemo(() => withLabelCounts(printable, batchCounts), [printable, batchCounts]);

  const totalLabels = useMemo(
    () => counted.reduce((sum, row) => sum + (row.copies || 0), 0),
    [counted]
  );

  const batchRows = useMemo(
    () => counted.filter((row) => resolveLabelMode(row).mode === LABEL_MODE.BATCH),
    [counted]
  );

  /* FORCE 2-UP LAYOUT: Ensure minimum 2 labels per row and a 100 x 40 mm
     stock page. The label keeps its REAL catalog size - shrinking it to
     40 x 40 mm left 20mm of the 100mm sheet unused, so the second sticker
     printed 10mm away from its die-cut position on the physical stock. */
  const format2up = useMemo(() => {
    if (!format) return null;
    const perRow = Math.max(2, Number(format.stickerInRow) || 2);
    const pageSize = '100 x 40 mm'; // Always use 100x40 for stock printing
    if (perRow === Number(format.stickerInRow) && format.pageSize === pageSize) return format; // already correct
    return { ...format, stickerInRow: perRow, pageSize };
  }, [format]);

  const run = labelRun(format2up, paper, totalLabels);
  const { gap, stockSize } = run;

  /* Parse paper dimensions for iframe printing. Labels per page come from
     the SAME geometry the sheet is drawn with (run.perRow / run.size), not
     from dividing the raw page width by the catalog label width - the
     fitted label is narrower than the catalog size on stock. */
  const isStock = paper === 'stock';
  const paperDims = isStock && format2up ? parsePageSize(format2up) : null;
  const paperW = paperDims ? paperDims.w : (paper === 'a4' ? 210 : 100);
  const paperH = paperDims ? paperDims.h : (paper === 'a4' ? 297 : 40);
  const labelsPerSheet = isStock
    ? run.perRow
    : run.perRow * Math.max(1, Math.floor((paperH - 10) / Math.max(1, run.size.h)));

  /* Build labels array for iframe printing */
  const labelsForPrint = counted.flatMap((row, ri) => {
    const n = Math.max(0, Math.floor(Number(row.copies) || 0));
    return Array.from({ length: n }, (_, copy) => ({
      key: `${row._id || row.id || ri}-${copy}`,
      row,
    }));
  });

  /* Group labels into sheets */
  const isZpl90x68 = printerMode === 'zpl_90x68' || printerMode === 'zpl90x68';

  const sheets = useMemo(() => {
    if (isZpl90x68) {
      return labelsForPrint.map((item) => [item]);
    }
    const s = [];
    for (let i = 0; i < labelsForPrint.length; i += labelsPerSheet) {
      s.push(labelsForPrint.slice(i, i + labelsPerSheet));
    }
    return s;
  }, [isZpl90x68, labelsForPrint, labelsPerSheet]);

  /* THE PRINT RUN. Render labels in a hidden container first, wait for barcodes to draw,
     then copy the rendered HTML to an iframe for printing. This ensures JsBarcode effects run. */
  useEffect(() => {
    if (!printing) return undefined;
    let cancelled = false;

    const hiddenContainer = document.createElement('div');
    hiddenContainer.style.cssText = 'position:fixed; left:-9999px; top:0; width:100%; height:100%; opacity:0; pointer-events:none;';
    document.body.appendChild(hiddenContainer);

    const iframe = document.createElement('iframe');
    iframe.style.cssText = 'position:fixed; left:-9999px; top:0; width:100%; height:100%; opacity:0; pointer-events:none;';
    document.body.appendChild(iframe);

    const done = () => {
      setPrinting(false);
      if (hiddenContainer.parentNode) {
        hiddenContainer.parentNode.removeChild(hiddenContainer);
      }
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };
    window.addEventListener('afterprint', done);

    (async () => {
      try {
        /* Wait for fonts to load */
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch { /* unsupported */ }
        }
        if (cancelled) return;

        /* Render labels in hidden container using ReactDOM */
        const { createRoot } = await import('react-dom/client');
        const root = createRoot(hiddenContainer);

        const geometry = labelGeometry(format2up, run.page, bar);
        const sheetsHTML = sheets.map((sheetLabels) => {
          if (isZpl90x68) {
            const item = sheetLabels[0];
            return (
              <div key={item.key} className="sheet" style={{ width: '90mm', height: '68mm', boxSizing: 'border-box', overflow: 'hidden' }}>
                <GrcZplLabelPreview row={item.row} config={zplConfig} isPrint={true} />
              </div>
            );
          }

          const sheetContent = sheetLabels.map(({ key, row }) => {
            const labelData = labelFor(row);
            return <Label key={key} label={labelData} geometry={geometry} idSpacing={idSpacing} />;
          });

          return <div key={sheetLabels[0]?.key || 'sheet'} className="sheet">{sheetContent}</div>;
        });

        root.render(<>{sheetsHTML}</>);

        /* Wait for React to mount and JsBarcode to draw */
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (cancelled) return;

        /* Check if all barcodes are drawn in hidden container */
        const drawn = Array.from(hiddenContainer.querySelectorAll('svg[data-barcode]'));
        const blank = drawn.filter((svg) => {
          const box = svg.getBoundingClientRect();
          return !svg.firstChild || box.width < 1 || box.height < 1;
        });

        const wanted = wantedRef.current;
        if (drawn.length !== wanted || blank.length) {
          /* Refusing to open the dialog is the point. A run that is short a
             label, or carries an empty box where a barcode should be,
             produces stickers that cannot be scanned and goods that cannot be
             found - and the operator would have no way of knowing until the
             till. */
          setNotice(
            'Printing stopped: ' + drawn.length + ' of ' + wanted +
            ' barcodes were drawn' + (blank.length ? ', ' + blank.length + ' of them empty' : '') +
            '. Nothing was sent to the printer.'
          );
          setPrinting(false);
          printInFlightRef.current = false;
          if (hiddenContainer.parentNode) {
            hiddenContainer.parentNode.removeChild(hiddenContainer);
          }
          if (iframe.parentNode) {
            iframe.parentNode.removeChild(iframe);
          }
          return;
        }

        /* Copy the rendered HTML (with drawn barcodes) to iframe */
        const doc = iframe.contentDocument || iframe.contentWindow.document;
        doc.open();

        let pageRule = '';
        let sheetCss = '';

        if (isZpl90x68) {
          pageRule = '@page { size: 90mm 68mm; margin: 0; }';
          sheetCss = `
            @page {
              size: 90mm 68mm;
              margin: 0;
            }
            .sheet {
              width: 90mm !important;
              height: 68mm !important;
              max-width: 90mm !important;
              max-height: 68mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
              page-break-after: always !important;
              break-after: page !important;
              page-break-inside: avoid !important;
              break-inside: avoid !important;
              margin: 0 !important;
              padding: 0 !important;
            }
            .sheet:last-child {
              page-break-after: auto !important;
              break-after: auto !important;
            }
            .zpl-label-preview {
              border: none !important;
              box-shadow: none !important;
              width: 90mm !important;
              height: 68mm !important;
              max-width: 90mm !important;
              max-height: 68mm !important;
              margin: 0 !important;
              padding: 3mm 4mm !important;
              box-sizing: border-box !important;
              overflow: hidden !important;
            }
          `;
        } else {
          pageRule = `@page { size: ${isStock ? paperW + 'mm ' + paperH + 'mm' : 'A4'}; margin: ${isStock ? '0' : '5mm'}; }`;
          sheetCss = isStock
            ? `
              @page {
                size: ${paperW}mm ${paperH}mm;
                margin: 0;
              }
              .sheet {
                width: ${paperW}mm !important;
                height: ${paperH}mm !important;
                max-width: ${paperW}mm !important;
                max-height: ${paperH}mm !important;
                display: flex !important;
                flex-direction: row !important;
                align-items: center !important;
                justify-content: flex-start !important;
                padding: 0 2mm !important;
                box-sizing: border-box !important;
                overflow: hidden !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
            `
            : `
              @page {
                size: A4;
                margin: 5mm;
              }
              .sheet {
                display: grid !important;
                grid-template-columns: repeat(${run.perRow}, ${run.size.w}mm) !important;
                grid-auto-rows: ${run.size.h}mm !important;
                column-gap: ${run.gapMm}mm !important;
                row-gap: ${run.gapMm}mm !important;
                justify-content: center !important;
                align-content: start !important;
                width: ${paperW - 10}mm !important;
                margin: 0 auto !important;
                overflow: hidden !important;
                page-break-after: always !important;
                break-after: page !important;
                page-break-inside: avoid !important;
                break-inside: avoid !important;
              }
              .sheet:last-child {
                page-break-after: auto !important;
                break-after: auto !important;
              }
            `;
        }

        doc.write(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Barcode Print</title>
  <style>
    ${pageRule}
    *, *::before, *::after {
      box-sizing: border-box;
    }
    html, body {
      margin: 0 !important;
      padding: 0 !important;
      background: #fff !important;
      -webkit-print-color-adjust: exact !important;
      print-color-adjust: exact !important;
      font-family: Arial, Helvetica, sans-serif !important;
      ${isZpl90x68 ? 'width: 90mm !important;' : ''}
    }
    @media print {
      html, body {
        margin: 0 !important;
        padding: 0 !important;
        background: #fff !important;
        -webkit-print-color-adjust: exact !important;
        print-color-adjust: exact !important;
      }
      .print-doc, .sheet, .barcode-label, .zpl-label-preview {
        visibility: visible !important;
      }
      .sheet * {
        visibility: visible !important;
      }
    }
    ${sheetCss}
    .print-doc {
      display: block !important;
      visibility: visible !important;
      width: 100% !important;
    }
    .barcode-label {
      border: none !important;
      outline: none !important;
      break-inside: avoid !important;
      page-break-inside: avoid !important;
      visibility: visible !important;
      flex-shrink: 0 !important;
    }
    svg[data-barcode] {
      display: block !important;
      width: 100% !important;
      height: 100% !important;
      visibility: visible !important;
    }
  </style>
</head>
<body class="print-doc">
  <div class="print-doc">
    ${hiddenContainer.innerHTML}
  </div>
</body>
</html>`);
        doc.close();

        /* Wait for iframe to render and fonts/DOM to paint */
        await new Promise((resolve) => setTimeout(resolve, 300));
        if (cancelled) return;

        setNotice('');
        iframe.contentWindow.focus();
        iframe.contentWindow.print();

        /* Wait for afterprint event */
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!cancelled) {
          setPrinting(false);
          printInFlightRef.current = false;
        }
      } catch (failure) {
        /* Without this the run could end with `printing` stuck true - which
           leaves printing-labels welded to <body>, and every LATER print
           anywhere in the application comes out blank. */
        console.error('Barcode label print failed', failure);
        setNotice('Printing stopped: the label sheet could not be prepared. Nothing was sent to the printer.');
        setPrinting(false);
        if (hiddenContainer.parentNode) {
          hiddenContainer.parentNode.removeChild(hiddenContainer);
        }
        if (iframe.parentNode) {
          iframe.parentNode.removeChild(iframe);
        }
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
      if (hiddenContainer.parentNode) {
        hiddenContainer.parentNode.removeChild(hiddenContainer);
      }
      if (iframe.parentNode) {
        iframe.parentNode.removeChild(iframe);
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printing]);

  /* the run is over - printed, refused or abandoned - so the next click may
     start one */
  useEffect(() => {
    if (!printing) printInFlightRef.current = false;
  }, [printing]);

  /* The BATCH rows Print Labels has to ask about. pendingBatchRows already
     leaves out a batch barcode with no quantity recorded - no count can ever
     be valid for it, so asking would stop the whole GRC from printing. It
     prints 0 labels and the panel says why. */
  function askable(counts) {
    return pendingBatchRows(printable, counts);
  }

  function askFor(row, continueToPrint) {
    setPrompt({ key: labelKey(row), continueToPrint });
  }

  /* Counted from the counts about to be committed rather than from `counted`,
     which still holds the previous render's copies at this point. */
  function requestPrint(counts) {
    if (printInFlightRef.current) return;
    const total = withLabelCounts(printable, counts).reduce((sum, row) => sum + row.copies, 0);
    if (total === 0) {
      setNotice('Nothing to print: no barcode on this GRC has a label to print.');
      return;
    }
    printInFlightRef.current = true;
    setNotice('');
    wantedRef.current = total;
    setPrinting(true);
  }

  /* event.detail counts the clicks of one gesture, so the second click of a
     double click arrives with detail 2 - and it is not a second request.
     printInFlightRef alone cannot stop it: window.print() blocks while the
     print dialog is open, the guard is released when it returns, and a
     second click that queued up behind the dialog then opened it again.
     A single click is detail 1 and keyboard activation detail 0, so both
     still print. */
  function startPrint(event) {
    if (event?.detail > 1) return;
    if (printInFlightRef.current) return;
    setNotice('');
    const pending = askable(batchCounts);
    if (pending.length) {
      askFor(pending[0], true);
      return;
    }
    requestPrint(batchCounts);
  }

  /* The dialog only calls this with a value validateBatchLabelCount has
     accepted. The next counts are built here and handed on, so the pending
     check and the print total both see the answer just given rather than the
     state from before it. */
  function confirmPrompt(value) {
    if (!prompt) return;
    const next = { ...batchCounts, [prompt.key]: value };
    setBatchCounts(next);
    if (!prompt.continueToPrint) {
      setPrompt(null);
      return;
    }
    const pending = askable(next);
    if (pending.length) {
      askFor(pending[0], true);
      return;
    }
    setPrompt(null);
    requestPrint(next);
  }

  /* Cancel at any point prints nothing. Counts already confirmed earlier in
     the same chain were valid answers and stay set - the panel shows them and
     they can be changed there. */
  function cancelPrompt() {
    setPrompt(null);
  }

  /* Nothing is rendered until the real data has arrived. */
  if (error) return <div className="p-6 text-sm text-red-600">{error}</div>;
  if (!data) return <div className="p-6 text-sm text-slate-500">Loading GRC data...</div>;

  const pendingCount = askable(batchCounts).length;
  const promptRow = prompt ? printable.find((row) => labelKey(row) === prompt.key) : null;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* Not printed, so the GRC number may stay here as a reminder of which
          GRC is on screen. The supplier code is gone: it has no place on this
          page now that no label carries it. */}
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 shadow-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-xs font-semibold text-slate-700">
            {totalLabels} label(s) &middot; GRC {data.grc?.grcNumber}
            {pendingCount > 0
              ? ` · ${pendingCount} batch barcode${pendingCount === 1 ? '' : 's'} awaiting count`
              : ''}
          </span>

          <label className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 ml-2">
            Printer:
            <select
              value={printerMode}
              onChange={(e) => {
                setPrinterMode(e.target.value);
                setZplNotice('');
              }}
              className="rounded border border-slate-300 bg-white px-2.5 py-1 text-xs font-semibold text-slate-800 shadow-2xs"
            >
              <option value="browser">Standard Browser Printer (HTML/PDF)</option>
              <option value="zpl_90x68">Zebra / ZPL Thermal Printer (90×68 mm)</option>
            </select>
          </label>

          {printerMode === 'zpl_90x68' && (
            <button
              type="button"
              onClick={() => setShowZplConfigModal(true)}
              className="inline-flex items-center gap-1 rounded border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-100"
              title="Configure 90×68 mm ZPL Printer Settings"
            >
              <Icon name="printer" size={13} />
              <span>⚙ Settings</span>
            </button>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {printerMode === 'browser' ? (
            <>
              {/* The same two choices the Barcode Generation picker offers, read
                  from the same catalog, so one GRC prints the same physical label
                  from either screen. */}
              <label className="flex items-center gap-1 text-xs text-slate-600">
                Label
                <select
                  value={formatName}
                  onChange={(event) => setFormatName(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  {formats.length === 0 && <option value="">Default 50 x 40 mm</option>}
                  {formats.map((f) => <option key={f.name} value={f.name}>{f.name}</option>)}
                </select>
              </label>

              <label className="flex items-center gap-1 text-xs text-slate-600">
                Paper
                <select
                  value={paper}
                  onChange={(event) => setPaper(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="stock">
                    {stockSize ? 'Label stock ' + format.pageSize : 'Label stock'}
                  </option>
                  <option value="a4">A4 sheet</option>
                </select>
              </label>

              <label className="flex items-center gap-1 text-xs text-slate-600">
                Barcode
                <select
                  value={barProfile}
                  onChange={(event) => setBarProfile(event.target.value)}
                  className="rounded border border-slate-300 px-2 py-1 text-xs"
                >
                  <option value="standard">Standard (full size)</option>
                  <option value="tsc_te310">TSC TE310 (compact)</option>
                </select>
              </label>

              <button
                type="button"
                onClick={() => setShowPicker(true)}
                className="rounded border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-2xs hover:bg-slate-50"
                title="Choose which barcodes to print, with preview"
              >
                Print Label Picker
              </button>

              <button
                type="button"
                disabled={printing}
                onClick={startPrint}
                className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
              >
                {printing ? 'Preparing...' : 'Print Labels'}
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleDownloadZplPrn}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                title="Download .PRN / .ZPL file to send directly to your Zebra / Boxp printer"
              >
                <Icon name="download" size={14} />
                <span>Download .PRN File</span>
              </button>

              <button
                type="button"
                onClick={handleBrowserPrintPreview}
                disabled={printing}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 shadow-xs"
                title="Preview in Browser Print Dialog (Chrome window.print)"
              >
                <Icon name="printer" size={14} />
                <span>{printing ? 'Preparing...' : 'Browser Preview'}</span>
              </button>

              <button
                type="button"
                disabled={directPrinting}
                onClick={handleDirectZplPrint}
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand px-4 py-1.5 text-xs font-bold text-white shadow-xs hover:bg-brand-dark disabled:opacity-60"
                title="Print directly to connected Boxp BP 4304e printer via Windows Spooler"
              >
                <Icon name="printer" size={14} />
                <span>{directPrinting ? 'Sending to Boxp...' : 'Direct Print (90×68 mm)'}</span>
              </button>
            </>
          )}

          {/* Close (21-10-2026): back to the GRC list - screen only, the
              whole toolbar is no-print */}
          <button
            type="button"
            className="btn border-danger bg-danger text-white hover:border-[#9f1d17] hover:bg-[#9f1d17]"
            title="Close"
            aria-label="Close"
            onClick={() => router.push('/admin/transaction/purchase/grc')}
          >
            <Icon name="x" size={16} />
          </button>
        </div>
      </div>

      {zplNotice && (
        <div className={`no-print mb-4 flex items-center justify-between rounded-md p-3 text-xs font-medium ${
          zplNotice.startsWith('❌') || zplNotice.startsWith('⚠️')
            ? 'border border-red-300 bg-red-50 text-red-800'
            : 'border border-emerald-300 bg-emerald-50 text-emerald-800'
        }`}>
          <span>{zplNotice}</span>
          <button type="button" onClick={() => setZplNotice('')} className="font-bold ml-2 text-slate-400">×</button>
        </div>
      )}

      {notice && (
        <p className="no-print mb-4 rounded border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          {notice}
        </p>
      )}

      {/* BATCH barcodes. A batch barcode stands for the whole received
          quantity, so how many stickers it needs is the admin's call - asked
          here, or by Print Labels for any still unanswered. */}
      {batchRows.length > 0 && (
        <div className="no-print mb-4 rounded border border-slate-300 bg-slate-50 p-3">
          <div className="mb-2 text-xs font-semibold text-slate-700">Batch barcodes</div>
          <ul className="divide-y divide-slate-200">
            {batchRows.map((row) => {
              const noQuantity = batchAvailableQty(row) === 0;
              return (
                <li key={row._id} className="flex items-center gap-3 py-1.5 text-xs">
                  {/* the value exactly as the label encodes and prints it */}
                  <span className="font-mono font-semibold normal-case">{toLabelData(row).barcode}</span>
                  <span className="min-w-0 flex-1 truncate text-slate-600">{toLabelData(row).description}</span>
                  {noQuantity ? (
                    <span className="text-red-700">No quantity recorded - cannot print</span>
                  ) : (
                    <>
                      <span className={row.copies > 0 ? 'text-slate-700' : 'text-amber-700'}>
                        {row.copies > 0 ? `${row.copies} label${row.copies === 1 ? '' : 's'}` : 'not set'}
                      </span>
                      <button
                        type="button"
                        onClick={() => askFor(row, false)}
                        className="rounded border border-slate-300 bg-white px-2 py-1 font-medium text-slate-700 hover:bg-slate-100"
                      >
                        {row.copies > 0 ? 'Change' : 'Set quantity'}
                      </button>
                    </>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {printable.length === 0 ? (
        <p className="no-print text-sm text-slate-400">
          No barcodes have been generated for this GRC yet.
        </p>
      ) : totalLabels === 0 ? (
        <p className="no-print text-sm text-slate-400">
          {pendingCount > 0
            ? 'No labels on the sheet yet - set a label quantity for the batch barcodes above.'
            : 'Nothing to print for this GRC.'}
        </p>
      ) : printerMode === 'zpl_90x68' ? (
        <div className="flex flex-col items-center">
          {counted.length > 1 && (
            <div className="mb-3 flex items-center justify-between w-full max-w-[90mm] text-xs text-slate-600 px-1">
              <span>
                Label <strong>{zplPreviewIndex + 1}</strong> of <strong>{counted.length}</strong>
              </span>
              <div className="flex gap-1.5">
                <button
                  type="button"
                  disabled={zplPreviewIndex <= 0}
                  onClick={() => setZplPreviewIndex((p) => Math.max(0, p - 1))}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  &larr; Prev
                </button>
                <button
                  type="button"
                  disabled={zplPreviewIndex >= counted.length - 1}
                  onClick={() => setZplPreviewIndex((p) => Math.min(counted.length - 1, p + 1))}
                  className="rounded border border-slate-300 bg-white px-2 py-0.5 font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40"
                >
                  Next &rarr;
                </button>
              </div>
            </div>
          )}
          <div className="p-4 bg-slate-100 rounded-lg border border-slate-300 overflow-auto max-w-full">
            <GrcZplLabelPreview row={counted[zplPreviewIndex] || counted[0]} config={zplConfig} />
          </div>
        </div>
      ) : (
        /* WHAT IS ON SCREEN IS WHAT IS PRINTED: the same component, the same
           rows, the same format and the same gutter as the print surface
           below. The box scrolls because a sheet of 50mm stickers is wider
           than a narrow window; nothing about the labels themselves changes
           with the viewport. */
        <div className="overflow-auto rounded border border-slate-200 bg-white p-3">
          <GrcBarcodeLabelSheet rows={counted} format={format2up} gap={gap} page={run.page} bar={bar} idSpacing={idSpacing} />
        </div>
      )}

      {/* The picker's own rows are the same barcode records this page prints -
          it filters to the ones carrying a barcode number itself. */}
      <PrintLabelPicker
        rows={data.rows}
        open={showPicker}
        onClose={() => setShowPicker(false)}
      />

      <BatchLabelCountDialog
        open={Boolean(promptRow)}
        barcode={promptRow ? toLabelData(promptRow).barcode : ''}
        description={promptRow ? toLabelData(promptRow).description : ''}
        available={promptRow ? batchAvailableQty(promptRow) : 0}
        initialValue={prompt ? batchCounts[prompt.key] ?? '' : ''}
        onCancel={cancelPrompt}
        onConfirm={confirmPrompt}
      />

      <ZplPrinterConfigModal
        open={showZplConfigModal}
        onClose={() => setShowZplConfigModal(false)}
        onSave={(newCfg) => {
          setZplConfig(newCfg);
          setZplNotice('Printer configuration updated!');
        }}
      />
    </div>
  );
}