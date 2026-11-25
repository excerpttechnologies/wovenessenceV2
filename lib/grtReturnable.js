import { isValidObjectId } from 'mongoose';
import Grt from '@/models/Grt';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { barcodeKey } from '@/lib/barcodeValue';

/** Extract numeric stock quantity from a BarcodeLabel document. */
export function stockQtyOf(row) {
  if (!row) return 0;
  const raw = row.qtyNum !== undefined && row.qtyNum !== null && row.qtyNum !== ''
    ? row.qtyNum
    : row.qty;
  if (raw === undefined || raw === null || raw === '') return 0;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : 0;
}

/** True when a BarcodeLabel unit is currently in stock (not sold, void, in transit, etc.). */
export function isBarcodeInStock(row) {
  if (!row) return false;
  return !row.status || row.status === BARCODE_STATUS.IN_STOCK;
}

/**
 * Sum previously returned quantities from saved GRTs, keyed by BarcodeLabel `_id`
 * and fallback normalized barcode string (never double-counting items matched by `_id`).
 */
export async function loadReturnedQuantities({
  businessId,
  supplierId,
  excludeGrtId,
  knownLabelIds,
} = {}) {
  const query = {};
  if (businessId && isValidObjectId(String(businessId))) query.businessId = businessId;
  if (supplierId && isValidObjectId(String(supplierId))) query.supplierId = supplierId;
  if (excludeGrtId && isValidObjectId(String(excludeGrtId))) {
    query._id = { $ne: excludeGrtId };
  }

  const grts = await Grt.find(query).select('items').lean();
  const byId = new Map();
  const byBarcode = new Map();

  for (const grt of grts) {
    const items = Array.isArray(grt?.items) ? grt.items : [];
    for (const item of items) {
      const qty = Number(item?.qty);
      if (!Number.isFinite(qty) || qty <= 0) continue;

      const idStr = item?._id ? String(item._id) : '';
      const hasKnownId = Boolean(idStr && (!knownLabelIds || knownLabelIds.has(idStr)));
      if (hasKnownId) {
        byId.set(idStr, (byId.get(idStr) || 0) + qty);
        continue;
      }

      const code = barcodeKey(item?.barcodeNo || item?.barcodeGenerated || '');
      if (code) {
        byBarcode.set(code, (byBarcode.get(code) || 0) + qty);
      }
    }
  }

  return { byId, byBarcode };
}

/** Compute remaining returnable quantity for one BarcodeLabel row. */
export function computeReturnableBreakdown(unit, returnedMaps) {
  if (!isBarcodeInStock(unit)) {
    return { receivedQty: stockQtyOf(unit), returnedQty: 0, returnableQty: 0 };
  }
  const receivedQty = stockQtyOf(unit);
  if (receivedQty <= 0) {
    return { receivedQty: 0, returnedQty: 0, returnableQty: 0 };
  }

  const idStr = String(unit._id || '');
  const code = barcodeKey(unit.barcodeNo || unit.barcodeGenerated || '');
  const returnedById = idStr ? (returnedMaps?.byId?.get(idStr) || 0) : 0;
  const returnedByCode = code ? (returnedMaps?.byBarcode?.get(code) || 0) : 0;
  const returnedQty = returnedById + returnedByCode;
  const returnableQty = Math.max(0, Number((receivedQty - returnedQty).toFixed(6)));

  return { receivedQty, returnedQty, returnableQty };
}

/**
 * Validate GRT line items before creating or updating a GRT:
 * - Every item must have positive numeric return quantity (> 0).
 * - Each item must have positive remaining returnable quantity and cannot exceed
 *   (receivedQty - previouslyReturnedQty) in MongoDB.
 */
export async function validateGrtReturnItems({
  items,
  businessId,
  supplierId,
  excludeGrtId,
}) {
  if (!Array.isArray(items) || items.length === 0) {
    return { ok: false, error: 'Select at least one vendor item.' };
  }

  const normalizedItems = [];
  const itemIds = [];
  const barcodeValues = [];

  for (let i = 0; i < items.length; i += 1) {
    const raw = items[i] || {};
    const qty = Number(raw.qty);
    const label = raw.barcodeNo || raw.itemCode || raw.itemName || raw.supplierDescription || `Row ${i + 1}`;
    if (!Number.isFinite(qty) || qty <= 0) {
      return {
        ok: false,
        error: `Return quantity for "${label}" must be greater than 0.`,
      };
    }
    const normalized = { ...raw, qty };
    normalizedItems.push(normalized);
    if (raw._id && isValidObjectId(String(raw._id))) itemIds.push(String(raw._id));
    if (raw.barcodeNo) barcodeValues.push(String(raw.barcodeNo).trim());
    if (raw.barcodeGenerated) barcodeValues.push(String(raw.barcodeGenerated).trim());
  }

  const labelOr = [];
  if (itemIds.length) labelOr.push({ _id: { $in: itemIds } });
  if (barcodeValues.length) {
    labelOr.push({ barcodeNo: { $in: barcodeValues } });
    labelOr.push({ barcodeGenerated: { $in: barcodeValues } });
  }

  const units = labelOr.length
    ? await BarcodeLabel.find({ $or: labelOr }).lean()
    : [];
  const unitById = new Map(units.map((u) => [String(u._id), u]));
  const unitByBarcode = new Map();
  for (const unit of units) {
    for (const val of [unit.barcodeNo, unit.barcodeGenerated]) {
      const k = barcodeKey(val || '');
      if (k && !unitByBarcode.has(k)) unitByBarcode.set(k, unit);
    }
  }

  const knownLabelIds = new Set(units.map((u) => String(u._id)));
  const returnedMaps = await loadReturnedQuantities({
    businessId,
    supplierId,
    excludeGrtId,
    knownLabelIds,
  });

  // Aggregate requested qty per BarcodeLabel unit so duplicate selections cannot bypass limits
  const requestedByUnit = new Map();
  for (let i = 0; i < normalizedItems.length; i += 1) {
    const item = normalizedItems[i];
    const label = item.barcodeNo || item.itemCode || item.itemName || `Row ${i + 1}`;
    const unit = (item._id && unitById.get(String(item._id)))
      || unitByBarcode.get(barcodeKey(item.barcodeNo || item.barcodeGenerated || ''));

    if (!unit) {
      const maxFallback = Number(item.maximumQuantity);
      if (Number.isFinite(maxFallback) && maxFallback >= 0 && item.qty > maxFallback) {
        return {
          ok: false,
          error: `Return quantity (${item.qty}) for "${label}" exceeds available returnable quantity (${maxFallback}).`,
        };
      }
      continue;
    }

    const uid = String(unit._id);
    const totalRequested = (requestedByUnit.get(uid) || 0) + item.qty;
    requestedByUnit.set(uid, totalRequested);

    if (!isBarcodeInStock(unit)) {
      return {
        ok: false,
        error: `"${label}" is not in stock (${unit.status}) and cannot be returned.`,
      };
    }

    const { returnableQty } = computeReturnableBreakdown(unit, returnedMaps);
    if (returnableQty <= 0) {
      return {
        ok: false,
        error: `"${label}" has 0 returnable quantity remaining and cannot be returned.`,
      };
    }
    if (totalRequested > returnableQty) {
      return {
        ok: false,
        error: `Return quantity (${totalRequested}) for "${label}" exceeds remaining returnable quantity (${returnableQty}).`,
      };
    }
    item.maximumQuantity = returnableQty;
  }

  return { ok: true, items: normalizedItems };
}
