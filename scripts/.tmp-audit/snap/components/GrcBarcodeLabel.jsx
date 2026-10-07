'use client';
import { useEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';
import { toLabelData, withLabelCounts } from '@/lib/barcodeLabelPrint';

/* ==========================================================================
   GrcBarcodeLabel — the SINGLE label renderer shared by:

     - app/admin/transaction/purchase/barcode-print/[id]/page.jsx
         (the authoritative print output)
     - components/GCRBarcodeGeneration.jsx PrintLabelPicker preview
         (the WYSIWYG preview that must match print exactly)

   This file was extracted from barcode-print/[id]/page.jsx so that future
   changes to the sticker design are automatically reflected in both places.
   The only difference between preview and print is the outer container —
   GrcBarcodeLabelSheet wraps labels in a 2-column grid for both; the print
   page adds print CSS via globals.css (.print-doc) and the picker portals
   the sheet to <body>.

   DATA CONTRACT — every label value comes from toLabelData() (whitelist) +
   the row's own qty text. Nothing outside that contract can reach the paper.
   ========================================================================== */

/* -----------------------------------------------------------------------
   LABEL FIELD MAP
   Controls which toLabelData() key fills LEFT | CENTRE | RIGHT on each row.

     detail row 1   hsn | itemCode | pmf
     detail row 2   encodedCostPrice | qtyWithUnit | wspPrice
     RATE line      sellingPrice  (offerPrice → retailPrice fallback)
----------------------------------------------------------------------- */
export const LABEL_FIELDS = {
  detailRow1: ['hsn', 'itemCode', 'pmf'],
  detailRow2Left: 'encodedCostPrice',
  detailRow2Price: 'wspPrice',
};

/* Every label row sits on one 3-column grid so each value's horizontal
   position is fixed regardless of neighbour lengths. minmax(0, …) prevents
   a long value from widening its own column and displacing the others. */
export const LABEL_ROW =
  'grid grid-cols-[minmax(0,1fr)_minmax(0,1.5fr)_minmax(0,1fr)] items-center gap-x-1';
export const CELL = ['truncate text-left', 'truncate text-center', 'truncate text-right'];

/* -----------------------------------------------------------------------
   labelFor(row) — augments the toLabelData whitelist with qtyWithUnit.
   qty is stored as the operator typed it ("16", "2.50"); the numeric
   quantity from toLabelData is the fallback when that text is blank.
----------------------------------------------------------------------- */
export function labelFor(row) {
  const label = toLabelData(row);
  const qtyText =
    String(row?.qty ?? '').trim() ||
    (label.quantity ? String(label.quantity) : '');
  return { ...label, qtyWithUnit: [qtyText, label.unit].filter(Boolean).join(' ') };
}

/* -----------------------------------------------------------------------
   BarcodeSvg — CODE128 barcode as an inline SVG.
   Uses useEffect (not useLayoutEffect) to match the print page's own
   timing model, which the double-rAF print guard was designed around.
   data-barcode is present so the print readiness check in
   GCRBarcodeGeneration.jsx still counts it.
----------------------------------------------------------------------- */
export function BarcodeSvg({ value }) {
  const svgRef = useRef(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;

    /* Clear before every render — a reused node keeps the previous barcode's
       bars while the number beside it changes, which is worse than blank. */
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('viewBox');

    if (!value) return;

    try {
      JsBarcode(svg, String(value), {
        format: 'CODE128',
        displayValue: false,
        height: 42,
        width: 1.3,
        margin: 0,
      });
    } catch {
      /* JsBarcode throws on characters it cannot encode (empty string, control
         characters). Leave the svg empty rather than taking the sheet down. */
    }
  }, [value]);

  return (
    <svg
      ref={svgRef}
      data-barcode=""
      className="mx-auto block w-full max-w-[190px]"
    />
  );
}

/* -----------------------------------------------------------------------
   Label — one complete printable sticker, layout:

              [ barcode bars ]
              barcode number
     description (up to 2 lines, left-aligned)
     HSN            item code          P-M-F
     encoded PR     qty + unit         wsp price
              RATE : ₹.../-
     (Inclusive all taxes)       DRY WASH ONLY
      No exchange, no guarantee, No Return

   Every block has a fixed height so all labels on a sheet share one
   geometry: a missing field leaves its column blank, a long value is
   cut with an ellipsis, a long description wraps into its 2-line box.

   Accepts the label data object (from labelFor / toLabelData), never
   the raw barcode row, so the whitelist is the only gate to paper.
----------------------------------------------------------------------- */
export function Label({ label }) {
  const detailRow1 = LABEL_FIELDS.detailRow1.map((k) => label[k] ?? '');
  const detailRow2 = [
    label[LABEL_FIELDS.detailRow2Left],
    label.qtyWithUnit,
    label[LABEL_FIELDS.detailRow2Price],
  ];

  return (
    <div className="overflow-hidden px-3 py-2 text-center break-inside-avoid">
      <BarcodeSvg value={label.barcode} />

      {/* The barcode value, exactly as the bars encode it
          (SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY), across the full width so it
          is not cut short. normal-case: globals.css uppercases body text; a
          barcode value is case-sensitive. */}
      <div className="mt-1 h-4 leading-4">
        <span className="block truncate text-center font-mono text-[11px] font-semibold tracking-wide normal-case">
          {label.barcode}
        </span>
      </div>

      {/* Description — up to two lines, left-aligned, slate-600 */}
      <div className="mt-1 h-[2.5em] text-left text-[9px] leading-tight text-slate-600 line-clamp-2 break-words">
        {label.description}
      </div>

      {/* Row 1: HSN | item code | P-M-F */}
      <div className={`${LABEL_ROW} mt-1.5 h-[15px] text-[10px] font-semibold leading-[15px]`}>
        {detailRow1.map((v, i) => (
          <span key={i} className={CELL[i]}>{v}</span>
        ))}
      </div>

      {/* Row 2: encoded cost price | qty + unit | wsp price */}
      <div className={`${LABEL_ROW} mt-1 h-[15px] text-[10px] font-semibold leading-[15px]`}>
        {detailRow2.map((v, i) => (
          <span key={i} className={CELL[i]}>{v}</span>
        ))}
      </div>

      {/* RATE line */}
      <div className="text-[13px] font-extrabold mt-1.5">
        RATE : ₹{label.sellingPrice}/-
      </div>

      {/* Footer row: tax note (left) | DRY WASH ONLY (right) */}
      <div className={`${LABEL_ROW} mt-0.5 h-3 text-[7.5px] leading-3 text-slate-500`}>
        <span className={CELL[0]}>(Inclusive all taxes)</span>
        <span className={CELL[1]} />
        <span className={CELL[2]}>DRY WASH ONLY</span>
      </div>

      {/* No exchange footer — full width, same tiny type */}
      <div className="mt-0.5 h-3 text-[7.5px] leading-3 text-slate-500">
        No exchange, no guarantee, No Return
      </div>

      {/* The same barcode value at the foot: SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY,
          e.g. "G1318 * 05178 * 1 * 16" - identical to the bars and the line
          under them (toLabelData). */}
      {label.labelIdentifier && (
        <div className="mt-0.5 h-3 text-[7.5px] leading-3 text-slate-600 font-semibold normal-case">
          {label.labelIdentifier}
        </div>
      )}
    </div>
  );
}

/* -----------------------------------------------------------------------
   GrcBarcodeLabelSheet — 2-column grid of Label cells, matching the
   barcode-print page layout exactly.

   rows   — array of barcode rows, each carrying `copies` (from withLabelCounts)
   gap    — CSS gap between cells (default '0' — matches print page behaviour)

   Each row is expanded into `copies` identical label cells. The left column
   of each pair gets a dashed right border matching the print page separator.
   The outer wrapper gets print-doc + content-start so it survives @media
   print via globals.css (only .print-doc and its children are visible).
----------------------------------------------------------------------- */
export default function GrcBarcodeLabelSheet({ rows, gap = '0' }) {
  const labels = (rows || []).flatMap((row, ri) => {
    const n = Math.max(0, Math.floor(Number(row.copies) || 0));
    return Array.from({ length: n }, (_, copy) => ({
      key: `${row._id || row.id || ri}-${copy}`,
      label: labelFor(row),
    }));
  });

  if (!labels.length) {
    return (
      <div className="py-6 text-center text-[13px] text-slate-400">
        No labels to display.
      </div>
    );
  }

  return (
    <div
      className="print-doc content-start grid grid-cols-2 print:grid-cols-2"
      style={{ gap }}
    >
      {labels.map(({ key, label }, i) => (
        <div
          key={key}
          className={
            'border-y border-slate-300 ' +
            (i % 2 === 0 ? 'border-r border-dashed border-slate-400' : '')
          }
        >
          <Label label={label} />
        </div>
      ))}
    </div>
  );
}
