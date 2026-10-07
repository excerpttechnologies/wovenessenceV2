'use client';
import { useLayoutEffect, useRef } from 'react';
import JsBarcode from 'jsbarcode';

/* A scannable CODE128 barcode, as an inline SVG.

   This was implemented twice - once in BarcodeLabelSheet.jsx and again in
   app/admin/transaction/purchase/barcode-print/[id]/page.jsx, whose own
   comment flagged the duplication. Both now import this one, and so does
   everything added since (the stock transfer document number, the billing
   document). One implementation means one set of encoding options, so a label
   printed from one screen scans the same as the same label printed from
   another.

   CODE128 because it encodes the full printable ASCII set: the barcode
   numbers this system issues carry a configurable prefix and suffix from the
   Barcode Setting master, and document numbers contain slashes - neither of
   which EAN or UPC can represent.

   JsBarcode is bundled, not loaded from a CDN, so a label still prints when
   the shop's connection is down. */

export default function BarcodeSvg({
  value,
  height = 34,
  width = 1.2,
  displayValue = false,
  fontSize = 12,
  margin = 0,
  /* Blank space either side of the bars, in modules. A scanner needs it to
     find where the symbol starts and ends. Horizontal only - a linear barcode
     has no use for a quiet zone above and below, and JsBarcode's single
     `margin` option would spend that space on height the label cannot spare.
     Left at 0 by default so the document-number callers are unchanged. */
  quietZone = 0,
  /* 'none' lets the bars fill the box on both axes independently.

     JsBarcode writes width, height AND viewBox, and callers then size the
     element with CSS. Under the default 'xMidYMid meet' a box NARROWER than
     the barcode's natural width scales it down UNIFORMLY - the bar height
     shrinks with the width, and a short barcode is a barcode a scanner has
     to be held straight against. 'none' keeps the height the caller asked
     for and only narrows the modules, which stay proportional to each other
     and so stay readable.

     It is opt-in because it also stretches the human-readable text that
     displayValue draws inside the SVG, which the invoice and challan
     documents rely on. They keep the default. */
  preserveAspectRatio = 'xMidYMid meet',
  className = 'block w-full',
}) {
  const ref = useRef(null);

  useLayoutEffect(() => {
    const svg = ref.current;
    if (!svg) return;

    /* Clear first, every time. JsBarcode only empties the element inside its
       own render(), which it never reaches when the value is missing or
       cannot be encoded - so a reused <svg> node kept the PREVIOUS row's
       bars while the human-readable number beside it changed. Two garments
       with mismatched label and barcode is worse than a blank label. */
    while (svg.firstChild) svg.removeChild(svg.firstChild);
    svg.removeAttribute('width');
    svg.removeAttribute('height');
    svg.removeAttribute('viewBox');

    if (!value) return;

    try {
      JsBarcode(svg, String(value), {
        format: 'CODE128',
        displayValue,
        fontSize,
        height,
        width,
        margin,
        /* JsBarcode resolves each side as `marginX || margin`, so a zero here
           correctly falls through to `margin` and the existing callers keep
           the single uniform margin they have always had. */
        marginLeft: quietZone || undefined,
        marginRight: quietZone || undefined,
      });
    } catch {
      /* CODE128 encodes anything printable; if it still throws - an empty
         string, a control character pasted in - leave the svg empty rather
         than taking the whole sheet or screen down with it. */
    }
  }, [value, height, width, displayValue, fontSize, margin, quietZone]);

  /* data-barcode is what the print readiness check counts before it opens
     the dialog - see PrintLabelPicker in GCRBarcodeGeneration.jsx. It is on
     every barcode, not just printed ones, so there is one selector for
     "a barcode that should have drawn" wherever the question comes up. */
  return (
    <svg
      ref={ref}
      data-barcode=""
      preserveAspectRatio={preserveAspectRatio}
      className={className}
    />
  );
}

/* Named export too: BarcodeLabelSheet exported it by name, and its callers
   still import it that way. */
export { BarcodeSvg };
