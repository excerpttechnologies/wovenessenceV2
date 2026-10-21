import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import { parseStockAdjustmentWorkbook } from '@/lib/stockAdjustmentImport';
import { withTransaction } from '@/lib/inventory';
import { applyMovement, MOVEMENT_TYPES } from '@/lib/inventory';
import { BarcodeLabel, BARCODE_STATUS } from '@/lib/barcodeLabel';
import { randomBytes } from 'crypto';

/* ==========================================================================
   STOCK ADJUSTMENT EXCEL IMPORT API

   POST /api/stock-adjustment-import/analyze
     Analyze uploaded workbook without writing to database

   POST /api/stock-adjustment-import/execute
     Execute the stock adjustment import
   ========================================================================== */

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'execute' ? 'execute' : 'analyze';
  const dryRun = body?.dryRun === true;

  const businessId = String(body?.business || '').trim();
  const locationId = String(body?.location || '').trim();
  const finYear = String(body?.finYear || '').trim();

  // Business ID is optional for this import
  if (businessId && !isValidObjectId(businessId)) {
    return json({ error: 'Invalid business ID' }, 422);
  }
  if (!locationId || !isValidObjectId(locationId)) {
    return json({ error: 'Invalid location ID' }, 422);
  }

  // Require stock adjustment permission
  const session = await requirePermission(PERMISSIONS.STOCK_ADJUSTMENT);
  await dbConnect();

  // Validate business and location
  const business = await Business.findById(businessId).select('_id').lean();
  if (!business) {
    return json({ error: 'Business not found' }, 422);
  }

  const location = await CompanyLocation.findById(locationId).select('name businessId').lean();
  if (!location) {
    return json({ error: 'Location not found' }, 422);
  }
  if (String(location.businessId) !== businessId) {
    return json({ error: 'Location does not belong to the selected business' }, 422);
  }

  // Get file from request
  const file = body?.file;
  if (!file) {
    return json({ error: 'No file provided' }, 422);
  }

  try {
    // Parse workbook
    const parseResult = parseStockAdjustmentWorkbook(file);

    // Analyze mode - return everything without executing
    if (mode === 'analyze') {
      return json({
        ok: true,
        mode: 'analyze',
        workbook: {
          fileName: body.fileName || 'stock_adjustment.xlsx',
          sheetName: parseResult.analysis.sheetName,
          totalRows: parseResult.summary.totalRows,
          validRows: parseResult.summary.validRows,
          invalidRows: parseResult.summary.invalidRows,
          ignored: parseResult.summary.ignored,
          duplicates: parseResult.summary.duplicates,
        },
        records: {
          total: parseResult.records.length,
          withProblems: parseResult.records.filter(r => r.hasProblems).length,
          ready: parseResult.records.filter(r => !r.hasProblems).length,
          sample: parseResult.records.slice(0, 10).map(r => ({
            line: r.line,
            itemCode: r.values.itemCode,
            barcodeNo: r.values.barcodeNo,
            qty: r.values.qty,
            adjustmentType: r.values.adjustmentType,
            reason: r.values.reason,
            hasProblems: r.hasProblems,
            problems: r.problems.slice(0, 3),
          })),
        },
      });
    }

    // Execute mode - perform the import
    if (mode === 'execute') {
      if (dryRun) {
        return json({
          ok: true,
          mode: 'execute',
          dryRun: true,
          wouldExecute: true,
          message: 'Dry run complete - no changes were made to the database',
        });
      }

      // Filter records that are ready for import
      const readyRecords = parseResult.records.filter(r => !r.hasProblems);

      if (readyRecords.length === 0) {
        return json({
          ok: false,
          error: 'No valid records to import - all records have problems',
          problems: parseResult.records.flatMap(r => r.problems),
        }, 422);
      }

      // Execute import with transaction
      const result = await withTransaction(async (session) => {
        let processed = 0;
        let skipped = 0;
        let failed = 0;

        for (const record of readyRecords) {
          try {
            const { values } = record;
            const qty = Number(values.qty);
            const adjType = values.adjustmentType.toUpperCase();
            const isAdd = adjType === 'ADD' || adjType === 'INCREASE';

            // Find barcodes for this item
            const barcodes = await BarcodeLabel.find({
              businessId,
              itemCode: values.itemCode,
              currentLocationId: locationId,
              status: BARCODE_STATUS.IN_STOCK,
            }).session(session);

            if (barcodes.length === 0) {
              skipped++;
              continue;
            }

            // Calculate total available stock
            const totalStock = barcodes.reduce((sum, b) => sum + (b.qtyNum || 0), 0);

            if (isAdd) {
              // Add stock
              await applyMovement({
                units: barcodes,
                expect: BARCODE_STATUS.IN_STOCK,
                set: {},
                movement: {
                  type: MOVEMENT_TYPES.ADJUST_IN,
                  direction: 'in',
                  toLocationId: locationId,
                  refModel: 'STOCK_ADJUSTMENT_EXCEL',
                  refNo: '',
                  reason: values.reason || 'Stock adjustment from Excel import',
                  finYear,
                },
                user: session,
                session,
              });
            } else {
              // Remove stock
              if (totalStock < qty) {
                skipped++;
                continue;
              }

              await applyMovement({
                units: barcodes,
                expect: BARCODE_STATUS.IN_STOCK,
                set: {},
                movement: {
                  type: MOVEMENT_TYPES.ADJUST_OUT,
                  direction: 'out',
                  fromLocationId: locationId,
                  refModel: 'STOCK_ADJUSTMENT_EXCEL',
                  refNo: '',
                  reason: values.reason || 'Stock adjustment from Excel import',
                  finYear,
                },
                user: session,
                session,
              });
            }

            processed++;
          } catch (error) {
            failed++;
          }
        }

        return { processed, skipped, failed };
      });

      return json({
        ok: true,
        mode: 'execute',
        targetLocation: location.name,
        result,
      });
    }
  } catch (error) {
    console.error('Stock adjustment import error:', error);
    return json({
      error: error.message || 'Import failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, 500);
  }
});
