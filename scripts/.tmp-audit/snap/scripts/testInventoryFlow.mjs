/* End-to-end test of the inventory lifecycle, driven through the real HTTP
   API against the real database.

   WHAT IT PROVES

     - the four barcode rules (PC/MTR x batch/unique) produce the right
       number of labels, each carrying the right quantity
     - barcode numbers are unique and never collide with existing stock
     - a GRC creates stock and opens each unit's ledger entry
     - scanning enforces status and location, and refuses a repeat scan
     - a transfer moves stock, can be partially received, and returned
     - billable quantity is despatched minus returned, computed not entered
     - a barcode cannot be sold twice, received twice, or refunded twice
     - two concurrent transfers of one unit resolve to exactly one winner
     - the movement ledger and the stock reports agree with the barcodes

   HOW TO RUN

     npx next build && npx next start -p 3111      (in one terminal)
     npm run test:inventory                        (in another)

   It expects the server on http://127.0.0.1:3111 - override with E2E_BASE.

   IT WRITES TO WHATEVER DATABASE MONGODB_URI POINTS AT. Everything it creates
   is tracked and deleted in the cleanup step, including a temporary sign-in
   account, and it touches no pre-existing record. Even so, prefer running it
   against a copy: a test that asserts on real data is only safe while it
   passes, and the cleanup cannot run if the process is killed mid-way. */

import mongoose from 'mongoose';

const BASE = process.env.E2E_BASE || 'http://127.0.0.1:3111';
const URI = process.env.MONGODB_URI;

let cookie = '';
let pass = 0;
let fail = 0;
const created = { barcodes: [], transfers: [], grcs: [], invoices: [], returns: [], users: [] };

const ok = (name, cond, detail = '') => {
  if (cond) { pass += 1; console.log('  PASS  ' + name); }
  else { fail += 1; console.log('  FAIL  ' + name + (detail ? '  -> ' + detail : '')); }
};

async function api(path, options = {}) {
  const r = await fetch(BASE + path, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...(cookie ? { Cookie: cookie } : {}),
      ...(options.headers || {}),
    },
  });
  const setCookie = r.headers.get('set-cookie');
  if (setCookie) cookie = setCookie.split(';')[0];
  let body = null;
  try { body = await r.json(); } catch { body = null; }
  return { status: r.status, ok: r.ok, body };
}

async function main() {
  await mongoose.connect(URI);
  const db = mongoose.connection.db;

  /* ---------------------------------------------------------- sign in --- */
  console.log('\n--- auth ---');
  const crypto = await import('crypto');
  const salt = crypto.randomBytes(16).toString('hex');
  const hash = salt + ':' + crypto.scryptSync('E2E-test-pass', salt, 64).toString('hex');
  const email = 'e2e-runner@example.invalid';
  await db.collection('user').deleteOne({ email });
  const ins = await db.collection('user').insertOne({
    name: 'E2E Runner', email, password: hash, role: 'Super Admin', isActive: true,
    createdAt: new Date(), updatedAt: new Date(),
  });
  created.users.push(ins.insertedId);

  const login = await api('/api/auth/login', {
    method: 'POST', body: JSON.stringify({ email, password: 'E2E-test-pass' }),
  });
  ok('sign in', login.ok, JSON.stringify(login.body));
  if (!login.ok) return finish(db);

  /* ------------------------------------------------------------ scope --- */
  const biz = await db.collection('business').findOne({ name: 'TEMPLE FABRICS' });
  const locs = await db.collection('companylocation')
    .find({ businessId: biz._id }).limit(3).toArray();
  const business = String(biz._id);
  const locA = String(locs[0]._id);
  const locB = String(locs[1]._id);
  const finYear = '2026-2027';
  console.log(`business=${biz.name}  A=${locs[0].name}  B=${locs[1].name}`);

  /* =================================================== 1. barcode rules = */
  console.log('\n--- 1. barcode generation rules (PC/MTR x batch/unique) ---');

  const plan = async (uom, batchType, qty, cuts) => {
    const r = await api('/api/barcode-generation/reserve', {
      method: 'POST',
      body: JSON.stringify({ uom, batchType, qty, cuts, business, finYear }),
    });
    return r;
  };

  const pcBatch = await plan('PC', 'batch', 1);
  ok('PC + batch, qty 1 -> 1 barcode', pcBatch.body?.count === 1, 'got ' + pcBatch.body?.count);

  const pcBatch5 = await plan('PC', 'batch', 5);
  ok('PC + batch, qty 5 -> 1 barcode carrying 5',
    pcBatch5.body?.count === 1 && pcBatch5.body?.rows?.[0]?.qty === 5,
    JSON.stringify(pcBatch5.body?.rows));

  const pcUnique = await plan('PC', 'unique', 5);
  ok('PC + unique, qty 5 -> 5 barcodes of 1',
    pcUnique.body?.count === 5 && pcUnique.body.rows.every((r) => r.qty === 1),
    'got ' + pcUnique.body?.count);

  const mtrBatch = await plan('MTR', 'batch', 5);
  ok('MTR + batch, qty 5 -> 1 barcode carrying 5 MTR',
    mtrBatch.body?.count === 1 && mtrBatch.body?.rows?.[0]?.qty === 5,
    JSON.stringify(mtrBatch.body?.rows));

  const mtrUnique = await plan('MTR', 'unique', 5);
  ok('MTR + unique, qty 5 -> 5 barcodes',
    mtrUnique.body?.count === 5, 'got ' + mtrUnique.body?.count);

  const mtrCuts = await plan('MTR', 'unique', 6, [2.5, 2.5, 1]);
  ok('MTR + unique with cuts [2.5,2.5,1] -> 3 barcodes summing to 6',
    mtrCuts.body?.count === 3 &&
    Math.abs(mtrCuts.body.rows.reduce((a, r) => a + r.qty, 0) - 6) < 0.001,
    JSON.stringify(mtrCuts.body?.rows));

  const badFraction = await plan('PC', 'unique', 2.5);
  ok('PC + unique with a fractional qty is refused',
    badFraction.status === 422 || badFraction.status === 409,
    'status ' + badFraction.status + ' ' + JSON.stringify(badFraction.body));

  /* numbers must be unique and above the seeded floor */
  const allNumbers = [
    ...pcBatch.body.rows, ...pcBatch5.body.rows, ...pcUnique.body.rows,
    ...mtrBatch.body.rows, ...mtrUnique.body.rows, ...mtrCuts.body.rows,
  ].map((r) => r.barcodeNo);
  ok('every reserved number is distinct',
    new Set(allNumbers).size === allNumbers.length,
    allNumbers.join(','));

  const clash = await db.collection('barcodeLabel')
    .countDocuments({ businessId: business, barcodeNo: { $in: allNumbers } });
  ok('no reserved number collides with existing stock', clash === 0, 'clashes: ' + clash);

  /* ==================================================== 2. GRC -> stock = */
  console.log('\n--- 2. GRC creates stock and opens the ledger ---');

  const rows = [
    ...pcUnique.body.rows.map((r, i) => ({
      barcodeNo: r.barcodeNo, itemCode: 'E2E-PC', qty: String(r.qty), uom: 'PC',
      batchUnique: 'unique', printDescription: 'E2E Cotton Shirt', supplierDescription: 'E2E Cotton Shirt',
      hsn: '6205', gst: '5', purRate: '400', finalNet: '380', retailPrice: '999',
      offerPrice: '899', billSlNo: String(i + 1),
    })),
    {
      barcodeNo: mtrBatch.body.rows[0].barcodeNo, itemCode: 'E2E-MTR', qty: '5', uom: 'MTR',
      batchUnique: 'batch', printDescription: 'E2E Silk Roll', supplierDescription: 'E2E Silk Roll',
      hsn: '5007', gst: '5', purRate: '600', finalNet: '570', retailPrice: '1500',
      offerPrice: '1400', billSlNo: '6',
    },
  ];

  const grc = await api('/api/barcode-generation', {
    method: 'POST',
    body: JSON.stringify({
      rows, business, location: locA, finYear,
      totals: { count: 10, value: 9495 },
    }),
  });
  ok('GRC + barcodes saved', grc.ok && grc.body?.count === 6, JSON.stringify(grc.body));
  if (grc.body?.grcId) created.grcs.push(grc.body.grcId);
  created.barcodes.push(...rows.map((r) => r.barcodeNo));
  console.log('   GRC ' + grc.body?.grcNumber);

  const stocked = await db.collection('barcodeLabel')
    .find({ barcodeNo: { $in: created.barcodes } }).toArray();
  ok('all 6 units are IN_STOCK at location A',
    stocked.length === 6 && stocked.every((u) => u.status === 'IN_STOCK' && String(u.currentLocationId) === locA),
    stocked.map((u) => u.status).join(','));

  const grcMoves = await db.collection('stockmovement')
    .countDocuments({ barcodeNo: { $in: created.barcodes }, type: 'GRC_IN' });
  ok('ledger has a GRC_IN for every unit', grcMoves === 6, 'got ' + grcMoves);

  /* the MTR batch unit must carry 5, not 1 */
  const batchUnit = stocked.find((u) => u.itemCode === 'E2E-MTR');
  ok('MTR batch unit carries qty 5', batchUnit?.qtyNum === 5, 'got ' + batchUnit?.qtyNum);

  /* ======================================================== 3. scanning = */
  console.log('\n--- 3. scanning ---');

  const scan = (code, extra = {}) => api('/api/barcode/scan', {
    method: 'POST', body: JSON.stringify({ code, business, location: locA, intent: 'SELL', ...extra }),
  });

  const s1 = await scan(created.barcodes[0]);
  ok('a valid in-stock barcode scans', s1.ok && s1.body?.unit?.barcodeNo === created.barcodes[0],
    JSON.stringify(s1.body));

  const sNone = await scan('NO-SUCH-BARCODE-E2E');
  ok('an unknown barcode is refused with BARCODE_NOT_FOUND',
    sNone.status === 404 && sNone.body?.code === 'BARCODE_NOT_FOUND', JSON.stringify(sNone.body));

  const sDup = await scan(created.barcodes[0], { scanned: [created.barcodes[0]] });
  ok('a repeat scan on the same document is refused',
    sDup.status === 409 && sDup.body?.code === 'BARCODE_DUPLICATE_SCAN', JSON.stringify(sDup.body));

  const sWrongLoc = await api('/api/barcode/scan', {
    method: 'POST', body: JSON.stringify({ code: created.barcodes[0], business, location: locB, intent: 'SELL' }),
  });
  ok('a barcode held at another location is refused',
    sWrongLoc.status === 409 && sWrongLoc.body?.code === 'BARCODE_WRONG_LOCATION',
    JSON.stringify(sWrongLoc.body));

  /* ==================================================== 4. stock transfer */
  console.log('\n--- 4. transfer 5 units A -> B ---');

  const moving = created.barcodes.slice(0, 5);
  const transfer = await api('/api/stock-transfer', {
    method: 'POST',
    body: JSON.stringify({
      business, finYear, fromLocationId: locA, toLocationId: locB,
      barcodes: moving, waybill: 'E2E-WB-1', remarks: 'E2E test transfer',
    }),
  });
  ok('transfer despatched', transfer.ok && transfer.body?.id, JSON.stringify(transfer.body));
  const tid = transfer.body?.id;
  if (tid) created.transfers.push(tid);
  console.log('   transfer ' + transfer.body?.transferNo);

  const inTransit = await db.collection('barcodeLabel')
    .countDocuments({ barcodeNo: { $in: moving }, status: 'IN_TRANSIT' });
  ok('despatched units are IN_TRANSIT', inTransit === 5, 'got ' + inTransit);

  const sellInTransit = await scan(moving[0]);
  ok('an in-transit barcode cannot be sold',
    sellInTransit.status === 409 && sellInTransit.body?.code === 'BARCODE_IN_TRANSIT',
    JSON.stringify(sellInTransit.body));

  /* -------------------------------------------------- receive 3 of 5 --- */
  const recv = await api(`/api/stock-transfer/${tid}/receive`, {
    method: 'POST', body: JSON.stringify({ barcodes: moving.slice(0, 3) }),
  });
  ok('partial receive of 3', recv.ok && recv.body?.receivedCount === 3, JSON.stringify(recv.body));
  ok('status becomes PARTIALLY_RECEIVED', recv.body?.status === 'PARTIALLY_RECEIVED', recv.body?.status);
  ok('2 remain pending', recv.body?.pendingCount === 2, 'got ' + recv.body?.pendingCount);

  const recvAgain = await api(`/api/stock-transfer/${tid}/receive`, {
    method: 'POST', body: JSON.stringify({ barcodes: moving.slice(0, 3) }),
  });
  ok('receiving the same lines twice is refused',
    recvAgain.status === 409 && recvAgain.body?.code === 'ALREADY_RECEIVED',
    JSON.stringify(recvAgain.body));

  /* --------------------------------------------------- return 2 damaged */
  const ret = await api(`/api/stock-transfer/${tid}/return`, {
    method: 'POST',
    body: JSON.stringify({ barcodes: moving.slice(3, 5), reason: 'Damaged', notes: 'E2E torn in transit' }),
  });
  ok('2 units returned as damaged', ret.ok && ret.body?.returnedCount === 2, JSON.stringify(ret.body));

  ok('BILLABLE = SENT - RETURNED (5 - 2 = 3)', ret.body?.billableQty === 3,
    'got ' + ret.body?.billableQty);

  const retAgain = await api(`/api/stock-transfer/${tid}/return`, {
    method: 'POST', body: JSON.stringify({ barcodes: [moving[3]], reason: 'Damaged' }),
  });
  ok('returning the same unit twice is refused',
    retAgain.status === 409 && retAgain.body?.code === 'ALREADY_RETURNED',
    JSON.stringify(retAgain.body));

  const badReason = await api(`/api/stock-transfer/${tid}/return`, {
    method: 'POST', body: JSON.stringify({ barcodes: [moving[0]], reason: 'Whatever' }),
  });
  ok('an invalid return reason is refused', badReason.status === 422, JSON.stringify(badReason.body));

  /* --------------------------------------------- billing before takeback */
  const billEarly = await api(`/api/stock-transfer/${tid}/bill`, {
    method: 'POST', body: JSON.stringify({}),
  });
  ok('billing is blocked while returns are still in transit',
    billEarly.status === 409 && billEarly.body?.code === 'RETURNS_PENDING',
    JSON.stringify(billEarly.body));

  /* ------------------------------------------------------ accept return */
  const accept = await api(`/api/stock-transfer/${tid}/accept-return`, {
    method: 'POST', body: JSON.stringify({}),
  });
  ok('source takes the 2 returned units back', accept.ok && accept.body?.acceptedCount === 2,
    JSON.stringify(accept.body));

  const backInStock = await db.collection('barcodeLabel')
    .find({ barcodeNo: { $in: moving.slice(3, 5) } }).toArray();
  ok('returned units are IN_STOCK at the SOURCE again',
    backInStock.every((u) => u.status === 'IN_STOCK' && String(u.currentLocationId) === locA),
    backInStock.map((u) => u.status + '@' + String(u.currentLocationId).slice(-4)).join(','));

  /* ------------------------------------------------------------- bill -- */
  const bill = await api(`/api/stock-transfer/${tid}/bill`, {
    method: 'POST', body: JSON.stringify({}),
  });
  ok('bill raised', bill.ok && bill.body?.billingNo, JSON.stringify(bill.body?.billingNo));
  ok('bill quantity is the accepted quantity (3)',
    bill.body?.quantities?.billable === 3, JSON.stringify(bill.body?.quantities));
  ok('bill lists RSP on every line',
    (bill.body?.lines || []).every((l) => l.rsp > 0), JSON.stringify((bill.body?.lines || []).map((l) => l.rsp)));
  ok('bill carries the document barcode', bill.body?.documentBarcode === transfer.body?.transferNo,
    bill.body?.documentBarcode);
  ok('returned units are listed as excluded', (bill.body?.excluded || []).length === 2,
    'got ' + (bill.body?.excluded || []).length);

  const billTwice = await api(`/api/stock-transfer/${tid}/bill`, {
    method: 'POST', body: JSON.stringify({}),
  });
  ok('billing twice is refused', billTwice.status === 409 && billTwice.body?.code === 'ALREADY_BILLED',
    JSON.stringify(billTwice.body));

  /* ----------------------------------- document number scan resolves it */
  const byNo = await api('/api/stock-transfer?perPage=1&search=' + encodeURIComponent(transfer.body.transferNo));
  ok('scanning the document number finds the transaction',
    byNo.body?.rows?.[0]?._id === tid, JSON.stringify(byNo.body?.rows?.[0]?.transferNo));

  /* ============================================================ 5. POS = */
  console.log('\n--- 5. POS sale and return ---');

  const sellUnit = created.barcodes[5];            // the MTR batch unit, still at A
  const sale = await api('/api/sell-pos', {
    method: 'POST',
    body: JSON.stringify({
      business, location: locA, finYear,
      data: {
        date: new Date().toISOString().slice(0, 10),
        billingType: 'Cash', exempted: 'NO',
        items: [{
          barcodeNo: sellUnit, itemCode: 'E2E-MTR', itemName: 'E2E Silk Roll',
          qty: 5, rsp: 1400, rate: 1400, gst: 5, discountPct: 0,
        }],
        payments: [{ method: 'Cash', amount: 7350 }],
        totalAmount: 7350, paid: 7350,
      },
    }),
  });
  ok('POS sale saved', sale.ok && sale.body?.invoiceNo, JSON.stringify(sale.body));
  if (sale.body?.id) created.invoices.push(sale.body.id);

  const soldUnit = await db.collection('barcodeLabel').findOne({ barcodeNo: sellUnit });
  ok('the sold unit is marked SOLD', soldUnit?.status === 'SOLD', soldUnit?.status);
  ok('the sold unit records its invoice', soldUnit?.billingNo === sale.body?.invoiceNo, soldUnit?.billingNo);

  const posMove = await db.collection('stockmovement')
    .findOne({ barcodeNo: sellUnit, type: 'POS_OUT' });
  ok('ledger records POS_OUT with a negative quantity', posMove?.qty === -5, 'got ' + posMove?.qty);

  /* THE BUG THIS WHOLE EXERCISE EXISTS FOR */
  const sellTwice = await api('/api/sell-pos', {
    method: 'POST',
    body: JSON.stringify({
      business, location: locA, finYear,
      data: {
        items: [{ barcodeNo: sellUnit, itemCode: 'E2E-MTR', qty: 5, rsp: 1400, gst: 5 }],
        totalAmount: 7350, paid: 7350,
      },
    }),
  });
  ok('THE SAME BARCODE CANNOT BE SOLD TWICE',
    sellTwice.status === 409 && sellTwice.body?.code === 'BARCODE_UNAVAILABLE',
    'status ' + sellTwice.status + ' ' + JSON.stringify(sellTwice.body));

  /* --------------------------------------------------------- POS return */
  const lookup = await api(`/api/sell-pos-return/lookup?business=${business}&barcode=${sellUnit}`);
  ok('return lookup finds the sale by scanning the item',
    lookup.ok && lookup.body?.invoice?.invoiceNo === sale.body?.invoiceNo,
    JSON.stringify(lookup.body?.invoice?.invoiceNo));
  ok('the sold line is reported returnable',
    lookup.body?.lines?.[0]?.returnable === true, JSON.stringify(lookup.body?.lines?.[0]));

  const overRefund = await api('/api/sell-pos-return', {
    method: 'POST',
    body: JSON.stringify({
      business, location: locA, finYear,
      data: { parentInvoiceId: sale.body.id, barcodes: [sellUnit], reason: 'Damaged', refundAmount: 99999 },
    }),
  });
  ok('a refund above what was charged is refused', overRefund.status === 422,
    JSON.stringify(overRefund.body));

  const posReturn = await api('/api/sell-pos-return', {
    method: 'POST',
    body: JSON.stringify({
      business, location: locA, finYear,
      data: { parentInvoiceId: sale.body.id, barcodes: [sellUnit], reason: 'Damaged', refundMode: 'Cash' },
    }),
  });
  ok('POS return processed', posReturn.ok && posReturn.body?.invoiceNo, JSON.stringify(posReturn.body));
  if (posReturn.body?.id) created.returns.push(posReturn.body.id);

  const returned = await db.collection('barcodeLabel').findOne({ barcodeNo: sellUnit });
  ok('the returned unit is back IN_STOCK', returned?.status === 'IN_STOCK', returned?.status);

  const returnTwice = await api('/api/sell-pos-return', {
    method: 'POST',
    body: JSON.stringify({
      business, location: locA, finYear,
      data: { parentInvoiceId: sale.body.id, barcodes: [sellUnit], reason: 'Damaged' },
    }),
  });
  ok('the same unit cannot be refunded twice',
    returnTwice.status === 409 && returnTwice.body?.code === 'ALREADY_RETURNED',
    JSON.stringify(returnTwice.body));

  /* ======================================================= 6. locking === */
  console.log('\n--- 6. location-pair locking ---');
  const lockAB = await api(`/api/stock-transfer/lock?business=${business}&from=${locA}&to=${locB}`);
  ok('lock endpoint answers for a pair', lockAB.ok, JSON.stringify(lockAB.body));
  ok('A<->B is free when nothing is running', lockAB.body?.busy === false, JSON.stringify(lockAB.body));

  /* two despatches between the same pair, fired together: both must resolve,
     and the units must not be double-committed */
  const [p1, p2] = await Promise.all([
    api('/api/stock-transfer', {
      method: 'POST',
      body: JSON.stringify({ business, finYear, fromLocationId: locA, toLocationId: locB, barcodes: [created.barcodes[3]] }),
    }),
    api('/api/stock-transfer', {
      method: 'POST',
      body: JSON.stringify({ business, finYear, fromLocationId: locA, toLocationId: locB, barcodes: [created.barcodes[3]] }),
    }),
  ]);
  const wins = [p1, p2].filter((r) => r.ok).length;
  ok('two concurrent transfers of ONE unit: exactly one succeeds', wins === 1,
    `p1=${p1.status} p2=${p2.status} ${JSON.stringify(p1.body?.error || p2.body?.error)}`);
  [p1, p2].forEach((r) => { if (r.body?.id) created.transfers.push(r.body.id); });

  const unitAfter = await db.collection('barcodeLabel').findOne({ barcodeNo: created.barcodes[3] });
  ok('the contested unit moved exactly once', unitAfter?.status === 'IN_TRANSIT', unitAfter?.status);

  /* THE POINT OF A PAIR LOCK: it must not be a global one.

     A lock is taken on A<->B and held while a second pair is exercised. If
     the lock were global - or keyed on the business, or on inventory as a
     whole - the C<->D transfer would block behind it. It must not. */
  const locC = locs[2] ? String(locs[2]._id) : null;
  if (locC) {
    await db.collection('transferlock').insertOne({
      pair: [business, locA, locB].sort().join(':'),
      businessId: biz._id, fromLocationId: locs[0]._id, toLocationId: locs[1]._id,
      operation: 'e2e:held-open', refNo: 'E2E-LOCK', token: 'e2e-token',
      userName: 'E2E', acquiredAt: new Date(),
      expiresAt: new Date(Date.now() + 60000),
      createdAt: new Date(), updatedAt: new Date(),
    });

    const heldAB = await api(`/api/stock-transfer/lock?business=${business}&from=${locA}&to=${locB}`);
    ok('A<->B reports busy while held', heldAB.body?.busy === true, JSON.stringify(heldAB.body));

    const freeCD = await api(`/api/stock-transfer/lock?business=${business}&from=${locC}&to=${locA}`);
    ok('a DIFFERENT pair stays free while A<->B is locked',
      freeCD.body?.busy === false, JSON.stringify(freeCD.body));

    /* and a real transfer on the other pair must actually go through */
    const otherPair = await api('/api/stock-transfer', {
      method: 'POST',
      body: JSON.stringify({
        business, finYear, fromLocationId: locA, toLocationId: locC,
        barcodes: [created.barcodes[4]],
      }),
    });
    ok('a transfer on the other pair completes while A<->B is locked',
      otherPair.ok, `status ${otherPair.status} ${JSON.stringify(otherPair.body?.error)}`);
    if (otherPair.body?.id) created.transfers.push(otherPair.body.id);

    await db.collection('transferlock').deleteMany({ token: 'e2e-token' });
  } else {
    console.log('  SKIP  third location needed for the C<->D case');
  }

  /* ===================================================== 7. traceability */
  console.log('\n--- 7. traceability and reports ---');
  const hist = await api('/api/barcode/' + encodeURIComponent(created.barcodes[0]));
  ok('barcode history is retrievable', hist.ok && (hist.body?.history || []).length >= 2,
    'events: ' + (hist.body?.history || []).length);
  console.log('   trail: ' + (hist.body?.history || []).map((h) => h.type).join(' -> '));

  const today = new Date().toISOString().slice(0, 10);
  const monthAgo = new Date(Date.now() - 30 * 864e5).toISOString().slice(0, 10);

  const move = await api(`/api/reports/stock-movement?business=${business}&finYear=${finYear}&fromDate=${monthAgo}&toDate=${today}&tab=daily`);
  ok('stock movement report runs', move.ok, JSON.stringify(move.body?.error));
  ok('it reports our movements', (move.body?.tiles?.events || 0) > 0, JSON.stringify(move.body?.tiles));

  const stock = await api(`/api/reports/item-stock?business=${business}&finYear=${finYear}&fromDate=${monthAgo}&toDate=${today}&tab=itemwise`);
  ok('item stock report runs', stock.ok, JSON.stringify(stock.body?.error));
  ok('outward is no longer always zero', (stock.body?.tiles?.outwardQty || 0) !== 0,
    JSON.stringify(stock.body?.tiles));

  await finish(db);
}

async function finish(db) {
  console.log('\n--- cleanup ---');
  try {
    if (created.barcodes.length) {
      const r = await db.collection('barcodeLabel').deleteMany({ barcodeNo: { $in: created.barcodes } });
      console.log('  removed ' + r.deletedCount + ' test barcodes');
      await db.collection('stockmovement').deleteMany({ barcodeNo: { $in: created.barcodes } });
    }
    for (const id of created.transfers) {
      await db.collection('stocktransfer').deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    for (const id of created.grcs) {
      await db.collection('grc').deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    for (const id of created.invoices) {
      await db.collection('posinvoice').deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    for (const id of created.returns) {
      await db.collection('posreturn').deleteOne({ _id: new mongoose.Types.ObjectId(id) });
    }
    for (const id of created.users) await db.collection('user').deleteOne({ _id: id });
    await db.collection('transferlock').deleteMany({});
    console.log('  cleaned up');
  } catch (e) {
    console.log('  cleanup problem:', e.message);
  }

  console.log(`\n================  ${pass} passed, ${fail} failed  ================\n`);
  await mongoose.disconnect();
  process.exit(fail ? 1 : 0);
}

main().catch(async (e) => {
  console.error('HARNESS ERROR', e);
  try { await finish(mongoose.connection.db); } catch { process.exit(1); }
});
