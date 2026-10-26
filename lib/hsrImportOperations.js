import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement from '@/models/StockMovement';
import Item from '@/models/Item';
import CompanyLocation from '@/models/CompanyLocation';
import StockTransfer, { TRANSFER_STATUS } from '@/models/StockTransfer';
import { withTransaction, applyMovement, MOVEMENT_TYPES } from '@/lib/inventory';
import { planBarcodes, reserveBarcodeNumbers, loadFormat } from '@/lib/barcodeEngine';
import { nextSeriesNumber } from '@/lib/docnumber';
import { IMPORT_OPERATIONS } from './hsrImportConstants.js';

/* ==========================================================================
   HSR IMPORT OPERATION HANDLERS

   These handlers write REAL inventory: a barcode row for every unit/lot and
   a stockMovement ledger entry through lib/inventory.js. Nothing here writes
   a lifecycle field directly, and nothing calls applyMovement with an object
   that has not been persisted first - applyMovement updates by _id, so an
   unsaved object silently updates zero rows while still looking successful.

   Result shape (the audit model stores numbers in these fields, never arrays):
     { total, inserted, updated, replaced, added, transferred,
       skipped, failed, details, skippedDetails, failedDetails }
   ========================================================================== */

const SOURCE = 'HSR_OPENING_STOCK';
const EPSILON = 0.0001;

const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const round3 = (value) => Math.round(num(value) * 1000) / 1000;

const text = (value) => String(value ?? '').trim();

const idOf = (value) => (value ? String(value) : '');

function emptyCounts(total) {
  return {
    total,
    inserted: 0,
    updated: 0,
    replaced: 0,
    added: 0,
    transferred: 0,
    skipped: 0,
    failed: 0,
    recovered: 0,
    details: [],
    skippedDetails: [],
    failedDetails: [],
  };
}

function finish(result, key) {
  result.skipped = result.skippedDetails.length;
  result.failed = result.failedDetails.length;
  if (key) result[key] = result.details.length;
  return result;
}

/* The batch type the row is stored under. The workbook's own value wins; the
   Item master's Unique Barcode flag is the fallback, exactly as the warehouse
   seed has always resolved it. Without either, a row is treated as a batch:
   one label for the whole quantity is the safe choice for opening stock (it
   never invents hundreds of barcodes the operator has not printed). */
function batchTypeFor(record) {
  const explicit = text(record.values?.batchUnique).toLowerCase();
  if (explicit === 'batch' || explicit === 'unique') return explicit;

  const flag = text(record.links?.itemUniqueBarcode).toLowerCase();
  if (['yes', 'y', 'true', '1'].includes(flag)) return 'unique';
  if (['no', 'n', 'false', '0'].includes(flag)) return 'batch';
  return 'batch';
}

function clientRowIdOf(record, suffix = '') {
  const base = record.clientRowId || `hsr:${record.fileName || 'workbook'}:${record.line}`;
  return suffix ? `${base}:${suffix}` : base;
}

function dateOf(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

/* A barcode document is a snapshot of the workbook line. Commercial fields
   stay strings, the lifecycle companion fields stay numeric, exactly as the
   rest of the ERP writes them. */
function buildBarcodeDoc(record, planItem, barcodeNo, scope, clientRowId) {
  const values = record.values || {};
  const links = record.links || {};
  const qty = num(planItem.qty);

  return {
    businessId: String(scope.businessId),
    locationId: String(scope.targetLocationId),
    finYear: String(scope.finYear || ''),

    itemCode: text(values.itemCode),
    itemName: text(values.itemName),
    printDescription: text(values.printDescription) || text(values.itemName),
    uom: text(values.uom),
    hsn: text(values.hsn),
    purRate: values.hsrPurPrice === null || values.hsrPurPrice === undefined ? '' : String(values.hsrPurPrice),
    gst: values.gst === null || values.gst === undefined ? '' : String(values.gst),
    retailPrice: values.rsp === null || values.rsp === undefined ? '' : String(values.rsp),
    offerPrice: values.offerPrice === null || values.offerPrice === undefined ? '' : String(values.offerPrice),
    wspPrice: values.wsp === null || values.wsp === undefined ? '' : String(values.wsp),
    dpPrice: values.dp === null || values.dp === undefined ? '' : String(values.dp),
    grcNo: text(values.grcNo),
    batchUnique: text(values.batchUnique) || (planItem.batchType === 'batch' ? 'Batch' : 'Unique'),

    openingQty: qty,
    hsrPurPrice: num(values.hsrPurPrice),
    stockDate: dateOf(values.date),
    stockAge: values.age === null || values.age === undefined || values.age === '' ? null : num(values.age),

    customFields: {
      purchaseDate: dateOf(values.purchaseDate),
      supplierInvoiceNo: text(values.supplierInvoiceNo),
      itemAttributes: text(values.itemAttributes),
      openValue: values.openValue ?? null,
      hsrLine: record.line,
      hsrFileName: record.fileName || '',
      hsrRowQty: num(values.openQty),
    },

    /* identity + lifecycle */
    barcodeNo,
    oldBarcode: '',
    barcodeGenerated: '',
    clientRowId,
    source: SOURCE,
    sourcePayload: JSON.stringify({
      line: record.line,
      fileName: record.fileName || '',
      itemCode: values.itemCode,
      openQty: values.openQty,
      batchUnique: values.batchUnique,
    }),

    itemId: links.itemId || null,
    groupId: links.groupId ? String(links.groupId) : '',
    supplierId: links.supplierId ? String(links.supplierId) : '',
    uomType: planItem.uomType,
    uomId: links.uomId || null,
    batchType: planItem.batchType,
    qty: String(qty),
    qtyNum: qty,
    batchNo: planItem.batchType === 'batch' ? barcodeNo : '',

    status: BARCODE_STATUS.IN_STOCK,
    currentLocationId: scope.targetLocationId,
    currentBusinessId: scope.businessId,
    currentStockPointId: scope.stockPointId || null,
  };
}

/* Persist the movement that puts freshly inserted rows into stock. */
async function openBarcodeRows(rows, scope, user, session, { refNo = '', reason = 'HSR opening stock' } = {}) {
  if (!rows.length) return;
  await applyMovement({
    units: rows,
    expect: null,
    set: {
      status: BARCODE_STATUS.IN_STOCK,
      currentLocationId: scope.targetLocationId,
      currentBusinessId: scope.businessId,
      currentStockPointId: scope.stockPointId || null,
    },
    movement: {
      type: MOVEMENT_TYPES.ADJUST_IN,
      direction: 'in',
      toLocationId: scope.targetLocationId,
      refModel: SOURCE,
      refNo,
      reason,
      finYear: scope.finYear,
    },
    user,
    session,
    strict: false,
  });
}

/* A retry must not create a second barcode row for the same workbook line.
   If the row exists but has no ADJUST_IN ledger (the process died between the
   insert and the movement, which can happen when MongoDB transactions are not
   available), the movement is written now instead of reporting a false skip. */
async function recoverIfPending(rows, scope, user, session, reason) {
  const recovered = [];
  for (const row of rows) {
    const moved = await StockMovement.exists({
      barcodeId: row._id,
      type: MOVEMENT_TYPES.ADJUST_IN,
      toLocationId: scope.targetLocationId,
    }).session(session || null);
    if (!moved) {
      await openBarcodeRows([row], scope, user, session, { reason });
      recovered.push(row);
    }
  }
  return recovered;
}

/* Create one record's barcode rows and open their stock. Returns
   { saved, existing, recovered }. */
async function createBarcodesForRecord(record, qty, scope, user, session, { reason, clientRowId }) {
  const existing = await BarcodeLabel.find({ clientRowId })
    .session(session || null)
    .lean();

  if (existing.length) {
    const recovered = await recoverIfPending(existing, scope, user, session, reason);
    return { saved: existing, existing: true, recovered };
  }

  const uom = text(record.values?.uom);
  const batchType = batchTypeFor(record);
  const plan = planBarcodes({ uom, batchType, qty });
  if (!plan.length) throw new Error('No barcode could be planned for this quantity');

  const format = await loadFormat(scope.businessId, scope.finYear);
  const numbers = await reserveBarcodeNumbers(plan.length, {
    businessId: scope.businessId,
    finYear: scope.finYear,
    setting: format,
  }, session);

  const docs = plan.map((p, i) => buildBarcodeDoc(record, p, numbers[i], scope, clientRowId));
  const saved = await BarcodeLabel.insertMany(docs, session ? { session, ordered: true } : { ordered: true });
  await openBarcodeRows(saved, scope, user, session, { refNo: record.values?.grcNo, reason });

  return { saved, existing: false, recovered: [] };
}

function itemKeyOf(record) {
  return idOf(record.links?.itemId) || text(record.values?.itemCode);
}

function groupByItem(records) {
  const groups = new Map();
  for (const record of records) {
    const key = itemKeyOf(record);
    if (!groups.has(key)) {
      groups.set(key, {
        key,
        itemCode: text(record.values?.itemCode),
        itemId: record.links?.itemId || null,
        records: [],
        qty: 0,
      });
    }
    const group = groups.get(key);
    group.records.push(record);
    group.qty = round3(group.qty + num(record.values?.openQty));
  }
  return [...groups.values()];
}

async function targetStockRows(group, scope, session) {
  const filter = {
    businessId: String(scope.businessId),
    currentLocationId: scope.targetLocationId,
    status: BARCODE_STATUS.IN_STOCK,
  };
  if (group.itemId) filter.itemId = group.itemId;
  else filter.itemCode = group.itemCode;
  return BarcodeLabel.find(filter).sort({ createdAt: 1, _id: 1 }).session(session || null);
}

/* Reduce an item's stock by exactly `qtyToRemove`, FIFO.

   A batch/MTR row can be reduced in place (its qtyNum is the quantity it
   stands for). A unique PC row is a physical piece: it is either left alone
   or voided whole, never turned into half a piece. If the requested decrease
   cannot be represented that way the operation fails loudly rather than
   leaving the item's stock wrong. */
async function reduceStock(rows, qtyToRemove, scope, user, session, reason) {
  let remaining = round3(qtyToRemove);
  const removed = [];

  for (const row of rows) {
    if (remaining <= EPSILON) break;
    const rowQty = num(row.qtyNum);
    if (rowQty <= 0) continue;

    const isUniquePiece = String(row.uomType || '').toUpperCase() === 'PC' && row.batchType !== 'batch';
    let take = Math.min(rowQty, remaining);
    if (isUniquePiece && take < rowQty) {
      /* Cannot split the piece. A later smaller row may cover the remainder. */
      continue;
    }
    take = round3(take);
    if (take <= 0) continue;

    const unit = { ...(typeof row.toObject === 'function' ? row.toObject() : row), qtyNum: take };
    const set = {};
    if (take >= rowQty - EPSILON) {
      set.status = BARCODE_STATUS.VOID;
      set.qtyNum = 0;
      set.qty = '0';
    } else {
      set.qtyNum = round3(rowQty - take);
      set.qty = String(round3(rowQty - take));
    }

    await applyMovement({
      units: [unit],
      expect: BARCODE_STATUS.IN_STOCK,
      set,
      movement: {
        type: MOVEMENT_TYPES.ADJUST_OUT,
        direction: 'out',
        fromLocationId: scope.targetLocationId,
        refModel: SOURCE,
        refNo: '',
        reason,
        finYear: scope.finYear,
      },
      user,
      session,
      strict: true,
    });

    remaining = round3(remaining - take);
    removed.push({ barcodeNo: row.barcodeNo, qty: take, voided: take >= rowQty - EPSILON });
  }

  if (remaining > EPSILON) {
    throw new Error(
      `Cannot remove ${remaining} in whole barcode units - unique pieces cannot be split. ` +
      'Void or adjust the affected barcodes first, then import again.'
    );
  }
  return removed;
}

/* Operation A: update barcode/item details, never stock. */
export async function executeUpdateDetails(records, scope, user, session = null) {
  const result = emptyCounts(records.length);

  for (const record of records) {
    const itemCode = text(record.values?.itemCode);
    try {
      /* A missing Item master is a warning, not a blocker: barcode metadata
         can still be updated by item code, exactly as the warehouse seed
         imported those rows (itemId null). Only the Item master write needs
         an itemId. */
      const itemId = record.links?.itemId || null;

      const itemUpdate = {};
      const v = record.values || {};
      if (v.rsp !== null && v.rsp !== undefined) itemUpdate.rsp = num(v.rsp);
      if (v.wsp !== null && v.wsp !== undefined) itemUpdate.wsp = num(v.wsp);
      if (v.discount !== null && v.discount !== undefined) itemUpdate.rspOfferPercent = num(v.discount);

      let itemWritten = false;
      if (Object.keys(itemUpdate).length && itemId) {
        await Item.updateOne({ _id: itemId }, { $set: itemUpdate }).session(session || null);
        itemWritten = true;
      }

      const barcodeUpdate = {};
      if (v.printDescription) barcodeUpdate.printDescription = text(v.printDescription);
      if (v.hsn) barcodeUpdate.hsn = text(v.hsn);
      if (v.hsrPurPrice !== null && v.hsrPurPrice !== undefined) {
        barcodeUpdate.hsrPurPrice = num(v.hsrPurPrice);
        barcodeUpdate.purRate = String(v.hsrPurPrice);
      }
      if (v.offerPrice !== null && v.offerPrice !== undefined) barcodeUpdate.offerPrice = String(v.offerPrice);
      if (v.wsp !== null && v.wsp !== undefined) barcodeUpdate.wspPrice = String(v.wsp);
      if (v.dp !== null && v.dp !== undefined) barcodeUpdate.dpPrice = String(v.dp);
      if (v.rsp !== null && v.rsp !== undefined) barcodeUpdate.retailPrice = String(v.rsp);
      if (v.gst !== null && v.gst !== undefined) barcodeUpdate.gst = String(v.gst);

      let modified = 0;
      if (Object.keys(barcodeUpdate).length) {
        const filter = {
          businessId: String(scope.businessId),
          currentLocationId: scope.targetLocationId,
          ...(record.links.itemId ? { itemId: record.links.itemId } : { itemCode }),
        };
        const res = await BarcodeLabel.updateMany(filter, { $set: barcodeUpdate }).session(session || null);
        modified = res.modifiedCount || 0;
      }

      if (modified || itemWritten) {
        result.details.push({ line: record.line, itemCode, barcodesUpdated: modified });
      } else {
        result.skippedDetails.push({ line: record.line, itemCode, reason: 'Nothing to update' });
      }
    } catch (error) {
      result.failedDetails.push({ line: record.line, itemCode, error: error.message });
    }
  }

  return finish(result, 'updated');
}

/* Operation B: add barcode rows only for items that have no stock at the
   target. Items that already exist are left untouched; Add Opening Stock is
   the operation that adds another lot to existing stock. */
export async function executeAddBarcodes(records, scope, user, session = null) {
  const result = emptyCounts(records.length);

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;
    const base = {
      businessId: String(scope.businessId),
      currentLocationId: scope.targetLocationId,
      status: BARCODE_STATUS.IN_STOCK,
    };
    const [existingIds, existingCodes] = await Promise.all([
      BarcodeLabel.distinct('itemId', { ...base, itemId: { $ne: null } }).session(sess || null),
      BarcodeLabel.distinct('itemCode', base).session(sess || null),
    ]);
    const haveItem = new Set(existingIds.map(String));
    const haveCode = new Set(existingCodes.map((c) => text(c).toLowerCase()));

    for (const record of records) {
      const itemCode = text(record.values?.itemCode);
      try {
        if (haveItem.has(String(record.links?.itemId || '')) || haveCode.has(itemCode.toLowerCase())) {
          result.skippedDetails.push({
            line: record.line,
            itemCode,
            reason: 'Item already has a barcode at this location - use Add Opening Stock to add another lot',
          });
          continue;
        }

        const qty = num(record.values?.openQty);
        const created = await createBarcodesForRecord(record, qty, scope, user, sess, {
          reason: 'HSR opening stock - new barcode',
          clientRowId: clientRowIdOf(record),
        });

        if (created.existing) {
          result.recovered += created.recovered.length;
          result.skippedDetails.push({
            line: record.line,
            itemCode,
            reason: created.recovered.length ? 'Recovered stock movement from an earlier partial run' : 'Already imported on an earlier run',
          });
        } else {
          result.details.push({
            line: record.line,
            itemCode,
            qty,
            barcodes: created.saved.map((b) => b.barcodeNo),
          });
        }
      } catch (error) {
        result.failedDetails.push({ line: record.line, itemCode, error: error.message });
      }
    }

    return finish(result, 'inserted');
  });
}

/* Operation C: make the item's target stock equal the Excel quantity.
   The delta is the only thing moved - existing stock is never silently
   rewritten to a new number without a matching receipt/issue in the ledger. */
export async function executeReplaceStock(records, scope, user, session = null) {
  const result = emptyCounts(records.length);

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    for (const group of groupByItem(records)) {
      const itemCode = group.itemCode;
      try {
        const firstRecord = group.records[0];
        const replaceId = `hsr-replace:${firstRecord.fileHash || firstRecord.fileName || ''}:${group.key}:${group.qty}`;
        /* If a previous attempt inserted the replacement rows but died before
           the movement, recover them first. They are then included in the
           stock total below, so a retry does not add the delta twice. */
        const pending = await BarcodeLabel.find({ clientRowId: replaceId }).session(sess || null).lean();
        const recovered = await recoverIfPending(pending, scope, user, sess, 'HSR replace stock - recovered');

        const rowsDoc = await targetStockRows(group, scope, sess);
        const rows = rowsDoc.map((r) => r.toObject());
        const existingQty = round3(rows.reduce((sum, r) => sum + num(r.qtyNum), 0));
        const targetQty = round3(group.qty);
        const diff = round3(targetQty - existingQty);

        if (Math.abs(diff) <= EPSILON) {
          result.skippedDetails.push({ line: group.records[0].line, itemCode, reason: 'Quantity unchanged' });
        } else if (diff > 0) {
          const first = group.records[0];
          const synthetic = { ...first, clientRowId: replaceId };
          const created = await createBarcodesForRecord(synthetic, diff, scope, user, sess, {
            reason: 'HSR replace stock - increase',
            clientRowId: replaceId,
          });
          result.details.push({
            line: first.line,
            itemCode,
            before: existingQty,
            after: targetQty,
            diff,
            barcodes: created.saved.map((b) => b.barcodeNo),
          });
        } else {
          const removed = await reduceStock(rows, Math.abs(diff), scope, user, sess, 'HSR replace stock - decrease');
          result.details.push({
            line: group.records[0].line,
            itemCode,
            before: existingQty,
            after: targetQty,
            diff,
            removed,
          });
        }

        if (recovered.length) result.recovered += recovered.length;

        /* Prices are metadata; update them on the rows that remain. */
        const price = group.records[0].values?.hsrPurPrice;
        if (price !== null && price !== undefined) {
          const filter = {
            businessId: String(scope.businessId),
            currentLocationId: scope.targetLocationId,
            ...(group.itemId ? { itemId: group.itemId } : { itemCode }),
          };
          await BarcodeLabel.updateMany(filter, {
            $set: { hsrPurPrice: num(price), purRate: String(price) },
          }).session(sess || null);
        }
      } catch (error) {
        result.failedDetails.push({ line: group.records[0].line, itemCode, error: error.message });
      }
    }

    return finish(result, 'replaced');
  });
}

/* Operation D: add opening stock. Repeated Item Codes are separate lots and
   each gets its own barcode row(s), on top of whatever is already in stock. */
export async function executeAddStock(records, scope, user, session = null) {
  const result = emptyCounts(records.length);

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    for (const record of records) {
      const itemCode = text(record.values?.itemCode);
      try {
        const qty = num(record.values?.openQty);
        if (!(qty > 0)) {
          result.failedDetails.push({ line: record.line, itemCode, error: 'Open Qty must be greater than 0' });
          continue;
        }

        const created = await createBarcodesForRecord(record, qty, scope, user, sess, {
          reason: 'HSR opening stock',
          clientRowId: clientRowIdOf(record),
        });

        if (created.existing) {
          result.recovered += created.recovered.length;
          result.skippedDetails.push({
            line: record.line,
            itemCode,
            reason: created.recovered.length ? 'Recovered stock movement from an earlier partial run' : 'Already imported on an earlier run',
          });
        } else {
          result.details.push({
            line: record.line,
            itemCode,
            qty,
            barcodes: created.saved.map((b) => b.barcodeNo),
          });
        }
      } catch (error) {
        result.failedDetails.push({ line: record.line, itemCode, error: error.message });
      }
    }

    return finish(result, 'added');
  });
}

/* Operation E: transfer whole barcode units from the source warehouse.

   Transfers are guarded per unit by the inventory engine (IN_STOCK ->
   IN_TRANSIT -> IN_STOCK), so the units are re-read after despatch and only
   then received. A partial batch row is not split here: that would need a new
   barcode and a split document, which is a separate, deliberate operation. */
export async function executeTransferStock(records, scope, user, session = null) {
  const result = emptyCounts(records.length);

  if (!scope.sourceLocationId) {
    for (const record of records) {
      result.skippedDetails.push({
        line: record.line,
        itemCode: text(record.values?.itemCode),
        reason: 'Source warehouse not specified for transfer',
      });
    }
    return finish(result, 'transferred');
  }

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;
    const [fromLoc, toLoc] = await Promise.all([
      CompanyLocation.findById(scope.sourceLocationId).select('name gstin').session(sess || null).lean(),
      CompanyLocation.findById(scope.targetLocationId).select('name gstin').session(sess || null).lean(),
    ]);

    const transferNo = await nextSeriesNumber(
      StockTransfer,
      'transferNo',
      'ST/' + (String(scope.finYear || '').slice(2, 4) || String(new Date().getFullYear()).slice(2)) + '/',
      { scope: { businessId: scope.businessId, finYear: scope.finYear }, pad: 4 },
      sess
    );

    const transfer = new StockTransfer({
      businessId: scope.businessId,
      finYear: scope.finYear || '',
      transferNo,
      transferDate: new Date(),
      fromLocationId: scope.sourceLocationId,
      fromLocationName: fromLoc?.name || '',
      fromGstn: fromLoc?.gstin || '',
      toLocationId: scope.targetLocationId,
      toLocationName: toLoc?.name || '',
      toGstn: toLoc?.gstin || '',
      toStockPointId: scope.stockPointId || null,
      status: TRANSFER_STATUS.IN_TRANSIT,
      source: 'HSR_IMPORT',
      lines: [],
      submittedAt: new Date(),
      submittedBy: user?.name || user?.email || '',
    });

    const selected = [];
    const groupPicks = [];

    for (const group of groupByItem(records)) {
      const itemCode = group.itemCode;
      try {
        const filter = {
          businessId: String(scope.businessId),
          currentLocationId: scope.sourceLocationId,
          status: BARCODE_STATUS.IN_STOCK,
          ...(group.itemId ? { itemId: group.itemId } : { itemCode }),
        };
        const rows = await BarcodeLabel.find(filter)
          .sort({ qtyNum: 1, createdAt: 1, _id: 1 })
          .session(sess || null)
          .lean();

        let remaining = round3(group.qty);
        const picked = [];
        for (const row of rows) {
          if (remaining <= EPSILON) break;
          const rowQty = num(row.qtyNum);
          if (rowQty <= 0 || rowQty > remaining + EPSILON) continue;
          picked.push(row);
          remaining = round3(remaining - rowQty);
        }

        if (remaining > EPSILON) {
          const available = round3(rows.reduce((sum, r) => sum + num(r.qtyNum), 0));
          result.skippedDetails.push({
            line: group.records[0].line,
            itemCode,
            reason: `Cannot transfer ${group.qty} in whole barcode units ` +
              `(available ${available}; ${remaining} would need a split)`,
          });
          continue;
        }

        for (const row of picked) {
          transfer.lines.push({
            barcodeId: row._id,
            barcodeNo: row.barcodeNo || '',
            itemId: row.itemId || null,
            itemCode: row.itemCode || itemCode,
            itemName: row.itemName || '',
            description: row.printDescription || '',
            uom: row.uom || '',
            uomType: row.uomType || '',
            batchType: row.batchType || '',
            qty: num(row.qtyNum),
            hsn: row.hsn || '',
            gst: num(row.gst),
            rate: num(row.hsrPurPrice || row.purRate),
            rsp: num(row.retailPrice),
            supplierId: row.supplierId || '',
            grcNo: row.grcNo || '',
            received: false,
            returned: false,
          });
          selected.push(row);
        }

        transfer.recalc();
        groupPicks.push({ line: group.records[0].line, itemCode, qty: group.qty, picked });
      } catch (error) {
        result.failedDetails.push({ line: group.records[0].line, itemCode, error: error.message });
      }
    }

    if (!transfer.lines.length) {
      return finish(result, 'transferred');
    }

    transfer.recalc();
    await transfer.save(sess ? { session: sess } : {});

    const units = await BarcodeLabel.find({
      _id: { $in: selected.map((r) => r._id) },
      status: BARCODE_STATUS.IN_STOCK,
    }).session(sess || null).lean();

    const { skipped } = await applyMovement({
      units,
      expect: BARCODE_STATUS.IN_STOCK,
      set: {
        status: BARCODE_STATUS.IN_TRANSIT,
        transferId: transfer._id,
        transferNo: transfer.transferNo,
        receivedId: null,
        returnId: null,
        returnReason: '',
      },
      movement: {
        type: MOVEMENT_TYPES.TRANSFER_OUT,
        direction: 'out',
        fromLocationId: scope.sourceLocationId,
        toLocationId: scope.targetLocationId,
        refModel: 'stockTransfer',
        refId: transfer._id,
        refNo: transfer.transferNo,
        at: transfer.transferDate,
      },
      user,
      session: sess,
      strict: false,
    });

    const skippedIds = new Set(skipped.map((u) => String(u._id)));
    for (const unit of skipped) {
      result.failedDetails.push({
        line: 0,
        itemCode: unit.itemCode || '',
        error: `Barcode ${unit.barcodeNo || unit._id} changed before it could be despatched`,
      });
    }

    const despatched = units.filter((u) => !skippedIds.has(String(u._id)));
    /* Re-read after despatch: receiveTransfer guards for IN_TRANSIT, and a
       stale IN_STOCK object would be rejected by that guard. */
    const inTransit = await BarcodeLabel.find({ _id: { $in: despatched.map((u) => u._id) } })
      .session(sess || null)
      .lean();

    await applyMovement({
      units: inTransit,
      expect: BARCODE_STATUS.IN_TRANSIT,
      set: {
        status: BARCODE_STATUS.IN_STOCK,
        currentLocationId: scope.targetLocationId,
        currentBusinessId: scope.businessId,
        currentStockPointId: scope.stockPointId || null,
        receivedId: transfer._id,
      },
      movement: {
        type: MOVEMENT_TYPES.TRANSFER_IN,
        direction: 'in',
        fromLocationId: scope.sourceLocationId,
        toLocationId: scope.targetLocationId,
        refModel: 'stockTransfer',
        refId: transfer._id,
        refNo: transfer.transferNo,
        at: new Date(),
      },
      user,
      session: sess,
      strict: false,
    });

    const movedIds = new Set(despatched.map((u) => String(u._id)));
    for (const line of transfer.lines) {
      if (movedIds.has(String(line.barcodeId))) {
        line.received = true;
        line.receivedAt = new Date();
        line.receivedBy = user?.name || '';
      }
    }

    for (const gp of groupPicks) {
      const allMoved = gp.picked.every((row) => movedIds.has(String(row._id)));
      if (allMoved) {
        result.details.push({
          line: gp.line,
          itemCode: gp.itemCode,
          qty: gp.qty,
          barcodes: gp.picked.map((r) => r.barcodeNo),
        });
      } else {
        result.failedDetails.push({
          line: gp.line,
          itemCode: gp.itemCode,
          error: 'One or more barcodes changed before they could be despatched',
        });
      }
    }

    transfer.recalc();
    transfer.receivedAt = new Date();
    transfer.receivedBy = user?.name || '';
    transfer.deriveStatus();
    await transfer.save(sess ? { session: sess } : {});

    return finish(result, 'transferred');
  });
}

/* Main execution handler */
export async function executeHSRImport(records, operation, scope, user, session = null) {
  switch (operation) {
    case IMPORT_OPERATIONS.UPDATE_DETAILS:
      return executeUpdateDetails(records, scope, user, session);
    case IMPORT_OPERATIONS.ADD_BARCODES:
      return executeAddBarcodes(records, scope, user, session);
    case IMPORT_OPERATIONS.REPLACE_STOCK:
      return executeReplaceStock(records, scope, user, session);
    case IMPORT_OPERATIONS.ADD_STOCK:
      return executeAddStock(records, scope, user, session);
    case IMPORT_OPERATIONS.TRANSFER_STOCK:
      return executeTransferStock(records, scope, user, session);
    default:
      throw new Error(`Unknown operation: ${operation}`);
  }
}

export default {
  IMPORT_OPERATIONS,
  executeHSRImport,
  executeUpdateDetails,
  executeAddBarcodes,
  executeReplaceStock,
  executeAddStock,
  executeTransferStock,
};
