/* Targeted tests for the Inter Store stock-engine fixes:
     - a despatch that fails part-way puts back what it already took
     - a row received at another store does not inherit the seller's history
   Run: node --env-file=.env --import ./scripts/aliasRegister.mjs scripts/.tmp-audit/verify-is-fixes.mjs */
import mongoose from 'mongoose';
import dbConnect from '@/lib/db';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import StockMovement from '@/models/StockMovement';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { shipStoreStock, receiveStoreStock } from '@/lib/storeStock';

const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok: Boolean(ok) });
  console.log((ok ? 'PASS  ' : 'FAIL  ') + name + (detail ? '   [' + detail + ']' : ''));
};

await dbConnect();

const biz = await Business.findOne({ name: /^TEMPLE FABRICS$/i }).lean();
if (!biz) throw new Error('main business not found');
const locs = await CompanyLocation.find({ businessId: biz._id }).lean();
if (locs.length < 2) throw new Error('need two stores under the main branch');
const src = locs[0];
const dst = locs[1];

const CODE = 'E2E-FIX-' + Date.now();
const challan = {
  _id: new mongoose.Types.ObjectId(),
  businessId: biz._id,
  locationId: src._id,
  toLocationId: dst._id,
  dcNo: 'TESTFIX/1',
  finYear: '2026-2027',
};

/* two rows of the same barcode so one despatch spans both: qty 8 = 5 + 3 */
const r1 = (await BarcodeLabel.collection.insertOne({
  barcodeNo: CODE, itemCode: 'FIX', printDescription: 'FIX ITEM', uom: 'MTR', uomType: 'MTR',
  hsn: '540752', qty: '5', qtyNum: 5, status: BARCODE_STATUS.IN_STOCK,
  businessId: String(biz._id), locationId: String(src._id), finYear: '2026-2027',
  createdAt: new Date(), updatedAt: new Date(),
})).insertedId;
const r2 = (await BarcodeLabel.collection.insertOne({
  barcodeNo: CODE, itemCode: 'FIX', printDescription: 'FIX ITEM', uom: 'MTR', uomType: 'MTR',
  hsn: '540752', qty: '5', qtyNum: 5, status: BARCODE_STATUS.IN_STOCK,
  businessId: String(biz._id), locationId: String(src._id), finYear: '2026-2027',
  createdAt: new Date(), updatedAt: new Date(),
})).insertedId;

/* make the SECOND take fail, exactly as a concurrent request would */
const realUpdateOne = BarcodeLabel.collection.updateOne.bind(BarcodeLabel.collection);
BarcodeLabel.collection.updateOne = async (filter, update, opts) => {
  if (String(filter._id) === String(r2) && update && update.$inc) return { modifiedCount: 0 };
  return realUpdateOne(filter, update, opts);
};

let threw = null;
try {
  await shipStoreStock({ challan, lines: [{ barcodeNo: CODE, qty: 8 }], user: null });
} catch (err) {
  threw = err;
}
BarcodeLabel.collection.updateOne = realUpdateOne;

const after1 = await BarcodeLabel.findById(r1).lean();
const after2 = await BarcodeLabel.findById(r2).lean();
const moves = await StockMovement.countDocuments({ refId: challan._id });

check('a despatch that fails part-way is refused', Boolean(threw), threw ? threw.message : 'no error');
check('the quantity already taken is put back', after1.qtyNum === 5, String(after1.qtyNum));
check('the row it could not take is untouched', after2.qtyNum === 5, String(after2.qtyNum));
check('the restored row is on hand again', after1.status === BARCODE_STATUS.IN_STOCK, after1.status);
check('the failed despatch leaves no movement behind', moves === 0, moves + ' movement(s)');

/* ---- a received row must not inherit the seller's sale history ---- */
await BarcodeLabel.collection.updateOne(
  { _id: r1 },
  {
    $set: {
      sales: [{ invoiceId: 'SOMEONE-ELSE', invoiceNo: 'X/1', qty: 1 }],
      billingId: new mongoose.Types.ObjectId(),
      billingNo: 'SELLER/9',
      icChallanId: 'IC/9',
      status: BARCODE_STATUS.IN_TRANSIT,
    },
  }
);

const receiveChallan = {
  _id: new mongoose.Types.ObjectId(),
  businessId: biz._id,
  locationId: src._id,
  toLocationId: dst._id,
  dcNo: 'TESTFIX/2',
  finYear: '2026-2027',
  items: [{ barcodeNo: CODE, qty: 2, stockMoves: [{ barcodeId: String(r1), qty: 2 }] }],
};
const created = await receiveStoreStock({ challan: receiveChallan, user: null });
const buyer = created.length ? await BarcodeLabel.findById(created[0]._id).lean() : null;

check('the receipt creates a row at the destination store',
  buyer && String(buyer.locationId) === String(dst._id), buyer ? String(buyer.locationId) : 'no row');
check('the received row carries the despatched quantity', buyer && buyer.qtyNum === 2, buyer ? String(buyer.qtyNum) : '-');
check('the received row does not inherit the seller sale history',
  buyer && (!buyer.sales || buyer.sales.length === 0), buyer ? JSON.stringify(buyer.sales || []) : '-');
check('the received row does not inherit the seller billing reference',
  buyer && !buyer.billingId && !buyer.icChallanId,
  buyer ? String(buyer.billingNo || '') + '/' + String(buyer.icChallanId || '') : '-');
check('the received row is on hand at the buyer', buyer && buyer.status === BARCODE_STATUS.IN_STOCK,
  buyer ? buyer.status : '-');

/* ---- two simultaneous receipts must land the goods once ---- */
const raceChallan = {
  _id: new mongoose.Types.ObjectId(),
  businessId: biz._id,
  locationId: src._id,
  toLocationId: dst._id,
  dcNo: 'TESTFIX/3',
  finYear: '2026-2027',
  items: [{ barcodeNo: CODE, qty: 3, stockMoves: [{ barcodeId: String(r1), qty: 3 }] }],
};

await Promise.all([
  receiveStoreStock({ challan: raceChallan, user: null }),
  receiveStoreStock({ challan: raceChallan, user: null }),
]);

const landed = await BarcodeLabel.find({ storeChallanId: String(raceChallan._id) }).lean();
check('two simultaneous receipts land the goods exactly once',
  landed.length === 1 && landed[0].qtyNum === 3,
  landed.length + ' row(s), qty ' + (landed[0] ? landed[0].qtyNum : '-'));

/* ---- cleanup ---- */
await BarcodeLabel.deleteMany({ barcodeNo: CODE });
await StockMovement.deleteMany({ refId: { $in: [challan._id, receiveChallan._id] } });
console.log('\ncleanup: test rows and movements removed');

const failed = results.filter((r) => !r.ok);
console.log((results.length - failed.length) + '/' + results.length + ' checks passed');
await mongoose.connection.close();
process.exit(failed.length ? 1 : 0);
