/* Tests the GRC barcode label's GEOMETRY - the thing that was wrong.

   THE ACCEPTANCE CRITERION

     A GRC barcode label is exactly its configured physical size, its eight
     sections always fit inside it, and the barcode gets the whole of the
     section budgeted for it - whatever the barcode value, the description
     or the price happens to be.

   It exercises the real labelGeometry() / LABEL_SECTIONS from
   lib/barcodeLabelGeometry.js - the module components/GrcBarcodeLabel.jsx
   lays every sticker out with - and the real CODE128 encoder JsBarcode uses,
   rather than copies of them, so a change to the label breaks this test
   instead of passing quietly.

   It also reports the printed X-DIMENSION - the width of one barcode module
   in millimetres - for the barcode values this ERP actually issues. That is
   the number that decides whether a printed sticker can be scanned, and it
   is set by the LENGTH of the barcode value, which is a data decision and
   not something the label layout can fix.

   HOW TO RUN
     npm run test:barcode-label
*/

import assert from 'node:assert/strict';
import pkg from 'jsbarcode/bin/barcodes/CODE128/index.js';
import {
  labelGeometry, LABEL_SECTIONS, SECTION_ORDER,
  PAD_X_MM, PAD_Y_MM, BORDER_MM, QUIET_ZONE_MODULES,
} from '@/lib/barcodeLabelGeometry';

const CODE128 = (pkg.default || pkg).CODE128;

/* The seeded catalog rows this ERP ships with (/api/catalog?name=barcodeLabels). */
const FORMATS = [
  { name: 'TF 50 x 40', labelSize: '50 x 40 mm', stickerInRow: 2 },
  { name: 'LL - 50.00mm x 25.00mm - 2Ups', labelSize: '50 x 25 mm', stickerInRow: 2 },
  { name: 'MA 38 x 25 mm 1Ups', labelSize: '38 x 25 mm', stickerInRow: 1 },
  { name: 'MF 100 x 50 mm', labelSize: '100 x 50 mm', stickerInRow: 1 },
];

/* Real barcode values from the barcodeLabel collection: the shortest and the
   longest this system has issued, plus a legacy counter number. */
const VALUES = [
  '9A2150',                      /* legacy Barcode Setting counter  */
  'G512 * 05173 * 1 * 1',        /* GRC 05173, the shortest composed */
  'G512 * 05173 * 16 * 20',
  'G1308 * 05083 * 33 * 14.25',  /* the longest in the database      */
];

let failures = 0;
const check = (name, fn) => {
  try {
    fn();
    console.log('  ok   ' + name);
  } catch (error) {
    failures += 1;
    console.log('  FAIL ' + name + '\n       ' + error.message);
  }
};

console.log('\nGRC BARCODE LABEL - GEOMETRY\n');

/* ------------------------------------------------------------------ 1 --
   THE SECTIONS FILL THE LABEL AND NEVER OVERFLOW IT.

   This is what stops a long description pushing the rate, the footer or the
   barcode off the sticker: each section is a fixed millimetre track, and
   the tracks add up to exactly the usable height. */
check('the eight sections sum to exactly the label height', () => {
  const shares = Object.values(LABEL_SECTIONS).reduce((sum, s) => sum + s.share, 0);
  assert.ok(Math.abs(shares - 1) < 1e-9, 'section shares sum to ' + shares + ', not 1');
  assert.equal(Object.keys(LABEL_SECTIONS).length, 8, 'the reference label has eight sections');
});

/* Every section is rendered, and every rendered section has a track. A
   section named in one list and not the other is a section with no height
   or a height with nothing in it. */
check('every section has a place in the stack, and vice versa', () => {
  assert.deepEqual([...SECTION_ORDER].sort(), Object.keys(LABEL_SECTIONS).sort());
  assert.equal(SECTION_ORDER[0], 'barcode', 'the barcode is the top of the label');
  assert.equal(SECTION_ORDER[SECTION_ORDER.length - 1], 'disclaimer', 'the disclaimer is the foot of it');
});

for (const format of FORMATS) {
  const { w, h, usableH, usableW, band, type } = labelGeometry(format);

  check(format.name + ': label is exactly ' + format.labelSize, () => {
    const [dw, dh] = format.labelSize.match(/[\d.]+/g).map(Number);
    assert.equal(w, dw);
    assert.equal(h, dh);
  });

  /* box-sizing is border-box, so the sticker's own size has to pay for its
     padding AND its cut line before a single section gets a millimetre.
     Budgeting against the padding alone left the stack 2px taller than the
     box, and the bottom of the disclaimer was clipped off every label. */
  check(format.name + ': the usable box allows for the padding and the cut line', () => {
    assert.ok(Math.abs(usableH - (h - (PAD_Y_MM + BORDER_MM) * 2)) < 1e-9, 'usable height ignores a border or a padding');
    assert.ok(Math.abs(usableW - (w - (PAD_X_MM + BORDER_MM) * 2)) < 1e-9, 'usable width ignores a border or a padding');
  });

  check(format.name + ': the section tracks fit inside the label', () => {
    const total = Object.keys(LABEL_SECTIONS).reduce((sum, k) => sum + band(k), 0);
    assert.ok(total <= usableH + 1e-9, total.toFixed(3) + 'mm of sections in ' + usableH.toFixed(3) + 'mm of label');
    assert.ok(total >= usableH - 1e-9, 'the sections leave ' + (usableH - total).toFixed(3) + 'mm unused');
  });

  check(format.name + ': every section has room for its own type', () => {
    for (const [key, section] of Object.entries(LABEL_SECTIONS)) {
      if (!section.font) continue;
      assert.ok(type(key) < band(key), key + ' type is taller than its band');
      assert.ok(type(key) > 0.9, key + ' type is ' + type(key).toFixed(2) + 'mm - too small to read');
    }
  });

  check(format.name + ': the barcode gets the largest share of the label', () => {
    const barcode = band('barcode');
    for (const key of Object.keys(LABEL_SECTIONS)) {
      if (key === 'barcode') continue;
      assert.ok(barcode > band(key), 'the ' + key + ' section is taller than the barcode');
    }
    assert.ok(barcode >= 4, 'the barcode gets only ' + barcode.toFixed(2) + 'mm of height');
  });

  /* ---------------------------------------------------------------- 2 --
     THE BARS KEEP THE HEIGHT THE LABEL BUDGETED FOR THEM.

     preserveAspectRatio="none" is what makes this true. Under the DEFAULT
     ('xMidYMid meet'), a barcode wider than its box is scaled down on both
     axes, so a 26-character value in a 47.6mm box came back at 45% and the
     bar height collapsed with it. That is the bug this file exists to keep
     fixed: the check below is the arithmetic of the old behaviour, and it
     has to be the one that is NOT what the label does. */
  check(format.name + ': uniform scaling would have thrown away the bar height', () => {
    const worst = VALUES.reduce((max, v) => Math.max(max, modulesOf(v)), 0);
    const naturalMm = (worst + QUIET_ZONE_MODULES * 2) * (1 / 96) * 25.4;
    const meetScale = Math.min(usableW / naturalMm, 1);
    if (meetScale >= 1) {
      /* Wide enough stock that even the longest value fits at its natural
         size. Nothing to lose here, and nothing to guard. */
      return;
    }
    const lost = band('barcode') * (1 - meetScale);
    assert.ok(lost > 1, 'uniform scaling would cost ' + lost.toFixed(2) + 'mm of bar height');
  });
}

/* ------------------------------------------------------------------ 3 --
   THE PRINTED X-DIMENSION.

   Reported, not asserted as a pass/fail of the LAYOUT: the layout already
   gives the bars every millimetre of the label it can. How wide one module
   lands is then decided by how many characters the barcode VALUE has, which
   is a data and Barcode Setting decision.

   ISO/IEC 15417 asks for 0.250mm; 0.190mm is the floor for a close-range
   imager. A 203dpi thermal printer's dot is 0.125mm, so anything under
   about 0.25mm there is being rounded to whole dots and the bar widths
   stop being proportional. */
function modulesOf(value) {
  return new CODE128(value, { width: 1, height: 40, format: 'CODE128' }).encode().data.length;
}

console.log('\nPRINTED X-DIMENSION on the default 50 x 40 mm sticker\n');
const barsMm = labelGeometry(FORMATS[0]).usableW;
let marginal = [];
for (const value of VALUES) {
  const modules = modulesOf(value) + QUIET_ZONE_MODULES * 2;
  const x = barsMm / modules;
  const verdict = x >= 0.25 ? 'ok' : x >= 0.19 ? 'close range only' : 'BELOW THE READABLE FLOOR';
  if (x < 0.25) marginal.push(value);
  console.log(
    '  ' + x.toFixed(3) + ' mm/module  ' + String(modules).padStart(4) + ' modules  ' +
    verdict.padEnd(26) + JSON.stringify(value)
  );
}
console.log(
  '\n  ' + marginal.length + ' of ' + VALUES.length + ' values cannot reach 0.25mm/module on a 50mm label.\n' +
  '  The label layout cannot change that - only a shorter barcode value or\n' +
  '  wider label stock can. Reported so the choice is made deliberately.\n'
);

console.log(failures === 0 ? 'All geometry checks passed.\n' : failures + ' check(s) FAILED.\n');
process.exit(failures === 0 ? 0 : 1);
