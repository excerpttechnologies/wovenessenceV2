import { isValidObjectId } from 'mongoose';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import Item from '@/models/Item';
import CompanyLocation from '@/models/CompanyLocation';
import { withTransaction, receiveIntoStock, applyMovement, MOVEMENT_TYPES } from '@/lib/inventory';
import { planBarcodes, reserveBarcodeNumbers, loadFormat } from '@/lib/barcodeEngine';
import { despatchTransfer, receiveTransfer } from '@/lib/inventory';
import StockTransfer from '@/models/StockTransfer';
import { nextDocNumber } from '@/lib/docnumber';
import { IMPORT_OPERATIONS } from './hsrImportConstants.js';

/* ==========================================================================
   HSR IMPORT OPERATION HANDLERS

   This module implements the actual database operations for each import type:
   - UPDATE_DETAILS: Update barcode/item fields only
   - ADD_BARCODES: Create new barcode records
   - REPLACE_STOCK: Replace stock quantities at target warehouse
   - ADD_STOCK: Add opening stock
   - TRANSFER_STOCK: Transfer from source to target warehouse
   ========================================================================== */

/* Helper: Create a barcode document from HSR record */
function createBarcodeDoc(record, scope, links) {
  const values = record.values;
  const { businessId, targetLocationId, finYear, stockPointId } = scope;

  return {
    businessId: String(businessId),
    locationId: String(targetLocationId),
    finYear: String(finYear),

    // Original fields
    itemCode: values.itemCode,
    itemName: values.itemName,
    printDescription: values.printDescription,
    uom: values.uom,
    hsn: values.hsn,
    purRate: values.hsrPurPrice ? String(values.hsrPurPrice) : '',
    gst: values.gst ? String(values.gst) : '',
    retailPrice: values.rsp ? String(values.rsp) : '',
    offerPrice: values.offerPrice ? String(values.offerPrice) : '',
    wspPrice: values.wsp ? String(values.wsp) : '',
    dpPrice: values.dp ? String(values.dp) : '',
    grcNo: values.grcNo || '',
    batchUnique: values.batchUnique || '',

    // HSR-specific fields
    openingQty: values.openQty,
    hsrPurPrice: values.hsrPurPrice || 0,
    stockDate: values.date || null,
    stockAge: values.age || null,

    // Custom fields
    customFields: {
      purchaseDate: values.purchaseDate || null,
      supplierInvoiceNo: values.supplierInvoiceNo || '',
      itemAttributes: values.itemAttributes || '',
    },

    // Lifecycle fields
    barcodeNo: '', // Will be generated
    itemId: links.itemId || null,
    itemName: values.itemName,
    uomType: values.uom === 'MTR' ? 'MTR' : 'PC',
    uomId: links.uomId || null,
    batchType: 'unique',
    qtyNum: values.openQty || 1,
    status: BARCODE_STATUS.IN_STOCK,
    currentLocationId: targetLocationId,
    currentBusinessId: businessId,
    currentStockPointId: stockPointId || null,

    // Source tracking
    source: 'HSR_OPENING_STOCK',
    sourcePayload: JSON.stringify({ line: record.line, fileName: record.fileName }),
  };
}

/* Operation A: Update barcode/item details */
export async function executeUpdateDetails(records, scope, user, session = null) {
  const updated = [];
  const skipped = [];
  const failed = [];

  for (const record of records) {
    try {
      const { itemCode, links } = record;
      
      if (!links.itemId) {
        skipped.push({ itemCode, reason: 'Item master not found' });
        continue;
      }

      // Update Item master fields
      const itemUpdate = {};
      if (record.values.itemName) itemUpdate.name = record.values.itemName;
      if (record.values.rsp !== null) itemUpdate.rsp = record.values.rsp;
      if (record.values.wsp !== null) itemUpdate.wsp = record.values.wsp;
      if (record.values.discount !== null) itemUpdate.rspOfferPercent = record.values.discount;

      if (Object.keys(itemUpdate).length > 0) {
        await Item.findByIdAndUpdate(links.itemId, itemUpdate).session(session || null);
      }

      // Update BarcodeLabel fields for existing barcodes
      const barcodeUpdate = {};
      if (record.values.printDescription) barcodeUpdate.printDescription = record.values.printDescription;
      if (record.values.hsn) barcodeUpdate.hsn = record.values.hsn;
      if (record.values.hsrPurPrice !== null) barcodeUpdate.hsrPurPrice = record.values.hsrPurPrice;
      if (record.values.offerPrice !== null) barcodeUpdate.offerPrice = String(record.values.offerPrice);
      if (record.values.wsp !== null) barcodeUpdate.wspPrice = String(record.values.wsp);
      if (record.values.dp !== null) barcodeUpdate.dpPrice = String(record.values.dp);

      if (Object.keys(barcodeUpdate).length > 0) {
        await BarcodeLabel.updateMany(
          { businessId: scope.businessId, itemCode, currentLocationId: scope.targetLocationId },
          barcodeUpdate
        ).session(session || null);
      }

      updated.push({ itemCode });
    } catch (error) {
      failed.push({ itemCode: record.values.itemCode, error: error.message });
    }
  }

  return { updated, skipped, failed };
}

/* Operation B: Add new barcodes */
export async function executeAddBarcodes(records, scope, user, session = null) {
  const inserted = [];
  const skipped = [];
  const failed = [];

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    // Load barcode format for the business and financial year
    const format = await loadFormat(scope.businessId, scope.finYear);

    for (const record of records) {
      try {
        if (!record.links.itemId) {
          skipped.push({ itemCode: record.values.itemCode, reason: 'Item master not found' });
          continue;
        }

        // Check if barcode already exists at target location
        const existing = await BarcodeLabel.findOne({
          businessId: scope.businessId,
          itemCode: record.values.itemCode,
          currentLocationId: scope.targetLocationId,
        }).session(sess);

        if (existing) {
          skipped.push({ itemCode: record.values.itemCode, reason: 'Barcode already exists at target location' });
          continue;
        }

        // Plan barcodes based on UOM and quantity
        const uom = record.values.uom || 'PC';
        const batchType = 'unique'; // HSR import uses unique barcodes per item
        const qty = record.values.openQty || 1;

        let plan;
        try {
          plan = await planBarcodes({ uom, batchType, qty });
        } catch (planError) {
          skipped.push({ itemCode: record.values.itemCode, reason: `Barcode plan error: ${planError.message}` });
          continue;
        }

        // Reserve barcode numbers
        const numbers = await reserveBarcodeNumbers(plan.length, {
          businessId: scope.businessId,
          finYear: scope.finYear,
          setting: format,
        });

        // Create barcode documents
        const barcodeDocs = plan.map((p, i) => ({
          businessId: String(scope.businessId),
          locationId: String(scope.targetLocationId),
          finYear: String(scope.finYear),

          // Original fields
          itemCode: record.values.itemCode,
          itemName: record.values.itemName,
          printDescription: record.values.printDescription,
          uom: record.values.uom,
          hsn: record.values.hsn,
          purRate: record.values.hsrPurPrice ? String(record.values.hsrPurPrice) : '',
          gst: record.values.gst ? String(record.values.gst) : '',
          retailPrice: record.values.rsp ? String(record.values.rsp) : '',
          offerPrice: record.values.offerPrice ? String(record.values.offerPrice) : '',
          wspPrice: record.values.wsp ? String(record.values.wsp) : '',
          dpPrice: record.values.dp ? String(record.values.dp) : '',
          grcNo: record.values.grcNo || '',
          batchUnique: record.values.batchUnique || '',

          // HSR-specific fields
          openingQty: record.values.openQty,
          hsrPurPrice: record.values.hsrPurPrice || 0,
          stockDate: record.values.date || null,
          stockAge: record.values.age || null,

          // Custom fields
          customFields: {
            purchaseDate: record.values.purchaseDate || null,
            supplierInvoiceNo: record.values.supplierInvoiceNo || '',
            itemAttributes: record.values.itemAttributes || '',
          },

          // Lifecycle fields
          barcodeNo: numbers[i],
          itemId: record.links.itemId,
          itemName: record.values.itemName,
          uomType: p.uomType,
          uomId: record.links.uomId || null,
          batchType: p.batchType,
          qtyNum: p.qty,
          status: BARCODE_STATUS.IN_STOCK,
          currentLocationId: scope.targetLocationId,
          currentBusinessId: scope.businessId,
          currentStockPointId: scope.stockPointId || null,

          // Source tracking
          source: 'HSR_OPENING_STOCK',
          sourcePayload: JSON.stringify({ line: record.line, fileName: record.fileName }),
        }));

        // Insert barcodes
        const saved = await BarcodeLabel.insertMany(barcodeDocs, { session: sess });

        // Create stock movement for each barcode
        for (const barcode of saved) {
          await applyMovement({
            units: [barcode],
            expect: null,
            set: { status: BARCODE_STATUS.IN_STOCK },
            movement: {
              type: MOVEMENT_TYPES.ADJUST_IN,
              direction: 'in',
              toLocationId: scope.targetLocationId,
              refModel: 'HSR_OPENING_STOCK',
              refNo: '',
              reason: 'HSR opening stock - new barcode',
              finYear: scope.finYear,
            },
            user,
            session: sess,
          });
        }

        inserted.push({ 
          itemCode: record.values.itemCode, 
          barcodeCount: saved.length,
          barcodes: saved.map(b => b.barcodeNo)
        });
      } catch (error) {
        failed.push({ itemCode: record.values.itemCode, error: error.message });
      }
    }

    return { inserted, skipped, failed };
  });
}

/* Operation C: Replace stock quantities */
export async function executeReplaceStock(records, scope, user, session = null) {
  const replaced = [];
  const skipped = [];
  const failed = [];

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    for (const record of records) {
      try {
        const { itemCode, reconciliation } = record;
        const excelQty = record.values.openQty;
        const existingQty = reconciliation.existingStock.target || 0;
        const diff = excelQty - existingQty;

        if (diff === 0) {
          skipped.push({ itemCode, reason: 'Quantity unchanged' });
          continue;
        }

        // Find all barcodes for this item at target location
        const barcodes = await BarcodeLabel.find({
          businessId: scope.businessId,
          itemCode,
          currentLocationId: scope.targetLocationId,
          status: BARCODE_STATUS.IN_STOCK,
        }).session(sess);

        if (barcodes.length === 0) {
          // No existing stock - create adjustment to add stock
          await applyMovement({
            units: [{
              itemCode,
              qtyNum: excelQty,
              currentLocationId: scope.targetLocationId,
              currentBusinessId: scope.businessId,
            }],
            expect: null,
            set: { status: BARCODE_STATUS.IN_STOCK },
            movement: {
              type: MOVEMENT_TYPES.ADJUST_IN,
              direction: 'in',
              toLocationId: scope.targetLocationId,
              refModel: 'HSR_OPENING_STOCK',
              refNo: '',
              reason: 'HSR opening stock - replace',
              finYear: scope.finYear,
            },
            user,
            session: sess,
          });
        } else {
          // Calculate quantity adjustment
          if (diff > 0) {
            // Add stock
            await applyMovement({
              units: barcodes,
              expect: BARCODE_STATUS.IN_STOCK,
              set: {},
              movement: {
                type: MOVEMENT_TYPES.ADJUST_IN,
                direction: 'in',
                toLocationId: scope.targetLocationId,
                refModel: 'HSR_OPENING_STOCK',
                refNo: '',
                reason: 'HSR opening stock - increase quantity',
                finYear: scope.finYear,
              },
              user,
              session: sess,
            });
          } else {
            // Remove stock
            await applyMovement({
              units: barcodes,
              expect: BARCODE_STATUS.IN_STOCK,
              set: {},
              movement: {
                type: MOVEMENT_TYPES.ADJUST_OUT,
                direction: 'out',
                fromLocationId: scope.targetLocationId,
                refModel: 'HSR_OPENING_STOCK',
                refNo: '',
                reason: 'HSR opening stock - decrease quantity',
                finYear: scope.finYear,
              },
              user,
              session: sess,
            });
          }
        }

        // Update HSR price if provided
        if (record.values.hsrPurPrice !== null) {
          await BarcodeLabel.updateMany(
            { businessId: scope.businessId, itemCode, currentLocationId: scope.targetLocationId },
            { hsrPurPrice: record.values.hsrPurPrice }
          ).session(sess);
        }

        replaced.push({ itemCode, before: existingQty, after: excelQty, diff });
      } catch (error) {
        failed.push({ itemCode: record.values.itemCode, error: error.message });
      }
    }

    return { replaced, skipped, failed };
  });
}

/* Operation D: Add stock / opening stock */
export async function executeAddStock(records, scope, user, session = null) {
  const added = [];
  const skipped = [];
  const failed = [];

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    for (const record of records) {
      try {
        const { itemCode, reconciliation } = record;
        const excelQty = record.values.openQty;

        // Create stock movement for opening stock
        await applyMovement({
          units: [{
            itemCode,
            qtyNum: excelQty,
            currentLocationId: scope.targetLocationId,
            currentBusinessId: scope.businessId,
            itemId: record.links.itemId,
            itemName: record.values.itemName,
            uom: record.values.uom,
            hsn: record.values.hsn,
            hsrPurPrice: record.values.hsrPurPrice,
          }],
          expect: null,
          set: { status: BARCODE_STATUS.IN_STOCK },
          movement: {
            type: MOVEMENT_TYPES.ADJUST_IN,
            direction: 'in',
            toLocationId: scope.targetLocationId,
            refModel: 'HSR_OPENING_STOCK',
            refNo: '',
            reason: 'HSR opening stock',
            finYear: scope.finYear,
          },
          user,
          session: sess,
        });

        added.push({ itemCode, qty: excelQty });
      } catch (error) {
        failed.push({ itemCode: record.values.itemCode, error: error.message });
      }
    }

    return { added, skipped, failed };
  });
}

/* Operation E: Transfer stock between warehouses */
export async function executeTransferStock(records, scope, user, session = null) {
  const transferred = [];
  const skipped = [];
  const failed = [];

  return withTransaction(async (txnSession) => {
    const sess = session || txnSession;

    // Validate source location
    if (!scope.sourceLocationId) {
      for (const record of records) {
        skipped.push({ itemCode: record.values.itemCode, reason: 'Source warehouse not specified for transfer' });
      }
      return { transferred, skipped, failed };
    }

    // Generate transfer number
    const transferNo = await nextDocNumber('STK_TRANSFER', scope.businessId, scope.finYear);

    // Create StockTransfer document
    const transferLines = [];
    for (const record of records) {
      const { reconciliation } = record;
      const validation = reconciliation.validateTransfer 
        ? reconciliation.validateTransfer(record, scope)
        : { canTransfer: true, errors: [], warnings: [] };

      if (!validation.canTransfer) {
        skipped.push({ 
          itemCode: record.values.itemCode, 
          reason: validation.errors.join(', ') 
        });
        continue;
      }

      transferLines.push({
        itemCode: record.values.itemCode,
        itemName: record.values.itemName,
        description: record.values.printDescription,
        uom: record.values.uom,
        uomType: record.values.uom === 'MTR' ? 'MTR' : 'PC',
        batchType: 'unique',
        qty: record.values.openQty,
        hsn: record.values.hsn,
        gst: record.values.gst || 0,
        rate: record.values.hsrPurPrice || 0,
        rsp: record.values.rsp || 0,
        supplierId: record.links.supplierId || '',
        grcNo: record.values.grcNo || '',
        received: false,
        receivedAt: null,
        receivedBy: '',
        returned: false,
        returnedAt: null,
        returnReason: '',
        returnNotes: '',
        returnAccepted: false,
        returnAcceptedAt: null,
      });
    }

    if (transferLines.length === 0) {
      return { transferred, skipped, failed };
    }

    // Create StockTransfer document
    const transfer = new StockTransfer({
      businessId: scope.businessId,
      finYear: scope.finYear,
      transferNo,
      transferDate: new Date(),
      fromLocationId: scope.sourceLocationId,
      fromLocationName: (await CompanyLocation.findById(scope.sourceLocationId).select('name').lean())?.name || '',
      toLocationId: scope.targetLocationId,
      toLocationName: (await CompanyLocation.findById(scope.targetLocationId).select('name').lean())?.name || '',
      toStockPointId: scope.stockPointId || null,
      status: 'DRAFT',
      source: 'HSR_IMPORT',
      lines: transferLines,
    });

    const savedTransfer = await transfer.save({ session: sess });

    // Find barcodes at source location
    const itemCodes = transferLines.map(l => l.itemCode);
    const sourceBarcodes = await BarcodeLabel.find({
      businessId: scope.businessId,
      itemCode: { $in: itemCodes },
      currentLocationId: scope.sourceLocationId,
      status: BARCODE_STATUS.IN_STOCK,
    }).session(sess);

    // Group barcodes by item code
    const barcodeMap = new Map();
    sourceBarcodes.forEach(b => {
      if (!barcodeMap.has(b.itemCode)) {
        barcodeMap.set(b.itemCode, []);
      }
      barcodeMap.get(b.itemCode).push(b);
    });

    // Despatch each transfer
    for (const line of transferLines) {
      const barcodes = barcodeMap.get(line.itemCode) || [];
      const qtyNeeded = line.qty;
      const qtyAvailable = barcodes.reduce((sum, b) => sum + (b.qtyNum || 0), 0);

      if (qtyAvailable < qtyNeeded) {
        failed.push({ 
          itemCode: line.itemCode, 
          error: `Insufficient stock: have ${qtyAvailable}, need ${qtyNeeded}` 
        });
        continue;
      }

      // Select barcodes to transfer (FIFO)
      let qtyToTransfer = qtyNeeded;
      const toTransfer = [];
      for (const barcode of barcodes) {
        if (qtyToTransfer <= 0) break;
        const qtyTake = Math.min(barcode.qtyNum, qtyToTransfer);
        toTransfer.push({ ...barcode, _transferQty: qtyTake });
        qtyToTransfer -= qtyTake;
      }

      // Despatch from source
      await despatchTransfer({
        units: toTransfer,
        transfer: savedTransfer,
        fromLocationId: scope.sourceLocationId,
        toLocationId: scope.targetLocationId,
        user,
        session: sess,
      });

      // Receive at target
      await receiveTransfer({
        units: toTransfer,
        transfer: savedTransfer,
        toLocationId: scope.targetLocationId,
        toBusinessId: scope.businessId,
        toStockPointId: scope.stockPointId,
        user,
        session: sess,
      });

      transferred.push({ 
        itemCode: line.itemCode, 
        qty: line.qty,
        transferNo: savedTransfer.transferNo
      });
    }

    // Update transfer status
    savedTransfer.status = 'RECEIVED';
    savedTransfer.receivedAt = new Date();
    savedTransfer.receivedBy = user?.name || '';
    await savedTransfer.save({ session: sess });

    return { transferred, skipped, failed };
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
