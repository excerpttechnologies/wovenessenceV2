/* Unit tests for lib/barcodeValue.js - the one barcode value format:

     SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY          e.g. "G1318 * 05178 * 1 * 16"

   Run against the real module. No database, no server.

     npm run test:barcode-value */

import {
  composeBarcodeValue, grcNumberForBarcode, qtyForBarcode, barcodeValueProblem,
  nextSeqStart, highestSeq, hasComposedBarcode,
} from '@/lib/barcodeValue';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== '' ? '  -> ' + JSON.stringify(detail) : '')); }
};

console.log('--- the format ---');
const v = composeBarcodeValue({ supplierCode: 'G1318', grcNumber: '05178', seq: 1, qty: 16 });
ok('G1318 / 05178 / 1 / 16  ->  "G1318 * 05178 * 1 * 16"', v === 'G1318 * 05178 * 1 * 16', v);
ok('SEQ 3 with its own QTY 89', composeBarcodeValue({ supplierCode: 'G1318', grcNumber: '05178', seq: 3, qty: 89 }) === 'G1318 * 05178 * 3 * 89');
ok('"GRC 05178" is written 05178', composeBarcodeValue({ supplierCode: 'G1318', grcNumber: 'GRC 05178', seq: 1, qty: 16 }) === 'G1318 * 05178 * 1 * 16'
  && grcNumberForBarcode('grc05178') === '05178');
ok('the separator is exactly space-asterisk-space', v.split(' * ').length === 4 && !/[-/]/.test(v));
ok('"16.00" and "16" are one quantity, "12.5" stays', qtyForBarcode('16.00') === '16' && qtyForBarcode(' 12.5 ') === '12.5');
ok('text around the parts is trimmed', composeBarcodeValue({ supplierCode: ' G1318 ', grcNumber: ' 05178 ', seq: ' 2 ', qty: ' 16 ' }) === 'G1318 * 05178 * 2 * 16');
ok('a missing part gives no value, never a shorter one',
  ['supplierCode', 'grcNumber', 'seq', 'qty'].every((k) => composeBarcodeValue({ supplierCode: 'G1318', grcNumber: '05178', seq: 1, qty: 16, [k]: '' }) === ''));

console.log('--- GRC 05178 as the brief gives it ---');
const lines = [{ qty: '16' }, { qty: '16' }, { qty: '89' }];
let seq = nextSeqStart([]);
const values = lines.map((line) => composeBarcodeValue({ supplierCode: 'G1318', grcNumber: '05178', seq: seq++, qty: line.qty }));
ok('three new lines of 16, 16, 89 are SEQ 1, 2, 3, each with its own quantity',
  JSON.stringify(values) === JSON.stringify(['G1318 * 05178 * 1 * 16', 'G1318 * 05178 * 2 * 16', 'G1318 * 05178 * 3 * 89']), values);

console.log('--- SEQ ---');
ok('a GRC with no barcodes starts at 1', nextSeqStart([]) === 1);
ok('after SEQ 1..3 comes 4', nextSeqStart([{ seq: '1' }, { seq: '2' }, { seq: '3' }]) === 4);
ok('barcodes made before SEQ keep 1..count: 3 old ones -> the next new is 4', nextSeqStart([{ seq: '' }, { seq: '' }, { seq: '' }]) === 4);
ok('a deleted barcode\'s SEQ is not given again (lastBarcodeSeq)', nextSeqStart([{ seq: '1' }, { seq: '2' }], 5) === 6);
ok('highestSeq ignores text that is not a SEQ', highestSeq([{ seq: '7' }, { seq: 'abc' }, { seq: '' }, {}]) === 7);

console.log('--- which stored barcodes follow the rule ---');
const parts = { supplierCode: 'G1318', grcNumber: 'GRC 05178' };
ok('a composed value with its SEQ does', hasComposedBarcode({ seq: '2', barcodeNo: 'G1318 * 05178 * 2 * 16' }, parts));
ok('an older counter number does not, even with a SEQ', !hasComposedBarcode({ seq: '2', barcodeNo: '9A1136' }, parts)
  && !hasComposedBarcode({ seq: '', barcodeNo: '9A1136' }, parts));
ok('a value of another GRC or supplier does not', !hasComposedBarcode({ seq: '2', barcodeNo: 'G1087 * 05177 * 2 * 20' }, parts));

console.log('--- refusals ---');
ok('no supplier code: refused, and says so', /supplier code/i.test(barcodeValueProblem({ supplierCode: '', grcNumber: '05178' })));
ok('no GRC number: refused', /GRC number/i.test(barcodeValueProblem({ supplierCode: 'G1318', grcNumber: 'GRC ' })));
ok('both present: fine', barcodeValueProblem(parts) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
