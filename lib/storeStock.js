import { Types } from 'mongoose';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';

/* ==========================================================================
   STOCK for Inter Store Sell.

   INTER COMPANY vs INTER STORE. lib/icStock.js moves goods between two
   BUSINESSES and scopes the source rows by businessId only. Here both ends
   are locations of the SAME business, so the scope that matters is the
   LOCATION - otherwise the source store could despatch another store's stock.

   Quantities, not whole units. One printed barcode is spread over many
   barcodeLabel rows (one per unit received), and a row holding 33 can send 5
   and keep 28. Each line therefore records the rows its quantity came off
   (`stockMoves`), so receiving and returning put the quantity back on exactly
   those rows instead of guessing.

   IDEMPOTENCY. Receiving twice must not double the destination stock, so each
   created row carries `storeChallanId` + `sourceBarcodeId` and the receive
   checks for an existing pair first. A return is capped by the invoice line's
   `returnQty`, so a retried request cannot credit the same unit twice.
   ========================================================================== */

const num = (v) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};
const r2 = (v) => Math.round(num(v) * 100) / 100;

const codeMatch = (code) => ({
  $regex: '^\\s*' + String(code).trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*$',
  $options: 'i',
});

/* A row is "at" a place when it names it, or when it names nothing. Rows
   imported before locations were recorded carry '' ; refusing them would make
   a store unable to ship stock it can plainly see on the barcode screen. */
const at = (field, value) => ({
  $or: [
    { [field]: String(value) },
    { [field]: '' },
    { [field]: { $exists: false } },
  ],
});

export class StoreStockError extends Error {
  constructor(message) {
    super(message);
    this.name = 'StoreStockError';
    this.status = 422;
  }
}

/* Undo a despatch that never completed on the other side - used when a
   challan is deleted before it was received. Puts each quantity back on the
   very rows it came off and marks them on hand again, so deleting a document
   cannot quietly lose stock. */
export async function restoreDespatchedStock({ challan, user = null }) {
  const ledger = [];

  for (const line of (challan.items || [])) {
    for (const move of (line.stockMoves || [])) {
      const qty = r2(move.qty);
      if (qty <= 0) continue;
      const _id = new Types.ObjectId(String(move.barcodeId));

      await BarcodeLabel.collection.updateOne(
        { _id },
        { $inc: { qtyNum: qty }, $set: { status: BARCODE_STATUS.IN_STOCK, updatedAt: new Date() } }
      );

      const row = await BarcodeLabel.findById(_id).lean();
      ledger.push({
        ...movementBase({
          businessId: challan.businessId,
          finYear: challan.finYear,
          user,
          refModel: 'storeDeliveryChallan',
          refId: challan._id,
          refNo: challan.dcNo,
          reason: 'Inter store delivery challan cancelled - stock restored',
        }),
        type: MOVEMENT_TYPES.TRANSFER_RETURN_IN,
        barcodeId: _id,
        barcodeNo: (row && (row.barcodeNo || row.barcodeGenerated)) || line.barcodeNo || '',
        itemCode: (row && row.itemCode) || line.itemCode || '',
        itemName: line.itemName || '',
        uom: line.uom || '',
        qty,
        fromLocationId: challan.toLocationId || null,
        toLocationId: challan.locationId || null,
        statusAfter: BARCODE_STATUS.IN_STOCK,
      });
    }
  }

  if (ledger.length) await StockMovement.insertMany(ledger, { ordered: true });
  return ledger;
}

const movementBase = ({ businessId, finYear, user, refModel, refId, refNo, reason }) => ({
  businessId: businessId || null,
  finYear: finYear || '',
  refModel,
  refId: refId || null,
  refNo: refNo || '',
  reason,
  userName: user?.name || '',
  userEmail: user?.email || '',
  at: new Date(),
});

/* ------------------------------------------------------------- despatch -- */

/* Take the challan's quantities out of the SOURCE store. Plans every line
   first and refuses the whole document if any line asks for more than the
   store holds - a partly-shipped challan would be worse than a refused one. */
export async function shipStoreStock({ challan, lines, user = null }) {
  const planned = [];

  for (const line of lines) {
    const barcode = String(line.barcodeNo || '').trim();
    const want = r2(line.qty);
    if (!barcode || want <= 0) {
      planned.push({ line, plan: [] });
      continue;
    }

    const rows = await BarcodeLabel.find({
      $and: [
        { $or: [{ barcodeNo: codeMatch(barcode) }, { barcodeGenerated: codeMatch(barcode) }] },
        { status: BARCODE_STATUS.IN_STOCK },
        at('businessId', challan.businessId),
        at('locationId', challan.locationId),
      ],
    }).sort({ createdAt: 1 }).lean();

    const held = r2(rows.reduce((a, r) => a + num(r.qtyNum), 0));
    if (held < want) {
      throw new StoreStockError(
        'Only ' + held + ' of barcode ' + barcode + ' in stock at the source store - '
        + 'the challan asks for ' + want + '.'
      );
    }

    let left = want;
    const plan = [];
    for (const row of rows) {
      if (left <= 0) break;
      const take = r2(Math.min(left, num(row.qtyNum)));
      if (take <= 0) continue;
      plan.push({ row, take });
      left = r2(left - take);
    }
    planned.push({ line, plan });
  }

  const ledger = [];
  const saved = [];

  for (const { line, plan } of planned) {
    const moves = [];
    for (const { row, take } of plan) {
      /* the guard is part of the write: another request may have taken this
         row's quantity between the read above and here */
      const res = await BarcodeLabel.collection.updateOne(
        { _id: new Types.ObjectId(String(row._id)), qtyNum: { $gte: take } },
        { $inc: { qtyNum: -take }, $set: { updatedAt: new Date() } }
      );
      if (!res.modifiedCount) {
        throw new StoreStockError(
          'Barcode ' + (row.barcodeNo || '') + ' was changed by someone else. Reload and try again.'
        );
      }

      const emptied = r2(num(row.qtyNum) - take) <= 0;
      if (emptied) {
        await BarcodeLabel.collection.updateOne(
          { _id: new Types.ObjectId(String(row._id)) },
          { $set: { status: BARCODE_STATUS.IN_TRANSIT } }
        );
      }

      moves.push({ barcodeId: String(row._id), qty: take });
      ledger.push({
        ...movementBase({
          businessId: challan.businessId,
          finYear: challan.finYear,
          user,
          refModel: 'storeDeliveryChallan',
          refId: challan._id,
          refNo: challan.dcNo,
          reason: 'Inter store delivery challan',
        }),
        type: MOVEMENT_TYPES.TRANSFER_OUT,
        barcodeId: row._id,
        barcodeNo: row.barcodeNo || row.barcodeGenerated || '',
        itemCode: row.itemCode || '',
        itemName: row.printDescription || row.supplierDescription || '',
        uom: row.uom || row.uomType || '',
        batchType: row.batchType || '',
        qty: -take,
        fromLocationId: challan.locationId || null,
        toLocationId: challan.toLocationId || null,
        statusBefore: BARCODE_STATUS.IN_STOCK,
        statusAfter: emptied ? BARCODE_STATUS.IN_TRANSIT : BARCODE_STATUS.IN_STOCK,
      });
    }
    saved.push({ ...line, stockMoves: moves });
  }

  if (ledger.length) await StockMovement.insertMany(ledger, { ordered: true });
  return saved;
}

/* -------------------------------------------------------------- receive -- */

/* Land the despatched goods in the DESTINATION store. Creates rows in the
   existing barcodeLabel collection under the receiving location - the source
   store's rows were decremented, not moved, because part of a batch row can
   ship. `sourceBarcodeId` ties each new row back to the row it came from so a
   later return can find it again. */
export async function receiveStoreStock({ challan, user = null }) {
  const created = [];
  const ledger = [];

  for (const line of (challan.items || [])) {
    for (const move of (line.stockMoves || [])) {
      const qty = r2(move.qty);
      if (qty <= 0) continue;

      const src = await BarcodeLabel.findById(new Types.ObjectId(String(move.barcodeId))).lean();
      if (!src) continue;

      /* already landed - receiving twice must not double the stock */
      const existing = await BarcodeLabel.findOne({
        sourceBarcodeId: String(src._id),
        storeChallanId: String(challan._id),
      }).lean();
      if (existing) continue;

      const { _id, createdAt, updatedAt, __v, ...rest } = src;
      const doc = {
        ...rest,
        businessId: String(challan.businessId || ''),
        locationId: String(challan.toLocationId || ''),
        currentBusinessId: challan.businessId || null,
        currentLocationId: challan.toLocationId || null,
        finYear: challan.finYear || src.finYear || '',
        qtyNum: qty,
        qty: String(qty),
        status: BARCODE_STATUS.IN_STOCK,
        sourceBarcodeId: String(src._id),
        storeChallanId: String(challan._id),
        storeChallanNo: challan.dcNo || '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const res = await BarcodeLabel.collection.insertOne(doc);
      created.push({ _id: res.insertedId, barcodeNo: doc.barcodeNo, qty });

      ledger.push({
        ...movementBase({
          businessId: challan.businessId,
          finYear: doc.finYear,
          user,
          refModel: 'storeDeliveryChallan',
          refId: challan._id,
          refNo: challan.dcNo,
          reason: 'Inter store challan received',
        }),
        type: MOVEMENT_TYPES.TRANSFER_IN,
        barcodeId: res.insertedId,
        barcodeNo: doc.barcodeNo || doc.barcodeGenerated || '',
        itemCode: doc.itemCode || '',
        itemName: doc.printDescription || doc.supplierDescription || '',
        uom: doc.uom || doc.uomType || '',
        batchType: doc.batchType || '',
        qty,
        fromLocationId: challan.locationId || null,
        toLocationId: challan.toLocationId || null,
        statusAfter: BARCODE_STATUS.IN_STOCK,
      });
    }
  }

  if (ledger.length) await StockMovement.insertMany(ledger, { ordered: true });
  return created;
}

/* --------------------------------------------------------------- return -- */
/* Goods going BACK from the buying store to the store that invoiced them.

   Two ends have to move, both by quantity:
     out of the buyer's rows this module created for the challan
     back into the seller's stock, on a matching barcode row

   The buyer's rows are deducted first. If the seller's stock cannot be
   credited (no matching row and the clone fails), everything deducted in this
   call is added straight back, so a failed return never silently destroys
   stock. */
export async function returnStoreStock({ invoice, lines, user = null }) {
  const wanted = [];
  for (const line of (lines || [])) {
    const barcode = String(line.barcodeNo || '').trim();
    const qty = r2(line.qty);
    if (barcode && qty > 0) wanted.push({ line, barcode, qty });
  }
  if (!wanted.length) return [];

  const challanIds = (invoice.deliveryChallanIds || []).map(String).filter(Boolean);
  const deducted = [];
  const ledger = [];

  const compensate = async () => {
    for (const undo of deducted) {
      await BarcodeLabel.collection.updateOne(
        { _id: undo._id },
        { $inc: { qtyNum: undo.qty }, $set: { status: BARCODE_STATUS.IN_STOCK, updatedAt: new Date() } }
      );
    }
  };

  try {
    for (const { line, barcode, qty } of wanted) {
      let left = qty;

      const buyerRows = await BarcodeLabel.find({
        $and: [
          { $or: [{ barcodeNo: codeMatch(barcode) }, { barcodeGenerated: codeMatch(barcode) }] },
          { status: BARCODE_STATUS.IN_STOCK },
          { storeChallanId: { $in: challanIds } },
          at('businessId', invoice.businessId),
          at('locationId', invoice.toLocationId),
        ],
      }).sort({ createdAt: 1 }).lean();

      const held = r2(buyerRows.reduce((a, r) => a + num(r.qtyNum), 0));
      if (held < qty) {
        throw new StoreStockError(
          'Only ' + held + ' of barcode ' + barcode + ' is still in stock at the buying store - '
          + 'the return asks for ' + qty + '.'
        );
      }

      let sourceRow = null;

      for (const row of buyerRows) {
        if (left <= 0) break;
        const take = r2(Math.min(left, num(row.qtyNum)));
        if (take <= 0) continue;

        const res = await BarcodeLabel.collection.updateOne(
          { _id: new Types.ObjectId(String(row._id)), qtyNum: { $gte: take } },
          { $inc: { qtyNum: -take }, $set: { updatedAt: new Date() } }
        );
        if (!res.modifiedCount) {
          throw new StoreStockError(
            'Barcode ' + barcode + ' was changed by someone else. Reload and try again.'
          );
        }
        deducted.push({ _id: new Types.ObjectId(String(row._id)), qty: take });
        if (r2(num(row.qtyNum) - take) <= 0) {
          await BarcodeLabel.collection.updateOne(
            { _id: new Types.ObjectId(String(row._id)) },
            { $set: { status: BARCODE_STATUS.VOID } }
          );
        }

        sourceRow = sourceRow || row;

        ledger.push({
          ...movementBase({
            businessId: invoice.businessId,
            finYear: invoice.finYear,
            user,
            refModel: 'storeSalesReturn',
            refId: invoice._id,
            refNo: invoice.invoiceNo,
            reason: 'Inter store sales return - returned by the buying store',
          }),
          type: MOVEMENT_TYPES.TRANSFER_RETURN_OUT,
          barcodeId: row._id,
          barcodeNo: row.barcodeNo || row.barcodeGenerated || '',
          itemCode: row.itemCode || '',
          itemName: row.printDescription || row.supplierDescription || '',
          uom: row.uom || row.uomType || '',
          qty: -take,
          fromLocationId: invoice.toLocationId || null,
          toLocationId: invoice.locationId || null,
          statusAfter: BARCODE_STATUS.IN_STOCK,
        });

        left = r2(left - take);
      }

      /* ---- back into the selling store ---- */
      const sellerRow = await BarcodeLabel.findOne({
        $and: [
          { $or: [{ barcodeNo: codeMatch(barcode) }, { barcodeGenerated: codeMatch(barcode) }] },
          { status: { $in: [BARCODE_STATUS.IN_STOCK, BARCODE_STATUS.IN_TRANSIT] } },
          at('businessId', invoice.businessId),
          at('locationId', invoice.locationId),
        ],
      }).sort({ createdAt: 1 }).lean();

      if (sellerRow) {
        await BarcodeLabel.collection.updateOne(
          { _id: new Types.ObjectId(String(sellerRow._id)) },
          {
            $inc: { qtyNum: r2(qty) },
            $set: { status: BARCODE_STATUS.IN_STOCK, updatedAt: new Date() },
          }
        );
        ledger.push({
          ...movementBase({
            businessId: invoice.businessId,
            finYear: invoice.finYear,
            user,
            refModel: 'storeSalesReturn',
            refId: invoice._id,
            refNo: invoice.invoiceNo,
            reason: 'Inter store sales return - back into the selling store',
          }),
          type: MOVEMENT_TYPES.TRANSFER_RETURN_IN,
          barcodeId: sellerRow._id,
          barcodeNo: sellerRow.barcodeNo || sellerRow.barcodeGenerated || '',
          itemCode: sellerRow.itemCode || '',
          itemName: sellerRow.printDescription || sellerRow.supplierDescription || '',
          uom: sellerRow.uom || sellerRow.uomType || '',
          qty: r2(qty),
          fromLocationId: invoice.toLocationId || null,
          toLocationId: invoice.locationId || null,
          statusAfter: BARCODE_STATUS.IN_STOCK,
        });
      } else if (sourceRow) {
        /* the selling store no longer holds a row for this barcode at all -
           recreate one from the row that came back */
        const { _id, createdAt, updatedAt, __v, ...rest } = sourceRow;
        const doc = {
          ...rest,
          businessId: String(invoice.businessId || ''),
          locationId: String(invoice.locationId || ''),
          currentBusinessId: invoice.businessId || null,
          currentLocationId: invoice.locationId || null,
          finYear: invoice.finYear || '',
          qtyNum: r2(qty),
          qty: String(r2(qty)),
          status: BARCODE_STATUS.IN_STOCK,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        const res = await BarcodeLabel.collection.insertOne(doc);
        ledger.push({
          ...movementBase({
            businessId: invoice.businessId,
            finYear: invoice.finYear,
            user,
            refModel: 'storeSalesReturn',
            refId: invoice._id,
            refNo: invoice.invoiceNo,
            reason: 'Inter store sales return - recreated at the selling store',
          }),
          type: MOVEMENT_TYPES.TRANSFER_RETURN_IN,
          barcodeId: res.insertedId,
          barcodeNo: doc.barcodeNo || doc.barcodeGenerated || '',
          itemCode: doc.itemCode || '',
          itemName: doc.printDescription || doc.supplierDescription || '',
          uom: doc.uom || doc.uomType || '',
          qty: r2(qty),
          fromLocationId: invoice.toLocationId || null,
          toLocationId: invoice.locationId || null,
          statusAfter: BARCODE_STATUS.IN_STOCK,
        });
      }
    }
  } catch (err) {
    await compensate();
    throw err;
  }

  if (ledger.length) await StockMovement.insertMany(ledger, { ordered: true });
  return ledger;
}
