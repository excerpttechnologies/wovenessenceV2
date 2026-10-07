
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
import { createPortal } from 'react-dom';
import { useParams } from 'next/navigation';
import BatchLabelCountDialog from '@/components/BatchLabelCountDialog';
import GrcBarcodeLabelSheet from '@/components/GrcBarcodeLabel';
import useBarcodeLabelFormat from '@/components/useBarcodeLabelFormat';
import { labelRun } from '@/lib/barcodeLabelGeometry';
import {
  LABEL_MODE,
  resolveLabelMode,
  batchAvailableQty,
  withLabelCounts,
  pendingBatchRows,
  labelKey,
  toLabelData,
} from '@/lib/barcodeLabelPrint';

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

  /* The sticker stock, and the paper it is printed on. A4 is the default
     because that is what a desktop printer and "Microsoft Print to PDF" are
     loaded with; the stock option makes the page one physical sheet of
     labels, which is what a label printer feeds. */
  const { formats, format, formatName, setFormatName } = useBarcodeLabelFormat(true);
  const [paper, setPaper] = useState('a4');

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
  const printRootRef = useRef(null);
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

  /* The page the sheet is printed on, and the gutter between stickers: a cut
     line's worth on A4 that somebody has to guillotine, none on die-cut stock
     where the sheet IS the page and the extra millimetre would push the last
     column off the paper. Both from the shared geometry module, so this page
     and the picker cannot disagree about either. */
  /* ONE call, so this page and the Barcode Generation picker cannot arrive
     at two different sheets from one format. labelRun fits the labels inside
     the page's PRINTABLE width - the sheet less the unprintable edge the
     printer's grippers take - which is what stops the leading sticker's
     barcode number being clipped on stock. */
  const run = labelRun(format, paper);
  const { gap, pageRule, stockSize } = run;

  /* THE PRINT RUN. The body class is what arms the label print rules in
     globals.css: everything that is not the print surface leaves the BOX TREE
     - not merely hidden - so the admin shell cannot paginate blank sheets,
     and the sheet stays in normal flow so it fragments across as many pages
     as it needs. Removed in the cleanup below, so there is no state to unwind
     by hand. */
  useEffect(() => {
    if (!printing) return undefined;
    let cancelled = false;

    document.body.classList.add('printing-labels');
    const done = () => setPrinting(false);
    window.addEventListener('afterprint', done);

    (async () => {
      try {
        /* Fonts first. The number, the price and the description are text;
           print before the face has loaded and they are measured with
           fallback metrics and re-flow inside a fixed-size sticker. */
        if (document.fonts && document.fonts.ready) {
          try { await document.fonts.ready; } catch { /* unsupported - the frames below still gate on layout */ }
        }
        if (cancelled) return;

        /* Two frames: the first lets React's commit reach the screen, the
           second lets the browser lay out the SVG bars JsBarcode drew during
           that commit. */
        await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
        if (cancelled) return;

        const root = printRootRef.current;
        const drawn = root ? Array.from(root.querySelectorAll('svg[data-barcode]')) : [];
        const blank = drawn.filter((svg) => {
          const box = svg.getBoundingClientRect();
          return !svg.firstChild || box.width < 1 || box.height < 1;
        });

        const wanted = wantedRef.current;
        if (!root || drawn.length !== wanted || blank.length) {
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
          return;
        }

        setNotice('');
        window.print();

        /* afterprint is the signal that the dialog is finished with, and in
           every current browser print() has already blocked until then. The
           frame below is the belt to that braces: it hands control back once
           more so a browser whose print() returns EARLY still has its
           afterprint delivered first, and the sheet is never pulled out from
           under a dialog that is still reading it. */
        await new Promise((resolve) => requestAnimationFrame(resolve));
        if (!cancelled) setPrinting(false);
      } catch (failure) {
        /* Without this the run could end with `printing` stuck true - which
           leaves printing-labels welded to <body>, and every LATER print
           anywhere in the application comes out blank. */
        console.error('Barcode label print failed', failure);
        setNotice('Printing stopped: the label sheet could not be prepared. Nothing was sent to the printer.');
        setPrinting(false);
      }
    })();

    return () => {
      cancelled = true;
      window.removeEventListener('afterprint', done);
      document.body.classList.remove('printing-labels');
    };
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
      <div className="no-print mb-4 flex flex-wrap items-center justify-between gap-3">
        <span className="text-xs text-slate-500">
          {totalLabels} label(s) &middot; GRC {data.grc?.grcNumber}
          {pendingCount > 0
            ? ` · ${pendingCount} batch barcode${pendingCount === 1 ? '' : 's'} awaiting a label count`
            : ''}
        </span>

        <div className="flex flex-wrap items-center gap-2">
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
              <option value="a4">A4 sheet</option>
              <option value="stock" disabled={!stockSize}>
                {stockSize ? 'Label stock ' + format.pageSize : 'Label stock (no size set)'}
              </option>
            </select>
          </label>

          <button
            type="button"
            disabled={printing}
            onClick={startPrint}
            className="rounded bg-indigo-600 px-4 py-2 text-xs font-semibold text-white shadow-sm hover:bg-indigo-700 disabled:opacity-60"
          >
            {printing ? 'Preparing...' : 'Print Labels'}
          </button>
        </div>
      </div>

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
      ) : (
        /* WHAT IS ON SCREEN IS WHAT IS PRINTED: the same component, the same
           rows, the same format and the same gutter as the print surface
           below. The box scrolls because a sheet of 50mm stickers is wider
           than a narrow window; nothing about the labels themselves changes
           with the viewport. */
        <div className="overflow-auto rounded border border-slate-200 bg-white p-3">
          <GrcBarcodeLabelSheet rows={counted} format={format} gap={gap} page={run.page} />
        </div>
      )}

      <BatchLabelCountDialog
        open={Boolean(promptRow)}
        barcode={promptRow ? toLabelData(promptRow).barcode : ''}
        description={promptRow ? toLabelData(promptRow).description : ''}
        available={promptRow ? batchAvailableQty(promptRow) : 0}
        initialValue={prompt ? batchCounts[prompt.key] ?? '' : ''}
        onCancel={cancelPrompt}
        onConfirm={confirmPrompt}
      />

      {/* THE PRINT SURFACE.

          Portaled to <body> so it is a sibling of the application rather than
          a descendant of this page - the same arrangement the Barcode
          Generation picker prints through, and for the same reason: at <body>
          level the sheet is ordinary in-flow content that fragments across as
          many pages as it needs, while the @media print rules in globals.css
          take the rest of the application out of the box tree so not one
          sheet of paper is spent on it.

          Mounted only for the duration of a run, so nothing is duplicated on
          screen or on paper at any other time. */}
      {printing && typeof document !== 'undefined' && createPortal(
        <div id="barcode-print-root" ref={printRootRef}>
          <style>{pageRule}</style>
          <GrcBarcodeLabelSheet rows={counted} format={format} gap={gap} page={run.page} />
        </div>,
        document.body
      )}
    </div>
  );
}
