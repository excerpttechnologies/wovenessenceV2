import mongoose, { isValidObjectId } from 'mongoose';
import BarcodeSplit, { SPLIT_STATUS } from '@/models/BarcodeSplit';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import StockMovement, { MOVEMENT_TYPES } from '@/models/StockMovement';
import { reserveSequence } from '@/models/Counter';
import Item from '@/models/Item';
import Supplier from '@/models/Supplier';
import Grc from '@/models/Grc';
import SplitBarcodeSetting from '@/models/SplitBarcodeSetting';
import { withTransaction, InventoryError, barcodeFilter } from '@/lib/inventory';
import { reserveBarcodeNumbers } from '@/lib/barcodeEngine';
import { requireConversion, convertQty, roundQty, categoryOf } from '@/lib/uomConversion';
import { uomTypeOf } from '@/lib/barcodeUnits';
import { encodedBarcodeValue } from '@/lib/barcodeValue';

/* ==========================================================================
   BARCODE SPLIT - the service the API routes call.

   One original unit of stock becomes several child units. The original row is
   never deleted or replaced: its quantity is reduced, its price is untouched,
   and every child keeps a permanent parent / root link back to it.

   The four rules that hold this together:

     1. INHERITANCE IS A COPY, NOT AN EDIT.
        Item, supplier, GRC and purchase context are read from the original
        barcode and copied onto the split document and each child. There is no
        path here that changes the supplier or the original's prices.

     2. ONLY A FINALISED SPLIT MOVES STOCK.
        A Draft reserves child numbers and writes the document; it writes no
        barcode row and no movement. Finalising is one transaction: validate,
        generate, reduce the original, insert children, post the ledger.

     3. QUANTITY IS GUARDED.
        The original is reduced with updateOne({_id, status, qtyNum: <the
        value read>}), so two overlapping splits cannot both spend the same
        metres. A failed guard rolls the whole transaction back.

     4. PCS / MTR NEEDS AN APPROVED FACTOR.
        Every line is converted into the original's UOM with a configured row
        (lib/uomConversion.js). No universal factor exists anywhere.
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

function supplierNameOf(supplier) {
  if (!supplier) return '';
  return String(
    supplier.businessName
    || [supplier.firstName, supplier.lastName].filter(Boolean).join(' ')
    || ''
  ).trim();
}

/* ----------------------------------------------------------------- lookup -- */

/* The original barcode, by id or by any spelling of its number. */
export async function findOriginalUnit({ businessId, barcodeId, code, session = null }) {
  let unit = null;

  if (barcodeId && isValidObjectId(String(barcodeId))) {
    const q = BarcodeLabel.findOne({
      _id: barcodeId,
      ...(businessId ? { businessId: String(businessId) } : {}),
    });
    if (session) q.session(session);
    unit = await q.lean();
  } else if (String(code || '').trim()) {
    const q = BarcodeLabel.findOne({
      ...barcodeFilter([String(code).trim()]),
      ...(businessId ? { businessId: String(businessId) } : {}),
    });
    if (session) q.session(session);
    unit = await q.lean();
  }

  if (!unit) {
    throw new InventoryError('BARCODE_NOT_FOUND', 'Barcode not found in this business.', { status: 404 });
  }
  return unit;
}

/* Everything the split screen shows about the original, inherited and
   read-only. The original's OWN prices are included as context - they are
   never used as a child's final price. */
export async function originalDetails(unit) {
  const businessId = unit.businessId || unit.currentBusinessId || null;

  const itemQuery = unit.itemId && isValidObjectId(String(unit.itemId))
    ? Item.findById(unit.itemId)
    : Item.findOne({ itemCode: unit.itemCode, ...(businessId ? { businessId } : {}) });
  const [item, supplier, grc] = await Promise.all([
    itemQuery.lean().catch(() => null),
    unit.supplierId && isValidObjectId(String(unit.supplierId))
      ? Supplier.findById(unit.supplierId).select('businessName firstName lastName contactId gstNo').lean().catch(() => null)
      : null,
    unit.grcId && isValidObjectId(String(unit.grcId))
      ? Grc.findById(unit.grcId).select('grcNumber grcDate vendorDocNo vendorGstNo').lean().catch(() => null)
      : null,
  ]);

  const availableQty = availableQtyOf(unit);
  const uom = String(unit.uom || item?.uom || '').trim();

  return {
    barcodeId: String(unit._id),
    barcodeNo: unit.barcodeNo || '',
    barcodeValue: encodedBarcodeValue(unit),
    status: unit.status || '',
    availableQty,
    qty: unit.qty || '',
    uom,
    uomType: uomTypeOf(uom),

    itemId: unit.itemId ? String(unit.itemId) : item?._id ? String(item._id) : '',
    itemCode: unit.itemCode || item?.itemCode || '',
    itemName: unit.itemName || item?.name || '',
    description: unit.printDescription || unit.supplierDescription || item?.description || '',
    hsn: unit.hsn || '',
    gst: unit.gst || '',
    batchNo: unit.batchNo || '',
    batchType: unit.batchType || unit.batchUnique || '',
    goodsType: unit.goodsType || '',
    pmf: unit.p_m_f || '',

    supplierId: unit.supplierId ? String(unit.supplierId) : '',
    supplierName: supplierNameOf(supplier),
    supplierCode: supplier?.contactId || '',
    supplierGstNo: supplier?.gstNo || '',

    grcId: unit.grcId ? String(unit.grcId) : '',
    grcNo: unit.grcNo || grc?.grcNumber || '',
    grcDate: grc?.grcDate || null,
    purchaseRef: grc?.vendorDocNo || '',

    /* the ORIGINAL's prices, shown as context only */
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

    locationId: unit.currentLocationId ? String(unit.currentLocationId) : unit.locationId ? String(unit.locationId) : '',
    stockPointId: unit.currentStockPointId ? String(unit.currentStockPointId) : '',
    finYear: unit.finYear || '',

    parentBarcodeId: unit.parentBarcodeId ? String(unit.parentBarcodeId) : '',
    rootBarcodeId: unit.rootBarcodeId ? String(unit.rootBarcodeId) : '',
    splitDepth: num(unit.splitDepth),
    splitChildCount: num(unit.splitChildCount),
    totalSplitQty: num(unit.totalSplitQty),
  };
}

/* ------------------------------------------------------------------ lines -- */

const PRICE_FIELDS = [
  'purchaseRate', 'discount', 'finalPurchaseRate', 'rsp', 'rspOfferPrice',
  'wsp', 'wspOfferPrice', 'dp', 'dpOfferPrice', 'sellingPrice',
];

/* Validates split lines against the ORIGINAL's current quantity and returns
   normalised lines plus the totals. Shared by the preview endpoint and the
   save path, so a preview can never accept what the save then refuses. */
export async function validateSplitLines({ original, lines, businessId, session = null }) {
  const available = availableQtyOf(original);
  const originalUom = String(original.uom || '').trim();
  const originalType = uomTypeOf(originalUom);
  const itemId = original.itemId ? String(original.itemId) : null;

  const errors = [];
  const normalized = [];
  let totalInOriginalUom = 0;

  for (let index = 0; index < (Array.isArray(lines) ? lines.length : 0); index += 1) {
    const line = lines[index] || {};
    const rowNo = index + 1;
    const qty = Number(line.qty);
    const uom = String(line.uom || originalUom).trim();

    if (!Number.isFinite(qty) || qty <= 0) {
      errors.push({ row: rowNo, field: 'qty', message: 'Quantity must be greater than 0.' });
      continue;
    }
    if (!uom) {
      errors.push({ row: rowNo, field: 'uom', message: 'Unit of measurement is required.' });
      continue;
    }

    let conversion;
    try {
      conversion = await requireConversion({
        businessId, itemId, fromUom: uom, toUom: originalUom, session,
      });
    } catch (err) {
      errors.push({ row: rowNo, field: 'uom', message: err.message });
      continue;
    }

    const qtyInOriginalUom = uomTypeOf(uom) === originalType ? roundQty(qty) : convertQty(qty, conversion);

    const prices = {};
    let priceError = '';
    PRICE_FIELDS.forEach((field) => {
      const raw = line[field];
      const value = raw === undefined || raw === null || raw === '' ? 0 : Number(raw);
      if (!Number.isFinite(value) || value < 0) {
        priceError = 'Prices must be numbers and cannot be negative.';
      }
      prices[field] = money(value);
    });

    if (priceError) {
      errors.push({ row: rowNo, field: 'pricing', message: priceError });
      continue;
    }

    /* New prices are mandatory for a child barcode. Purchase rate and RSP are
       the two every label and every report needs; the offers/DP/SP may be 0
       where the business does not use them, but they must be confirmed. */
    if (!(prices.purchaseRate > 0)) {
      errors.push({ row: rowNo, field: 'purchaseRate', message: 'Enter the new purchase rate for this child barcode.' });
      continue;
    }
    if (!(prices.rsp > 0)) {
      errors.push({ row: rowNo, field: 'rsp', message: 'Enter the new RSP for this child barcode.' });
      continue;
    }

    if (!prices.finalPurchaseRate) {
      prices.finalPurchaseRate = money(Math.max(0, prices.purchaseRate - prices.discount));
    }

    totalInOriginalUom = roundQty(totalInOriginalUom + qtyInOriginalUom);

    normalized.push({
      ...prices,
      qty: roundQty(qty),
      uom,
      uomType: uomTypeOf(uom),
      conversionFactor: conversion.factor,
      conversionRowId: conversion.rowId || null,
      qtyInOriginalUom,
      providedBarcodeNo: String(line.barcodeNo || '').trim(),
      itemCode: original.itemCode || '',
      itemName: String(line.itemName || ''),
      hsn: String(line.hsn || original.hsn || ''),
      gst: String(line.gst || original.gst || ''),
      batchNo: String(line.batchNo || original.batchNo || ''),
      goodsType: String(line.goodsType || original.goodsType || ''),
    });
  }

  if (!normalized.length && !errors.length) {
    errors.push({ row: 0, field: 'lines', message: 'Add at least one child barcode.' });
  }

  /* Total split quantity may never exceed what the original holds - the stock
     rule, checked before any number is issued. */
  if (normalized.length && totalInOriginalUom > available + EPS) {
    errors.push({
      row: 0,
      field: 'qty',
      message: 'Total split quantity (' + totalInOriginalUom + ' ' + (originalUom || '')
        + ') exceeds the available stock (' + available + ' ' + (originalUom || '') + ').',
    });
  }

  return {
    normalized,
    available,
    originalUom,
    originalType,
    totalInOriginalUom,
    remaining: roundQty(Math.max(0, available - totalInOriginalUom)),
    errors,
  };
}

/* ------------------------------------------------------------- numbering -- */

/* One child number per line, never a duplicate.

   The Split Barcode Settings master is used when it is configured - the
   extension point the existing ERP already has for this module. With no
   setting, the reference workbook's convention is used: the original's number
   followed by a two-digit running suffix (8A1235 -> 8A123501). Both paths sit
   on the atomic Counter, so two operators splitting at once get disjoint
   numbers; every candidate is also checked against barcodeLabel before it is
   accepted. */
async function childNumbers({ original, count, businessId, session }) {
  if (count <= 0) return [];

  const setting = await SplitBarcodeSetting.findOne({
    ...(businessId ? { businessId } : {}),
    status: { $ne: 'Inactive' },
  }).sort({ effectiveDate: -1, createdAt: -1 }).lean();

  const hasSetting = Boolean(setting && (String(setting.prefix || '') || Number(setting.startNumber) > 0));

  const numbers = [];
  if (hasSetting) {
    const reserved = await reserveBarcodeNumbers(count, {
      businessId,
      setting: {
        prefix: String(setting.prefix || ''),
        suffix: String(setting.suffix || ''),
        width: Number(setting.numberLenght) || 4,
        start: Number(setting.startNumber) || 1,
      },
    }, session);
    reserved.forEach((value) => numbers.push(value));
  } else {
    const parent = String(original.barcodeNo || original.barcodeGenerated || '').trim();
    if (!parent) {
      throw new InventoryError('NO_BARCODE_NUMBER', 'The original barcode has no number to derive child barcodes from.', { status: 422 });
    }
    for (let i = 0; i < count; i += 1) {
      /* reserve one at a time and skip over anything already on a label - a
         legacy duplicate cannot be reissued */
      let candidate = '';
      for (let attempt = 0; attempt < 1000; attempt += 1) {
        const next = await reserveSequence('split-child:' + parent, { businessId }, 1, session);
        candidate = parent + String(next).padStart(2, '0');
        const taken = await BarcodeLabel.exists({ barcodeNo: candidate, ...(businessId ? { businessId: String(businessId) } : {}) });
        if (!taken) break;
        candidate = '';
      }
      if (!candidate) {
        throw new InventoryError('BARCODE_NUMBER_COLLISION', 'Could not issue a unique child barcode number. Try again.', { status: 409 });
      }
      numbers.push(candidate);
    }
  }

  /* A configured series must be unique too. If a legacy row already holds one
     of its numbers the save is refused rather than overwriting it. */
  const existing = await BarcodeLabel.find({
    barcodeNo: { $in: numbers },
    ...(businessId ? { businessId: String(businessId) } : {}),
  }).select('barcodeNo').lean();
  if (existing.length) {
    throw new InventoryError(
      'BARCODE_NUMBER_COLLISION',
      'These barcode numbers already exist and were not issued again: '
      + existing.map((r) => r.barcodeNo).slice(0, 8).join(', ') + '.',
      { status: 409, conflicts: existing.map((r) => r.barcodeNo) }
    );
  }

  return numbers;
}

async function nextDocumentNo({ businessId, finYear, session, prefix, counterName }) {
  const scope = { businessId, finYear };
  const n = await reserveSequence(counterName, scope, 1, session);
  const period = finYear || String(new Date().getFullYear());
  return prefix + '/' + period + '/' + String(n).padStart(4, '0');
}

/* ---------------------------------------------------------------- document -- */

function buildSplitDocument({
  original, details, lines, totalSplitQty, remainingQty, splitNo, status, body, session,
}) {
  return {
    businessId: toId(original.businessId) || toId(body.business),
    locationId: toId(details.locationId) || toId(body.location),
    finYear: original.finYear || body.finYear || '',

    splitNo,
    status,

    originalBarcodeId: original._id,
    originalBarcodeNo: details.barcodeNo,
    originalQty: details.availableQty,
    originalUom: details.uom,
    uomType: details.uomType,

    itemId: toId(details.itemId),
    itemCode: details.itemCode,
    itemName: details.itemName,

    supplierId: toId(details.supplierId),
    supplierName: details.supplierName,
    supplierCode: details.supplierCode,
    grcId: toId(details.grcId),
    grcNo: details.grcNo,
    purchaseRef: details.purchaseRef,

    snapshot: details,
    totalSplitQty,
    remainingQty,
    childCount: lines.length,
    lines: lines.map((line) => ({
      childBarcodeNo: line.barcodeNo || '',
      qty: line.qty,
      uom: line.uom,
      uomType: line.uomType,
      conversionFactor: line.conversionFactor,
      qtyInOriginalUom: line.qtyInOriginalUom,
      purchaseRate: line.purchaseRate,
      discount: line.discount,
      finalPurchaseRate: line.finalPurchaseRate,
      rsp: line.rsp,
      rspOfferPrice: line.rspOfferPrice,
      wsp: line.wsp,
      wspOfferPrice: line.wspOfferPrice,
      dp: line.dp,
      dpOfferPrice: line.dpOfferPrice,
      sellingPrice: line.sellingPrice,
      itemCode: details.itemCode,
      itemName: details.itemName,
      hsn: line.hsn,
      gst: line.gst,
      batchNo: line.batchNo,
      goodsType: line.goodsType,
    })),

    notes: String(body.notes || ''),
    createdBy: toId(body.userId),
    createdByName: body.userName || '',
    createdByEmail: body.userEmail || '',
    audit: [{
      action: status === SPLIT_STATUS.FINALIZED ? 'Finalized' : 'Draft saved',
      userId: toId(body.userId),
      userName: body.userName || '',
      userEmail: body.userEmail || '',
      note: body.notes || '',
    }],
  };
}

/* An inherited child barcode row. Every attribute that belongs to the item or
   the purchase comes from the original; only quantity, UOM and prices are the
   split's own. */
function childRow({ original, details, line, splitId, splitNo, index }) {
  const locationId = toId(details.locationId);
  const totalQty = roundQty(line.qty);
  return {
    businessId: String(original.businessId || ''),
    locationId: String(original.locationId || details.locationId || ''),
    finYear: original.finYear || '',

    grcId: original.grcId || '',
    grcNo: details.grcNo || original.grcNo || '',
    supplierId: original.supplierId || '',
    itemCode: details.itemCode,
    itemId: toId(details.itemId),
    itemName: details.itemName,
    printDescription: original.printDescription || details.description || '',
    supplierDescription: original.supplierDescription || details.description || '',
    hsn: line.hsn || original.hsn || '',
    gst: line.gst || original.gst || '',

    qty: qtyString(totalQty),
    qtyNum: totalQty,
    uom: line.uom,
    uomType: line.uomType,
    batchType: 'unique',
    batchUnique: 'unique',
    batchNo: line.batchNo || original.batchNo || '',
    goodsType: line.goodsType || original.goodsType || '',
    sm: original.sm || '',
    p_m_f: original.p_m_f || '',
    fma: original.fma || '',
    silkMark: original.silkMark || '',

    /* NEW prices - deliberately not the original's */
    purRate: String(line.purchaseRate),
    disc: String(line.discount),
    finalNet: String(line.finalPurchaseRate),
    retailPrice: String(line.rsp),
    offerPrice: String(line.rspOfferPrice),
    wspPrice: String(line.wsp),
    wsp: String(line.wspOfferPrice),
    dpPrice: String(line.dp),
    dp: String(line.dpOfferPrice),
    sellingPrice: String(line.sellingPrice),

    /* the unit's own number; the bars encode encodedBarcodeValue(), which for
       a split child with no composed GRC value is this number */
    barcodeNo: line.barcodeNo,
    barcodeGenerated: '',
    oldBarcode: '',
    source: 'BARCODE_SPLIT',

    status: BARCODE_STATUS.IN_STOCK,
    currentLocationId: locationId,
    currentBusinessId: toId(original.businessId),
    currentStockPointId: toId(details.stockPointId),

    parentBarcodeId: original._id,
    rootBarcodeId: original.rootBarcodeId || original._id,
    splitId,
    splitFromBarcodeNo: details.barcodeNo,
    splitDepth: num(original.splitDepth) + 1,
    splitChildCount: 0,
    totalSplitQty: 0,
    lineIndex: index + 1,
    splitNo,
  };
}

function movementRow({ unit, qty, type, direction, fromLocationId, toLocationId, split, user, session }) {
  return {
    businessId: toId(unit.businessId),
    finYear: unit.finYear || '',
    type,
    barcodeId: unit._id,
    barcodeNo: unit.barcodeNo || unit.barcodeGenerated || '',
    itemId: toId(unit.itemId),
    itemCode: unit.itemCode || '',
    itemName: unit.itemName || unit.printDescription || unit.supplierDescription || '',
    uom: unit.uom || '',
    batchType: unit.batchType || unit.batchUnique || '',
    qty: direction === 'out' ? -Math.abs(num(qty)) : Math.abs(num(qty)),
    fromLocationId: toId(fromLocationId),
    toLocationId: toId(toLocationId),
    statusBefore: unit.status || BARCODE_STATUS.IN_STOCK,
    statusAfter: unit.status || BARCODE_STATUS.IN_STOCK,
    refModel: 'barcodeSplit',
    refId: split._id,
    refNo: split.splitNo || '',
    reason: 'Barcode Split',
    notes: '',
    userId: toId(user?.id),
    userName: user?.name || '',
    userEmail: user?.email || '',
    at: new Date(),
  };
}

/* Applies the stock half of a finalized split. Must run inside a transaction
   with the freshly read original. */
async function postSplitStock({ original, split, details, lines, session, user }) {
  /* No duplicate barcode numbers, checked again at the moment of posting: a
     draft's numbers were reserved when it was saved, but another import may
     have claimed one since. */
  const numbers = lines.map((l) => String(l.barcodeNo || '').trim()).filter(Boolean);
  if (numbers.length) {
    const clash = await BarcodeLabel.find({
      barcodeNo: { $in: numbers },
      ...(original.businessId ? { businessId: String(original.businessId) } : {}),
    }).select('barcodeNo').lean();
    if (clash.length) {
      throw new InventoryError(
        'DUPLICATE_BARCODE',
        'These barcode numbers already exist and were not issued again: '
        + clash.map((r) => r.barcodeNo).slice(0, 8).join(', ') + '.',
        { status: 409, conflicts: clash.map((r) => r.barcodeNo) }
      );
    }
  }

  const totalQty = roundQty(lines.reduce((sum, l) => sum + num(l.qtyInOriginalUom), 0));
  const available = availableQtyOf(original);
  const remaining = roundQty(Math.max(0, available - totalQty));

  if (totalQty > available + EPS) {
    throw new InventoryError(
      'INSUFFICIENT_STOCK',
      'Available stock is ' + available + ' ' + (original.uom || '')
      + ' but the split asks for ' + totalQty + '. Nothing was saved.',
      { status: 409 }
    );
  }

  const childDocs = lines.map((line, index) => childRow({
    original, details, line, splitId: split._id, splitNo: split.splitNo, index,
  }));

  /* Insert first, then reduce - if the guarded reduction loses a race, the
     transaction rolls the insert back too. */
  const inserted = await BarcodeLabel.insertMany(
    childDocs,
    session ? { session, ordered: true } : { ordered: true }
  );

  const guard = {
    _id: original._id,
    status: BARCODE_STATUS.IN_STOCK,
    qtyNum: original.qtyNum,
  };

  const updated = await BarcodeLabel.updateOne(
    guard,
    {
      $set: {
        qtyNum: remaining,
        qty: qtyString(remaining),
        updatedAt: new Date(),
      },
      $inc: {
        splitChildCount: lines.length,
        totalSplitQty: totalQty,
      },
    },
    session ? { session } : {}
  );

  if (!updated.matchedCount) {
    throw new InventoryError(
      'MOVEMENT_CONFLICT',
      'This barcode changed while the split was being saved. Reload it and try again - nothing was posted.',
      { status: 409 }
    );
  }

  const from = details.locationId || original.currentLocationId || original.locationId;
  const ledger = [
    movementRow({
      unit: original, qty: totalQty, type: MOVEMENT_TYPES.SPLIT_OUT, direction: 'out',
      fromLocationId: from, toLocationId: null, split, user, session,
    }),
    ...inserted.map((child) => movementRow({
      unit: child, qty: child.qtyNum, type: MOVEMENT_TYPES.SPLIT_IN, direction: 'in',
      fromLocationId: null, toLocationId: child.currentLocationId || from, split, user, session,
    })),
  ];

  await StockMovement.insertMany(ledger, session ? { session, ordered: true } : { ordered: true });

  return { inserted, remaining, totalQty };
}

/* ------------------------------------------------------------------- save -- */

/* Creates a split. `finalize: false` saves a Draft and touches no stock;
   `finalize: true` posts the stock and the document together. */
export async function createSplit({ businessId, body, session }) {
  const unit = await findOriginalUnit({
    businessId,
    barcodeId: body.originalBarcodeId,
    code: body.originalBarcode,
  });

  if (unit.status !== BARCODE_STATUS.IN_STOCK) {
    throw new InventoryError(
      'NOT_IN_STOCK',
      'This barcode is not in stock (status ' + (unit.status || 'unknown') + '), so it cannot be split.',
      { status: 409 }
    );
  }

  const details = await originalDetails(unit);
  if (details.availableQty <= 0) {
    throw new InventoryError('NO_STOCK', 'This barcode has no stock left to split.', { status: 409 });
  }

  const finalize = body.finalize === true || String(body.status || '').toLowerCase() === 'finalized';
  const checked = await validateSplitLines({ original: unit, lines: body.lines, businessId });
  if (checked.errors.length) {
    const error = new Error(checked.errors[0].message);
    error.status = 422;
    error.code = 'SPLIT_VALIDATION';
    error.errors = checked.errors;
    error.rows = checked.errors;
    throw error;
  }

  /* Supplied numbers (an Excel import) are validated before any counter is
     touched; the rest are generated. */
  const supplied = checked.normalized.map((l) => l.providedBarcodeNo).filter(Boolean);
  if (new Set(supplied.map((s) => s.toUpperCase())).size !== supplied.length) {
    const error = new Error('Two child rows use the same barcode number.');
    error.status = 422;
    error.code = 'DUPLICATE_BARCODE';
    throw error;
  }
  if (supplied.length) {
    const clash = await BarcodeLabel.find({
      barcodeNo: { $in: supplied },
      ...(businessId ? { businessId: String(businessId) } : {}),
    }).select('barcodeNo').lean();
    if (clash.length) {
      const error = new Error('These barcode numbers already exist: ' + clash.map((r) => r.barcodeNo).join(', ') + '.');
      error.status = 409;
      error.code = 'DUPLICATE_BARCODE';
      throw error;
    }
  }

  const result = await withTransaction(async (dbSession) => {
    /* Re-read inside the transaction: the quantity checked above may have
       moved while the operator was typing. */
    const fresh = await findOriginalUnit({ businessId, barcodeId: unit._id, session: dbSession });
    const freshDetails = await originalDetails(fresh);

    /* Carry the operator-supplied numbers (an Excel import) through the
       second validation - normalised lines hold them as providedBarcodeNo,
       while validateSplitLines reads `barcodeNo`. */
    const revalidateLines = checked.normalized.map((line) => ({
      ...line,
      barcodeNo: line.providedBarcodeNo || line.barcodeNo || '',
    }));
    const verified = await validateSplitLines({ original: fresh, lines: revalidateLines, businessId, session: dbSession });
    if (verified.errors.length) {
      const error = new Error(verified.errors[0].message);
      error.status = 422;
      error.code = 'SPLIT_VALIDATION';
      error.errors = verified.errors;
      throw error;
    }

    const splitNo = await nextDocumentNo({
      businessId: fresh.businessId || businessId,
      finYear: fresh.finYear || body.finYear,
      session: dbSession,
      prefix: 'SPL',
      counterName: 'barcode-split-no',
    });

    /* Numbers are issued after validation, inside the transaction, so a
       refused save does not burn a series. */
    const generated = await childNumbers({
      original: fresh,
      count: verified.normalized.filter((l) => !l.providedBarcodeNo).length,
      businessId: fresh.businessId || businessId,
      session: dbSession,
    });

    let cursor = 0;
    const lines = verified.normalized.map((line) => ({
      ...line,
      barcodeNo: line.providedBarcodeNo || generated[cursor++],
    }));

    const doc = buildSplitDocument({
      original: fresh,
      details: freshDetails,
      lines,
      totalSplitQty: verified.totalInOriginalUom,
      remainingQty: verified.remaining,
      splitNo,
      status: finalize ? SPLIT_STATUS.FINALIZED : SPLIT_STATUS.DRAFT,
      body: { ...body, userId: session?.id, userName: session?.name, userEmail: session?.email },
      session: dbSession,
    });

    const [split] = await BarcodeSplit.create([doc], dbSession ? { session: dbSession } : {});

    if (!finalize) return { split, stock: null };

    const stock = await postSplitStock({
      original: fresh,
      split,
      details: freshDetails,
      lines,
      session: dbSession,
      user: session,
    });

    const byNumber = new Map(stock.inserted.map((row) => [row.barcodeNo, String(row._id)]));
    await BarcodeSplit.updateOne(
      { _id: split._id },
      {
        $set: {
          status: SPLIT_STATUS.FINALIZED,
          finalizedAt: new Date(),
          lines: split.lines.map((line) => ({
            ...line.toObject(),
            childBarcodeId: byNumber.get(line.childBarcodeNo) || null,
          })),
          updatedAt: new Date(),
        },
        $push: {
          audit: {
            action: 'Finalized',
            userId: toId(session?.id),
            userName: session?.name || '',
            userEmail: session?.email || '',
            note: 'Stock posted: ' + stock.totalQty + ' ' + freshDetails.uom + ' across ' + lines.length + ' child barcode(s).',
            at: new Date(),
          },
        },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { split, stock };
  });

  return {
    id: String(result.split._id),
    splitNo: result.split.splitNo,
    status: finalize ? SPLIT_STATUS.FINALIZED : SPLIT_STATUS.DRAFT,
    childBarcodes: result.split.lines.map((l) => l.childBarcodeNo),
    remaining: checked.remaining,
  };
}

/* Finalises an existing Draft. Child numbers were reserved when the draft was
   saved and are reused, so a printed draft list and the final document agree. */
export async function finalizeSplit({ id, businessId, session }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid split id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }

  return withTransaction(async (dbSession) => {
    const split = await BarcodeSplit.findOne({
      _id: id,
      ...(businessId ? { businessId } : {}),
    }).session(dbSession || null).lean();
    if (!split) {
      const error = new Error('Split not found.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (split.status !== SPLIT_STATUS.DRAFT) {
      const error = new Error('Only a draft split can be finalized. This one is ' + split.status + '.');
      error.status = 409;
      error.code = 'NOT_DRAFT';
      throw error;
    }

    const original = await findOriginalUnit({ businessId: businessId || split.businessId, barcodeId: split.originalBarcodeId, session: dbSession });
    if (original.status !== BARCODE_STATUS.IN_STOCK) {
      throw new InventoryError('NOT_IN_STOCK', 'The original barcode is no longer in stock.', { status: 409 });
    }
    const details = await originalDetails(original);

    const lines = (split.lines || []).map((line) => ({
      qty: line.qty,
      uom: line.uom,
      purchaseRate: line.purchaseRate,
      discount: line.discount,
      finalPurchaseRate: line.finalPurchaseRate,
      rsp: line.rsp,
      rspOfferPrice: line.rspOfferPrice,
      wsp: line.wsp,
      wspOfferPrice: line.wspOfferPrice,
      dp: line.dp,
      dpOfferPrice: line.dpOfferPrice,
      sellingPrice: line.sellingPrice,
      barcodeNo: line.childBarcodeNo,
    }));

    const verified = await validateSplitLines({ original, lines, businessId: original.businessId, session: dbSession });
    if (verified.errors.length) {
      const error = new Error(verified.errors[0].message);
      error.status = 422;
      error.code = 'SPLIT_VALIDATION';
      error.errors = verified.errors;
      throw error;
    }

    const stock = await postSplitStock({
      original,
      split: { ...split, _id: split._id, splitNo: split.splitNo },
      details,
      lines: verified.normalized.map((line, index) => ({
        ...line,
        barcodeNo: split.lines[index]?.childBarcodeNo || line.barcodeNo,
      })),
      session: dbSession,
      user: session,
    });

    const byNumber = new Map(stock.inserted.map((row) => [row.barcodeNo, String(row._id)]));
    await BarcodeSplit.updateOne(
      { _id: split._id },
      {
        $set: {
          status: SPLIT_STATUS.FINALIZED,
          finalizedAt: new Date(),
          remainingQty: stock.remaining,
          lines: split.lines.map((line) => ({
            ...line,
            childBarcodeId: byNumber.get(line.childBarcodeNo) || null,
          })),
          updatedAt: new Date(),
        },
        $push: {
          audit: {
            action: 'Finalized',
            userId: toId(session?.id),
            userName: session?.name || '',
            userEmail: session?.email || '',
            note: 'Stock posted from draft.',
            at: new Date(),
          },
        },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { id: String(split._id), splitNo: split.splitNo, status: SPLIT_STATUS.FINALIZED };
  });
}

/* Updates a Draft's lines and/or finalises it in one request. */
export async function updateDraftSplit({ id, businessId, body, session }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid split id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }
  const split = await BarcodeSplit.findOne({ _id: id, ...(businessId ? { businessId } : {}) }).lean();
  if (!split) {
    const error = new Error('Split not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }
  if (split.status !== SPLIT_STATUS.DRAFT) {
    const error = new Error('Only a draft split can be edited.');
    error.status = 409;
    error.code = 'NOT_DRAFT';
    throw error;
  }

  if (body.action === 'finalize') return finalizeSplit({ id, businessId, session });
  if (body.action === 'cancel') return cancelSplit({ id, businessId, session, reason: body.reason || 'Draft discarded' });

  const unit = await findOriginalUnit({ businessId: businessId || split.businessId, barcodeId: split.originalBarcodeId });
  const checked = await validateSplitLines({ original: unit, lines: body.lines, businessId: unit.businessId || businessId });
  if (checked.errors.length) {
    const error = new Error(checked.errors[0].message);
    error.status = 422;
    error.code = 'SPLIT_VALIDATION';
    error.errors = checked.errors;
    throw error;
  }

  const generated = await childNumbers({
    original: unit,
    count: checked.normalized.filter((l) => !l.providedBarcodeNo).length,
    businessId: unit.businessId || businessId,
  });
  let cursor = 0;
  const lines = checked.normalized.map((line, index) => ({
    ...line,
    barcodeNo: line.providedBarcodeNo || split.lines[index]?.childBarcodeNo || generated[cursor++],
    childBarcodeId: split.lines[index]?.childBarcodeId || null,
  }));

  await BarcodeSplit.updateOne(
    { _id: split._id },
    {
      $set: {
        lines: lines.map((line) => ({
          childBarcodeNo: line.barcodeNo,
          childBarcodeId: line.childBarcodeId,
          qty: line.qty,
          uom: line.uom,
          uomType: line.uomType,
          conversionFactor: line.conversionFactor,
          qtyInOriginalUom: line.qtyInOriginalUom,
          purchaseRate: line.purchaseRate,
          discount: line.discount,
          finalPurchaseRate: line.finalPurchaseRate,
          rsp: line.rsp,
          rspOfferPrice: line.rspOfferPrice,
          wsp: line.wsp,
          wspOfferPrice: line.wspOfferPrice,
          dp: line.dp,
          dpOfferPrice: line.dpOfferPrice,
          sellingPrice: line.sellingPrice,
          itemCode: unit.itemCode || '',
          itemName: split.itemName || '',
          hsn: line.hsn,
          gst: line.gst,
          batchNo: line.batchNo,
          goodsType: line.goodsType,
        })),
        totalSplitQty: checked.totalInOriginalUom,
        remainingQty: checked.remaining,
        childCount: lines.length,
        notes: body.notes !== undefined ? String(body.notes || '') : split.notes,
        updatedAt: new Date(),
      },
      $push: {
        audit: {
          action: 'Draft updated',
          userId: toId(session?.id),
          userName: session?.name || '',
          userEmail: session?.email || '',
          at: new Date(),
        },
      },
    }
  );

  return { id: String(split._id), status: SPLIT_STATUS.DRAFT };
}

/* --------------------------------------------------------------- cancel --- */

export async function cancelSplit({ id, businessId, session, reason = '' }) {
  if (!isValidObjectId(String(id))) {
    const error = new Error('Invalid split id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }

  return withTransaction(async (dbSession) => {
    const split = await BarcodeSplit.findOne({
      _id: id,
      ...(businessId ? { businessId } : {}),
    }).session(dbSession || null).lean();
    if (!split) {
      const error = new Error('Split not found.');
      error.status = 404;
      error.code = 'NOT_FOUND';
      throw error;
    }
    if (split.status === SPLIT_STATUS.CANCELLED) {
      const error = new Error('This split is already cancelled.');
      error.status = 409;
      error.code = 'ALREADY_CANCELLED';
      throw error;
    }

    /* A Draft has posted no stock, so cancelling it is only a status change. */
    if (split.status === SPLIT_STATUS.DRAFT) {
      await BarcodeSplit.updateOne(
        { _id: split._id, status: SPLIT_STATUS.DRAFT },
        {
          $set: { status: SPLIT_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: String(reason || 'Draft discarded') },
          $push: { audit: { action: 'Cancelled', userId: toId(session?.id), userName: session?.name || '', note: String(reason || 'Draft discarded'), at: new Date() } },
        },
        dbSession ? { session: dbSession } : {}
      );
      return { id: String(split._id), status: SPLIT_STATUS.CANCELLED, stockReversed: false };
    }

    const children = await BarcodeLabel.find({ splitId: split._id, status: { $ne: BARCODE_STATUS.VOID } })
      .session(dbSession || null).lean();

    /* Cancel is only safe while every child is exactly as the split left it.
       A child that has been sold, transferred or split again cannot be pulled
       back - the goods have moved, and pretending otherwise would corrupt
       stock. The refusal names the offending barcodes. */
    const blocked = [];
    for (const child of children) {
      const line = (split.lines || []).find((l) => String(l.childBarcodeId) === String(child._id))
        || (split.lines || []).find((l) => l.childBarcodeNo === child.barcodeNo);
      const expected = num(line?.qty);
      const current = availableQtyOf(child);
      if (child.status !== BARCODE_STATUS.IN_STOCK
        || child.billingId
        || child.transferId
        || current + EPS < expected
        || num(child.splitChildCount) > 0) {
        blocked.push(child.barcodeNo + (child.billingId ? ' (sold)' : child.transferId ? ' (transferred)' : num(child.splitChildCount) > 0 ? ' (split again)' : ''));
      }
    }
    if (blocked.length) {
      const error = new Error(
        'This split cannot be cancelled because these child barcodes have moved since it was finalised: '
        + blocked.slice(0, 8).join(', ') + (blocked.length > 8 ? '...' : '')
        + '. Reverse those transactions first.'
      );
      error.status = 409;
      error.code = 'SPLIT_IN_USE';
      throw error;
    }

    const totalQty = num(split.totalSplitQty);
    const original = await BarcodeLabel.findOne({ _id: split.originalBarcodeId }).session(dbSession || null).lean();
    if (!original) {
      const error = new Error('The original barcode no longer exists.');
      error.status = 409;
      error.code = 'ORIGINAL_MISSING';
      throw error;
    }

    /* Void each child with the same guarded shape the split used. */
    for (const child of children) {
      const line = (split.lines || []).find((l) => String(l.childBarcodeId) === String(child._id))
        || (split.lines || []).find((l) => l.childBarcodeNo === child.barcodeNo);
      const qty = num(line?.qty);
      const res = await BarcodeLabel.updateOne(
        { _id: child._id, status: BARCODE_STATUS.IN_STOCK, qtyNum: child.qtyNum },
        {
          $set: {
            status: BARCODE_STATUS.VOID,
            qtyNum: 0,
            qty: '0',
            updatedAt: new Date(),
            mergedIntoBarcodeNo: '',
          },
        },
        dbSession ? { session: dbSession } : {}
      );
      if (!res.matchedCount) {
        throw new InventoryError('MOVEMENT_CONFLICT', 'A child barcode changed while the split was being cancelled. Reload and try again.', { status: 409 });
      }

      await StockMovement.insertMany([{
        businessId: toId(child.businessId),
        finYear: child.finYear || '',
        type: MOVEMENT_TYPES.SPLIT_REVERSE,
        barcodeId: child._id,
        barcodeNo: child.barcodeNo || '',
        itemId: toId(child.itemId),
        itemCode: child.itemCode || '',
        itemName: child.itemName || '',
        uom: child.uom || '',
        qty: -Math.abs(qty),
        fromLocationId: toId(child.currentLocationId),
        toLocationId: null,
        statusBefore: BARCODE_STATUS.IN_STOCK,
        statusAfter: BARCODE_STATUS.VOID,
        refModel: 'barcodeSplit',
        refId: split._id,
        refNo: split.splitNo || '',
        reason: 'Barcode Split cancelled',
        notes: String(reason || ''),
        userId: toId(session?.id),
        userName: session?.name || '',
        userEmail: session?.email || '',
        at: new Date(),
      }], dbSession ? { session: dbSession, ordered: true } : { ordered: true });
    }

    /* Restore the original's quantity. Guarded on the quantity the split left
       behind: if it has been split again since, the arithmetic would be wrong
       and the transaction is refused. */
    const expectedRemaining = num(split.remainingQty);
    if (Math.abs(availableQtyOf(original) - expectedRemaining) > EPS) {
      const error = new Error(
        'The original barcode has changed since this split (it now holds '
        + availableQtyOf(original) + ' ' + (original.uom || '') + ', the split left '
        + expectedRemaining + '). Reverse the later transactions first.'
      );
      error.status = 409;
      error.code = 'ORIGINAL_CHANGED';
      throw error;
    }

    const restored = roundQty(availableQtyOf(original) + totalQty);
    const res = await BarcodeLabel.updateOne(
      { _id: original._id, status: BARCODE_STATUS.IN_STOCK, qtyNum: original.qtyNum },
      {
        $set: { qtyNum: restored, qty: qtyString(restored), updatedAt: new Date() },
        $inc: { splitChildCount: -children.length, totalSplitQty: -totalQty },
      },
      dbSession ? { session: dbSession } : {}
    );
    if (!res.matchedCount) {
      throw new InventoryError('MOVEMENT_CONFLICT', 'The original barcode changed while the split was being cancelled.', { status: 409 });
    }

    await StockMovement.insertMany([{
      businessId: toId(original.businessId),
      finYear: original.finYear || '',
      type: MOVEMENT_TYPES.SPLIT_REVERSE,
      barcodeId: original._id,
      barcodeNo: original.barcodeNo || '',
      itemId: toId(original.itemId),
      itemCode: original.itemCode || '',
      itemName: original.itemName || '',
      uom: original.uom || '',
      qty: Math.abs(totalQty),
      fromLocationId: null,
      toLocationId: toId(original.currentLocationId || original.locationId),
      statusBefore: original.status || BARCODE_STATUS.IN_STOCK,
      statusAfter: BARCODE_STATUS.IN_STOCK,
      refModel: 'barcodeSplit',
      refId: split._id,
      refNo: split.splitNo || '',
      reason: 'Barcode Split cancelled',
      notes: String(reason || ''),
      userId: toId(session?.id),
      userName: session?.name || '',
      userEmail: session?.email || '',
      at: new Date(),
    }], dbSession ? { session: dbSession, ordered: true } : { ordered: true });

    await BarcodeSplit.updateOne(
      { _id: split._id, status: SPLIT_STATUS.FINALIZED },
      {
        $set: { status: SPLIT_STATUS.CANCELLED, cancelledAt: new Date(), cancelReason: String(reason || '') },
        $push: { audit: { action: 'Cancelled', userId: toId(session?.id), userName: session?.name || '', note: String(reason || ''), at: new Date() } },
      },
      dbSession ? { session: dbSession } : {}
    );

    return { id: String(split._id), status: SPLIT_STATUS.CANCELLED, stockReversed: true };
  });
}

/* -------------------------------------------------------------- genealogy -- */

/* The parent chain and immediate children of a barcode. Works from any child
   back to the root, and from an original forward to its children. */
export async function genealogyFor({ barcodeId, businessId }) {
  if (!isValidObjectId(String(barcodeId))) {
    const error = new Error('Invalid barcode id.');
    error.status = 400;
    error.code = 'BAD_INPUT';
    throw error;
  }

  const unit = await BarcodeLabel.findOne({
    _id: barcodeId,
    ...(businessId ? { businessId: String(businessId) } : {}),
  }).lean();
  if (!unit) {
    const error = new Error('Barcode not found.');
    error.status = 404;
    error.code = 'NOT_FOUND';
    throw error;
  }

  const ancestry = [];
  let cursor = unit;
  for (let depth = 0; depth < 25 && cursor?.parentBarcodeId; depth += 1) {
    const parent = await BarcodeLabel.findById(cursor.parentBarcodeId)
      .select('barcodeNo itemCode itemName qtyNum qty uom status parentBarcodeId rootBarcodeId splitId splitDepth').lean();
    if (!parent) break;
    ancestry.unshift(parent);
    cursor = parent;
  }

  const children = await BarcodeLabel.find({ parentBarcodeId: unit._id })
    .select('barcodeNo itemCode itemName qtyNum qty uom status splitId splitDepth createdAt')
    .sort({ createdAt: 1 })
    .lean();

  const rootId = unit.rootBarcodeId || (ancestry[0]?._id) || unit._id;
  const root = String(rootId) === String(unit._id)
    ? unit
    : await BarcodeLabel.findById(rootId)
      .select('barcodeNo itemCode itemName qtyNum qty uom status').lean();

  return { unit, ancestry, children, root };
}

/* ------------------------------------------------------------------ list -- */

export function splitListFilter(sp) {
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
  if (barcode) filter.originalBarcodeNo = { $regex: barcode.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };

  const search = String(sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), $options: 'i' };
    filter.$or = [
      { splitNo: rx }, { originalBarcodeNo: rx }, { itemCode: rx },
      { itemName: rx }, { supplierName: rx }, { grcNo: rx },
    ];
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

/* Rows for the split Excel export, one row per child barcode - the shape of
   the reference workbook (original row, then each split line). */
export function splitExportRows(split) {
  return (split.lines || []).map((line, index) => ({
    'Split Transaction Code': split.splitNo,
    'Original Barcode': split.originalBarcodeNo,
    'Original Item Code': split.itemCode,
    'Item Name': split.itemName,
    'Supplier': split.supplierName,
    'Original Quantity': split.originalQty,
    'Original UOM': split.originalUom,
    'Split Quantity': line.qty,
    'Split UOM': line.uom,
    'Conversion Factor': line.conversionFactor,
    'Quantity in Original UOM': line.qtyInOriginalUom,
    'New Barcode': line.childBarcodeNo,
    'Purchase Rate': line.purchaseRate,
    'Discount': line.discount,
    'Final Purchase Rate': line.finalPurchaseRate,
    'RSP': line.rsp,
    'RSP Offer Price': line.rspOfferPrice,
    'WSP': line.wsp,
    'WSP Offer Price': line.wspOfferPrice,
    'DP': line.dp,
    'DP Offer Price': line.dpOfferPrice,
    'SP': line.sellingPrice,
    'GRC No': split.grcNo,
    'Purchase Reference': split.purchaseRef,
    'Batch': line.batchNo,
    'HSN': line.hsn,
    'GST': line.gst,
    'Status': split.status,
    'Created By': split.createdByName,
    'Created Date': split.createdAt,
    'Row': index + 1,
  }));
}

export { PRICE_FIELDS, categoryOf };
