/* Read-only integrity audit of every Inter Store Sell document and the stock
   behind it. Prints findings; changes nothing. */
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import StoreDeliveryChallan from '@/models/StoreDeliveryChallan';
import StoreSalesInvoice from '@/models/StoreSalesInvoice';
import StoreDebitNote from '@/models/StoreDebitNote';
import StoreSalesReturn from '@/models/StoreSalesReturn';
import StockMovement from '@/models/StockMovement';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { applyStoreTotals, r2 } from '@/lib/storeSell';

await dbConnect();
const bizIds = new Set((await Business.find({}).select('_id').lean()).map((b) => String(b._id)));
const locIds = new Set((await CompanyLocation.find({}).select('_id').lean()).map((l) => String(l._id)));

const challans = await StoreDeliveryChallan.find({}).lean();
const invoices = await StoreSalesInvoice.find({}).lean();
const notes = await StoreDebitNote.find({}).lean();
const returns = await StoreSalesReturn.find({}).lean();
const byId = new Map(challans.map((c) => [String(c._id), c]));
const invById = new Map(invoices.map((i) => [String(i._id), i]));
const F = [];
const add = (tag, msg) => F.push(tag + ': ' + msg);

console.log('documents:', { challans: challans.length, invoices: invoices.length, notes: notes.length, returns: returns.length });

const noOrphans = (label, d, no) => {
  if (!bizIds.has(String(d.businessId))) add(label + ' ' + no, 'businessId ' + String(d.businessId) + ' does not exist');
  if (!locIds.has(String(d.locationId))) add(label + ' ' + no, 'locationId ' + String(d.locationId) + ' does not exist');
  if (d.toLocationId && !locIds.has(String(d.toLocationId))) add(label + ' ' + no, 'toLocationId ' + String(d.toLocationId) + ' does not exist');
  if (d.fromLocationId && !locIds.has(String(d.fromLocationId))) add(label + ' ' + no, 'fromLocationId ' + String(d.fromLocationId) + ' does not exist');
  if (d.module !== 'interStoreSell') add(label + ' ' + no, 'module is ' + JSON.stringify(d.module));
};

challans.forEach((c) => noOrphans('challan', c, c.dcNo));
invoices.forEach((i) => noOrphans('invoice', i, i.invoiceNo));
notes.forEach((n) => noOrphans('note', n, n.debitNoteNo));
returns.forEach((r) => noOrphans('return', r, r.returnNo));

for (const c of challans) {
  for (const l of c.items || []) {
    if (!(Number(l.unitRate) > 0)) add('challan ' + c.dcNo, 'line ' + l.barcodeNo + ' has rate ' + l.unitRate);
    if (r2(l.billedQty) < 0 || r2(l.returnedQty) < 0 || r2(l.debitedQty) < 0) add('challan ' + c.dcNo, 'negative running qty on ' + l.barcodeNo);
  }
}

const totalsOf = (doc) => applyStoreTotals((doc.items || []).map((l) => ({
  qty: l.qty, unitRate: l.unitRate, discountPct: l.discountPct, roffDiscount: l.roffDiscount, gstPct: l.gstPct,
})), { mode: doc.gstMode, discountPercent: doc.discountPercent, roundOffDiscountAmt: doc.roundOffDiscountAmt });

for (const c of challans) {
  const t = totalsOf(c);
  if (Math.abs(r2(t.netValue) - r2(c.netValue)) > 0.01) add('challan ' + c.dcNo, 'stored net ' + c.netValue + ' but lines recompute to ' + t.netValue);
  if (Math.abs(r2(t.taxableValue) - r2(c.taxableValue)) > 0.01) add('challan ' + c.dcNo, 'stored taxable ' + c.taxableValue + ' vs ' + t.taxableValue);
}
for (const i of invoices) {
  const t = totalsOf(i);
  if (Math.abs(r2(t.netValue) - r2(i.netValue)) > 0.01) add('invoice ' + i.invoiceNo, 'stored net ' + i.netValue + ' but lines recompute to ' + t.netValue);
}

for (const c of challans) {
  if (!c.receivedAt) { if ((c.items || []).some((l) => r2(l.billedQty) > 0)) add('challan ' + c.dcNo, 'billed without being received'); continue; }
  const rows = await BarcodeLabel.find({ storeChallanId: String(c._id) }).select('qtyNum').lean();
  if (!rows.length) add('challan ' + c.dcNo, 'marked received but no destination barcode rows exist');
  const held = r2(rows.reduce((a, r) => a + (Number(r.qtyNum) || 0), 0));
  const sent = r2((c.items || []).reduce((a, l) => a + (Number(l.qty) || 0), 0));
  const returnedOrDebited = r2((c.items || []).reduce((a, l) => a + r2(l.returnedQty), 0));
  if (held > sent - returnedOrDebited + 0.01) add('challan ' + c.dcNo, 'buyer holds ' + held + ' of ' + sent + ' sent (returned ' + returnedOrDebited + ')');
}

for (const i of invoices) {
  for (const line of i.items || []) {
    const c = byId.get(String(line.challanId));
    if (!c) { add('invoice ' + i.invoiceNo, 'line ' + line.barcodeNo + ' references a missing challan'); continue; }
    const cl = (c.items || []).find((l) => String(l.lineId) === String(line.challanLineId));
    if (!cl) { add('invoice ' + i.invoiceNo, 'line ' + line.barcodeNo + ' is not on challan ' + c.dcNo); continue; }
    if (r2(line.qty) > r2(cl.qty)) add('invoice ' + i.invoiceNo, 'billed ' + line.qty + ' of a challan line with qty ' + cl.qty);
    if (r2(cl.billedQty) < r2(line.qty)) add('invoice ' + i.invoiceNo, 'challan ' + c.dcNo + ' records billedQty ' + cl.billedQty + ' < invoiced ' + line.qty);
  }
  if (!(i.deliveryChallanIds || []).length) add('invoice ' + i.invoiceNo, 'no deliveryChallanIds');
}

for (const c of challans) {
  const fully = (c.items || []).length && (c.items || []).every((l) => r2((Number(l.qty) || 0) - r2(l.billedQty)) <= 0.001);
  if (c.status === 'invoiced' && !fully) add('challan ' + c.dcNo, 'status invoiced but quantity is still unbilled');
  if (c.status === 'received' && fully) add('challan ' + c.dcNo, 'status received but every line is fully billed');
  if (c.status === 'dispatched' && c.receivedAt) add('challan ' + c.dcNo, 'status dispatched but receivedAt is set');
}

for (const n of notes) {
  const i = invById.get(String(n.salesInvoiceId));
  if (!i) { add('debit note ' + n.debitNoteNo, 'invoice missing'); continue; }
  for (const l of n.items || []) {
    const il = (i.items || []).find((x) => String(x.lineId) === String(l.lineId));
    if (!il) add('debit note ' + n.debitNoteNo, 'line ' + l.barcodeNo + ' is not on invoice ' + i.invoiceNo);
    else if (r2(l.qty) > r2(il.qty)) add('debit note ' + n.debitNoteNo, 'adjusts ' + l.qty + ' of an invoiced ' + il.qty);
  }
}
for (const r of returns) {
  const i = invById.get(String(r.salesInvoiceId));
  if (!i) { add('return ' + r.returnNo, 'invoice missing'); continue; }
  for (const l of r.items || []) {
    const il = (i.items || []).find((x) => String(x.lineId) === String(l.lineId));
    if (!il) add('return ' + r.returnNo, 'line ' + l.barcodeNo + ' is not on invoice ' + i.invoiceNo);
    else if (r2(il.returnedQty) < r2(l.qty)) add('return ' + r.returnNo, 'invoice shows returnedQty ' + il.returnedQty + ' < returned ' + l.qty);
  }
}

for (const [label, docs, field] of [
  ['challan', challans, 'dcNo'], ['invoice', invoices, 'invoiceNo'],
  ['debit note', notes, 'debitNoteNo'], ['return', returns, 'returnNo'],
]) {
  const seen = new Map();
  for (const d of docs) {
    if (!d[field]) continue;
    const key = [d[field], String(d.businessId), String(d.locationId), d.finYear].join('|');
    if (seen.has(key)) add('duplicate ' + label + ' number', d[field] + ' issued twice');
    seen.set(key, String(d._id));
  }
}

const rowOrphanOpen = (await BarcodeLabel.find({ storeChallanId: { $nin: ['', null], $exists: true } })
  .select('storeChallanId').lean()).filter((r) => !byId.has(String(r.storeChallanId))).length;
console.log('receipt rows whose challan is missing:', rowOrphanOpen);

const moves = await StockMovement.find({ refModel: { $in: ['storeDeliveryChallan', 'storeSalesReturn'] } }).select('refModel refId').lean();
const moveMissing = moves.filter((m) => (m.refModel === 'storeDeliveryChallan' ? !byId.has(String(m.refId)) : false)).length;
console.log('movements:', moves.length, '| pointing at a missing challan:', moveMissing);

const orphans = [];
for (const l of await CompanyLocation.find({}).select('name businessId state gstin').lean()) {
  if (!bizIds.has(String(l.businessId))) orphans.push(l.name + ' (' + (l.state || 'no state') + ', ' + (l.gstin || 'no gstin') + ')');
}
console.log('locations hanging off a missing business:', orphans.length, '->', orphans.join(' | '));

const emptyState = (await CompanyLocation.find({}).select('name state gstin').lean())
  .filter((l) => bizIds.has(String(l.businessId)) && !String(l.state || '').trim())
  .map((l) => l.name + (l.gstin ? ' (gstin ' + l.gstin + ')' : ' (no gstin)'));
console.log('live locations with a blank State:', emptyState.length, '->', emptyState.join(' | '));

console.log('\n--- FINDINGS (' + F.length + ') ---');
F.forEach((f) => console.log(' *', f));
await mongoose.connection.close();
