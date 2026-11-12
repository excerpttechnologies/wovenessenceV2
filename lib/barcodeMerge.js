import mongoose, { isValidObjectId } from 'mongoose';
import BarcodeMerge, { MERGE_STATUS } from '@/models/BarcodeMerge';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import { reserveSequence } from '@/models/Counter';
import Supplier from '@/models/Supplier';
import { withTransaction, InventoryError, barcodeFilter } from '@/lib/inventory';
import { reserveBarcodeNumbers } from '@/lib/barcodeEngine';
import { requireConversion, convertQty, roundQty } from '@/lib/uomConversion';
import { uomTypeOf } from '@/lib/barcodeUnits';

/* ==========================================================================
   BARCODE MERGE - the service the API routes call.

   Several source barcodes become one new barcode. The sources are never
   deleted: they are marked MERGED with qtyNum 0, and their full quantity and
   price snapshot is stored on the merge document. Cancelling a merge restores
   them, provided the merged barcode has not moved since.

   Compatibility is checked, not assumed:
     - the same item (itemId, or itemCode where the row predates itemId)
     - the same supplier (supplier is inherited, never combined across parties)
     - the same HSN / GST where both are present
     - the same batch where both are present
     - the same current location (a merge must not move stock between branches)
     - an approved UOM conversion where the units differ

   Prices are never averaged: the merged barcode's prices are entered and
   confirmed by the operator, and every source's prices are kept beside them.
   ========================================================================== */

const EPS = 1e-6;

const money = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
};
const num = (value) => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};
const toId = (value) => (isValidObjectId(String(value || '')) ? new mongoose.Types.ObjectId(String(value)) : null);
const qtyString = (value) => String(roundQty(value));

export function availableQtyOf(unit) {
  if (!unit) return 0;
  const value = unit.qtyNum !== undefined && unit.qtyNum !== null ? unit.qtyNum : unit.qty;
  return Math.max(0, num(value));
}

const keyOf = (value) => String(value || '').trim().toLowerCase();

function sourceSnapshot(unit) {
  return {
    barcodeId: String(unit._id),
    barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
    itemId: unit.itemId ? String(unit.itemId) : '',
    itemCode: unit.itemCode || '',
    itemName: unit.itemName || '',
    qty: availableQtyOf(unit),
    uom: unit.uom || '',
    uomType: uomTypeOf(unit.uom),
    status: unit.status || '',
    supplierId: unit.supplierId ? String(unit.supplierId) : '',
    grcId: unit.grcId ? String(unit.grcId) : '',
    grcNo: unit.grcNo || '',
    batchNo: unit.batchNo || '',
    hsn: unit.hsn || '',
    gst: unit.gst || '',
    purchaseRate: num(unit.purRate),
    discount: num(unit.disc),
    finalPurchaseRate: num(unit.finalNet),
    rsp: num(unit.retailPrice),
    rspOfferPrice: num(unit.offerPrice),
    wsp: num(unit.wspPrice),
    wspOfferPrice: num(unit.wsp),
    dp: num(unit.dpPrice),
    dpOfferPrice: num(unit.dp),
    sellingPrice: num(unit.sellingPrice),
    splitId: unit.splitId ? String(unit.splitId) : '',
    parentBarcodeId: unit.parentBarcodeId ? String(unit.parentBarcodeId) : '',
    rootBarcodeId: unit.rootBarcodeId ? String(unit.rootBarcodeId) : '',
    locationId: unit.currentLocationId ? String(unit.currentLocationId) : unit.locationId ? String(unit.locationId) : '',
    /* Legacy rows carry only locationId; treating that as the current
       location keeps a merge of older stock possible without moving it. */
    currentLocationId: unit.currentLocationId
      ? String(unit.currentLocationId)
      : unit.locationId ? String(unit.locationId) : '',
    stockPointId: unit.currentStockPointId ? String(unit.currentStockPointId) : '',
    businessId: unit.businessId ? String(unit.businessId) : '',
    finYear: unit.finYear || '',
  };
}

/* Loads the selected rows, by id or number. Every row must exist and be in
   stock; selecting a sold barcode is a refusal, not a silent skip. */
export async function loadMergeSources({ businessId, barcodeIds = [], codes = [], session = null }) {
  const ids = (Array.isArray(barcodeIds) ? barcodeIds : []).filter((id) => isValidObjectId(String(id)));
  const text = (Array.isArray(codes) ? codes : [codes]).map((c) => String(c || '').trim()).filter(Boolean);

  if (!ids.length && !text.length) {
    throw new InventoryError('NO_SOURCES', 'Select at least two barcodes to merge.', { status: 422 });
  }

  const query = BarcodeLabel.find({
    $or: [
      ...(ids.length ? [{ _id: { $in: ids } }] : []),
      ...(text.length ? [barcodeFilter(text)] : []),
    ],
    ...(businessId ? { businessId: String(businessId) } : {}),
  });
  if (session) query.session(session);
  const units = await query.lean();

  const found = new Set(units.map((u) => String(u._id)));
  const missing = ids.filter((id) => !found.has(String(id)));
  if (missing.length) {
    throw new InventoryError('BARCODE_NOT_FOUND', 'Some selected barcodes no longer exist. Reload and select again.', { status: 404, skipped: missing });
  }

  if (units.length < 2) {
    throw new InventoryError('NOT_ENOUGH_SOURCES', 'A merge needs at least two barcodes.', { status: 422 });
  }

  const unavailable = units.filter((u) => u.status !== BARCODE_STATUS.IN_STOCK || availableQtyOf(u) <= 0);
  if (unavailable.length) {
    throw new InventoryError(
      'NOT_IN_STOCK',
      'These barcodes are not available to merge: '
      + unavailable.map((u) => (u.barcodeNo || u.barcodeGenerated) + ' (' + (u.status || 'unknown') + ')').slice(0, 8).join(', ') + '.',
      { status: 409 }
    );
  }

  return units;
}

/* Compatibility + quantity. Returns normalised source rows and the merged
   quantity, or a list of errors - never a partial conversion. */
/* The source rows as stored on the merge document. Kept in one place so a
   draft created and a draft edited write exactly the same shape - the
   finalize path reads these snapshots back, it does not re-invent them. */
export function documentSources(sources) {
  return sources.map((s) => ({
    barcodeId: toId(s.barcodeId),
    barcodeNo: s.barcodeNo,
    qty: s.qty,
    uom: s.uom,
    uomType: s.uomType,
    conversionFactor: s.conversionFactor,
    qtyInMergedUom: s.qtyInMergedUom,
    purchaseRate: s.purchaseRate,
    discount: s.discount,
    finalPurchaseRate: s.finalPurchaseRate,
    rsp: s.rsp,
    rspOfferPrice: s.rspOfferPrice,
    wsp: s.wsp,
    wspOfferPrice: s.wspOfferPrice,
    dp: s.dp,
    dpOfferPrice: s.dpOfferPrice,
    sellingPrice: s.sellingPrice,
    grcId: toId(s.grcId),
    grcNo: s.grcNo,
    batchNo: s.batchNo,
    splitId: toId(s.splitId),
    parentBarcodeId: toId(s.parentBarcodeId),
    rootBarcodeId: toId(s.rootBarcodeId),
  }));
}

export async function validateMergeSources({ businessId, units, targetUom }) {
  const errors = [];
  const snapshots = units.map(sourceSnapshot);
  const first = snapshots[0];
  const uom = String(targetUom || first.uom || '').trim();

  if (!uom) {
    errors.push({ field: 'uom', message: 'Choose the UOM the merged barcode will hold.' });
  }

  snapshots.forEach((source, index) => {
    const rowNo = index + 1;

    /* Item identity. itemId is authoritative; itemCode is the fallback for
       rows written before item resolution existed. */
    const sameItem = first.itemId
      ? String(sourceItemId(units[index])) === String(sourceItemId(units[0]))
      : keyOf(source.itemCode) === keyOf(first.itemCode);
    if (!sameItem) {
      errors.push({ row: rowNo, field: 'item', message: source.barcodeNo + ' is a different item (' + (source.itemCode || 'no code') + ') and cannot be merged with ' + first.itemCode + '.' });
    }

    if (String(source.supplierId || '') !== String(first.supplierId || '')) {
      errors.push({ row: rowNo, field: 'supplier', message: source.barcodeNo + ' belongs to a different supplier. Supplier is inherited and cannot be combined.' });
    }

    if (source.hsn && first.hsn && keyOf(source.hsn) !== keyOf(first.hsn)) {
      errors.push({ row: rowNo, field: 'hsn', message: source.barcodeNo + ' has a different HSN (' + source.hsn + ').' });
    }
    if (source.gst && first.gst && String(source.gst) !== String(first.gst)) {
      errors.push({ row: rowNo, field: 'gst', message: source.barcodeNo + ' has a different GST slab (' + source.gst + ').' });
    }
    if (source.batchNo && first.batchNo && keyOf(source.batchNo) !== keyOf(first.batchNo)) {
      errors.push({ row: rowNo, field: 'batch', message: source.barcodeNo + ' is from a different batch (' + source.batchNo + ').' });
    }
    if (String(source.currentLocationId || '') !== String(first.currentLocationId || '')) {
      errors.push({ row: rowNo, field: 'location', message: source.barcodeNo + ' is at a different location. Stock cannot be merged across branches.' });
    }
  });

  if (errors.length) return { errors, sources: [], totalQty: 0, uom };

  let totalQty = 0;
  const sources = [];
  for (let index = 0; index < units.length; index += 1) {
    const unit = units[index];
    const source = snapshots[index];
    try {
      const conversion = await requireConversion({
        businessId: unit.businessId || businessId,
        itemId: unit.itemId ? String(unit.itemId) : null,
        fromUom: source.uom,
        toUom: uom,
      });
      const qtyInMergedUom = uomTypeOf(source.uom) === uomTypeOf(uom)
        ? roundQty(source.qty)
        : convertQty(source.qty, conversion);
      totalQty = roundQty(totalQty + qtyInMergedUom);
      sources.push({
        ...source,
        conversionFactor: conversion.factor,
        qtyInMergedUom,
      });
    } catch (err) {
      errors.push({ row: index + 1, field: 'uom', message: err.message });
    }
  }

  return { errors, sources, totalQty, uom, uomType: uomTypeOf(uom) };
}

function sourceItemId(unit) {
  return unit?.itemId ? String(unit.itemId) : '';
}

/* The supplier's display name and code, resolved once for the merge header.
   The supplier itself is inherited from the sources and never re-entered. */
async function supplierOf(id) {
  if (!id || !isValidObjectId(String(id))) return { name: '', code: '' };
  const supplier = await Supplier.findById(id).select('businessName firstName lastName contactId').lean();
  if (!supplier) return { name: '', code: '' };
  return {
    name: String(supplier.businessName || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ') || '').trim(),
    code: supplier.contactId || '',
  };
}

/* ---------------------------------------------------------------- numbers -- */

async function mergedBarcodeNumber({ supplied, businessId, session }) {
  if (String(supplied || '').trim()) {
    const number = String(supplied).trim();
    const taken = await BarcodeLabel.exists({ barcodeNo: number, ...(businessId ? { businessId: String(businessId) } : {}) });
    if (taken) {
      throw new InventoryError('BARCODE_NUMBER_COLLISION', 'Barcode ' + number + ' already exists. Choose another number.', { status: 409 });
    }
    return number;
  }

  /* The standard Barcode Setting series - the same one Barcode Generation
     issues from, so a merged barcode scans and prints like any other. */
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const [candidate] = await reserveBarcodeNumbers(1, { businessId }, session);
    if (!candidate) break;
    const taken = await BarcodeLabel.exists({ barcodeNo: candidate, ...(businessId ? { businessId: String(businessId) } : {}) });
    if (!taken) return candidate;
  }
  throw new InventoryError('BARCODE_NUMBER_COLLISION', 'Could not issue a unique merged barcode number. Try again.', { status: 409 });
}

async function nextMergeNo({ businessId, finYear, session }) {
  const n = await reserveSequence('barcode-merge-no', { businessId, finYear }, 1, session);
  return 'MRG/' + (finYear || new Date().getFullYear()) + '/' + String(n).padStart(4, '0');
}

/* ------------------------------------------------------------------ prices -- */

const PRICE_FIELDS = [
  'purchaseRate', 'discount', 'finalPurchaseRate', 'rsp', 'rspOfferPrice',
  'wsp', 'wspOfferPrice', 'dp', 'dpOfferPrice', 'sellingPrice',
];

function readPrices(body) {
  const errors = [];
  const prices = {};
  PRICE_FIELDS.forEach((field) => {
    const raw = body[field];
    const value = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
    if (!Number.isFinite(value) || value < 0) {
      errors.push({ field, message: 'Prices must be numbers and cannot be negative.' });
    }
    prices[field] = money(value);
  });
  if (!(prices.purchaseRate > 0)) {
    errors.push({ field: 'purchaseRate', message: 'Enter the approved purchase rate for the merged barcode.' });
  }
  if (!(prices.rsp > 0)) {
    errors.push({ field: 'rsp', message: 'Enter the approved RSP for the merged barcode.' });
  }
  if (!errors.length && !prices.finalPurchaseRate) {
    prices.finalPurchaseRate = money(Math.max(0, prices.purchaseRate - prices.discount));
  }
  return { prices, errors };
}

/* ------------------------------------------------------------------- save -- */

export async function createMerge({ businessId, body, session }) {
  const units = await loadMergeSources({
    businessId,
    barcodeIds: body.barcodeIds,
    codes: body.barcodes,
  });

  const checked = await validateMergeSources({ businessId, units, targetUom: body.uom });
  if (checked.errors.length) {
    const error = new Error(checked.errors[0].message);
    error.status = 422;
    error.code = 'MERGE_VALIDATION';
    error.errors = checked.errors;
    throw error;
  }

  const { prices, errors: priceErrors } = readPrices(body);
  if (priceErrors.length) {
    const error = new Error(priceErrors[0].message);
    error.status = 422;
    error.code = 'MERGE_VALIDATION';
    error.errors = priceErrors;
    throw error;
  }

  const finalize = body.finalize === true || String(body.status || '').toLowerCase() === 'finalized';
  const first = checked.sources[0];

  const result = await withTransaction(async (dbSession) => {
    /* Re-read inside the transaction so the quantities and statuses the
       operator saw are the ones being consumed. */
    const freshUnits = await loadMergeSources({
      businessId: businessId || first.businessId,
      barcodeIds: checked.sources.map((s) => s.barcodeId),
      session: dbSession,
    });
    const fresh = await validateMergeSources({ businessId, units: freshUnits, targetUom: checked.uom });
    if (fresh.errors.length) {
      const error = new Error(fresh.errors[0].message);
      error.status = 422;
      error.code = 'MERGE_VALIDATION';
      error.errors = fresh.errors;
      throw error;
    }
    if (Math.abs(fresh.totalQty - checked.totalQty) > EPS) {
      throw new InventoryError('STOCK_CHANGED', 'One of the selected barcodes changed while the merge was being saved. Reload and try again.', { status: 409 });
    }

    const mergeNo = await nextMergeNo({
      businessId: freshUnits[0].businessId || businessId,
      finYear: freshUnits[0].finYear || body.finYear,
      session: dbSession,
    });
    const mergedBarcodeNo = await mergedBarcodeNumber({
      supplied: body.mergedBarcodeNo,
      businessId: freshUnits[0].businessId || businessId,
      session: dbSession,
    });

    const firstUnit = freshUnits[0];
    const firstSource = fresh.sources[0];
    const supplier = await supplierOf(firstSource.supplierId || firstUnit.supplierId);
    const rootIds = new Set(fresh.sources.map((s) => String(s.rootBarcodeId || '')));
    const sharedRoot = rootIds.size === 1 && [...rootIds][0] ? toId([...rootIds][0]) : null;

    const [merge] = await BarcodeMerge.create([{
      businessId: toId(firstUnit.businessId) || toId(businessId),
      locationId: toId(firstSource.currentLocationId) || toId(body.location),
      finYear: firstUnit.finYear || body.finYear || '',
      mergeNo,
      status: finalize ? MERGE_STATUS.FINALIZED : MERGE_STATUS.DRAFT,

      mergedBarcodeNo,
      itemId: toId(firstSource.itemId || firstUnit.itemId),
      itemCode: firstSource.itemCode,
      itemName: firstSource.itemName,

      supplierId: toId(firstSource.supplierId),
      supplierName: supplier.name,
      supplierCode: supplier.code,

      totalQty: fresh.totalQty,
      uom: fresh.uom,
      uomType: fresh.uomType,
      sourceCount: fresh.sources.length,

      ...prices,
      snapshot: {
        itemCode: firstSource.itemCode,
        itemName: firstSource.itemName,
        hsn: firstSource.hsn,
        gst: firstSource.gst,
        batchNo: firstSource.batchNo,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        grcNos: [...new Set(fresh.sources.map((s) => s.grcNo).filter(Boolean))],
        barcodes: fresh.sources.map((s) => s.barcodeNo),
      },
      sources: documentSources(fresh.sources),

      notes: String(body.notes || ''),
      createdBy: toId(session?.id),
      createdByName: session?.name || '',
      createdByEmail: session?.email || '',
      audit: [{
        action: finalize ? 'Finalized' : 'Draft saved',
        userId: toId(session?.id),
        userName: session?.name || '',
        userEmail: session?.email || '',
        note: body.notes || '',
        at: new Date(),
      }],
    }], dbSession ? { session: dbSession } : {});

    if (!finalize) return { merge, stock: null };

    const [merged] = await BarcodeLabel.create([{
      businessId: String(firstUnit.businessId || ''),
      locationId: String(firstUnit.locationId || firstSource.locationId || ''),
      finYear: firstUnit.finYear || '',
      grcId: firstUnit.grcId || '',
      grcNo: firstSource.grcNo || firstUnit.grcNo || '',
      supplierId: firstUnit.supplierId || '',
      itemCode: firstSource.itemCode,
      itemId: toId(firstSource.itemId || firstUnit.itemId),
      itemName: firstSource.itemName,
      printDescription: firstUnit.printDescription || firstSource.itemName || '',
      supplierDescription: firstUnit.supplierDescription || '',
      hsn: firstSource.hsn || firstUnit.hsn || '',
      gst: firstSource.gst || firstUnit.gst || '',
      qty: qtyString(fresh.totalQty),
      qtyNum: fresh.totalQty,
      uom: fresh.uom,
      uomType: fresh.uomType,
      batchType: 'unique',
      batchUnique: 'unique',
      batchNo: firstSource.batchNo || firstUnit.batchNo || '',
      goodsType: firstUnit.goodsType || '',
      sm: firstUnit.sm || '',
      p_m_f: firstUnit.p_m_f || '',
      fma: firstUnit.fma || '',
      silkMark: firstUnit.silkMark || '',

      purRate: String(prices.purchaseRate),
      disc: String(prices.discount),
      finalNet: String(prices.finalPurchaseRate),
      retailPrice: String(prices.rsp),
      offerPrice: String(prices.rspOfferPrice),
      wspPrice: String(prices.wsp),
      wsp: String(prices.wspOfferPrice),
      dpPrice: String(prices.dp),
      dp: String(prices.dpOfferPrice),
      sellingPrice: String(prices.sellingPrice),

      barcodeNo: mergedBarcodeNo,
      barcodeGenerated: '',
      oldBarcode: '',
      source: 'BARCODE_MERGE',

      status: BARCODE_STATUS.IN_STOCK,
      currentLocationId: toId(firstSource.currentLocationId),
      currentBusinessId: toId(firstUnit.businessId),
      currentStockPointId: toId(firstSource.stockPointId),

      parentBarcodeId: null,
      rootBarcodeId: sharedRoot,
      splitDepth: 0,
      splitChildCount: 0,
      totalSplitQty: 0,

      mergeId: merge._id,
      mergedFromBarcodes: fresh.sources.map((s) => s.barcodeNo),
    }], dbSession ? { session: dbSession } : {});

    const from = firstSource.currentLocationId;
    const ledger = [];
    for (const unit of freshUnits) {
      const source = fresh.sources.find((s) => String(s.barcodeId) === String(unit._id));
      const res = await BarcodeLabel.updateOne(
        { _id: unit._id, status: BARCODE_STATUS.IN_STOCK, qtyNum: unit.qtyNum },
        {
          $set: {
            status: BARCODE_STATUS.MERGED,
            qtyNum: 0,
            qty: '0',
            mergedIntoBarcodeNo: mergedBarcodeNo,
            mergeId: merge._id,
            updatedAt: new Date(),
          },
        },
        dbSession ? { session: dbSession } : {}
      );
      if (!res.matchedCount) {
        throw new InventoryError('MOVEMENT_CONFLICT', 'A source barcode changed while the merge was being saved. Reload and try again.', { status: 409 });
      }

      ledger.push({
        businessId: toId(unit.businessId),
        finYear: unit.finYear || '',
        type: MOVEMENT_TYPES.MERGE_OUT,
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
        itemId: toId(unit.itemId),
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        qty: -Math.abs(num(source?.qty)),
        fromLocationId: toId(from),
        toLocationId: null,
        statusBefore: BARCODE_STATUS.IN_STOCK,
        statusAfter: BARCODE_STATUS.MERGED,
        refModel: 'barcodeMerge',
        refId: merge._id,
        refNo: mergeNo,
        reason: 'Barcode Merge',
        userId: toId(session?.id),
        userName: session?.name || '',
        userEmail: session?.email || '',
        at: new Date(),
      });
    }

    ledger.push({
      businessId: toId(firstUnit.businessId),
      finYear: firstUnit.finYear || '',
      type: MOVEMENT_TYPES.MERGE_IN,
      barcodeId: merged._id,
      barcodeNo: mergedBarcodeNo,
      itemId: toId(merged.itemId),
      itemCode: merged.itemCode || '',
      itemName: merged.itemName || '',
      uom: merged.uom || '',
      qty: Math.abs(fresh.totalQty),
      fromLocationId: null,
      toLocationId: toId(merged.currentLocationId),
      statusBefore: BARCODE_STATUS.IN_STOCK,
      statusAfter: BARCODE_STATUS.IN_STOCK,
      refModel: 'barcodeMerge',
      refId: merge._id,
      refNo: mergeNo,
      reason: 'Barcode Merge',
      userId: toId(session?.id),
      userName: session?.name || '',
      userEmail: session?.email || '',
      at: new Date(),
    });

    await StockMovement.insertMany(ledger, dbSession ? { session: dbSession, ordered: true } : { ordered: true });

    await BarcodeMerge.updateOne(
      { _id: merge._id },
      {
        $set: {
          mergedBarcodeId: merged._id,
          mergedBarcodeNo,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: {
          audit: {
            action: 'Finalized',
            userId: toId(session?.id),
            userName: session?.name || '',
            userEmail: session?.email || '',
            note: 'Stock posted: ' + fresh.totalQty + ' ' + fresh.uom + ' from ' + freshUnits.length + ' barcode(s).',
            at: new Date(),
          },
        },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { merge, stock: { mergedBarcodeNo, totalQty: fresh.totalQty } };
  });

  return {
    id: String(result.merge._id),
    mergeNo: result.merge.mergeNo,
    status: finalize ? MERGE_STATUS.FINALIZED : MERGE_STATUS.DRAFT,
    mergedBarcodeNo: result.merge.mergedBarcodeNo,
    totalQty: result.merge.totalQty,
  };
}

/* Finalises an existing Draft merge. The merged barcode number reserved on the
   draft is reused, so a draft's number never changes under the operator. */
export async function finalizeMerge({ id, businessId, session }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid merge id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }

  return withTransaction(async (dbSession) => {
    const merge = await BarcodeMerge.findOne({ _id: id, ...(businessId ? { businessId } : {}) })
      .session(dbSession || null).lean();
    if (!merge) {
      const error = new Error('Merge not found.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (merge.status !== MERGE_STATUS.DRAFT) {
      const error = new Error('Only a draft merge can be finalized. This one is ' + merge.status + '.');
      error.status = 409;
      error.code = 'NOT_DRAFT';
      throw error;
    }

    const units = await loadMergeSources({
      businessId: businessId || merge.businessId,
      barcodeIds: (merge.sources || []).map((s) => s.barcodeId),
      session: dbSession,
    });
    const fresh = await validateMergeSources({ businessId, units, targetUom: merge.uom });
    if (fresh.errors.length) {
      const error = new Error(fresh.errors[0].message);
      error.status = 422;
      error.code = 'MERGE_VALIDATION';
      error.errors = fresh.errors;
      throw error;
    }

    /* The draft holds the approved prices; revalidate them like a fresh save. */
    const { prices, errors: priceErrors } = readPrices(merge);
    if (priceErrors.length) {
      const error = new Error(priceErrors[0].message);
      error.status = 422;
      error.code = 'MERGE_VALIDATION';
      error.errors = priceErrors;
      throw error;
    }

    const firstUnit = units[0];
    const firstSource = fresh.sources[0];
    const supplier = await supplierOf(firstSource.supplierId || firstUnit.supplierId);
    const rootIds = new Set(fresh.sources.map((s) => String(s.rootBarcodeId || '')));
    const sharedRoot = rootIds.size === 1 && [...rootIds][0] ? toId([...rootIds][0]) : null;

    if (!merge.mergedBarcodeNo) {
      throw new InventoryError('NO_BARCODE_NUMBER', 'This draft has no merged barcode number. Recreate the merge.', { status: 422 });
    }
    const taken = await BarcodeLabel.exists({
      barcodeNo: merge.mergedBarcodeNo,
      ...(firstUnit.businessId ? { businessId: String(firstUnit.businessId) } : {}),
    });
    if (taken) {
      throw new InventoryError(
        'DUPLICATE_BARCODE',
        'Barcode ' + merge.mergedBarcodeNo + ' already exists. Recreate the merge so a new number is issued.',
        { status: 409 }
      );
    }

    const [merged] = await BarcodeLabel.create([{
      businessId: String(firstUnit.businessId || ''),
      locationId: String(firstUnit.locationId || firstSource.locationId || ''),
      finYear: firstUnit.finYear || '',
      grcId: firstUnit.grcId || '',
      grcNo: firstSource.grcNo || firstUnit.grcNo || '',
      supplierId: firstUnit.supplierId || '',
      itemCode: firstSource.itemCode,
      itemId: toId(firstSource.itemId || firstUnit.itemId),
      itemName: firstSource.itemName,
      printDescription: firstUnit.printDescription || firstSource.itemName || '',
      supplierDescription: firstUnit.supplierDescription || '',
      hsn: firstSource.hsn || firstUnit.hsn || '',
      gst: firstSource.gst || firstUnit.gst || '',
      qty: qtyString(fresh.totalQty),
      qtyNum: fresh.totalQty,
      uom: fresh.uom,
      uomType: fresh.uomType,
      batchType: 'unique',
      batchUnique: 'unique',
      batchNo: firstSource.batchNo || firstUnit.batchNo || '',
      goodsType: firstUnit.goodsType || '',

      purRate: String(prices.purchaseRate),
      disc: String(prices.discount),
      finalNet: String(prices.finalPurchaseRate),
      retailPrice: String(prices.rsp),
      offerPrice: String(prices.rspOfferPrice),
      wspPrice: String(prices.wsp),
      wsp: String(prices.wspOfferPrice),
      dpPrice: String(prices.dp),
      dp: String(prices.dpOfferPrice),
      sellingPrice: String(prices.sellingPrice),

      barcodeNo: merge.mergedBarcodeNo,
      barcodeGenerated: '',
      oldBarcode: '',
      source: 'BARCODE_MERGE',

      status: BARCODE_STATUS.IN_STOCK,
      currentLocationId: toId(firstSource.currentLocationId),
      currentBusinessId: toId(firstUnit.businessId),
      currentStockPointId: toId(firstSource.stockPointId),

      parentBarcodeId: null,
      rootBarcodeId: sharedRoot,
      splitDepth: 0,
      mergeId: merge._id,
      mergedFromBarcodes: fresh.sources.map((s) => s.barcodeNo),
    }], dbSession ? { session: dbSession } : {});

    const from = firstSource.currentLocationId;
    const ledger = [];

    for (const unit of units) {
      const source = fresh.sources.find((s) => String(s.barcodeId) === String(unit._id));
      const res = await BarcodeLabel.updateOne(
        { _id: unit._id, status: BARCODE_STATUS.IN_STOCK, qtyNum: unit.qtyNum },
        {
          $set: {
            status: BARCODE_STATUS.MERGED,
            qtyNum: 0,
            qty: '0',
            mergedIntoBarcodeNo: merge.mergedBarcodeNo,
            mergeId: merge._id,
            updatedAt: new Date(),
          },
        },
        dbSession ? { session: dbSession } : {}
      );
      if (!res.matchedCount) {
        throw new InventoryError('MOVEMENT_CONFLICT', 'A source barcode changed while the merge was being finalized.', { status: 409 });
      }

      ledger.push({
        businessId: toId(unit.businessId),
        finYear: unit.finYear || '',
        type: MOVEMENT_TYPES.MERGE_OUT,
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || '',
        itemId: toId(unit.itemId),
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        qty: -Math.abs(num(source?.qty)),
        fromLocationId: toId(from),
        toLocationId: null,
        statusBefore: BARCODE_STATUS.IN_STOCK,
        statusAfter: BARCODE_STATUS.MERGED,
        refModel: 'barcodeMerge',
        refId: merge._id,
        refNo: merge.mergeNo,
        reason: 'Barcode Merge',
        userId: toId(session?.id),
        userName: session?.name || '',
        userEmail: session?.email || '',
        at: new Date(),
      });
    }

    ledger.push({
      businessId: toId(firstUnit.businessId),
      finYear: firstUnit.finYear || '',
      type: MOVEMENT_TYPES.MERGE_IN,
      barcodeId: merged._id,
      barcodeNo: merge.mergedBarcodeNo,
      itemId: toId(merged.itemId),
      itemCode: merged.itemCode || '',
      itemName: merged.itemName || '',
      uom: merged.uom || '',
      qty: Math.abs(fresh.totalQty),
      fromLocationId: null,
      toLocationId: toId(merged.currentLocationId),
      statusBefore: BARCODE_STATUS.IN_STOCK,
      statusAfter: BARCODE_STATUS.IN_STOCK,
      refModel: 'barcodeMerge',
      refId: merge._id,
      refNo: merge.mergeNo,
      reason: 'Barcode Merge',
      userId: toId(session?.id),
      userName: session?.name || '',
      userEmail: session?.email || '',
      at: new Date(),
    });

    await StockMovement.insertMany(ledger, dbSession ? { session: dbSession, ordered: true } : { ordered: true });

    await BarcodeMerge.updateOne(
      { _id: merge._id },
      {
        $set: {
          status: MERGE_STATUS.FINALIZED,
          mergedBarcodeId: merged._id,
          totalQty: fresh.totalQty,
          sources: merge.sources,
          finalizedAt: new Date(),
          updatedAt: new Date(),
        },
        $push: { audit: { action: 'Finalized', userId: toId(session?.id), userName: session?.name || '', note: 'Stock posted from draft.', at: new Date() } },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { id: String(merge._id), mergeNo: merge.mergeNo, status: MERGE_STATUS.FINALIZED, mergedBarcodeNo: merge.mergedBarcodeNo };
  });
}

/* A Draft may be edited in full: the source barcodes, the merged UOM and the
   approved prices. Nothing is consumed here, so the draft keeps its reserved
   merged barcode number and simply re-snapshots the sources. Finalize re-reads
   every source and posts stock in one transaction, so an edit that raced with
   a sale is refused there rather than trusted here. */
export async function updateDraftMerge({ id, businessId, body, session }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid merge id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }
  const merge = await BarcodeMerge.findOne({ _id: id, ...(businessId ? { businessId } : {}) }).lean();
  if (!merge) {
    const error = new Error('Merge not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (merge.status !== MERGE_STATUS.DRAFT) {
    const error = new Error('Only a draft merge can be edited.');
    error.status = 409;
    error.code = 'NOT_DRAFT';
    throw error;
  }
  if (body.action === 'finalize') return finalizeMerge({ id, businessId, session });
  if (body.action === 'cancel') return cancelMerge({ id, businessId, session, reason: body.reason || 'Draft discarded' });

  const { prices, errors: priceErrors } = readPrices(body);
  if (priceErrors.length) {
    const error = new Error(priceErrors[0].message);
    error.status = 422;
    error.code = 'MERGE_VALIDATION';
    error.errors = priceErrors;
    throw error;
  }

  const update = {
    ...prices,
    notes: body.notes !== undefined ? String(body.notes || '') : merge.notes,
    updatedAt: new Date(),
  };

  const hasSources = Array.isArray(body.barcodeIds) || Array.isArray(body.barcodes);
  if (hasSources) {
    const scopeBusiness = businessId || merge.businessId;
    let units;
    try {
      units = await loadMergeSources({
        businessId: scopeBusiness,
        barcodeIds: body.barcodeIds,
        codes: body.barcodes,
      });
    } catch (err) {
      err.status = err.status || 422;
      err.code = err.code || 'MERGE_VALIDATION';
      throw err;
    }

    const checked = await validateMergeSources({
      businessId: scopeBusiness,
      units,
      targetUom: body.uom || merge.uom,
    });
    if (checked.errors.length) {
      const error = new Error(checked.errors[0].message);
      error.status = 422;
      error.code = 'MERGE_VALIDATION';
      error.errors = checked.errors;
      throw error;
    }

    const first = checked.sources[0];
    const supplier = await supplierOf(first.supplierId);
    Object.assign(update, {
      itemId: toId(first.itemId),
      itemCode: first.itemCode,
      itemName: first.itemName,
      supplierId: toId(first.supplierId),
      supplierName: supplier.name,
      supplierCode: supplier.code,
      locationId: toId(first.currentLocationId),
      totalQty: checked.totalQty,
      uom: checked.uom,
      uomType: checked.uomType,
      sourceCount: checked.sources.length,
      sources: documentSources(checked.sources),
      snapshot: {
        itemCode: first.itemCode,
        itemName: first.itemName,
        hsn: first.hsn,
        gst: first.gst,
        batchNo: first.batchNo,
        supplierName: supplier.name,
        supplierCode: supplier.code,
        grcNos: [...new Set(checked.sources.map((s) => s.grcNo).filter(Boolean))],
        barcodes: checked.sources.map((s) => s.barcodeNo),
      },
    });
  }

  await BarcodeMerge.updateOne(
    { _id: merge._id },
    {
      $set: update,
      $push: {
        audit: {
          action: 'Draft updated',
          userId: toId(session?.id),
          userName: session?.name || '',
          userEmail: session?.email || '',
          note: hasSources ? 'Sources and prices updated.' : 'Prices updated.',
          at: new Date(),
        },
      },
    }
  );
  return { id: String(merge._id), status: MERGE_STATUS.DRAFT, totalQty: update.totalQty ?? merge.totalQty };
}

/* --------------------------------------------------------------- cancel --- */

export async function cancelMerge({ id, businessId, session, reason = '' }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid merge id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }

  return withTransaction(async (dbSession) => {
    const merge = await BarcodeMerge.findOne({ _id: id, ...(businessId ? { businessId } : {}) })
      .session(dbSession || null).lean();
    if (!merge) {
      const error = new Error('Merge not found.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (merge.status === MERGE_STATUS.CANCELLED) {
      const error = new Error('This merge is already cancelled.');
      error.status = 409;
      error.code = 'ALREADY_CANCELLED';
      throw error;
    }

    if (merge.status === MERGE_STATUS.DRAFT) {
      await BarcodeMerge.updateOne(
        { _id: merge._id, status: MERGE_STATUS.DRAFT },
        {
          $set: { status: MERGE_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: String(reason || 'Draft discarded') },
          $push: { audit: { action: 'Cancelled', userId: toId(session?.id), userName: session?.name || '', note: String(reason || 'Draft discarded'), at: new Date() } },
        },
        dbSession ? { session: dbSession } : {}
      );
      return { id: String(merge._id), status: MERGE_STATUS.CANCELLED, stockReversed: false };
    }

    const merged = merge.mergedBarcodeId
      ? await BarcodeLabel.findById(merge.mergedBarcodeId).session(dbSession || null).lean()
      : null;
    if (!merged) {
      const error = new Error('The merged barcode no longer exists.');
      error.status = 409;
      error.code = 'MERGED_MISSING';
      throw error;
    }

    /* The merged unit may only be pulled back if it is untouched. */
    if (merged.status !== BARCODE_STATUS.IN_STOCK
      || merged.billingId
      || merged.transferId
      || num(merged.splitChildCount) > 0
      || Math.abs(availableQtyOf(merged) - num(merge.totalQty)) > EPS) {
      const error = new Error(
        'The merged barcode ' + (merged.barcodeNo || '') + ' has moved since this merge '
        + '(status ' + (merged.status || 'unknown') + ', quantity ' + availableQtyOf(merged)
        + '). Reverse its later transactions before cancelling the merge.'
      );
      error.status = 409;
      error.code = 'MERGE_IN_USE';
      throw error;
    }

    const sources = await BarcodeLabel.find({ mergeId: merge._id }).session(dbSession || null).lean();
    if (!sources.length) {
      const error = new Error('The source barcodes of this merge could not be found.');
      error.status = 409;
      error.code = 'SOURCES_MISSING';
      throw error;
    }

    const ledger = [];
    for (const source of merge.sources || []) {
      const unit = sources.find((s) => String(s._id) === String(source.barcodeId));
      if (!unit) {
        throw new InventoryError('SOURCES_MISSING', 'Source barcode ' + source.barcodeNo + ' could not be restored.', { status: 409 });
      }
      const restoreQty = num(source.qty);
      const res = await BarcodeLabel.updateOne(
        { _id: unit._id, status: BARCODE_STATUS.MERGED, qtyNum: 0 },
        {
          $set: {
            status: BARCODE_STATUS.IN_STOCK,
            qtyNum: restoreQty,
            qty: qtyString(restoreQty),
            mergedIntoBarcodeNo: '',
            updatedAt: new Date(),
          },
        },
        dbSession ? { session: dbSession } : {}
      );
      if (!res.matchedCount) {
        throw new InventoryError('MOVEMENT_CONFLICT', 'Source barcode ' + source.barcodeNo + ' could not be restored.', { status: 409 });
      }

      ledger.push({
        businessId: toId(unit.businessId),
        finYear: unit.finYear || '',
        type: MOVEMENT_TYPES.MERGE_REVERSE,
        barcodeId: unit._id,
        barcodeNo: unit.barcodeNo || '',
        itemId: toId(unit.itemId),
        itemCode: unit.itemCode || '',
        itemName: unit.itemName || '',
        uom: unit.uom || '',
        qty: Math.abs(restoreQty),
        fromLocationId: null,
        toLocationId: toId(unit.currentLocationId || unit.locationId),
        statusBefore: BARCODE_STATUS.MERGED,
        statusAfter: BARCODE_STATUS.IN_STOCK,
        refModel: 'barcodeMerge',
        refId: merge._id,
        refNo: merge.mergeNo,
        reason: 'Barcode Merge cancelled',
        notes: String(reason || ''),
        userId: toId(session?.id),
        userName: session?.name || '',
        userEmail: session?.email || '',
        at: new Date(),
      });
    }

    const res = await BarcodeLabel.updateOne(
      { _id: merged._id, status: BARCODE_STATUS.IN_STOCK, qtyNum: merged.qtyNum },
      {
        $set: {
          status: BARCODE_STATUS.VOID,
          qtyNum: 0,
          qty: '0',
          mergedFromBarcodes: [],
          updatedAt: new Date(),
        },
      },
      dbSession ? { session: dbSession } : {}
    );
    if (!res.matchedCount) {
      throw new InventoryError('MOVEMENT_CONFLICT', 'The merged barcode changed while the merge was being cancelled.', { status: 409 });
    }

    ledger.push({
      businessId: toId(merged.businessId),
      finYear: merged.finYear || '',
      type: MOVEMENT_TYPES.MERGE_REVERSE,
      barcodeId: merged._id,
      barcodeNo: merged.barcodeNo || '',
      itemId: toId(merged.itemId),
      itemCode: merged.itemCode || '',
      itemName: merged.itemName || '',
      uom: merged.uom || '',
      qty: -Math.abs(num(merge.totalQty)),
      fromLocationId: toId(merged.currentLocationId),
      toLocationId: null,
      statusBefore: BARCODE_STATUS.IN_STOCK,
      statusAfter: BARCODE_STATUS.VOID,
      refModel: 'barcodeMerge',
      refId: merge._id,
      refNo: merge.mergeNo,
      reason: 'Barcode Merge cancelled',
      notes: String(reason || ''),
      userId: toId(session?.id),
      userName: session?.name || '',
      userEmail: session?.email || '',
      at: new Date(),
    });

    await StockMovement.insertMany(ledger, dbSession ? { session: dbSession, ordered: true } : { ordered: true });

    await BarcodeMerge.updateOne(
      { _id: merge._id, status: MERGE_STATUS.FINALIZED },
      {
        $set: { status: MERGE_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: String(reason || '') },
        $push: { audit: { action: 'Cancelled', userId: toId(session?.id), userName: session?.name || '', note: String(reason || ''), at: new Date() } },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { id: String(merge._id), status: MERGE_STATUS.CANCELLED, stockReversed: true };
  });
}

/* ------------------------------------------------------------------ list -- */

export function mergeListFilter(sp) {
  const filter = {};
  const business = sp.get('business');
  const location = sp.get('location');
  const finYear = sp.get('finYear');
  if (business && isValidObjectId(business)) filter.businessId = business;
  if (location && isValidObjectId(location)) filter.locationId = location;
  if (finYear) filter.finYear = finYear;

  const status = sp.get('status');
  if (status) filter.status = status;
  const supplier = sp.get('supplierId');
  if (supplier && isValidObjectId(supplier)) filter.supplierId = supplier;
  const item = sp.get('itemId');
  if (item && isValidObjectId(item)) filter.itemId = item;

  const barcode = String(sp.get('barcode') || '').trim();
  if (barcode) {
    const rx = { $regex: barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [{ mergedBarcodeNo: rx }, { 'sources.barcodeNo': rx }];
  }

  const search = String(sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    const clause = [
      { mergeNo: rx }, { mergedBarcodeNo: rx }, { itemCode: rx },
      { itemName: rx }, { supplierName: rx }, { 'sources.barcodeNo': rx },
    ];
    filter.$and = [...(filter.$and || []), { $or: clause }];
  }

  const from = String(sp.get('from') || '').trim();
  const to = String(sp.get('to') || '').trim();
  if (from || to) {
    filter.createdAt = {};
    if (from) filter.createdAt.$gte = new Date(from);
    if (to) {
      const end = new Date(to);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  return filter;
}

export function mergeExportRows(merge) {
  return (merge.sources || []).map((source, index) => ({
    'Merge Transaction Code': merge.mergeNo,
    'Merged Barcode': merge.mergedBarcodeNo,
    'Item Code': merge.itemCode,
    'Item Name': merge.itemName,
    'Source Barcode': source.barcodeNo,
    'Source Quantity': source.qty,
    'Source UOM': source.uom,
    'Conversion Factor': source.conversionFactor,
    'Quantity in Merged UOM': source.qtyInMergedUom,
    'Total Merged Quantity': merge.totalQty,
    'Merged UOM': merge.uom,
    'Supplier': merge.supplierName,
    'GRC No': source.grcNo,
    'Batch': source.batchNo,
    'Purchase Rate': merge.purchaseRate,
    'RSP': merge.rsp,
    'WSP': merge.wsp,
    'DP': merge.dp,
    'SP': merge.sellingPrice,
    'Status': merge.status,
    'Created By': merge.createdByName,
    'Created Date': merge.createdAt,
    'Row': index + 1,
  }));
}
