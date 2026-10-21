/* Unit tests for lib/barcodeValue.js - the one barcode value format:

     SUPPLIER_CODE * GRC_NUMBER * BILL_SL_NO * SERIAL_NO   e.g. "G512 * 05173 * 5 * 1"

   stored with spaces ("G512 * 05173 * 5 * 1"), drawn and scanned in its
   canonical compact spelling ("G512*05173*5*1").

   The third part is the BILL SL NO. - the bill line the item was received on,
   as the GRC's Item Summary shows it against that item - and never the
   quantity. The tests below are written so that a quantity put back in that
   place fails them: every case uses a Bill Sl No. and a quantity that are
   different numbers.

   The fourth part is the SERIAL NO. - 1, 2, 3 ... within its Bill Sl No. for
   a barcode made now; the GRC-wide SEQ for one made before, left as printed.
   It is read off the VALUE, never off the stored serialNo field, which every
   older row carries as a copy of its Bill Sl No.

   Run against the real module. No database, no server.

     npm run test:barcode-value */

import {
  composeBarcodeValue, grcNumberForBarcode, billSlNoForBarcode, serialNoForBarcode, barcodeValueProblem,
  billSlNoProblem, serialNoProblem, nextSeqStart, highestSeq, hasComposedBarcode, hasOldComposedBarcode,
  canonicalBarcodeValue, displayBarcodeValue, parseBarcodeValue, isComposedBarcodeValue, generateBarcodeValue,
  composedValueOf, unitNumberOf, encodedBarcodeValue, barcodeSpellings, barcodeKey, sameBarcode, unitAnswersTo,
  barcodeSearchPattern, serialNoOfUnit, highestSerialNo, nextSerialNo, serialFloorKey, serialFloorOf, legacySerialFloor,
} from '@/lib/barcodeValue';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail !== '' ? '  -> ' + JSON.stringify(detail) : '')); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('--- the format ---');
const v = composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 5, serialNo: 1 });
ok('G512 / 05173 / bill line 5 / serial 1  ->  "G512 * 05173 * 5 * 1"', v === 'G512 * 05173 * 5 * 1', v);
ok('another item, bill line 16, serial 1', composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 16, serialNo: 1 }) === 'G512 * 05173 * 16 * 1');
ok('"GRC 05173" is written 05173', composeBarcodeValue({ supplierCode: 'G512', grcNumber: 'GRC 05173', billSlNo: 5, serialNo: 1 }) === 'G512 * 05173 * 5 * 1'
  && grcNumberForBarcode('grc05173') === '05173');
ok('the stored separator is exactly space-asterisk-space', v.split(' * ').length === 4 && !/[-/]/.test(v));
ok('a Bill Sl No. is carried as it is typed, trimmed', billSlNoForBarcode(' 007 ') === '007' && billSlNoForBarcode(5) === '5');
ok('so is a Serial No.', serialNoForBarcode(' 007 ') === '007' && serialNoForBarcode(3) === '3' && serialNoForBarcode(null) === '');
ok('text around the parts is trimmed', composeBarcodeValue({ supplierCode: ' G512 ', grcNumber: ' 05173 ', billSlNo: ' 5 ', serialNo: ' 2 ' }) === 'G512 * 05173 * 5 * 2');
ok('a missing part gives no value, never a shorter one',
  ['supplierCode', 'grcNumber', 'billSlNo', 'serialNo'].every((k) => composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 5, serialNo: 1, [k]: '' }) === ''));
ok('no arguments at all gives no value', composeBarcodeValue() === '' && composeBarcodeValue({}) === '');
/* The seed, restate and repair scripts name the fourth part seq, and the GRC
   number referenceCode. When the parameter was renamed they silently composed
   '' - and the seed wrote that over good values. */
ok('seq is still accepted as another name for serialNo',
  composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 5, seq: 3 }) === 'G512 * 05173 * 5 * 3');
ok('referenceCode is still accepted as another name for grcNumber',
  composeBarcodeValue({ supplierCode: 'G512', referenceCode: 'GRC 05173', billSlNo: 5, serialNo: 3 }) === 'G512 * 05173 * 5 * 3');
ok('serialNo wins over seq when both are given',
  composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 5, serialNo: 2, seq: 9 }) === 'G512 * 05173 * 5 * 2');

console.log('--- the quantity is NOT in the value ---');
/* The case the whole change is about: 16 metres received against bill line 5.
   The value carries the 5. */
ok('16 received on bill line 5 is "* 5 * 1", not "* 16 * 1"',
  composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: '5', qty: '16', serialNo: 1 }) === 'G512 * 05173 * 5 * 1');
ok('37 received on bill line 16 is "* 16 * 1"',
  composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: '16', qty: '37', serialNo: 1 }) === 'G512 * 05173 * 16 * 1');
ok('a quantity alone cannot make a value', composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', qty: '16', serialNo: 1 }) === '');

console.log('--- the canonical spelling: what the bars encode and the label prints ---');
ok('"G1319 * 05182 * 1 * 6" -> "G1319*05182*1*6"', canonicalBarcodeValue('G1319 * 05182 * 1 * 6') === 'G1319*05182*1*6');
ok('the compact spelling is already canonical', canonicalBarcodeValue('G1319*05182*1*6') === 'G1319*05182*1*6');
ok('any spacing round the separators closes up', canonicalBarcodeValue('  G1319 *05182*  1 * 6 ') === 'G1319*05182*1*6');
ok('a counter number comes back trimmed and otherwise as it was',
  canonicalBarcodeValue(' 9A1135 ') === '9A1135' && canonicalBarcodeValue('OLD-9A0001') === 'OLD-9A0001');
ok('nothing gives ""', canonicalBarcodeValue(null) === '' && canonicalBarcodeValue(undefined) === '' && canonicalBarcodeValue('') === '');
ok('displayBarcodeValue is the canonical spelling', displayBarcodeValue('G512 * 05173 * 16 * 20') === 'G512*05173*16*20'
  && displayBarcodeValue('9A1135') === '9A1135');

console.log('--- parsing a value ---');
const G1319 = { supplierCode: 'G1319', grcNumber: '05182', billSlNo: '1', serialNo: '6' };
ok('the stored spelling parses into its four parts', same(parseBarcodeValue('G1319 * 05182 * 1 * 6'), G1319), parseBarcodeValue('G1319 * 05182 * 1 * 6'));
ok('so does the compact one, to the same parts', same(parseBarcodeValue('G1319*05182*1*6'), G1319));
ok('a counter number is not a composed value', parseBarcodeValue('9A1135') === null && !isComposedBarcodeValue('9A1135'));
ok('three parts, or five, are not a value',
  parseBarcodeValue('G1319*05182*1') === null && parseBarcodeValue('G1319*05182*1*6*7') === null);
ok('an empty part is not a value', parseBarcodeValue('G1319**1*6') === null && parseBarcodeValue('G512 * 05173 *  * 2') === null);
ok('a part with a space inside it is not a value', parseBarcodeValue('G 1319*05182*1*6') === null);
ok('nothing is not a value', parseBarcodeValue('') === null && parseBarcodeValue(null) === null && !isComposedBarcodeValue(undefined));
ok('isComposedBarcodeValue agrees with the parser',
  isComposedBarcodeValue('G1319 * 05182 * 1 * 6') && isComposedBarcodeValue('G1319*05182*1*6') && !isComposedBarcodeValue('G1319*05182*1'));

console.log('--- THE generator ---');
ok('generateBarcodeValue gives the canonical value',
  generateBarcodeValue({ supplierCode: 'G1319', grcNumber: 'GRC 05182', billSlNo: 1, serialNo: 6 }) === 'G1319*05182*1*6');
ok('...which is the stored value, spelt compact',
  generateBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 16, serialNo: 20 })
    === canonicalBarcodeValue(composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 16, serialNo: 20 })));
ok('...and takes the same other names (referenceCode, seq)',
  generateBarcodeValue({ supplierCode: 'G1308', referenceCode: '05083', billSlNo: 33, seq: 14 }) === 'G1308*05083*33*14');
ok('a missing part gives no value there either',
  ['supplierCode', 'grcNumber', 'billSlNo', 'serialNo'].every((k) => generateBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: 5, serialNo: 1, [k]: '' }) === '')
  && generateBarcodeValue() === '');

console.log('--- the three shapes a stored record comes in ---');
/* split          barcodeNo = its own number, barcodeGenerated = the value
   composed-both  the composed value in both fields (written before the split)
   number-both    a counter number in both fields (made before composed values) */
const split = { barcodeNo: '9A1135', barcodeGenerated: 'G1318 * 05178 * 1 * 1', billSlNo: '1', serialNo: '1' };
const composedBoth = { barcodeNo: 'G1318 * 05178 * 1 * 1', barcodeGenerated: 'G1318 * 05178 * 1 * 1', billSlNo: '1' };
const numberBoth = { barcodeNo: '9A1135', barcodeGenerated: '9A1135', billSlNo: '1', serialNo: '1' };
ok('composedValueOf: split row -> its value, canonical', composedValueOf(split) === 'G1318*05178*1*1', composedValueOf(split));
ok('composedValueOf: composed in both -> that value, canonical', composedValueOf(composedBoth) === 'G1318*05178*1*1');
ok('composedValueOf: number in both -> nothing', composedValueOf(numberBoth) === '');
ok('composedValueOf: a value only in barcodeNo is still found', composedValueOf({ barcodeNo: 'G1318 * 05178 * 1 * 1' }) === 'G1318*05178*1*1');
ok('composedValueOf: a number only, or no record, -> nothing',
  composedValueOf({ barcodeNo: '9A1135' }) === '' && composedValueOf(null) === '' && composedValueOf({}) === '');
ok('unitNumberOf: split row -> its own number', unitNumberOf(split) === '9A1135', unitNumberOf(split));
ok('unitNumberOf: composed in both -> nothing is invented', unitNumberOf(composedBoth) === '');
ok('unitNumberOf: number in both -> that number', unitNumberOf(numberBoth) === '9A1135');
ok('unitNumberOf: a number only in barcodeGenerated is still found, trimmed',
  unitNumberOf({ barcodeNo: '', barcodeGenerated: ' 9A1135 ' }) === '9A1135' && unitNumberOf(null) === '');
ok('encodedBarcodeValue: split row -> the compact composed value', encodedBarcodeValue(split) === 'G1318*05178*1*1', encodedBarcodeValue(split));
ok('encodedBarcodeValue: composed in both -> the compact composed value', encodedBarcodeValue(composedBoth) === 'G1318*05178*1*1');
ok('encodedBarcodeValue: number in both -> its own number, as its old label encoded it', encodedBarcodeValue(numberBoth) === '9A1135');
ok('encodedBarcodeValue never draws the stored spelling, and nothing for no record',
  ![split, composedBoth, numberBoth].some((row) => encodedBarcodeValue(row).includes(' ')) && encodedBarcodeValue({}) === '');

console.log('--- looking a scan up ---');
ok('a counter number is looked for only as itself', same(barcodeSpellings('9A1135'), ['9A1135']) && same(barcodeSpellings(' 9A1135 '), ['9A1135']));
ok('a plain number likewise', same(barcodeSpellings('123456'), ['123456']));
ok('nothing is looked for as nothing', same(barcodeSpellings(''), []) && same(barcodeSpellings(null), []) && same(barcodeSpellings('   '), []));
ok('a compact scan is looked for compact AND as stored',
  same(barcodeSpellings('G1318*05178*1*1'), ['G1318*05178*1*1', 'G1318 * 05178 * 1 * 1']), barcodeSpellings('G1318*05178*1*1'));
ok('a typed stored spelling is looked for as typed AND compact',
  same(barcodeSpellings('G1318 * 05178 * 1 * 1'), ['G1318 * 05178 * 1 * 1', 'G1318*05178*1*1']), barcodeSpellings('G1318 * 05178 * 1 * 1'));
ok('an oddly spaced scan is looked for as typed, compact and stored',
  same(barcodeSpellings('G1318 *05178* 1 * 1'), ['G1318 *05178* 1 * 1', 'G1318*05178*1*1', 'G1318 * 05178 * 1 * 1']));
ok('barcodeKey is the same for both spellings', barcodeKey('G1318 * 05178 * 1 * 1') === barcodeKey('G1318*05178*1*1')
  && barcodeKey('G1318 * 05178 * 1 * 1') === 'G1318*05178*1*1');
ok('sameBarcode: the two spellings are one barcode', sameBarcode('G1318 * 05178 * 1 * 1', 'G1318*05178*1*1'));
ok('sameBarcode: a number and its padded copy are one barcode', sameBarcode('9A1135', ' 9A1135 '));
ok('sameBarcode: different values, or a value and a number, are not',
  !sameBarcode('G1318*05178*1*1', 'G1318*05178*1*2') && !sameBarcode('G1318*05178*1*1', '9A1135') && !sameBarcode('9A1135', '9A1136'));
ok('sameBarcode: nothing matches nothing', !sameBarcode('', '') && !sameBarcode(null, undefined) && !sameBarcode('', '9A1135'));
const withOld = { ...split, oldBarcode: 'OLD-7' };
ok('unitAnswersTo: its own number (an old label)', unitAnswersTo(withOld, '9A1135'));
ok('unitAnswersTo: its value, scanned compact (a new label) or typed with spaces',
  unitAnswersTo(withOld, 'G1318*05178*1*1') && unitAnswersTo(withOld, 'G1318 * 05178 * 1 * 1'));
ok('unitAnswersTo: its old barcode', unitAnswersTo(withOld, 'OLD-7'));
ok('unitAnswersTo: not another barcode, and not nothing',
  !unitAnswersTo(withOld, 'G1318*05178*1*2') && !unitAnswersTo(withOld, '9A1136') && !unitAnswersTo(withOld, '') && !unitAnswersTo(null, '9A1135'));
ok('unitAnswersTo: the legacy shapes answer to what their labels encode',
  unitAnswersTo(composedBoth, 'G1318*05178*1*1') && unitAnswersTo(numberBoth, '9A1135'));

console.log('--- free-text search ---');
const finds = (typed, stored) => new RegExp(barcodeSearchPattern(typed)).test(stored);
ok('a compact search finds the stored spelling', finds('G1319*05182', 'G1319 * 05182 * 1 * 6'));
ok('a spaced search finds the compact spelling', finds('G1319 * 05182', 'G1319*05182*1*6'));
ok('...and each finds its own spelling', finds('G1319*05182', 'G1319*05182*1*6') && finds('G1319 * 05182', 'G1319 * 05182 * 1 * 6'));
ok('a search does not find another value', !finds('G1319*05182', 'G1319 * 05183 * 1 * 6'));
ok('regex characters are taken literally', barcodeSearchPattern('14.25') === '14\\.25' && !finds('14.25', 'G1308 * 05083 * 33 * 14x25')
  && finds('33*14.25', 'G1308 * 05083 * 33 * 14.25'));
ok('a counter number is searched for as itself', barcodeSearchPattern(' 9A1135 ') === '9A1135' && barcodeSearchPattern('') === '');

console.log('--- the Serial No. a stored barcode carries ---');
ok('read off the value, not the serialNo field (a copy of the Bill Sl No.)',
  serialNoOfUnit({ billSlNo: '1', serialNo: '1', barcodeNo: '9A1135', barcodeGenerated: 'G1318 * 05178 * 1 * 16' }) === '16');
ok('the compact spelling reads the same', serialNoOfUnit({ billSlNo: '1', barcodeGenerated: 'G1318*05178*1*16' }) === '16');
ok('a value in barcodeNo only (composed in both) is read too',
  serialNoOfUnit({ billSlNo: '1', barcodeNo: 'G1318 * 05178 * 1 * 4', barcodeGenerated: '' }) === '4'
  && serialNoOfUnit({ ...composedBoth }) === '1');
ok('a counter number carries none, whatever its serialNo field says', serialNoOfUnit(numberBoth) === '' && serialNoOfUnit({ billSlNo: '3', serialNo: '3', barcodeNo: '9A1' }) === '');
ok('a value whose third part is not the row\'s Bill Sl No. carries none for it',
  serialNoOfUnit({ billSlNo: '5', qty: '16', barcodeGenerated: 'G512 * 05173 * 16 * 1' }) === '');
ok('a numeric Bill Sl No. field compares as its text', serialNoOfUnit({ billSlNo: 5, barcodeGenerated: 'G512 * 05173 * 5 * 2' }) === '2');

/* bill line 12: two barcodes, serialNo polluted with "12", values 3 and 1.
   bill line 1: one barcode with a GRC-wide SEQ of 40 in its value.
   bill line 2: a counter number with a big serialNo, and an old quantity-era
   value - neither takes a serial on line 2. */
const lines = [
  { billSlNo: '12', serialNo: '12', seq: '7', barcodeNo: '9A2001', barcodeGenerated: 'G1 * 05100 * 12 * 3' },
  { billSlNo: '12', serialNo: '12', seq: '8', barcodeNo: '9A2002', barcodeGenerated: 'G1 * 05100 * 12 * 1' },
  { billSlNo: '1', serialNo: '1', seq: '40', barcodeNo: '9A2003', barcodeGenerated: 'G1 * 05100 * 1 * 40' },
  { billSlNo: '2', serialNo: '99', seq: '2', barcodeNo: '9A2004', barcodeGenerated: '9A2004' },
  { billSlNo: '2', serialNo: '2', seq: '3', barcodeNo: '9A2005', barcodeGenerated: 'G1 * 05100 * 16 * 3' },
];
ok('highestSerialNo reads the values: bill line 12 -> 3, not the "12" in serialNo', highestSerialNo(lines, '12') === 3, highestSerialNo(lines, '12'));
ok('highestSerialNo: an older value\'s GRC-wide SEQ counts on its own line', highestSerialNo(lines, '1') === 40);
ok('highestSerialNo: a counter number and a value of another line count for nothing', highestSerialNo(lines, '2') === 0, highestSerialNo(lines, '2'));
ok('highestSerialNo: a line with no barcodes, no line, no list -> 0',
  highestSerialNo(lines, '9') === 0 && highestSerialNo(lines, '') === 0 && highestSerialNo([], '1') === 0 && highestSerialNo(null, '1') === 0);
ok('highestSerialNo: a non-numeric fourth part is not a serial',
  highestSerialNo([{ billSlNo: '33', barcodeGenerated: 'G1308 * 05083 * 33 * 14.25' }], '33') === 0);

console.log('--- the next Serial No., per Bill Sl No. ---');
ok('the first barcode of a line is serial 1', nextSerialNo([], '1') === 1 && nextSerialNo(lines, '9') === 1);
ok('serials restart on every line: line 12 -> 4, line 2 -> 1, line 1 -> 41',
  nextSerialNo(lines, '12') === 4 && nextSerialNo(lines, '2') === 1 && nextSerialNo(lines, '1') === 41);
ok('the floor keeps a deleted barcode\'s serial from being given again', nextSerialNo(lines, '12', 10) === 11 && nextSerialNo([], '1', '5') === 6);
ok('a floor below the live serials changes nothing', nextSerialNo(lines, '12', 2) === 4);
ok('a floor that is not a number is no floor', nextSerialNo(lines, '12', 'abc') === 4 && nextSerialNo([], '1', null) === 1);
/* One bill line cut into three pieces: same Bill Sl No., its own serial each,
   so every value is still unique - and their differing quantities change
   nothing. */
const cuts = [{ billSlNo: '5', qty: '16' }, { billSlNo: '5', qty: '16' }, { billSlNo: '5', qty: '89' }];
const made = [];
cuts.forEach((cut) => {
  const serialNo = nextSerialNo(made, cut.billSlNo);
  made.push({ ...cut, serialNo: String(serialNo), barcodeGenerated: composeBarcodeValue({ supplierCode: 'G512', grcNumber: '05173', billSlNo: cut.billSlNo, serialNo }) });
});
const values = made.map((m) => m.barcodeGenerated);
ok('three barcodes of bill line 5 are serial 1, 2, 3 and all different',
  same(values, ['G512 * 05173 * 5 * 1', 'G512 * 05173 * 5 * 2', 'G512 * 05173 * 5 * 3']) && new Set(values).size === 3, values);
ok('...and each stored serialNo is its value\'s fourth part', made.every((m) => serialNoOfUnit(m) === m.serialNo));
ok('their differing quantities change nothing', new Set(cuts.map((cut) => cut.qty)).size === 2);
ok('the next line starts again at 1', nextSerialNo(made, '6') === 1 && nextSerialNo(made, '5') === 4);

console.log('--- the serial floor a GRC keeps ---');
ok('serialFloorKey: "b" + the Bill Sl No., with "." and "$" made safe',
  serialFloorKey('1') === 'b1' && serialFloorKey(' 12 ') === 'b12' && serialFloorKey('1.5') === 'b1_5' && serialFloorKey('$x') === 'b_x');
const perLine = { lastSerialByBill: { b1: 4, b12: 7 }, lastBarcodeSeq: 40 };
ok('a GRC that numbers per line: its line\'s highest', serialFloorOf(perLine, '1') === 4 && serialFloorOf(perLine, '12') === 7);
ok('...0 for a line it has not numbered, whatever lastBarcodeSeq says', serialFloorOf(perLine, '2') === 0);
ok('...never below serialFloorBase, the older GRC-wide floor it started from',
  serialFloorOf({ ...perLine, serialFloorBase: 5 }, '1') === 5 && serialFloorOf({ ...perLine, serialFloorBase: 5 }, '12') === 7
  && serialFloorOf({ lastSerialByBill: {}, serialFloorBase: 5 }, '3') === 5);
const seqs = (...list) => list.map((seq) => ({ seq: String(seq) }));
ok('legacySerialFloor: no lastBarcodeSeq, no floor', legacySerialFloor(seqs(1, 2), 0) === 0 && legacySerialFloor(seqs(1, 2), undefined) === 0);
ok('legacySerialFloor: every SEQ up to it still live -> nothing to protect', legacySerialFloor(seqs(1, 2, 3), 3) === 0 && legacySerialFloor(seqs(3, 1, 2, 4), '3') === 0);
ok('legacySerialFloor: a SEQ up to it missing -> the whole of it', legacySerialFloor(seqs(1, 3), 3) === 3 && legacySerialFloor(seqs(1, 2), 5) === 5);
/* a barcode saved before SEQ was stored carries none, and the lowest SEQs
   were left for it - so each one accounts for one gap */
ok('legacySerialFloor: each barcode with no SEQ accounts for one gap',
  legacySerialFloor(seqs('', ''), 2) === 0 && legacySerialFloor(seqs(1, ''), 2) === 0 && legacySerialFloor(seqs('', 2), 2) === 0);
ok('legacySerialFloor: more gaps than such barcodes -> the whole of it', legacySerialFloor(seqs(1, ''), 3) === 3
  && legacySerialFloor(seqs(''), 2) === 2);
ok('legacySerialFloor: no live barcodes at all -> the whole of it', legacySerialFloor([], 2) === 2 && legacySerialFloor(null, 2) === 2);
ok('serialFloorOf a GRC saved before per-line serials is its legacy floor',
  serialFloorOf({ lastBarcodeSeq: 3 }, '1', seqs(1, 3)) === 3 && serialFloorOf({ lastBarcodeSeq: 3 }, '1', seqs(1, 2, 3)) === 0
  && serialFloorOf({ lastBarcodeSeq: 3 }, '1', seqs(1, '', 3)) === 0 && serialFloorOf(null, '1') === 0);
ok('the floor feeds nextSerialNo: an older GRC with a deleted barcode starts a new line after lastBarcodeSeq',
  nextSerialNo([], '1', serialFloorOf({ lastBarcodeSeq: 3 }, '1', seqs(1, 3))) === 4);

console.log('--- SEQ: the GRC-wide running number (still stored; the fourth part of older values) ---');
ok('a GRC with no barcodes starts at 1', nextSeqStart([]) === 1);
ok('after SEQ 1..3 comes 4', nextSeqStart([{ seq: '1' }, { seq: '2' }, { seq: '3' }]) === 4);
ok('barcodes made before SEQ keep 1..count: 3 old ones -> the next new is 4', nextSeqStart([{ seq: '' }, { seq: '' }, { seq: '' }]) === 4);
ok('a deleted barcode\'s SEQ is not given again (lastBarcodeSeq)', nextSeqStart([{ seq: '1' }, { seq: '2' }], 5) === 6);
ok('highestSeq ignores text that is not a SEQ', highestSeq([{ seq: '7' }, { seq: 'abc' }, { seq: '' }, {}]) === 7);

console.log('--- which stored barcodes follow the rule ---');
const parts = { supplierCode: 'G512', grcNumber: 'GRC 05173' };
ok('a value composed by this rule does', hasComposedBarcode({ seq: '2', billSlNo: '5', barcodeNo: 'G512 * 05173 * 5 * 2' }, parts));
ok('...in barcodeGenerated beside the unit\'s own number, in either spelling',
  hasComposedBarcode({ billSlNo: '5', barcodeNo: '9A1136', barcodeGenerated: 'G512 * 05173 * 5 * 2' }, parts)
  && hasComposedBarcode({ billSlNo: '5', barcodeNo: '9A1136', barcodeGenerated: 'G512*05173*5*2' }, parts));
/* decided on the value alone: every older row has a numeric serialNo (a copy
   of its Bill Sl No.), so the field proves nothing either way */
ok('whatever the serialNo and seq fields hold', hasComposedBarcode({ billSlNo: '5', serialNo: '', seq: '', barcodeGenerated: 'G512 * 05173 * 5 * 2' }, parts)
  && hasComposedBarcode({ billSlNo: '5', serialNo: '5', seq: '9', barcodeGenerated: 'G512 * 05173 * 5 * 2' }, parts));
ok('an older counter number does not, even with a SEQ or a serialNo', !hasComposedBarcode({ seq: '2', billSlNo: '5', barcodeNo: '9A1136' }, parts)
  && !hasComposedBarcode({ seq: '', billSlNo: '5', barcodeNo: '9A1136' }, parts)
  && !hasComposedBarcode({ serialNo: '5', billSlNo: '5', barcodeNo: '9A1136', barcodeGenerated: '9A1136' }, parts));
ok('a value of another GRC or supplier does not', !hasComposedBarcode({ seq: '2', billSlNo: '5', barcodeNo: 'G1087 * 05177 * 5 * 2' }, parts)
  && !hasComposedBarcode({ billSlNo: '5', barcodeGenerated: 'G512 * 05174 * 5 * 2' }, parts));
/* Barcodes printed before the third part became the Bill Sl No. carry a
   quantity there. They are not this rule's, so nothing recomposes them and the
   sticker on the goods stays the truth. */
ok('a value composed when the third part was the quantity does not',
  !hasComposedBarcode({ seq: '1', billSlNo: '5', qty: '16', barcodeNo: 'G512 * 05173 * 16 * 1' }, parts));
ok('a row with no Bill Sl No. does not', !hasComposedBarcode({ seq: '2', billSlNo: '', barcodeNo: 'G512 * 05173 *  * 2' }, parts));
ok('a value whose fourth part is not a whole number does not',
  !hasComposedBarcode({ billSlNo: '33', barcodeGenerated: 'G1308 * 05083 * 33 * 14.25' }, { supplierCode: 'G1308', grcNumber: '05083' }));
ok('hasOldComposedBarcode answers the same', hasOldComposedBarcode({ billSlNo: '5', barcodeGenerated: 'G512 * 05173 * 5 * 2' }, parts)
  && !hasOldComposedBarcode({ billSlNo: '5', barcodeGenerated: '9A1136' }, parts));

console.log('--- refusals ---');
ok('no supplier code: refused, and says so', /supplier code/i.test(barcodeValueProblem({ supplierCode: '', grcNumber: '05173' })));
ok('no GRC number: refused', /GRC number/i.test(barcodeValueProblem({ supplierCode: 'G512', grcNumber: 'GRC ' })));
ok('both present: fine', barcodeValueProblem(parts) === '');
ok('no Bill Sl No.: refused, and names the item and the column',
  /Bill Sl No/i.test(billSlNoProblem({ itemCode: '10-PLNBTM', qty: '16' }))
  && /10-PLNBTM/.test(billSlNoProblem({ itemCode: '10-PLNBTM', qty: '16' })));
ok('a row with a Bill Sl No. is fine, whatever its quantity', billSlNoProblem({ itemCode: '10-PLNBTM', billSlNo: '5', qty: '16' }) === '');
ok('no Serial No.: refused, and names the item', /Serial No/i.test(serialNoProblem({ itemCode: '10-PLNBTM' }))
  && /10-PLNBTM/.test(serialNoProblem({ itemCode: '10-PLNBTM' })) && /A row/.test(serialNoProblem(null)));
ok('a row with a Serial No. is fine', serialNoProblem({ itemCode: '10-PLNBTM', serialNo: '1' }) === '');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
