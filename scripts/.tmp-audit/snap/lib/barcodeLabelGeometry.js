/* ==========================================================================
   THE PHYSICAL GEOMETRY OF A BARCODE LABEL.

   A barcode label is a printed object, not a card on a web page. Its width
   and height come from the barcode label catalog (labelSize "50 x 40 mm",
   stickerInRow 2) and everything on it is laid out in MILLIMETRES - the one
   CSS unit that survives the browser's print pipeline at its real size.

   Pure and client-safe, and deliberately not in a .jsx file: the numbers
   below decide whether a sticker can be scanned, so they are testable on
   their own (scripts/testGrcBarcodeLabel.mjs) rather than only observable
   by printing one.

   ---------------------------------------------------------------- why ----
   The GRC label used to be laid out in px inside a box with no size of its
   own, so a label was as wide as whatever container it landed in - about
   100mm on A4 for a 50mm sticker - and the bars were squeezed into a fixed
   190px box under the DEFAULT preserveAspectRatio, which scales BOTH axes:
   a 22-character CODE128 value is 277 modules and 360px wide at the encoder
   settings used, so it came back at 53% and the 42px bar height collapsed to
   22px. Short bars at a sub-dot module width is what "the barcode is
   missing / half printed / will not scan" looks like coming off a printer.
   ========================================================================== */

/* "50 x 40 mm" -> { w: 50, h: 40 }. Falls back to a sane default rather than
   rendering a zero-sized label when a catalog row is missing its sizes - the
   seeded catalog is not self-consistent ('RT 72 x 116 mm' declares a label
   size of "0 x 0 mm"). */
export function parseSize(text, fallback = { w: 50, h: 40 }) {
  const m = String(text || '').match(/(\d+(?:\.\d+)?)\s*[x×]\s*(\d+(?:\.\d+)?)/i);
  if (!m) return fallback;
  const w = Number(m[1]);
  const h = Number(m[2]);
  if (!w || !h) return fallback;
  return { w, h };
}

/* THE EIGHT SECTIONS of the GRC label, as fractions of its usable height:

     1 barcode graphic
     2 barcode identifier        number | secondary reference
     3 product description       two lines
     4 product information       HSN | item code | P-M-F
     5 quantity / uom / value    encoded PR | qty + unit | wsp
     6 rate
     7 tax / washing             (Inclusive all taxes) | DRY WASH ONLY
     8 disclaimer

   They sum to exactly 1, so the sections always fill the sticker and can
   never overflow it, at ANY configured label height - 50x40, 50x25, 38x25.
   A section cannot grow: its track is a fixed millimetre height and its
   content is clipped to it. That is what keeps the barcode where it is when
   a description runs long, and keeps the disclaimer on the label when a
   price runs wide.

   `font` is the type size as a fraction of the section's OWN height, so text
   can never be taller than the band it sits in. */
export const LABEL_SECTIONS = {
  barcode:     { share: 0.3300 },
  identifier:  { share: 0.0750, font: 0.66 },
  description: { share: 0.1350, font: 0.39 },  /* two lines */
  detailRow1:  { share: 0.0850, font: 0.66 },
  detailRow2:  { share: 0.0850, font: 0.66 },
  rate:        { share: 0.1250, font: 0.66 },
  taxWash:     { share: 0.0825, font: 0.58 },
  disclaimer:  { share: 0.0825, font: 0.58 },
};

/* The order they are stacked in, top to bottom. One list, used to build the
   grid tracks AND to render, so a section cannot be given a track it is not
   rendered into or rendered into a track it was not given. */
export const SECTION_ORDER = [
  'barcode', 'identifier', 'description',
  'detailRow1', 'detailRow2', 'rate', 'taxWash', 'disclaimer',
];

/* Sticker margins. Small - the label is only 50mm across and every
   millimetre spent here is a millimetre of barcode lost - but never zero:
   ink that runs to the die cut is ink the printer clips. */
export const PAD_X_MM = 1.2;
export const PAD_Y_MM = 0.8;

/* The cut line round a label, in millimetres rather than pixels - and
   subtracted from the usable height below, because it is part of the
   sticker's box. A 1px border is 0.265mm, which is exactly what the
   disclaimer at the foot of the label was being clipped by: the section
   tracks were budgeted against the padding alone, so the stack came out
   2px taller than the content box it had to fit in. Everything on a label
   is measured in the label's own units, this included. */
export const BORDER_MM = 0.2;

/* The blank run either side of the bars, in modules. CODE128 asks for ten;
   a scanner uses it to find where the symbol starts and ends. It is inside
   the barcode's own viewBox, so it survives however narrow the label is -
   unlike padding, which the bars would simply be scaled into. */
export const QUIET_ZONE_MODULES = 10;

/* A number as a CSS millimetre length. */
export const mm = (n) => Number(n).toFixed(3) + 'mm';

/* The mm geometry of one label, derived ONCE per sheet and handed to every
   label on it - so no label can compute a different size from its neighbour.

     w, h    the sticker, exactly as configured
     band(k) the height of section k, in mm
     type(k) the type size for section k, in mm */
export function labelGeometry(format) {
  const { w, h } = parseSize(format?.labelSize);
  /* box-sizing is border-box, so w and h include BOTH the padding and the
     cut line. What the sections have to fit inside is what is left. */
  const usableH = Math.max(0, h - (PAD_Y_MM + BORDER_MM) * 2);
  const usableW = Math.max(0, w - (PAD_X_MM + BORDER_MM) * 2);
  const band = (key) => usableH * LABEL_SECTIONS[key].share;
  const type = (key) => band(key) * (LABEL_SECTIONS[key].font || 0);
  return { w, h, usableH, usableW, band, type };
}

/* How many labels sit across the sheet. Two is the seeded default and what
   the GRC sheet has always shown. */
export function labelsPerRow(format) {
  return Math.max(1, Number(format?.stickerInRow) || 2);
}
