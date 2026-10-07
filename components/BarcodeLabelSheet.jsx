'use client';
import BarcodeSvg from './BarcodeSvg';
import { toLabelData } from '@/lib/barcodeLabelPrint';
import { encodedBarcodeValue } from '@/lib/barcodeValue';
import { parseSize } from '@/lib/barcodeLabelGeometry';

/* ==========================================================================
   A printable sheet of barcode labels.

   Geometry comes from the chosen Barcode Label Setting - the seeded catalog
   rows carry labelSize ("50 x 40 mm") and stickerInRow (2), so a format
   change re-lays the sheet without touching this file.

   Sizes are set in millimetres rather than pixels: a label has to come out
   of the printer at its real size, and mm is the one CSS unit that survives
   the browser's print scaling intact.

   The barcode itself now comes from ./BarcodeSvg, which is the single
   implementation shared with the print page, the stock transfer document
   number and the billing document - it used to be written out twice.
   ========================================================================== */

/* Re-exported so the screens that already import { BarcodeSvg } or
   { parseSize } from this file keep working unchanged. parseSize ("50 x 40
   mm" -> { w: 50, h: 40 }) is the one in lib/barcodeLabelGeometry.js, which
   the GRC label sizes itself with - this file used to carry a copy of it. */
export { BarcodeSvg, parseSize };

/* One label.

   Rows may come from a barcode row (which carries a generated barcode and
   GRC pricing) or from the item master (which does not). Every value on the
   sticker is read through toLabelData (lib/barcodeLabelPrint.js), the label
   data contract, which WHITELISTS what a label may carry - so whatever else
   a row happens to hold never reaches the paper.

   WHAT IS ON IT, and why. The label is the only thing that travels with the
   goods, so it carries what identifies the piece at the counter:

     barcode + number   the scannable reference, and the same number in
                        human-readable form for when a label is damaged
     description        what it is
     quantity           essential on a BATCH label, where one barcode stands
                        for several pieces or several metres - without it,
                        nobody can tell a 5-metre label from a 1-metre one
     RSP / CP           the selling price, and the cost the existing design
                        prints beside it

   What is deliberately NOT on it: the supplier, the supplier's code, the GRC
   it arrived on and the bill serial. They are purchase records - kept on the
   barcode row, the GRC and the reports - and are left out of the label DATA,
   not merely hidden, so they cannot resurface in a preview, a print or a PDF.

   A label is small. Everything below the barcode is rendered only when the
   row actually carries it, and the tiny print scales with the label height,
   so a 25mm sticker drops to essentials while a 50mm one shows the lot -
   rather than a fixed layout that overflows on the small stock. */
export function Label({ row, w, h }) {
  const label = toLabelData(row);
  /* THE value the bars encode, and the one string printed under them - so
     the image and the text can never differ. It is the record's composed
     value in its canonical spelling ("G1318*05178*1*1"), the same string the
     GRC label encodes, or for a barcode made before composed values existed
     its own number (lib/barcodeValue.js encodedBarcodeValue). Only a row
     with neither - an item-master row that has never been through Barcode
     Generation - falls back to its item code. */
  const code = encodedBarcodeValue(row) || String(row?.itemCode || '');
  const rate = label.sellingPrice;
  const cost = label.costPrice;
  const desc = label.description;
  const qty = label.quantity;
  const uom = label.unit;
  const isBatch = label.isBatch;

  /* Room for the CP only exists on a taller sticker. */
  const roomy = h >= 30;
  const barcodeHeight = Math.max(14, Math.round(h * (roomy ? 0.5 : 0.62)));

  return (
    <div
      data-label=""
      className="barcode-label flex flex-col items-center justify-center overflow-hidden border border-dashed border-[#d5dce8] px-1 text-center leading-tight"
      style={{ width: w + 'mm', height: h + 'mm' }}
    >
      {/* quietZone is the blank run either side of the bars that tells a
          scanner where the symbol starts and ends - ten modules is what
          CODE128 asks for. It matters here and not on a document number,
          because on a sticker the bars otherwise run to the very edge.

          preserveAspectRatio="none" keeps the bars the height this label
          budgeted for them. Under the default, a barcode wider than the
          sticker is scaled down on BOTH axes, and the lost height is what
          makes a label need a second pass under the scanner. */}
      {code && (
        <BarcodeSvg
          value={code}
          height={barcodeHeight}
          quietZone={10}
          preserveAspectRatio="none"
        />
      )}

      {/* normal-case: globals.css uppercases every text node under <body>.
          On any other line that is only a house style, but this line is the
          fallback a human types in when the bars will not scan - and CODE128
          is case-sensitive. Printing "tf25a" as "TF25A" would send the
          storekeeper looking for a barcode that does not exist. */}
      <div className="w-full truncate font-mono text-[7pt] font-semibold normal-case">
        {code}
      </div>

      {desc && (
        <div className="w-full truncate text-[6pt] text-[#46556f]">{desc}</div>
      )}

      {/* The quantity earns its line in two cases.

          A BATCH label, because one barcode stands for several units and
          nothing else on the sticker says how many.

          And ANY length-measured label, batch or not: a unique piece label
          carries quantity 1 and can safely leave it off, but a unique CUT of
          cloth is one barcode for 12.65 metres, and a roll with no length on
          it is worth nothing at the counter.

          "(batch)" still marks only the batch case - it is what warns the
          storekeeper that this one label covers more than one item. */}
      {qty > 0 && (isBatch || isLength(uom)) && (
        <div className="w-full truncate text-[7pt] font-bold">
          {trimQty(qty)} {uom}
          {isBatch && <span className="ml-[0.6mm] font-normal text-[#46556f]">(batch)</span>}
        </div>
      )}

      {/* Number.isFinite, not a truthiness check: a price that arrived from an
          Excel import as text prints "NaN" through toFixed, and a sticker
          reading "Rs NaN" goes on the shop floor. No price at all is the
          honest output when there is no price. */}
      {Number.isFinite(Number(rate)) && rate !== '' && rate !== null && (
        <div className="flex w-full items-baseline justify-center gap-[1mm]">
          <span className="text-[8pt] font-extrabold">
            &#8377;{Number(rate).toFixed(2)}
          </span>
          {roomy && Number.isFinite(Number(cost)) && Number(cost) > 0 && (
            <span className="text-[5.5pt] text-[#5a6c88]">CP {Number(cost).toFixed(2)}</span>
          )}
        </div>
      )}
    </div>
  );
}

/* Goods sold by length rather than by the piece. Matched on the unit's text
   because that is all a row carries - MTR, MTRS, METER, METRE all appear in
   this data. */
function isLength(uom) {
  return /mtr|met/i.test(String(uom || ''));
}

/* 5 rather than 5.000, but 2.5 stays 2.5 - a metre label has to be exact. */
function trimQty(v) {
  const n = Number(v) || 0;
  return Number.isInteger(n) ? String(n) : n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '');
}

/* Expands each row by its `copies` - on the Barcode Generation screen that
   count comes from getLabelPrintCount (lib/barcodeLabelPrint.js) - and lays
   the result out in a grid `stickerInRow` wide. Every copy of a row is the
   same row, so the same barcode number. */
export default function BarcodeLabelSheet({ rows, format, gap = '1mm' }) {
  const { w, h } = parseSize(format?.labelSize);
  const perRow = Math.max(1, Number(format?.stickerInRow) || 1);

  const labels = rows.flatMap((r, ri) => {
    const n = Math.max(0, Math.floor(Number(r.copies) || 0));
    return Array.from({ length: n }, (_, i) => ({ row: r, key: ri + '-' + i }));
  });

  if (!labels.length) {
    return (
      <div className="py-10 text-center text-[13px] text-inkmuted">
        Every row has Barcode Copies set to 0 - nothing to print.
      </div>
    );
  }

  return (
    <div
      className="print-doc mx-auto"
      style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(' + perRow + ', ' + w + 'mm)',
        gridAutoRows: h + 'mm',
        /* A gutter is right on a sheet of paper that gets cut, and wrong on
           die-cut sticker stock where the sheet IS the page - there the extra
           millimetre pushes the last column off the edge of the label. */
        gap,
        justifyContent: 'center',
        /* Without this the implicit rows stretch to fill whatever height the
           sheet is given, and a single row of labels comes out a full page
           tall with the cut line running the length of the paper. The print
           page had to work around exactly this
           (barcode-print/[id]/page.jsx: "content-start goes with it"); doing
           it here fixes it for every caller. */
        alignContent: 'start',
      }}
    >
      {labels.map(({ row, key }) => <Label key={key} row={row} w={w} h={h} />)}
    </div>
  );
}
