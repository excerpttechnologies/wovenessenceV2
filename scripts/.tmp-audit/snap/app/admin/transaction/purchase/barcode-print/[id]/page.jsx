
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
import { useParams } from 'next/navigation';
import BatchLabelCountDialog from '@/components/BatchLabelCountDialog';
import GrcBarcodeLabelSheet, { labelFor } from '@/components/GrcBarcodeLabel';
import {
  LABEL_MODE,
  resolveLabelMode,
  batchAvailableQty,
  withLabelCounts,
  pendingBatchRows,
  labelKey,
  toLabelData,
} from '@/lib/barcodeLabelPrint';

/* Label rendering (BarcodeSvg, Label, labelFor, GrcBarcodeLabelSheet) now
   lives in components/GrcBarcodeLabel.jsx — the single source of truth shared
   with the Barcode Generation preview so both always show the same sticker. */

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

  /* PRINTING HAPPENS EXACTLY ONCE PER USER ACTION.
     window.print() photographs the DOM as it stands at the instant it is
     called. Called straight from a click or confirm handler, it would run
     before React had committed the counts that handler just set, so the paper
     would miss the batch labels the admin had only just asked for. The handler
     therefore only bumps printRequest; the effect below prints after the
     commit.
     printInFlightRef refuses a second request while one is pending, so a
     double Enter in the dialog, or a double click that lands before the
     print, cannot queue a second print dialog (for the second click of a
     double click that lands after it, see startPrint). printedRef remembers
     which request has been printed, so an effect that runs twice for the same
     request (StrictMode, or a re-run after a cancelled frame) still prints
     once. */
  const [printRequest, setPrintRequest] = useState(0);
  const printInFlightRef = useRef(false);
  const printedRef = useRef(0);

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

  /* Two frames: the first lets the commit that carries the updated sheet
     reach the screen, the second lets the browser lay out the SVG bars
     JsBarcode drew in that commit's effects. Only then is the page printed.
     The claim on printedRef is taken inside the frame, at the moment of
     printing - taken earlier, a cleanup that cancelled the frame would leave
     the request marked done and nothing would ever print. */
  useEffect(() => {
    if (!printRequest) return undefined;
    let frame = requestAnimationFrame(() => {
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (printedRef.current === printRequest) return;
        printedRef.current = printRequest;
        try {
          window.print();
        } finally {
          printInFlightRef.current = false;
        }
      });
    });
    return () => {
      if (frame) cancelAnimationFrame(frame);
    };
  }, [printRequest]);

  /* Rows without any barcode number are skipped: there is nothing to encode.
     labelKey is the same key batchCounts is kept under. */
  const printable = useMemo(() => (data?.rows || []).filter((row) => labelKey(row)), [data]);

  /* Every printable row with its sticker count (`copies`) from the shared
     rule - MTR 2, UNIQUE 1, BATCH the admin's validated answer or 0. */
  const counted = useMemo(() => withLabelCounts(printable, batchCounts), [printable, batchCounts]);

  /* THE SHEET - both the on-screen preview and the paper, so it holds
     exactly the copies that will print. Each copy is the same label data: a
     second metre sticker or a twentieth batch sticker is a print copy of the
     same barcode number, never a new barcode, and nothing here writes or
     reserves anything. A BATCH row with no valid count yet has copies 0 and
     so is simply not on the sheet until the admin gives it one. */
  const sheet = useMemo(
    () => counted.flatMap((row) => {
      const label = labelFor(row);
      return Array.from({ length: row.copies }, (_, copy) => ({ key: row._id + '-' + copy, label }));
    }),
    [counted]
  );

  const batchRows = useMemo(
    () => counted.filter((row) => resolveLabelMode(row).mode === LABEL_MODE.BATCH),
    [counted]
  );

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

  /* Counted from the counts about to be committed rather than from `sheet`,
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
    setPrintRequest((n) => n + 1);
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
    <div className="max-w-5xl mx-auto p-6 print:p-0">
      <style jsx global>{`
        @media print {
          .no-print { display: none !important; }
          body { background: white; }
        }
      `}</style>

      {/* Not printed, so the GRC number may stay here as a reminder of which
          GRC is on screen. The supplier code is gone: it has no place on this
          page now that no label carries it. */}
      <div className="no-print flex justify-between items-center mb-4">
        <span className="text-xs text-slate-500">
          {sheet.length} label(s) &middot; GRC {data.grc?.grcNumber}
          {pendingCount > 0
            ? ` · ${pendingCount} batch barcode${pendingCount === 1 ? '' : 's'} awaiting a label count`
            : ''}
        </span>
        <button
          type="button"
          onClick={startPrint}
          className="bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold px-4 py-2 rounded shadow-sm"
        >
          Print Labels
        </button>
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
              const key = labelKey(row);
              const noQuantity = batchAvailableQty(row) === 0;
              return (
                <li key={row._id} className="flex items-center gap-3 py-1.5 text-xs">
                  <span className="font-mono font-semibold normal-case">{key}</span>
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
      ) : sheet.length === 0 ? (
        <p className="no-print text-sm text-slate-400">
          {pendingCount > 0
            ? 'No labels on the sheet yet - set a label quantity for the batch barcodes above.'
            : 'Nothing to print for this GRC.'}
        </p>
      ) : (
        /* GrcBarcodeLabelSheet renders the same 2-column grid + Label cells as
           before, now from the shared component so print and preview are
           always in sync. print-doc + content-start live inside the sheet so
           globals.css keeps the labels visible at print time. */
        <GrcBarcodeLabelSheet rows={counted} />
      )}

      <BatchLabelCountDialog
        open={Boolean(promptRow)}
        barcode={prompt?.key || ''}
        description={promptRow ? toLabelData(promptRow).description : ''}
        available={promptRow ? batchAvailableQty(promptRow) : 0}
        initialValue={prompt ? batchCounts[prompt.key] ?? '' : ''}
        onCancel={cancelPrompt}
        onConfirm={confirmPrompt}
      />
    </div>
  );
}
