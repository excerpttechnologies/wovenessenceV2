/* DECODES the exact CODE128 bitstream JsBarcode produces for a barcode
   value - a real decode, not a re-encode comparison.

   It chunks encode().data into its 11-module symbols (13 for the stop),
   maps each back through JsBarcode's own BARS table, walks the code-set
   shifts, and rebuilds the text a scanner would read. A value passes only
   when the decoded text equals the input exactly.

   It also prints the PHYSICAL size the label draws those bars at
   (barsBox on the 50 x 40 mm stock): drawn width/height in mm and the
   printed module width (X-dimension) - the number that decides whether a
   203dpi thermal printer can reproduce the bars at all.

   HOW TO RUN
     node --import ./scripts/aliasRegister.mjs scripts/testBarcodeDecode.mjs
*/

import { createRequire } from 'node:module';
import assert from 'node:assert/strict';

const require = createRequire(import.meta.url);
const pkg = require('jsbarcode/bin/barcodes/CODE128/index.js');
const constants = require('jsbarcode/bin/barcodes/CODE128/constants.js');
const CODE128 = (pkg.default || pkg).CODE128;
const { BARS, SET_BY_CODE, SWAP, SHIFT, STOP } = constants;

const SET_A = 0, SET_B = 1, SET_C = 2;
const SET_NAME = ['A', 'B', 'C'];

/* pattern string -> symbol value, from the encoder's own table */
const PATTERN_TO_SYMBOL = new Map(BARS.map((pattern, index) => [String(pattern), index]));

/* symbol value -> character, per code set. Set B covers printable ASCII
   32-127 as value+32; Set A the C0 controls and 32-95 as value; Set C is
   handled as digit pairs, not characters. */
function charOf(set, value) {
  if (set === SET_C) return null;
  /* Set B: symbol = ASCII - 32. Set A (per correctIndex in CODE128.js):
     symbols 0-63 are ASCII 32-95, symbols 64-95 are the C0 controls. */
  const code = set === SET_A ? (value < 64 ? value + 32 : value - 64) : value + 32;
  if (code < 0 || code > 127) return null;
  return String.fromCharCode(code);
}

/* The module bitstring -> the symbol values, chunked 11 modules at a time
   (the stop symbol is 13). */
function symbolsOf(data) {
  const symbols = [];
  let pos = 0;
  while (pos < data.length) {
    const rest = data.length - pos;
    const len = rest === 13 ? 13 : 11;
    const pattern = data.slice(pos, pos + len);
    const symbol = PATTERN_TO_SYMBOL.get(pattern);
    assert.notEqual(symbol, undefined, 'no CODE128 symbol matches ' + JSON.stringify(pattern));
    symbols.push(symbol);
    pos += len;
  }
  return symbols;
}

/* symbols -> text, exactly as a scanner walks them: start sets the set,
   100/101/99 swap sets, 98 shifts one symbol, the symbol before STOP is
   the modulo-103 checksum and is not data. */
function decodeSymbols(symbols) {
  assert.ok(symbols.length >= 3, 'too few symbols');
  const start = symbols[0];
  assert.ok(start >= 103 && start <= 105, 'does not start with a CODE128 start symbol');
  let set = SET_BY_CODE[start];
  assert.notEqual(set, undefined, 'unknown start symbol ' + start);

  const dataSymbols = symbols.slice(1, -2); // drop start, checksum, stop
  let out = '';
  for (let i = 0; i < dataSymbols.length; i += 1) {
    const symbol = dataSymbols[i];
    if (symbol === STOP) break;
    /* Inside set C the values 0-99 ARE the digit pairs - the set-switch
       codes only mean something from sets A and B. */
    if (set === SET_C && symbol <= 99) {
      out += String(symbol).padStart(2, '0');
      continue;
    }
    if (symbol in SWAP) { set = SWAP[symbol]; continue; }
    if (symbol === SHIFT) {
      const next = dataSymbols[i + 1];
      i += 1;
      const shiftedSet = set === SET_C ? SET_B : (set === SET_A ? SET_B : SET_A);
      if (shiftedSet === SET_C) out += String(next).padStart(2, '0');
      else out += charOf(shiftedSet, next) ?? '?';
      continue;
    }
    if (set === SET_C) {
      out += String(symbol).padStart(2, '0');
      continue;
    }
    out += charOf(set, symbol) ?? '?';
  }
  return out;
}

function decode(value) {
  const encoded = new CODE128(String(value), { width: 1, height: 40, format: 'CODE128' }).encode();
  return decodeSymbols(symbolsOf(encoded.data));
}

/* ---- physical size on the label stock ------------------------------- */
const { labelGeometry, barsBox, barcodeModules } = await import('@/lib/barcodeLabelGeometry.js');
const FORMAT_50x40 = { name: 'TF 50 x 40', labelSize: '50 x 40 mm', stickerInRow: 2 };
const geometry = labelGeometry(FORMAT_50x40, { onStock: false, gapMm: 1 });

const VALUES = [
  '11A1874', '11A1875', '11A1876', '11A1877',
  'G1333*05394*1*1', 'G1333*05394*2*1',
  'G512*05173*1*1', 'G1308*05083*33*14.25',
];

let failures = 0;
for (const value of VALUES) {
  try {
    const decoded = decode(value);
    const ok = decoded === value;
    if (!ok) failures += 1;
    const box = barsBox(geometry, value);
    console.log(
      (ok ? '  ok  ' : '  FAIL') + ' ' + JSON.stringify(value) +
      ' -> ' + JSON.stringify(decoded) +
      ' | ' + box.modules + ' modules, drawn ' + box.w.toFixed(1) + ' x ' + box.h.toFixed(1) + 'mm' +
      ' @ ' + box.x.toFixed(3) + 'mm/module'
    );
  } catch (error) {
    failures += 1;
    console.log('  FAIL ' + JSON.stringify(value) + ' - ' + error.message);
  }
}

console.log(failures === 0 ? '\nAll barcode values decode to themselves.\n' : '\n' + failures + ' value(s) FAILED to decode.\n');
process.exit(failures === 0 ? 0 : 1);
