/* Unit tests for lib/itemsSheet.js - the ITEMS sheet's columns, parsers,
   clipboard format and paste planning - run against the real module, not a
   copy of its logic. No database, no server.

     npm run test:items-sheet */

import {
  sheetColumns, parseTsv, toTsv, planPaste, planClear, rowErrors, sheetProblems,
  isBlankRow, isLockedRow, gstAmountOf, finalRateOf, money,
} from '@/lib/itemsSheet';
import { matchRowsToUnits } from '@/lib/barcodeRowSync';

let pass = 0;
let fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

const cols = sheetColumns(['Colour']);
const col = (key) => cols.find((c) => c.key === key);
const idx = (key) => cols.findIndex((c) => c.key === key);

/* a saved MTR row as the grid holds it after loading GRC 05177 */
const saved = {
  id: 's1', _id: 's1', itemCode: '10-PLNBTM', itemName: '10-PLNBTM', hsn: '520811', gst: '0', qty: '20',
  noOfCuts: '', purchaseRate: '74', purRate: '74', finalPrice: '70.3', finalNet: '70.3',
  encodedPurchaseRate: 'GD', encodedPurRate: 'GD', uom: 'MTR', batchUnique: 'unique', mode: 'unique',
  status: 'IN_STOCK', locationId: 'L1', currentLocationId: 'L1', customFields: {},
};
let made = 0;
const createRow = (above) => ({
  id: 'new-' + (++made), itemCode: '', itemName: '', hsn: '', gst: '', qty: '', noOfCuts: '',
  purchaseRate: '', finalPrice: '', discount: '0', discountType: 'Percentage', barcodeNo: '',
  uom: above?.uom ?? '', mode: above?.mode ?? 'unique', customFields: {},
});

console.log('--- columns ---');
ok('the ITEMS columns, in the table\'s order, then custom fields',
  same(cols.map((c) => c.label), ['Sl No', 'Item Code', 'Item', 'HSN', 'GST%', 'QTY/MTR', 'No. of Cut', 'Rate', 'GST Amount', 'Colour']));
ok('Sl No and GST Amount cannot be typed into', col('slNo').readOnly && col('gstAmount').readOnly && !col('qty').readOnly);
ok('Sl No is the position', col('slNo').display(saved, 12) === '13');
ok('Rate shows purchase / final as the table did', col('rate').display(saved) === '74.00 / 70.30', col('rate').display(saved));
ok('an empty cell shows "-"', col('noOfCuts').display(saved) === '-');
ok('GST Amount is the totals-bar expression',
  gstAmountOf({ finalPrice: '70.3', qty: '20', gst: '5' }) === (70.3 * 20) * (5 / 100) && col('gstAmount').display({ finalPrice: '70.3', qty: '20', gst: '5' }) === money(70.3));

console.log('--- parsing ---');
ok('QTY/MTR 20 -> 35', col('qty').parse('35', saved).patch?.qty === '35');
ok('QTY/MTR keeps metres to 3 decimals', col('qty').parse('12.125', saved).patch?.qty === '12.125');
ok('QTY/MTR refuses 0, text, blank and 4 decimals',
  ['0', 'abc', '', '1.2345'].every((t) => col('qty').parse(t, saved).error), ['0', 'abc', '', '1.2345'].map((t) => col('qty').parse(t, saved).error).join(' | '));
ok('a unique PIECE quantity must be whole', Boolean(col('qty').parse('2.5', { uom: 'PC', mode: 'unique' }).error)
  && col('qty').parse('2.5', { uom: 'PC', mode: 'batch' }).patch?.qty === '2.5');
ok('GST% accepts 5 and "5%", refuses 41 and text', col('gst').parse('5%', saved).patch?.gst === '5'
  && Boolean(col('gst').parse('41', saved).error) && Boolean(col('gst').parse('x', saved).error) && col('gst').parse('', saved).patch?.gst === '');
ok('HSN: digits, 2 to 8 of them', col('hsn').parse('5208 11', saved).patch?.hsn === '520811'
  && Boolean(col('hsn').parse('ABC', saved).error) && Boolean(col('hsn').parse('1', saved).error));
ok('No. of Cut: "-" is none, whole numbers only', col('noOfCuts').parse('-', saved).patch?.noOfCuts === ''
  && col('noOfCuts').parse('3', saved).patch?.noOfCuts === '3' && Boolean(col('noOfCuts').parse('2.5', saved).error));

const both = col('rate').parse('74.00 / 70.30', saved).patch;
ok('Rate "74.00 / 70.30" sets both, and the stored names with them',
  both?.purchaseRate === '74' && both?.purRate === '74' && both?.finalPrice === '70.3' && both?.finalNet === '70.3', JSON.stringify(both));
ok('an unchanged purchase rate keeps its encoded label rate', both?.encodedPurchaseRate === 'GD' && both?.encodedPurRate === 'GD');
const kept = col('rate').parse('80', saved).patch;
ok('a new purchase rate alone keeps a final rate whose discount is unknown', kept?.purchaseRate === '80' && kept?.purRate === '80' && kept?.finalPrice === '70.3', JSON.stringify(kept));
const derived = col('rate').parse('80', { ...saved, discount: '5' }).patch;
ok('...and re-derives it when the discount is known (80 less 5% = 76)', derived?.finalPrice === '76' && derived?.finalNet === '76', JSON.stringify(derived));
ok('Rate refuses 0, text and three parts', ['0', 'abc', '1 / 2 / 3', '- / 5'].every((t) => col('rate').parse(t, saved).error));
ok('finalRateOf is the Add Item rule', finalRateOf({ purchaseRate: '100', discount: '10' }) === 90 && finalRateOf({ purchaseRate: '100', discount: '10', discountType: 'Flat' }) === 90);
ok('custom fields are text', same(col('custom:Colour').parse('Red', saved).patch, { customFields: { Colour: 'Red' } }));

console.log('--- clipboard ---');
ok('Excel rows and cells, trailing line break ignored', same(parseTsv('a\tb\r\nc\td\r\n'), [['a', 'b'], ['c', 'd']]));
ok('quoted cells with tabs, breaks and quotes', same(parseTsv('"x\ty"\t"he said ""hi"""\t"two\nlines"\n'), [['x\ty', 'he said "hi"', 'two\nlines']]));
ok('an empty last cell survives', same(parseTsv('a\t'), [['a', '']]));
const tricky = [['a\tb', 'q"t', ''], ['line\nbreak', '74.00 / 70.30', '-']];
ok('toTsv round-trips through parseTsv', same(parseTsv(toTsv(tricky)), tricky), toTsv(tricky));

console.log('--- paste ---');
const excel = '10-PLNBTM\t10-PLNBTM\t520811\t0\t20\t-\t74.00 / 70.30\t0.00\r\n10-PLNBTM\t10-PLNBTM\t520811\t0\t30\t-\t74.00 / 70.30\t0.00\r\n';
const pasted = planPaste({ rows: [], columns: cols, top: 0, left: idx('itemCode'), matrix: parseTsv(excel), createRow });
ok('the brief\'s Excel rows land in their columns', pasted.rows.length === 2 && pasted.added === 2 && pasted.skipped.length === 0
  && same(pasted.rows.map((r) => [r.itemCode, r.itemName, r.hsn, r.gst, r.qty, r.noOfCuts, r.purchaseRate, r.finalPrice]),
    [['10-PLNBTM', '10-PLNBTM', '520811', '0', '20', '', '74', '70.3'], ['10-PLNBTM', '10-PLNBTM', '520811', '0', '30', '', '74', '70.3']]),
  JSON.stringify(pasted.rows.map((r) => [r.qty, r.purchaseRate, r.finalPrice])) + ' skipped ' + JSON.stringify(pasted.skipped));
ok('...marked edited, GST Amount left to the calculation', pasted.rows.every((r) => r._edited) && !('gstAmount' in pasted.rows[0]));
const header = planPaste({ rows: [], columns: cols, top: 0, left: 0, matrix: parseTsv('SL NO\tITEM CODE\tITEM\tHSN\n1\tAB-1\tShirt\t6205\n'), createRow });
ok('a copied header row is not pasted as an item', header.rows.length === 1 && header.rows[0].itemCode === 'AB-1', JSON.stringify(header.rows.map((r) => r.itemCode)));
const filled = planPaste({ rows: [saved, { ...saved, id: 's2', _id: 's2' }, { ...saved, id: 's3', _id: 's3' }], columns: cols, top: 0, left: idx('qty'),
  matrix: [['35']], fill: { r1: 0, r2: 2, c1: idx('qty'), c2: idx('qty') }, createRow });
ok('one value over a selection fills every cell', filled.rows.every((r) => r.qty === '35') && filled.changed === 3);
const mixed = planPaste({ rows: [saved], columns: cols, top: 0, left: idx('gst'), matrix: [['abc', '25']], createRow });
ok('a refused value is skipped and reported, the rest applied', mixed.rows[0].gst === '0' && mixed.rows[0].qty === '25'
  && mixed.skipped.length === 1 && /GST% must be a number/.test(mixed.skipped[0].reason));
const sold = { ...saved, status: 'SOLD' };
const onSold = planPaste({ rows: [sold], columns: cols, top: 0, left: idx('qty'), matrix: [['99']], createRow });
ok('a sold row is never pasted over', onSold.rows[0].qty === '20' && onSold.skipped.length === 1 && /Sold/.test(onSold.skipped[0].reason));
const echo = planPaste({ rows: [sold], columns: cols, top: 0, left: idx('qty'), matrix: [['20']], createRow });
ok('...and its own values pasted back are not reported', echo.skipped.length === 0);
const wide = planPaste({ rows: [saved], columns: cols, top: 0, left: idx('custom:Colour'), matrix: [['Red', 'x', 'y']], createRow });
ok('values past the last column are counted, not lost silently', wide.droppedCols === 2 && wide.rows[0].customFields.Colour === 'Red');
ok('the input rows are never mutated', saved.qty === '20' && saved.gst === '0');

console.log('--- barcode identifier column ---');
const idCols = sheetColumns([], { identifierOf: (row, index) => ['G1318', '05177', row.billSlNo || index + 1, row.qty].filter(Boolean).join(' * ') });
ok('the identifier sits after Sl No, read-only', idCols[1].key === 'barcodeIdentifier' && idCols[1].readOnly && idCols[2].key === 'itemCode');
ok('it is worked out from the row, so it follows an edited quantity',
  idCols[1].display({ ...saved, billSlNo: '1', qty: '35' }, 0) === 'G1318 * 05177 * 1 * 35', idCols[1].display({ ...saved, billSlNo: '1', qty: '35' }, 0));
const rowWithId = planPaste({ rows: [], columns: idCols, top: 0, left: 0,
  matrix: parseTsv('1\tG1318 * 05177 * 1 * 20\t10-PLNBTM\t10-PLNBTM\t520811\t0\t20\t-\t74.00 / 70.30\t0.00\n'), createRow });
ok('a whole copied table row - Sl No and identifier included - lines up', rowWithId.skipped.length === 0
  && rowWithId.rows[0].itemCode === '10-PLNBTM' && rowWithId.rows[0].qty === '20' && rowWithId.rows[0].purchaseRate === '74',
  JSON.stringify(rowWithId.rows[0]));

console.log('--- clear ---');
const cleared = planClear({ rows: [saved], columns: cols, rect: { r1: 0, r2: 0, c1: idx('hsn'), c2: idx('qty') } });
ok('Delete empties HSN and GST%, refuses to empty QTY/MTR', cleared.rows[0].hsn === '' && cleared.rows[0].gst === '' && cleared.rows[0].qty === '20'
  && cleared.skipped.some((s) => /required/.test(s.reason)));

console.log('--- validation ---');
const fresh = createRow(null);
ok('an untouched new row is blank - not saved, not judged', isBlankRow(fresh) && rowErrors(fresh, cols) === null);
const half = { ...fresh, itemCode: 'AB-1' };
const halfErrors = rowErrors(half, cols);
ok('a half-filled new row is told what it lacks', Boolean(halfErrors?.qty) && Boolean(halfErrors?.rate) && !halfErrors?.itemCode, JSON.stringify(halfErrors));
ok('data without an item code or name is refused', Boolean(rowErrors({ ...fresh, qty: '3' }, cols)?.itemCode));
const legacy = { ...saved, gst: 'abc' };
ok('an untouched saved row never blocks Submit', sheetProblems([legacy], cols).length === 0);
ok('...an edited one does', sheetProblems([{ ...legacy, _edited: true }], cols).some((p) => p.key === 'gst' && p.index === 0));
ok('a sold row is locked, an unsaved one never', isLockedRow(sold) && !isLockedRow({ ...sold, _id: undefined }));
ok('a unit received at another branch is locked', isLockedRow({ ...saved, currentLocationId: 'L2' }));

console.log('--- which submitted row is which saved unit (lib/barcodeRowSync.js) ---');
const units = [
  { _id: 'u1', barcodeNo: 'G1 * 05177 * 1 * 20', clientRowId: 'a' },
  { _id: 'u2', barcodeNo: 'G1 * 05177 * 1 * 20', clientRowId: 'b' },
];
const cuts = matchRowsToUnits([
  { _id: 'u1', barcodeNo: 'G1 * 05177 * 1 * 20' },
  { id: 'n1', barcodeNo: 'G1 * 05177 * 1 * 20' },
  { id: 'n2', barcodeNo: 'G1 * 05177 * 1 * 20' },
], units);
ok('new rows sharing a composed barcode number with saved ones are still new', cuts.matched.length === 1 && cuts.fresh.length === 2
  && cuts.duplicated.length === 0, JSON.stringify({ m: cuts.matched.length, f: cuts.fresh.length, d: cuts.duplicated.length }));
const again = matchRowsToUnits([{ id: 'b', barcodeNo: '' }], units);
ok('a row sent again before the screen re-read is matched by its own id', again.matched.length === 1 && again.matched[0].unit._id === 'u2' && again.fresh.length === 0);
const api = matchRowsToUnits([{ barcodeNo: 'X-1' }], [{ _id: 'u3', barcodeNo: 'X-1' }]);
ok('a caller sending neither id is matched on the barcode number', api.matched.length === 1 && api.matched[0].unit._id === 'u3');
const twice = matchRowsToUnits([{ id: 'n9' }, { id: 'n9' }], []);
ok('the same row twice in one save is refused, once', twice.fresh.length === 1 && twice.duplicated.length === 1);
ok('an _id this GRC does not hold is stale', matchRowsToUnits([{ _id: 'gone' }], units).stale.length === 1);
ok('a saved unit nobody sends is left alone', matchRowsToUnits([], units).matched.length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
