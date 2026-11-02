/* E2E: Inter Store Sell flow through the real HTTP API.
   Run: node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/.tmp-audit/e2e-is-flow.mjs

   Creates ONE synthetic barcode row and one full document chain, asserts the
   numbers at every step, then removes everything it made. Nothing existing is
   modified (the source row is created by this script, not borrowed). */

import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import { signSession, COOKIE } from '@/lib/auth';
import { ROLES } from '@/models/User';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import Hsn from '@/models/Hsn';
import StockMovement from '@/models/StockMovement';
import StoreDeliveryChallan from '@/models/StoreDeliveryChallan';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import StoreDebitNote from '@/models/StoreDebitNote';
import StoreSalesReturn from '@/models/StoreSalesReturn';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { resolveGstRate, gstModeForLocations } from '@/lib/storeGst';
import { applyStoreTotals } from '@/lib/storeSell';
import { businessOfLocation, destinationStores } from '@/lib/storeLocations';

const BASE = process.env.E2E_BASE || 'http://localhost:3000';
const FY = '2026-2027';
const STAMP = Date.now();
const CODE = 'E2E-ISTEST-' + STAMP;
const results = [];
const created = { challanId: null, invoiceId: null, debitNoteId: null, returnId: null };
const storeRows = []; // barcode _ids this script created

const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok), detail });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
};

const r2 = (v) => Math.round((Number(v) || 0) * 100) / 100;

const token = signSession({ id: 'e2e', name: 'E2E Run', email: 'e2e@local', role: ROLES.SUPER_ADMIN });
const call = async (method, path, body) => {
  const res = await fetch(BASE + path, {
    method,
    headers: { 'content-type': 'application/json', cookie: COOKIE + '=' + token },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { json = null; }
  return { status: res.status, json };
};

const qtyAt = async (barcodeNo, locationId) => {
  const rows = await BarcodeLabel.find({ barcodeNo, locationId: String(locationId) }).lean();
  return {
    rows: rows.length,
    qty: r2(rows.reduce((a, r) => a + (Number(r.qtyNum) || 0), 0)),
    statuses: [...new Set(rows.map((r) => r.status))],
  };
};

const main = async () => {
  await dbConnect();

  /* ---------------------------------------------------------- fixtures -- */
  const list = await Business.find({}).select('name parentBusinessId isMainBranch').lean();
  const biz = list.find((b) => /temple fab/i.test(b.name || '')) || list[0];
  if (!biz) throw new Error('no business rows');

  const { options } = await destinationStores(String(biz._id));
  if (options.length < 2) throw new Error('need two stores in the company group, found ' + options.length);

  /* E2E_SRC / E2E_DST pick an exact store label, so a second run can exercise
     the inter-state split with two stores that record different states. */
  const pick = (want, fallback) => options.find((o) => o.label === want) || fallback;
  const src = pick(process.env.E2E_SRC, options[0]);
  const dst = pick(process.env.E2E_DST, options.find((o) => o.value !== src.value));
  const srcLoc = await CompanyLocation.findById(src.value).lean();
  const dstLoc = await CompanyLocation.findById(dst.value).lean();

  console.log('source      :', src.label, '| state', srcLoc.state);
  console.log('destination :', dst.label, '| state', dstLoc.state);

  /* an HSN that really resolves to a non-zero rate */
  const hsnRows = await Hsn.find({ 'taxSlabs.0': { $exists: true } }).limit(40).lean();
  let hsn = null;
  for (const row of hsnRows) {
    const res = await resolveGstRate({ businessId: String(biz._id), hsnCode: row.code, amount: 4000 });
    if (res.gstPct > 0) { hsn = row; break; }
  }
  if (!hsn) throw new Error('no HSN resolving to a GST rate');
  const resolved = await resolveGstRate({ businessId: String(biz._id), hsnCode: hsn.code, amount: 4000 });
  console.log('hsn         :', hsn.code, '->', resolved.gstPct + '%');
  check('GST rate is looked up from the HSN master (not 0, not hard-coded)', resolved.gstPct > 0, resolved.gstPct + '%');

  const mode = gstModeForLocations(srcLoc, dstLoc) || 'cgst_sgst';
  console.log('gst mode    :', mode, '(states', srcLoc.state, '/', dstLoc.state + ')');

  const ins = await BarcodeLabel.collection.insertOne({
    barcodeNo: CODE,
    barcodeGenerated: CODE,
    itemCode: 'E2E-ITEM',
    printDescription: 'E2E TEST FABRIC',
    uom: 'MTR',
    uomType: 'MTR',
    batchType: 'batch',
    hsn: String(hsn.code),
    qty: '10',
    qtyNum: 10,
    status: BARCODE_STATUS.IN_STOCK,
    businessId: String(src.businessId || biz._id),
    locationId: String(srcLoc._id),
    finYear: FY,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  storeRows.push(ins.insertedId);

  const srcBiz = String(srcLoc.businessId || biz._id);
  const dstBiz = await businessOfLocation(String(dstLoc._id));

  /* the SAME barcode at the destination store, with different item details:
     the challan line must describe the source row, not this one */
  const decoy = await BarcodeLabel.collection.insertOne({
    barcodeNo: CODE,
    barcodeGenerated: CODE,
    itemCode: 'DECOY-ITEM',
    printDescription: 'DECOY ITEM',
    uom: 'MTR',
    uomType: 'MTR',
    hsn: '999999',
    qty: '50',
    qtyNum: 50,
    status: BARCODE_STATUS.IN_STOCK,
    businessId: String(dstBiz || ''),
    locationId: String(dstLoc._id),
    finYear: FY,
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  /* ------------------------------------------------- 1. delivery challan -- */
  /* the number series for this store, read before the save so the check is
     about this run rather than about whatever the scope already issued */
  const counterKey = 'series:ISDC/|' + srcBiz + '|' + String(srcLoc._id) + '|' + FY;
  const seqBefore = (await mongoose.connection.db.collection('counter').findOne({ key: counterKey }))?.seq ?? 0;

  const QTY = 4;
  const RATE = 1000;
  const expectedChallan = applyStoreTotals(
    [{ qty: QTY, unitRate: RATE, discountPct: 0, roffDiscount: 0, gstPct: resolved.gstPct }],
    { mode }
  );  let res = await call('POST', '/api/is-delivery-challan', {
    business: srcBiz,
    location: String(srcLoc._id),
    finYear: FY,
    data: {
      toLocationId: String(dstLoc._id),
      dcDate: new Date().toISOString().slice(0, 10),
      remarks: 'E2E run ' + STAMP,
      items: [{ barcodeNo: CODE, qty: QTY, unitRate: RATE, discountPct: 0 }],
    },
  });
  check('POST challan created', res.status === 200 && res.json?.ok, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));
  created.challanId = res.json?.id || null;
  if (!created.challanId) throw new Error('challan not created - stopping');

  const challan = await StoreDeliveryChallan.findById(created.challanId).lean();
  check('challan number issued', /^ISDC\//.test(challan.dcNo || ''), challan.dcNo);

  check('the line describes the source store row, not another store row',
    challan.items[0].itemCode === 'E2E-ITEM'
      && challan.items[0].hsn === String(hsn.code)
      && String(challan.items[0].barcodeId) === String(ins.insertedId),
    challan.items[0].itemCode + ' / hsn ' + challan.items[0].hsn + ' / row ' + challan.items[0].barcodeId);

  /* the decoy has to go before the stock checks, which count every row at the
     destination store for this barcode */
  await BarcodeLabel.collection.deleteOne({ _id: decoy.insertedId });
  check('challan GST percent came from the master', challan.items[0].gstPct === resolved.gstPct, String(challan.items[0].gstPct));
  check('challan taxable value correct', challan.taxableValue === expectedChallan.taxableValue,
    challan.taxableValue + ' vs ' + expectedChallan.taxableValue);
  check('challan net value correct', challan.netValue === expectedChallan.netValue,
    challan.netValue + ' vs ' + expectedChallan.netValue);
  check(mode === 'igst' ? 'IGST charged' : 'CGST + SGST charged',
    mode === 'igst' ? challan.igstTotal > 0 && challan.cgstTotal === 0 : challan.cgstTotal > 0 && challan.sgstTotal > 0,
    'igst ' + challan.igstTotal + ' cgst ' + challan.cgstTotal + ' sgst ' + challan.sgstTotal);

  let at = await qtyAt(CODE, srcLoc._id);
  check('source store stock debited by the challan qty', at.qty === 10 - QTY, at.qty + ' left');

  /* out of stock must be refused */
  res = await call('POST', '/api/is-delivery-challan', {
    business: srcBiz, location: String(srcLoc._id), finYear: FY,
    data: {
      toLocationId: String(dstLoc._id),
      dcDate: new Date().toISOString().slice(0, 10),
      items: [{ barcodeNo: CODE, qty: 999, unitRate: RATE }],
    },
  });
  check('over-shipping is refused and leaves no document', res.status === 422, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));

  /* a refused save must not consume a challan number */
  const counter = await mongoose.connection.db.collection('counter').findOne({ key: counterKey });
  check('refused save did not consume a document number', (counter?.seq ?? 0) === seqBefore + 1,
    'seq ' + seqBefore + ' -> ' + (counter?.seq ?? 0));

  /* the GSTIN fallback for a store whose State field was left blank */
  check('GSTIN decides the split when State is blank',
    gstModeForLocations({ state: '', gstin: '29AANFT6295P1ZW' }, { state: '', gstin: '36AAAAA0000A1Z5' }) === 'igst',
    String(gstModeForLocations({ state: '', gstin: '29AANFT6295P1ZW' }, { state: '', gstin: '36AAAAA0000A1Z5' })));
  check('same GSTIN state stays CGST + SGST',
    gstModeForLocations({ state: '', gstin: '29AANFT6295P1ZW' }, { state: 'Karnataka', gstin: '' }) === 'cgst_sgst');

  /* ------------------------------------- 2. list visibility (the bug fix) -- */
  const listAt = async (path, locationId, businessId) => {
    const q = await call('GET', path + '?business=' + businessId + '&location=' + locationId + '&finYear=' + FY + '&perPage=50');
    return q;
  };

  let l = await listAt('/api/is-delivery-challan', String(srcLoc._id), srcBiz);
  check('challan visible from the SOURCE store', (l.json?.rows || []).some((r) => String(r._id) === String(created.challanId)),
    'rows ' + (l.json?.rows || []).length);

  l = await listAt('/api/is-delivery-challan', String(dstLoc._id), dstBiz);
  check('challan visible from the DESTINATION store (sibling branch)', (l.json?.rows || []).some((r) => String(r._id) === String(created.challanId)),
    'rows ' + (l.json?.rows || []).length);

  /* ------------------------------------------------------- 3. receive -- */
  /* a store the goods are not addressed to must not be able to book them */
  res = await call('POST', '/api/is-delivery-challan/' + created.challanId + '/receive', {
    business: srcBiz, location: String(srcLoc._id),
  });
  check('receiving from the wrong store is refused', res.status === 403,
    'HTTP ' + res.status + ' ' + JSON.stringify(res.json));

  res = await call('POST', '/api/is-delivery-challan/' + created.challanId + '/receive', {});
  check('receiving without naming a store is refused', res.status === 422,
    'HTTP ' + res.status + ' ' + JSON.stringify(res.json));

  const notYet = await StoreDeliveryChallan.findById(created.challanId).lean();
  check('a refused receipt did not mark the challan received', !notYet.receivedAt, String(notYet.receivedAt));

  res = await call('POST', '/api/is-delivery-challan/' + created.challanId + '/receive', {
    business: dstBiz, location: String(dstLoc._id),
  });
  check('receive accepted', res.status === 200 && res.json?.ok, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));

  at = await qtyAt(CODE, dstLoc._id);
  check('destination store received the qty', at.qty === QTY, at.qty + ' in ' + at.rows + ' row(s)');
  let srcAt = await qtyAt(CODE, srcLoc._id);
  check('source store not double-debited', srcAt.qty === 10 - QTY, srcAt.qty + ' left');

  res = await call('POST', '/api/is-delivery-challan/' + created.challanId + '/receive', {
    business: dstBiz, location: String(dstLoc._id),
  });
  at = await qtyAt(CODE, dstLoc._id);
  check('receiving twice does not double the stock', res.json?.alreadyReceived === true && at.qty === QTY,
    'qty ' + at.qty + ', rows ' + at.rows);

  /* ------------------------------------------------------- 4. invoice -- */
  res = await call('POST', '/api/is-sales-invoice', {
    business: srcBiz, location: String(srcLoc._id), finYear: FY,
    data: { invoiceDate: new Date().toISOString().slice(0, 10), toLocationId: String(dstLoc._id), remarks: 'E2E ' + STAMP },
  });
  check('invoice refused without a challan', res.status === 422, 'HTTP ' + res.status);

  res = await call('POST', '/api/is-sales-invoice', {
    business: srcBiz, location: String(srcLoc._id), finYear: FY,
    data: {
      invoiceDate: new Date().toISOString().slice(0, 10),
      deliveryChallanIds: [created.challanId],
      toLocationId: String(dstLoc._id),
      remarks: 'E2E ' + STAMP,
    },
  });
  check('invoice raised from the challan', res.status === 200 && res.json?.ok, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));
  created.invoiceId = res.json?.id || null;

  if (created.invoiceId) {
    const inv = await StoreSalesInvoice.findById(created.invoiceId).lean();
    check('invoice number issued', /^ISSI\//.test(inv.invoiceNo || ''), inv.invoiceNo);
    check('invoice lines copied from the challan', inv.items.length === 1 && inv.items[0].barcodeNo === CODE && inv.items[0].qty === QTY,
      inv.items.length + ' line(s), qty ' + inv.items[0]?.qty);
    check('invoice totals match the shared GST maths', inv.netValue === expectedChallan.netValue,
      inv.netValue + ' vs ' + expectedChallan.netValue);
    check('invoice references the challan', (inv.deliveryChallanIds || []).map(String).includes(String(created.challanId)));

    const after = await StoreDeliveryChallan.findById(created.challanId).lean();
    check('challan line marked billed', after.items[0].billedQty === QTY, String(after.items[0].billedQty));
    check('challan status moved to invoiced', after.status === 'invoiced', after.status);

    /* release guard: a challan that no longer records this quantity must make
       the delete refuse instead of pushing billedQty below zero */
    await StoreDeliveryChallan.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.challanId) },
      { $set: { 'items.$[l].billedQty': 0 } },
      { arrayFilters: [{ 'l.lineId': after.items[0].lineId }] }
    );
    res = await call('DELETE', '/api/is-sales-invoice/' + created.invoiceId);
    const stillThere = await StoreSalesInvoice.findById(created.invoiceId).lean();
    const chZero = await StoreDeliveryChallan.findById(created.challanId).lean();
    check('invoice delete refuses when the challan no longer records the quantity',
      res.status === 409 && Boolean(stillThere) && chZero.items[0].billedQty === 0,
      'HTTP ' + res.status + ', invoice kept ' + Boolean(stillThere) + ', billedQty ' + chZero.items[0].billedQty);

    await StoreDeliveryChallan.collection.updateOne(
      { _id: new mongoose.Types.ObjectId(created.challanId) },
      { $set: { 'items.$[l].billedQty': QTY } },
      { arrayFilters: [{ 'l.lineId': after.items[0].lineId }] }
    );

    /* duplicate billing */
    res = await call('POST', '/api/is-sales-invoice', {
      business: srcBiz, location: String(srcLoc._id), finYear: FY,
      data: { invoiceDate: new Date().toISOString().slice(0, 10), deliveryChallanIds: [created.challanId] },
    });
    check('fully invoiced challan cannot be billed again', res.status === 422, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));

    l = await listAt('/api/is-sales-invoice', String(dstLoc._id), dstBiz);
    check('invoice visible from the BUYING store', (l.json?.rows || []).some((r) => String(r._id) === String(created.invoiceId)),
      'rows ' + (l.json?.rows || []).length);
  }

  /* ---------------------------------------------------- 5. debit note -- */
  if (created.invoiceId) {
    const inv = await StoreSalesInvoice.findById(created.invoiceId).lean();
    const lineId = inv.items[0].lineId;

    res = await call('POST', '/api/is-debit-note', {
      business: dstBiz, location: String(dstLoc._id), finYear: FY,
      data: {
        salesInvoiceId: created.invoiceId,
        debitNoteDate: new Date().toISOString().slice(0, 10),
        reason: 'E2E rate difference',
        lines: [{ lineId, qty: 1 }],
      },
    });
    check('received debit note created at the buying store', res.status === 200 && res.json?.ok,
      'HTTP ' + res.status + ' ' + JSON.stringify(res.json));
    created.debitNoteId = res.json?.id || null;

    if (created.debitNoteId) {
      const dn = await StoreDebitNote.findById(created.debitNoteId).lean();
      check('debit note number issued', /^ISDN\//.test(dn.debitNoteNo || ''), dn.debitNoteNo);
      check('debit note amount is for the adjusted qty only', dn.netValue === applyStoreTotals(
        [{ qty: 1, unitRate: RATE, discountPct: 0, roffDiscount: 0, gstPct: inv.items[0].gstPct }], { mode }
      ).netValue, String(dn.netValue));

      const invNow = await StoreSalesInvoice.findById(created.invoiceId).lean();
      check('invoice line records the debited qty', invNow.items[0].debitedQty === 1, String(invNow.items[0].debitedQty));
      at = await qtyAt(CODE, dstLoc._id);
      check('debit note did NOT move stock', at.qty === QTY, at.qty + ' still in the buying store');

      /* the same guard on the note's release */
      await StoreSalesInvoice.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(created.invoiceId) },
        { $set: { 'items.$[l].debitedQty': 0 } },
        { arrayFilters: [{ 'l.lineId': lineId }] }
      );
      res = await call('DELETE', '/api/is-debit-note/' + created.debitNoteId);
      const noteKept = await StoreDebitNote.findById(created.debitNoteId).lean();
      const invZero = await StoreSalesInvoice.findById(created.invoiceId).lean();
      check('debit note delete refuses when the invoice no longer records it',
        res.status === 409 && Boolean(noteKept) && invZero.items[0].debitedQty === 0,
        'HTTP ' + res.status + ', note kept ' + Boolean(noteKept) + ', debitedQty ' + invZero.items[0].debitedQty);

      await StoreSalesInvoice.collection.updateOne(
        { _id: new mongoose.Types.ObjectId(created.invoiceId) },
        { $set: { 'items.$[l].debitedQty': 1 } },
        { arrayFilters: [{ 'l.lineId': lineId }] }
      );
    }

    /* -------------------------------------------------- 6. sales return -- */
    res = await call('POST', '/api/is-sales-return', {
      business: dstBiz, location: String(dstLoc._id), finYear: FY,
      data: {
        salesInvoiceId: created.invoiceId,
        returnDate: new Date().toISOString().slice(0, 10),
        reason: 'E2E damaged',
        lines: [{ lineId, qty: 2 }],
      },
    });
    check('sales return created', res.status === 200 && res.json?.ok, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));
    created.returnId = res.json?.id || null;

    if (created.returnId) {
      const ret = await StoreSalesReturn.findById(created.returnId).lean();
      check('return number issued', /^ISRT\//.test(ret.returnNo || ''), ret.returnNo);

      /* the ledger entries of a return must name the return, not the invoice */
      const returnMoves = await StockMovement.find({ refModel: 'storeSalesReturn' })
        .select('refId refNo').lean();
      check('return movements point at the return document',
        returnMoves.length >= 2 && returnMoves.every(
          (m) => String(m.refId) === String(created.returnId) && m.refNo === ret.returnNo
        ),
        returnMoves.length + ' movement(s)' + (returnMoves[0]
          ? ', refNo ' + JSON.stringify(returnMoves[0].refNo)
          : ''));

      at = await qtyAt(CODE, dstLoc._id);
      check('returned qty left the buying store', at.qty === QTY - 2, at.qty + ' left');
      srcAt = await qtyAt(CODE, srcLoc._id);
      check('returned qty went back into the selling store', srcAt.qty === 10 - QTY + 2, srcAt.qty + ' at the seller');

      const invNow = await StoreSalesInvoice.findById(created.invoiceId).lean();
      check('invoice line records the returned qty', invNow.items[0].returnedQty === 2, String(invNow.items[0].returnedQty));

      res = await call('POST', '/api/is-sales-return', {
        business: dstBiz, location: String(dstLoc._id), finYear: FY,
        data: {
          salesInvoiceId: created.invoiceId,
          returnDate: new Date().toISOString().slice(0, 10),
          lines: [{ lineId, qty: 2 }],
        },
      });
      check('over-return beyond the invoiced qty is refused', res.status === 422, 'HTTP ' + res.status + ' ' + JSON.stringify(res.json));
      at = await qtyAt(CODE, dstLoc._id);
      check('refused return moved no stock', at.qty === QTY - 2, at.qty + ' left');
    }
  }

  /* ---------------------------------------------- 7. cross-module leak -- */
  l = await listAt('/api/is-delivery-challan', String(dstLoc._id), dstBiz);
  check('inter store list carries only inter store documents',
    (l.json?.rows || []).every((r) => !r.module || r.module === 'interStoreSell'));
  const icList = await call('GET', '/api/ic-delivery-challan?business=' + srcBiz + '&location=' + srcLoc._id + '&finYear=' + FY);
  check('inter company challan list stays separate (no inter store rows)',
    (icList.json?.rows || []).every((r) => String(r._id) !== String(created.challanId)));
};

const cleanup = async () => {
  try {
    for (const id of Object.values(created)) {
      if (!id) continue;
      await StoreDeliveryChallan.deleteOne({ _id: id });
      await StoreSalesInvoice.deleteOne({ _id: id });
      await StoreDebitNote.deleteOne({ _id: id });
      await StoreSalesReturn.deleteOne({ _id: id });
    }
    const delRows = await BarcodeLabel.deleteMany({ barcodeNo: CODE });
    const delMove = await StockMovement.deleteMany({ barcodeNo: CODE });
    console.log('\ncleanup: barcode rows deleted ' + delRows.deletedCount + ', movements deleted ' + delMove.deletedCount
      + ', documents deleted where matched');
  } catch (err) {
    console.log('cleanup error:', err.message);
  }
};

main()
  .catch((err) => { check('script completed', false, err.message); })
  .finally(async () => {
    await cleanup();
    const failed = results.filter((r) => !r.ok);
    console.log('\n' + (results.length - failed.length) + '/' + results.length + ' checks passed');
    if (failed.length) console.log('failed: ' + failed.map((f) => f.name).join(' | '));
    await mongoose.connection.close();
    process.exit(failed.length ? 1 : 0);
  });
