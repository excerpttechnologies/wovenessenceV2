import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { withTransaction } from '@/lib/inventory';
import { IMPORT_OPERATIONS } from './hsrImportConstants.js';
export { IMPORT_OPERATIONS };

/* ==========================================================================
   HSR WAREHOUSE RECONCILIATION

   This module handles warehouse-specific reconciliation for HSR imports:
   - Compare Excel quantities vs existing stock
   - Handle TEMPLE FABRICS WAREHOUSE → HSR transfer scenarios
   - Validate source stock availability
   - Calculate before/after quantities for different operations
   ========================================================================== */

/* Reconcile a single record against existing inventory */
export async function reconcileWarehouseStock(record, scope, session = null) {
  const { businessId, targetLocationId, sourceLocationId, finYear } = scope;
  const values = record.values;
  const itemCode = values.itemCode;

  const reconciliation = {
    itemCode,
    excelQty: values.openQty,
    excelPrice: values.hsrPurPrice,
    existingStock: {
      source: null,
      target: null,
    },
    proposed: {
      source: null,
      target: null,
    },
    warnings: [],
    errors: [],
    canProceed: true,
  };

  // Query existing barcodes for this item code
  const existingBarcodes = await BarcodeLabel.find({
    businessId,
    itemCode,
  }).select('barcodeNo qtyNum status currentLocationId currentBusinessId hsrPurPrice purRate')
    .session(session || null)
    .lean();

  // Calculate stock at source warehouse (if specified)
  if (sourceLocationId) {
    const sourceStock = existingBarcodes
      .filter(b => String(b.currentLocationId) === String(sourceLocationId) && b.status === BARCODE_STATUS.IN_STOCK)
      .reduce((sum, b) => sum + (b.qtyNum || 0), 0);
    reconciliation.existingStock.source = sourceStock;
  }

  // Calculate stock at target warehouse
  const targetStock = existingBarcodes
    .filter(b => String(b.currentLocationId) === String(targetLocationId) && b.status === BARCODE_STATUS.IN_STOCK)
    .reduce((sum, b) => sum + (b.qtyNum || 0), 0);
  reconciliation.existingStock.target = targetStock;

  // Check for existing HSR purchase price differences
  const targetBarcodes = existingBarcodes.filter(b => String(b.currentLocationId) === String(targetLocationId));
  if (targetBarcodes.length > 0) {
    const existingPrice = targetBarcodes[0].hsrPurPrice || targetBarcodes[0].purRate;
    if (existingPrice && values.hsrPurPrice && Math.abs(existingPrice - values.hsrPurPrice) > 0.01) {
      reconciliation.warnings.push({
        field: 'hsrPurPrice',
        message: `Existing HSR price (${existingPrice}) differs from Excel (${values.hsrPurPrice})`,
      });
    }
  }

  return reconciliation;
}

/* Batch reconcile multiple records */
export async function reconcileBatchWarehouseStock(records, scope, session = null) {
  const reconciliations = [];
  const summary = {
    totalRecords: records.length,
    itemsWithExistingStock: 0,
    itemsWithoutExistingStock: 0,
    totalExcelQty: 0,
    totalExistingTargetQty: 0,
    totalSourceQty: 0,
    priceDifferences: 0,
  };

  for (const record of records) {
    const recon = await reconcileWarehouseStock(record, scope, session);
    reconciliations.push({ ...record, reconciliation: recon });

    summary.totalExcelQty += recon.excelQty || 0;
    summary.totalExistingTargetQty += recon.existingStock.target || 0;
    summary.totalSourceQty += recon.existingStock.source || 0;

    if (recon.existingStock.target > 0) {
      summary.itemsWithExistingStock += 1;
    } else {
      summary.itemsWithoutExistingStock += 1;
    }

    if (recon.warnings.some(w => w.field === 'hsrPurPrice')) {
      summary.priceDifferences += 1;
    }
  }

  return {
    reconciliations,
    summary,
  };
}

/* Validate transfer operation feasibility */
export function validateTransferOperation(reconciliation, scope) {
  const { excelQty, existingStock } = reconciliation;
  const { sourceLocationId } = scope;

  const validation = {
    canTransfer: true,
    errors: [],
    warnings: [],
  };

  if (!sourceLocationId) {
    validation.errors.push('Source warehouse not specified for transfer operation');
    validation.canTransfer = false;
    return validation;
  }

  if (existingStock.source === null || existingStock.source === undefined) {
    validation.errors.push('Source warehouse stock not available');
    validation.canTransfer = false;
    return validation;
  }

  if (existingStock.source < excelQty) {
    validation.errors.push(
      `Insufficient stock at source warehouse: have ${existingStock.source}, need ${excelQty}`
    );
    validation.canTransfer = false;
  }

  if (existingStock.source === excelQty) {
    validation.warnings.push('Transfer will empty source warehouse stock for this item');
  }

  return validation;
}

/* Calculate proposed stock changes for each operation */
export function calculateProposedChanges(reconciliation, operation, scope) {
  const { excelQty, existingStock } = reconciliation;
  const { targetLocationId, sourceLocationId } = scope;

  const proposed = {
    source: existingStock.source || 0,
    target: existingStock.target || 0,
    sourceAfter: existingStock.source || 0,
    targetAfter: existingStock.target || 0,
    sourceChange: 0,
    targetChange: 0,
  };

  switch (operation) {
    case IMPORT_OPERATIONS.TRANSFER_STOCK:
      // Transfer: deduct from source, add to target
      proposed.sourceAfter = (existingStock.source || 0) - excelQty;
      proposed.targetAfter = (existingStock.target || 0) + excelQty;
      proposed.sourceChange = -excelQty;
      proposed.targetChange = excelQty;
      break;

    case IMPORT_OPERATIONS.REPLACE_STOCK:
      // Replace: set target to Excel quantity (source unchanged)
      proposed.targetAfter = excelQty;
      proposed.targetChange = excelQty - (existingStock.target || 0);
      break;

    case IMPORT_OPERATIONS.ADD_STOCK:
      // Add: Excel quantity to existing target (source unchanged)
      proposed.targetAfter = (existingStock.target || 0) + excelQty;
      proposed.targetChange = excelQty;
      break;

    case IMPORT_OPERATIONS.UPDATE_DETAILS:
    case IMPORT_OPERATIONS.ADD_BARCODES:
      // No stock changes
      break;

    default:
      break;
  }

  return proposed;
}

/* Generate reconciliation summary for preview */
export function generateReconciliationSummary(reconciliations, operation, scope) {
  const summary = {
    operation,
    totalItems: reconciliations.length,
    totalExcelQty: 0,
    totalExistingTargetQty: 0,
    totalProposedTargetQty: 0,
    totalTargetChange: 0,
    itemsWithExistingStock: 0,
    itemsWithoutExistingStock: 0,
    itemsWithPriceDifferences: 0,
    insufficientSourceStock: 0,
    warnings: [],
    errors: [],
  };

  for (const { reconciliation } of reconciliations) {
    const proposed = calculateProposedChanges(reconciliation, operation, scope);

    summary.totalExcelQty += reconciliation.excelQty || 0;
    summary.totalExistingTargetQty += reconciliation.existingStock.target || 0;
    summary.totalProposedTargetQty += proposed.targetAfter;
    summary.totalTargetChange += proposed.targetChange;

    if (reconciliation.existingStock.target > 0) {
      summary.itemsWithExistingStock += 1;
    } else {
      summary.itemsWithoutExistingStock += 1;
    }

    if (reconciliation.warnings.some(w => w.field === 'hsrPurPrice')) {
      summary.itemsWithPriceDifferences += 1;
    }

    if (operation === IMPORT_OPERATIONS.TRANSFER_STOCK) {
      const validation = validateTransferOperation(reconciliation, scope);
      if (!validation.canTransfer) {
        summary.insufficientSourceStock += 1;
        summary.errors.push(...validation.errors);
      }
      summary.warnings.push(...validation.warnings);
    }
  }

  // Operation-specific warnings
  if (operation === IMPORT_OPERATIONS.TRANSFER_STOCK && summary.insufficientSourceStock > 0) {
    summary.warnings.unshift(
      `${summary.insufficientSourceStock} items have insufficient source stock for transfer`
    );
  }

  if (operation === IMPORT_OPERATIONS.REPLACE_STOCK && summary.itemsWithExistingStock > 0) {
    summary.warnings.unshift(
      `${summary.itemsWithExistingStock} items have existing stock that will be replaced`
    );
  }

  if (summary.itemsWithPriceDifferences > 0) {
    summary.warnings.unshift(
      `${summary.itemsWithPriceDifferences} items have HSR purchase price differences`
    );
  }

  return summary;
}

/* Check for potential conflicts with existing transfers or pending operations */
export async function checkPendingConflicts(itemCodes, scope, session = null) {
  const { businessId, targetLocationId, sourceLocationId } = scope;

  const conflicts = {
    inTransit: 0,
    sold: 0,
    void: 0,
  };

  // Check for barcodes in TRANSIT status at target location
  const inTransit = await BarcodeLabel.countDocuments({
    businessId,
    itemCode: { $in: itemCodes },
    status: BARCODE_STATUS.IN_TRANSIT,
    currentLocationId: targetLocationId,
  }).session(session || null);

  conflicts.inTransit = inTransit;

  // Check for barcodes in SOLD status
  const sold = await BarcodeLabel.countDocuments({
    businessId,
    itemCode: { $in: itemCodes },
    status: BARCODE_STATUS.SOLD,
  }).session(session || null);

  conflicts.sold = sold;

  // Check for barcodes in VOID status
  const voided = await BarcodeLabel.countDocuments({
    businessId,
    itemCode: { $in: itemCodes },
    status: BARCODE_STATUS.VOID,
  }).session(session || null);

  conflicts.void = voided;

  return conflicts;
}

export default {
  IMPORT_OPERATIONS,
  reconcileWarehouseStock,
  reconcileBatchWarehouseStock,
  validateTransferOperation,
  calculateProposedChanges,
  generateReconciliationSummary,
  checkPendingConflicts,
};
