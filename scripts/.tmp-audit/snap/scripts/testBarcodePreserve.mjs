/* Barcode rows SURVIVE an update of a GRC's Barcode Generation.

   Regression test for the delete-and-recreate bug. Saving the Barcode
   Generation screen of an existing GRC used to void and delete EVERY barcode
   row of that GRC and insert whatever the browser sent: every row got a new
   _id on every save, and any row the request did not carry - Generate For
   Changes sends only the changed ones - was gone for good.

   WHAT IT PROVES, driven through the real HTTP API against the real database

     - editing one row updates THAT row: same _id, barcode number, serial,
       createdAt; the rows that were not edited are not rewritten at all
     - a request carrying only some rows leaves the others alone
     - a new row is the only thing inserted, with a barcode number of its own
     - Submit twice - at once, or again from stale browser state - duplicates
       nothing
     - UNIQUE (1 label), MTR (2) and BATCH (operator's count) survive an edit
       with their barcode unchanged
     - a payload that identifies rows only by barcode number (an API caller)
       matches them instead of duplicating them
     - new rows whose composed barcode number equals a saved unit's are still
       inserted as new, and the saved unit is not touched
     - a unit that has moved (sold) does not block saving the rest, and cannot
       itself be edited or deleted; a refused save writes nothing at all
     - deletion happens only by explicit id - the DELETE route, or the ids a
       Submit names - only of those rows, and a stale tab cannot bring one back
     - the ledger shows one receipt per unit and a reversal only for a
       quantity correction or an explicit deletion

   Every new barcode's value is checked to be exactly SUPPLIER_CODE *
   GRC_NUMBER * SEQ * QTY - SEQ the GRC's own running number, never reused,
   QTY that line's own quantity - and a corrected quantity moves the value
   with it. Rows are identified by their item codes.

   HOW TO RUN

     npm run dev                         (any running server; E2E_BASE points at it)
     npm run test:barcode-preserve

   Everything happens inside a throwaway business, so it cannot touch real
   stock. All of it - and the temporary sign-in - is removed at the end,
   pass or fail. */

import mongoose from 'mongoose';
import crypto from 'crypto';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
await mongoose.connect(process.env.MONGODB_URI);
const db = mongoose.connection.db;
const { ObjectId } = mongoose.Types;

let pass = 0, fail = 0;
const ok = (name, cond, detail = '') => {
  if (cond) { pass++; console.log('  PASS  ' + name); }
  else { fail++; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};
const note = (text) => console.log('  NOTE  ' + text);

/* ------------------------------------------------------ throwaway scope -- */
const business = new ObjectId();
const location = new ObjectId();
const finYear = '2026-2027';
const grcId = new ObjectId();
const supplierId = new ObjectId();
const supplierCode = 'GE2E' + crypto.randomBytes(2).toString('hex').toUpperCase();
const email = 'barcode-preserve-test@example.invalid';

async function cleanup() {
  await Promise.all([
    db.collection('barcodeLabel').deleteMany({ $or: [{ grcId: String(grcId) }, { businessId: String(business) }] }),
    db.collection('stockmovement').deleteMany({ $or: [{ refId: grcId }, { businessId: business }] }),
    db.collection('grc').deleteOne({ _id: grcId }),
    db.collection('contact').deleteOne({ _id: supplierId }),
    db.collection('counter').deleteMany({ key: { $regex: String(business) } }),
    db.collection('user').deleteOne({ email }),
  ]);
}

/* ---------------------------------------------------------------- sign in -- */
const salt = crypto.randomBytes(16).toString('hex');
const pw = 'Bp-' + crypto.randomBytes(6).toString('hex');
await db.collection('user').deleteOne({ email });
await db.collection('user').insertOne({
  name: 'Barcode Preserve E2E', email,
  password: salt + ':' + crypto.scryptSync(pw, salt, 64).toString('hex'),
  role: 'Super Admin', isActive: true, createdAt: new Date(), updatedAt: new Date(),
});
const login = await fetch(BASE + '/api/auth/login', {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password: pw }),
});
const cookie = (login.headers.get('set-cookie') || '').split(';')[0];
const api = (path, opts = {}) => fetch(BASE + path, {
  ...opts, headers: { 'Content-Type': 'application/json', Cookie: cookie, ...(opts.headers || {}) },
}).then(async (r) => ({ status: r.status, ok: r.ok, body: await r.json().catch(() => null) }));

/* ----------------------------------------------------------------- helpers -- */

/* the shape Add Item and the ITEMS sheet hand the grid - no _id, the
   screen's own row id, no barcode number */
let made = 0;
const newRow = (over = {}) => ({
  id: `${Date.now()}-${made++}`,
  oldBarcode: '', itemCode: 'E2E-ITEM', itemName: 'E2E ITEM', goodsType: '', sm: '', p_m_f: '',
  hsn: '520811', gst: '5', uom: 'PC', qty: '1', noOfCuts: '', totalMtr: '',
  purchaseRate: '95', encodedPurchaseRate: '', discountType: 'Percentage', discount: '0', finalPrice: '95',
  retailPrice: '150', uniqueBarcode: 'Yes', barcodeNo: '', supplierDescription: 'E2E SUPPLIER', printDescription: 'E2E PRINT',
  mode: 'unique', groupId: 'pc-1', groupSize: 1, billSlNo: '1', rsp: '150', wsp: '0', dp: '0',
  offerPrice: '', wspPrice: '', dpPrice: '',
  ...over,
});

/* exactly what the screen does to a row it loaded (lib/barcodeRowSync.js
   toGridRow) - the payload has to be the browser's, not a tidier one */
const asGridRow = (row, index) => ({
  ...row,
  id: row._id || row.id || `${row.itemCode || row.itemName || 'saved-row'}-${index}`,
  itemCode: row.itemCode || '',
  itemName: row.itemName || row.supplierDescription || row.printDescription || '',
  sm: row.sm || (row.goodsType === 'SM' ? 'SM' : ''),
  p_m_f: row.p_m_f || (row.goodsType === 'P-M-F' ? 'P-M-F' : ''),
  hsn: row.hsn || '',
  gst: row.gst || '',
  qty: row.qty || '',
  noOfCuts: row.noOfCuts || '',
  purchaseRate: row.purchaseRate || row.purRate || '',
  encodedPurchaseRate: row.encodedPurchaseRate || row.encodedPurRate || '',
  finalPrice: row.finalPrice || row.finalNet || '',
  retailPrice: row.retailPrice || row.rsp || '',
  offerPrice: row.offerPrice || '',
  uniqueBarcode: row.uniqueBarcode || (row.batchUnique === 'unique' ? 'Yes' : 'No') || 'No',
  uom: row.uom || '',
  barcodeNo: row.barcodeGenerated || row.barcodeNo || '',
  supplierDescription: row.supplierDescription || row.itemName || '',
  printDescription: row.printDescription || '',
  mode: row.mode || row.batchUnique || '',
  groupId: row.groupId || null,
  groupSize: row.groupSize || 1,
  billSlNo: row.billSlNo || '',
  rsp: row.rsp || row.retailPrice || '',
  wsp: row.wspPrice || row.wsp || '',
  dp: row.dpPrice || row.dp || '',
  customFields: row.customFields && typeof row.customFields === 'object' ? row.customFields : {},
});

const loadGrid = async () => (await api('/api/grc/' + grcId)).body.rows.map(asGridRow);

/* the body saveRows() posts - deleteIds are the saved rows removed on the grid */
const save = (rows, deleteIds = []) => api('/api/barcode-generation', {
  method: 'POST',
  body: JSON.stringify({
    rows: rows.map(({ _importStatus, _edited, ...rest }) => rest),
    grcId: String(grcId), business: String(business), location: String(location), finYear,
    supplierId: null, totals: { count: 0, value: 0 }, deleteIds,
  }),
});

const dbRows = () => db.collection('barcodeLabel').find({ grcId: String(grcId) }).sort({ createdAt: 1, _id: 1 }).toArray();
const byCode = (rows, code) => rows.find((r) => r.itemCode === code);
const countCode = (rows, code) => rows.filter((r) => r.itemCode === code).length;
const idOfCode = (rows, code) => String(byCode(rows, code)?._id);
const ids = (rows) => rows.map((r) => String(r._id)).sort();
const sameIds = (a, b) => JSON.stringify(ids(a)) === JSON.stringify(ids(b));
const keeps = (before, after) => ids(before).every((id) => ids(after).includes(id));
const sameTime = (a, b) => Boolean(a && b) && new Date(a).getTime() === new Date(b).getTime();
const codes = (rows) => rows.map((r) => r.itemCode).join(',');
const brief = (r) => r.status + ' ' + JSON.stringify(r.body).slice(0, 300);
const labelsOf = (rows) => Object.fromEntries(rows.map((r) => [r.itemCode, { type: r.barcodeType, count: r.labelCount }]));
const qtySum = (rows) => rows.reduce((s, r) => s + (parseFloat(r.qty) || 0), 0);
const numbersKept = (numbers, rows) => rows.filter((r) => numbers[r.itemCode]).every((r) => r.barcodeNo === numbers[r.itemCode]);
/* the value the save route must give: SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY,
   the GRC number written without its "GRC " prefix */
const value = (seq, qty) => `${supplierCode} * 90517 * ${seq} * ${qty}`;

try {
  await db.collection('contact').insertOne({
    _id: supplierId, contactId: supplierCode, businessName: 'E2E SUPPLIER', contactKind: 'Supplier',
    businessId: business, createdAt: new Date(), updatedAt: new Date(),
  });
  await db.collection('grc').insertOne({
    _id: grcId, businessId: business, locationId: location, finYear, grcNumber: 'GRC 90517', supplierId,
    grcDate: new Date(), stockPointName: 'Warehouse', taxable: 0, totalQuantity: 0, gst: 0, netAmount: 0,
    items: [], voucherRows: [], createdAt: new Date(), updatedAt: new Date(),
  });
  ok('signed in', Boolean(cookie), 'login ' + login.status);

  console.log('\n--- 0. a GRC with four barcodes: UNIQUE x2, MTR, BATCH ---');
  const r0 = await save([
    newRow({ billSlNo: '1', itemCode: 'E2E-A' }),
    newRow({ billSlNo: '2', itemCode: 'E2E-B' }),
    newRow({ billSlNo: '3', itemCode: 'E2E-C', uom: 'MTR', qty: '16', groupId: 'mtr-1' }),
    newRow({ billSlNo: '4', itemCode: 'E2E-D', qty: '5', uniqueBarcode: 'No', mode: 'batch', groupId: 'batch' }),
  ]);
  ok('first save accepted', r0.ok, brief(r0));
  const s0 = await dbRows();
  ok('4 rows in the database', s0.length === 4, 'got ' + s0.length);
  const issued = Object.fromEntries(s0.map((r) => [r.itemCode, r.barcodeNo]));
  ok('each value is SUPPLIER_CODE * GRC_NUMBER * SEQ * QTY - SEQ 1 to 4, each line\'s own quantity',
    issued['E2E-A'] === value(1, 1) && issued['E2E-B'] === value(2, 1) && issued['E2E-C'] === value(3, 16) && issued['E2E-D'] === value(4, 5),
    JSON.stringify(issued));
  const labels0 = labelsOf((await api('/api/grc/' + grcId)).body.rows);
  ok('label rule as configured: UNIQUE 1, MTR 2, BATCH asks',
    labels0['E2E-A']?.count === 1 && labels0['E2E-C']?.count === 2 && labels0['E2E-D']?.count === null, JSON.stringify(labels0));

  console.log('\n--- 1. edit ONE field on ONE row, whole grid submitted ---');
  let grid = await loadGrid();
  const b = byCode(grid, 'E2E-B');
  /* the grid writes a changed Purchase Rate under both names (lib/itemsSheet.js) */
  b.purchaseRate = '100'; b.purRate = '100';
  const r1 = await save(grid);
  ok('save accepted', r1.ok, brief(r1));
  const s1 = await dbRows();
  ok('still 4 rows', s1.length === 4, 'got ' + s1.length);
  ok('every row kept its database _id', sameIds(s0, s1), 'before ' + ids(s0).join(',') + ' after ' + ids(s1).join(','));
  ok('every barcode number unchanged', numbersKept(issued, s1));
  ok('the edited row carries the new purchase rate', byCode(s1, 'E2E-B')?.purRate === '100', byCode(s1, 'E2E-B')?.purRate);
  ok('the edited row kept its createdAt and serial', sameTime(byCode(s1, 'E2E-B')?.createdAt, byCode(s0, 'E2E-B')?.createdAt)
    && byCode(s1, 'E2E-B')?.serialNo === byCode(s0, 'E2E-B')?.serialNo);
  ok('rows NOT edited were not rewritten (updatedAt unchanged)',
    ['E2E-A', 'E2E-C', 'E2E-D'].every((c) => sameTime(byCode(s1, c)?.updatedAt, byCode(s0, c)?.updatedAt)));

  console.log('\n--- 2. a request carrying ONLY the changed row (Generate For Changes) ---');
  grid = await loadGrid();
  const c = byCode(grid, 'E2E-C');
  c.printDescription = 'MTR EDITED';
  const r2 = await save([c]);
  ok('save accepted', r2.ok, brief(r2));
  const s2 = await dbRows();
  ok('still 4 rows - the rows not sent were NOT deleted', s2.length === 4, 'got ' + s2.length + ': ' + codes(s2));
  ok('all _ids preserved', sameIds(s1, s2));
  ok('the sent row was updated in place', byCode(s2, 'E2E-C')?.printDescription === 'MTR EDITED' && idOfCode(s2, 'E2E-C') === idOfCode(s1, 'E2E-C'));
  const grc2 = await db.collection('grc').findOne({ _id: grcId });
  ok('GRC total quantity still counts every row, not just the one sent', grc2.totalQuantity === qtySum(s2) && grc2.totalQuantity === 23,
    'grc ' + grc2.totalQuantity + ' rows ' + qtySum(s2));

  console.log('\n--- 3. add ONE new barcode ---');
  grid = await loadGrid();
  const r3 = await save([...grid, newRow({ billSlNo: '5', itemCode: 'E2E-E' })]);
  ok('save accepted', r3.ok, brief(r3));
  const s3 = await dbRows();
  ok('exactly one row added', s3.length === s2.length + 1 && countCode(s3, 'E2E-E') === 1, s2.length + ' -> ' + s3.length);
  ok('existing rows kept their _ids and numbers', keeps(s2, s3) && numbersKept(issued, s3));
  ok('the new row takes the next SEQ: ' + value(5, 1), byCode(s3, 'E2E-E')?.barcodeNo === value(5, 1), byCode(s3, 'E2E-E')?.barcodeNo);

  console.log('\n--- 4. edit one row AND add one ---');
  grid = await loadGrid();
  byCode(grid, 'E2E-A').printDescription = 'A EDITED';
  const r4 = await save([...grid, newRow({ billSlNo: '6', itemCode: 'E2E-F' })]);
  ok('save accepted', r4.ok, brief(r4));
  const s4 = await dbRows();
  ok('exactly one row added', s4.length === s3.length + 1 && countCode(s4, 'E2E-F') === 1, s3.length + ' -> ' + s4.length);
  ok('the edited row was updated in place', byCode(s4, 'E2E-A')?.printDescription === 'A EDITED' && idOfCode(s4, 'E2E-A') === idOfCode(s3, 'E2E-A'));
  ok('existing rows kept their _ids and numbers', keeps(s3, s4) && numbersKept(issued, s4));
  ok('...and the added row is ' + value(6, 1), byCode(s4, 'E2E-F')?.barcodeNo === value(6, 1), byCode(s4, 'E2E-F')?.barcodeNo);

  console.log('\n--- 5. Submit clicked twice ---');
  grid = await loadGrid();
  const twice = [...grid, newRow({ billSlNo: '7', itemCode: 'E2E-G' })];
  const [d1, d2] = await Promise.all([save(twice), save(twice)]);
  ok('the saves are answered', d1.ok || d2.ok, brief(d1) + ' | ' + brief(d2));
  const s5 = await dbRows();
  ok('the new row exists exactly once', countCode(s5, 'E2E-G') === 1, 'copies: ' + countCode(s5, 'E2E-G'));
  ok('nothing else was duplicated', s5.length === s4.length + 1, s4.length + ' -> ' + s5.length);
  ok('...and it is ' + value(7, 1), byCode(s5, 'E2E-G')?.barcodeNo === value(7, 1), byCode(s5, 'E2E-G')?.barcodeNo);
  /* the same browser state sent again after the first save landed - its new
     row still has no _id, because the grid has not re-read yet */
  const d3 = await save(twice);
  const s5b = await dbRows();
  ok('re-sending stale state duplicates nothing', d3.ok && s5b.length === s5.length && sameIds(s5, s5b), brief(d3) + ' rows ' + s5b.length);

  console.log('\n--- 6. refresh / reopen the page ---');
  const reopened = (await api('/api/grc/' + grcId)).body.rows;
  ok('every row comes back with the same _id', JSON.stringify(reopened.map((r) => String(r._id)).sort()) === JSON.stringify(ids(s5b)),
    reopened.length + ' vs ' + s5b.length);
  const labels6 = labelsOf(reopened);
  ok('UNIQUE row: same barcode, still 1 label', labels6['E2E-A']?.count === 1 && byCode(reopened, 'E2E-A')?.barcodeNo === issued['E2E-A'], JSON.stringify(labels6['E2E-A']));
  ok('MTR row: same barcode after its edit, still 2 labels', labels6['E2E-C']?.count === 2 && byCode(reopened, 'E2E-C')?.barcodeNo === issued['E2E-C'], JSON.stringify(labels6['E2E-C']));
  ok('BATCH row: same barcode, count still the operator\'s', labels6['E2E-D']?.count === null && byCode(reopened, 'E2E-D')?.barcodeNo === issued['E2E-D'], JSON.stringify(labels6['E2E-D']));

  console.log('\n--- 7. an API caller naming rows by barcode number only ---');
  grid = await loadGrid();
  const byNumberOnly = grid.map(({ _id, id, ...rest }) => rest);
  byCode(byNumberOnly, 'E2E-D').printDescription = 'BATCH EDITED';
  const r7 = await save([...byNumberOnly, newRow({ billSlNo: '8', itemCode: 'E2E-H' })]);
  ok('save accepted', r7.ok, brief(r7));
  const s7 = await dbRows();
  ok('only the genuinely new row was added', s7.length === s5b.length + 1 && countCode(s7, 'E2E-H') === 1, s5b.length + ' -> ' + s7.length);
  ok('existing rows kept their _ids', keeps(s5b, s7));
  ok('the matched row was updated in place', byCode(s7, 'E2E-D')?.printDescription === 'BATCH EDITED' && idOfCode(s7, 'E2E-D') === idOfCode(s5b, 'E2E-D'));
  ok('the BATCH row is still a batch after the edit', byCode(s7, 'E2E-D')?.batchType === 'batch', byCode(s7, 'E2E-D')?.batchType);

  console.log('\n--- 7b. correct the quantity received on the BATCH barcode (5 -> 6) ---');
  grid = await loadGrid();
  byCode(grid, 'E2E-D').qty = '6';
  const r7b = await save(grid);
  ok('save accepted', r7b.ok, brief(r7b));
  const s7b = await dbRows();
  const d7b = byCode(s7b, 'E2E-D');
  ok('same row and SEQ; its value follows the corrected quantity: ' + value(4, 6),
    idOfCode(s7b, 'E2E-D') === idOfCode(s7, 'E2E-D') && d7b?.barcodeNo === value(4, 6) && d7b?.seq === '4'
    && d7b?.qty === '6' && d7b?.qtyNum === 6, JSON.stringify({ no: d7b?.barcodeNo, seq: d7b?.seq, qty: d7b?.qty }));
  issued['E2E-D'] = value(4, 6);
  ok('nothing else was rewritten', s7b.filter((r) => r.itemCode !== 'E2E-D').every((r) => sameTime(r.updatedAt, byCode(s7, r.itemCode)?.updatedAt)));
  const dMoves = await db.collection('stockmovement').find({ barcodeId: d7b?._id }).toArray();
  ok('the ledger follows the correction - this barcode now nets 6', dMoves.reduce((s, m) => s + m.qty, 0) === 6,
    dMoves.map((m) => m.type + ' ' + m.qty).join(', '));

  console.log('\n--- 8. one unit has been SOLD ---');
  await db.collection('barcodeLabel').updateOne({ grcId: String(grcId), itemCode: 'E2E-A' }, { $set: { status: 'SOLD' } });
  const soldBefore = await db.collection('barcodeLabel').findOne({ grcId: String(grcId), itemCode: 'E2E-A' });
  const r8a = await save(await loadGrid());
  ok('an unchanged sold unit does not block saving the GRC', r8a.ok, brief(r8a));
  const soldAfter = await db.collection('barcodeLabel').findOne({ _id: soldBefore._id });
  ok('the sold unit was left exactly as it was', soldAfter?.status === 'SOLD' && sameTime(soldAfter.updatedAt, soldBefore.updatedAt));
  grid = await loadGrid();
  byCode(grid, 'E2E-A').printDescription = 'EDIT OF A SOLD UNIT';
  byCode(grid, 'E2E-B').printDescription = 'B IN THE SAME SAVE';
  const r8b = await save(grid);
  ok('editing the sold unit is refused', r8b.status === 409, brief(r8b));
  const s8 = await dbRows();
  ok('the refused save wrote nothing - not even the in-stock row beside it',
    byCode(s8, 'E2E-B')?.printDescription !== 'B IN THE SAME SAVE' && byCode(s8, 'E2E-A')?.printDescription !== 'EDIT OF A SOLD UNIT');
  await db.collection('barcodeLabel').updateOne({ _id: soldBefore._id }, { $set: { status: 'IN_STOCK' } });

  console.log('\n--- 9. explicit delete of ONE barcode ---');
  const before9 = await dbRows();
  const e = byCode(before9, 'E2E-E');
  const del = await api('/api/barcode-generation', { method: 'DELETE', body: JSON.stringify({ id: String(e?._id) }) });
  ok('delete accepted', del.ok, brief(del));
  const s9 = await dbRows();
  ok('exactly that row is gone', s9.length === before9.length - 1 && !byCode(s9, 'E2E-E'), before9.length + ' -> ' + s9.length);
  ok('every other row kept its _id', ids(before9).filter((id) => id !== String(e?._id)).every((id) => ids(s9).includes(id)));
  const r9 = await save([...(await loadGrid()), asGridRow({ ...e, _id: String(e?._id) }, 99)]);
  const s9b = await dbRows();
  ok('a stale tab cannot bring the deleted barcode back', !byCode(s9b, 'E2E-E') && s9b.length === s9.length, 'rows ' + s9b.length);
  ok('...and is told so rather than silently accepted', r9.status === 409, brief(r9));

  console.log('\n--- 9b. rows removed on the grid are deleted by Submit - explicit ids, one transaction ---');
  grid = await loadGrid();
  const bId = idOfCode(s9b, 'E2E-B');
  byCode(grid, 'E2E-C').noOfCuts = '4';
  byCode(grid, 'E2E-C').itemName = 'RENAMED C';
  const r9c = await save(grid.filter((r) => r.itemCode !== 'E2E-B'), [bId]);
  ok('a Submit with a removed row is accepted', r9c.ok && r9c.body?.deleted === 1, brief(r9c));
  const s9c = await dbRows();
  ok('exactly the removed row is gone', s9c.length === s9b.length - 1 && !byCode(s9c, 'E2E-B'), s9b.length + ' -> ' + s9c.length);
  ok('every other row kept its _id', ids(s9b).filter((id) => id !== bId).every((id) => ids(s9c).includes(id)));
  ok('No. of Cut and an edited Item name are saved on their row',
    byCode(s9c, 'E2E-C')?.noOfCuts === '4' && byCode(s9c, 'E2E-C')?.itemName === 'RENAMED C' && idOfCode(s9c, 'E2E-C') === idOfCode(s9b, 'E2E-C'),
    JSON.stringify({ noOfCuts: byCode(s9c, 'E2E-C')?.noOfCuts, itemName: byCode(s9c, 'E2E-C')?.itemName }));
  const reopenedC = byCode(await loadGrid(), 'E2E-C');
  ok('...and come back that way when the page is reopened', reopenedC?.noOfCuts === '4' && reopenedC?.itemName === 'RENAMED C',
    JSON.stringify({ noOfCuts: reopenedC?.noOfCuts, itemName: reopenedC?.itemName }));

  await db.collection('barcodeLabel').updateOne({ grcId: String(grcId), itemCode: 'E2E-A' }, { $set: { status: 'SOLD' } });
  grid = await loadGrid();
  const aId = String(byCode(grid, 'E2E-A')?._id);
  byCode(grid, 'E2E-C').printDescription = 'C WITH A REFUSED DELETE';
  const r9d = await save(grid.filter((r) => r.itemCode !== 'E2E-A'), [aId]);
  const s9d = await dbRows();
  ok('deleting a sold unit is refused', r9d.status === 409, brief(r9d));
  ok('...and nothing in that Submit was written', Boolean(byCode(s9d, 'E2E-A')) && byCode(s9d, 'E2E-C')?.printDescription !== 'C WITH A REFUSED DELETE');
  await db.collection('barcodeLabel').updateOne({ grcId: String(grcId), itemCode: 'E2E-A' }, { $set: { status: 'IN_STOCK' } });

  const r9e = await save(await loadGrid(), [idOfCode(s9d, 'E2E-D')]);
  ok('a row cannot be kept and deleted in one Submit', r9e.status === 409 && (await dbRows()).length === s9d.length, brief(r9e));

  await save([...(await loadGrid()), newRow({ billSlNo: '9', itemCode: 'E2E-J' })]);
  const jId = idOfCode(await dbRows(), 'E2E-J');
  const r9f = await save([], [jId]);
  const s9f = await dbRows();
  ok('a Submit that only deletes is accepted', r9f.ok && !byCode(s9f, 'E2E-J') && s9f.length === s9d.length, brief(r9f));

  console.log('\n--- 9c. SEQ is never reused; two lines of the same quantity never share a value ---');
  /* the same bill serial and quantity as E2E-A, twice - two cuts of one
     length, as Add Item makes them */
  const aBefore = await db.collection('barcodeLabel').findOne({ grcId: String(grcId), itemCode: 'E2E-A' });
  const clashRows = [newRow({ billSlNo: '1', itemCode: 'E2E-K1' }), newRow({ billSlNo: '1', itemCode: 'E2E-K2' })];
  const r9g = await save([...(await loadGrid()), ...clashRows]);
  const s9g = await dbRows();
  ok('both are saved as new rows, SEQ 10 and 11 - SEQ 9 left with the deleted E2E-J',
    r9g.ok && byCode(s9g, 'E2E-K1')?.barcodeNo === value(10, 1) && byCode(s9g, 'E2E-K2')?.barcodeNo === value(11, 1) && s9g.length === s9f.length + 2,
    brief(r9g) + ' ' + JSON.stringify([byCode(s9g, 'E2E-K1')?.barcodeNo, byCode(s9g, 'E2E-K2')?.barcodeNo]));
  const aAfter = byCode(s9g, 'E2E-A');
  ok('E2E-A itself was not touched', String(aAfter?._id) === String(aBefore._id) && sameTime(aAfter?.updatedAt, aBefore.updatedAt));
  const again = await save([...(await loadGrid()).filter((r) => !['E2E-K1', 'E2E-K2'].includes(r.itemCode)), ...clashRows]);
  ok('sent again from the same screen, they are matched by their row ids - no copies', again.ok && (await dbRows()).length === s9g.length, brief(again));
  ok('no two barcodes of the GRC share a value', new Set(s9g.map((r) => r.barcodeNo)).size === s9g.length);

  console.log('\n--- 10. ledger and header ---');
  const sEnd = await dbRows();
  const ledger = await db.collection('stockmovement').find({ refModel: 'grc', refId: grcId }).toArray();
  const receipts = ledger.filter((m) => m.type === 'GRC_IN' && !m.reason);
  const voids = ledger.filter((m) => m.type === 'GRC_VOID');
  ok('one receipt per unit ever received - existing units were never received again',
    receipts.length === 11 && new Set(receipts.map((m) => String(m.barcodeId))).size === 11, 'first receipts ' + receipts.length);
  const corrections = voids.filter((m) => /corrected/i.test(m.reason));
  const deletions = voids.filter((m) => /deleted from the GRC/i.test(m.reason));
  ok('the only reversals are the quantity correction and the two explicit deletions',
    voids.length === 3 && corrections.length === 1 && String(corrections[0].barcodeId) === idOfCode(sEnd, 'E2E-D')
      && deletions.length === 2 && deletions.every((m) => [bId, jId].includes(String(m.barcodeId))),
    voids.map((m) => m.barcodeNo + ' ' + m.reason).join(' | '));
  const net = new Map();
  (await db.collection('stockmovement').find({ barcodeId: { $in: sEnd.map((r) => r._id) } }).toArray())
    .forEach((m) => net.set(String(m.barcodeId), (net.get(String(m.barcodeId)) || 0) + m.qty));
  const off = sEnd.filter((r) => net.get(String(r._id)) !== r.qtyNum);
  ok('the ledger nets to every unit\'s quantity', off.length === 0,
    off.map((r) => r.itemCode + ' ' + net.get(String(r._id)) + '/' + r.qtyNum).join(', '));
  const grcEnd = await db.collection('grc').findOne({ _id: grcId });
  ok('GRC total quantity equals the rows on it', grcEnd.totalQuantity === qtySum(sEnd), grcEnd.totalQuantity + ' vs ' + qtySum(sEnd));
  const serials = Object.fromEntries(sEnd.map((r) => [r.itemCode, r.serialNo]));
  ok('serial numbers as first saved', serials['E2E-A'] === '1' && serials['E2E-C'] === '3' && serials['E2E-D'] === '4', JSON.stringify(serials));
  ok('barcode numbers as first issued', numbersKept(issued, sEnd));

  console.log('\n--- 11. an older barcode keeps its printed number; no supplier code, no barcodes ---');
  await db.collection('barcodeLabel').insertOne({
    grcId: String(grcId), businessId: String(business), locationId: String(location), barcodeNo: 'OLD-9A0001', barcodeGenerated: 'OLD-9A0001',
    itemCode: 'E2E-OLD', itemName: 'E2E OLD', qty: '3', qtyNum: 3, uom: 'PC', purRate: '95', finalNet: '95', gst: '5', seq: '',
    status: 'IN_STOCK', batchType: 'batch', batchUnique: 'batch', currentLocationId: location, createdAt: new Date(), updatedAt: new Date(),
  });
  grid = await loadGrid();
  byCode(grid, 'E2E-OLD').qty = '4';
  const r11 = await save(grid);
  const old = byCode(await dbRows(), 'E2E-OLD');
  ok('an older barcode\'s quantity can be corrected, and it keeps the number printed on it',
    r11.ok && old?.qty === '4' && old?.barcodeNo === 'OLD-9A0001', brief(r11) + ' ' + old?.barcodeNo);
  await db.collection('contact').updateOne({ _id: supplierId }, { $set: { contactId: '' } });
  const before11 = (await dbRows()).length;
  const r11b = await save([...(await loadGrid()), newRow({ billSlNo: '12', itemCode: 'E2E-NOCODE' })]);
  ok('with no supplier code the save is refused, and says why', r11b.status === 400 && /supplier code/i.test(r11b.body?.error || ''), brief(r11b));
  ok('...and nothing was written', (await dbRows()).length === before11);
  await db.collection('contact').updateOne({ _id: supplierId }, { $set: { contactId: supplierCode } });
} catch (err) {
  fail++;
  console.log('  FAIL  test aborted -> ' + (err?.stack || err));
} finally {
  await cleanup();
  await mongoose.disconnect();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
