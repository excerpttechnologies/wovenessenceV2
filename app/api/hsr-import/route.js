import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import HsrImportJob from '@/models/HsrImportJob';
import { parseHSRWorkbook } from '@/lib/hsrWorkbookImport';
import { resolveBatchHSRMasters, summarizeUnmatchedMasters } from '@/lib/hsrMasterResolution';
import { reconcileBatchWarehouseStock, generateReconciliationSummary, IMPORT_OPERATIONS } from '@/lib/hsrWarehouseReconciliation';
import { executeHSRImport } from '@/lib/hsrImportOperations';
import { withTransaction } from '@/lib/inventory';
import { randomBytes } from 'crypto';

/* ==========================================================================
   HSR EXCEL IMPORT API

   POST /api/hsr-import/analyze
     Analyze uploaded workbook without writing to database
     Returns: workbook analysis, master resolution, reconciliation summary

   POST /api/hsr-import/execute
     Execute the import with selected operation
     Returns: import results, summary, errors

   Both endpoints support dry-run mode for testing.
   ========================================================================== */

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const mode = body?.mode === 'execute' ? 'execute' : 'analyze';
  const dryRun = body?.dryRun === true;

  const businessId = String(body?.business || '').trim();
  const locationId = String(body?.location || '').trim();
  const finYear = String(body?.finYear || '').trim();
  const sourceLocationId = body?.sourceLocation ? String(body.sourceLocation).trim() : null;
  const operation = body?.operation || IMPORT_OPERATIONS.ADD_STOCK;

  // Business ID is optional for this import
  if (businessId && !isValidObjectId(businessId)) {
    return json({ error: 'Invalid business ID' }, 422);
  }
  if (!locationId || !isValidObjectId(locationId)) {
    return json({ error: 'Invalid target location ID' }, 422);
  }

  // Importing requires barcode generation permission
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId });
  await dbConnect();

  // Validate business and location
  const business = await Business.findById(businessId).select('_id').lean();
  if (!business) {
    return json({ error: 'Business not found' }, 422);
  }

  const location = await CompanyLocation.findById(locationId).select('name businessId').lean();
  if (!location) {
    return json({ error: 'Target location not found' }, 422);
  }
  if (String(location.businessId) !== businessId) {
    return json({ error: 'Target location does not belong to the selected business' }, 422);
  }

  // Validate source location if specified
  if (sourceLocationId) {
    if (!isValidObjectId(sourceLocationId)) {
      return json({ error: 'Invalid source location ID' }, 422);
    }
    const sourceLocation = await CompanyLocation.findById(sourceLocationId).select('name businessId').lean();
    if (!sourceLocation) {
      return json({ error: 'Source location not found' }, 422);
    }
    if (String(sourceLocation.businessId) !== businessId) {
      return json({ error: 'Source location does not belong to the selected business' }, 422);
    }
  }

  // Get file from request
  const file = body?.file;
  if (!file) {
    return json({ error: 'No file provided' }, 422);
  }

  try {
    // Parse workbook
    const parseResult = parseHSRWorkbook(file);

    // Resolve masters for valid records
    const validRecords = parseResult.records.filter(r => !r.hasProblems);
    const masterResolution = await resolveBatchHSRMasters(validRecords, businessId);

    // Reconcile warehouse stock
    const scope = {
      businessId,
      targetLocationId: locationId,
      sourceLocationId,
      finYear,
    };

    const warehouseReconciliation = await reconcileBatchWarehouseStock(
      masterResolution.records,
      scope
    );

    // Generate reconciliation summary
    const reconciliationSummary = generateReconciliationSummary(
      warehouseReconciliation.reconciliations,
      operation,
      scope
    );

    // Analyze mode - return everything without executing
    if (mode === 'analyze') {
      return json({
        ok: true,
        mode: 'analyze',
        workbook: {
          fileName: body.fileName || 'hsr_opening_stock.xlsx',
          sheetName: parseResult.analysis.sheetName,
          totalRows: parseResult.summary.totalRows,
          validRows: parseResult.summary.validRows,
          invalidRows: parseResult.summary.invalidRows,
          ignored: parseResult.summary.ignored,
          duplicates: parseResult.summary.duplicates,
        },
        masters: {
          matched: masterResolution.mastersMatched,
          unmatched: summarizeUnmatchedMasters(masterResolution.unmatched),
          warnings: masterResolution.warnings.slice(0, 50),
        },
        reconciliation: {
          operation,
          operationLabel: body.operationLabel || operation,
          targetLocation: location.name,
          sourceLocation: sourceLocationId ? (await CompanyLocation.findById(sourceLocationId).select('name').lean())?.name : null,
          summary: reconciliationSummary,
        },
        records: {
          total: masterResolution.records.length,
          withProblems: masterResolution.records.filter(r => r.hasProblems).length,
          ready: masterResolution.records.filter(r => !r.hasProblems).length,
          sample: masterResolution.records.slice(0, 10).map(r => ({
            line: r.line,
            itemCode: r.values.itemCode,
            itemName: r.values.itemName,
            excelQty: r.values.openQty,
            hasProblems: r.hasProblems,
            problems: r.problems.slice(0, 3),
            warnings: r.warnings.slice(0, 3),
          })),
        },
      });
    }

    // Execute mode - perform the import
    if (mode === 'execute') {
      // Generate unique job ID
      const jobId = randomBytes(16).toString('hex');

      // Create import job record
      const job = new HsrImportJob({
        jobId,
        businessId,
        locationId,
        sourceLocationId,
        operation,
        fileName: body.fileName || 'hsr_opening_stock.xlsx',
        rowCount: masterResolution.records.length,
        status: 'RUNNING',
        startedAt: new Date(),
        finYear,
        dryRun,
        userId: session.id,
        userName: session.name || '',
        userEmail: session.email || '',
      });

      await job.save();

      if (dryRun) {
        job.status = 'COMPLETED';
        job.completedAt = new Date();
        job.result = {
          total: parseResult.summary.totalRows,
          inserted: 0,
          updated: 0,
          replaced: 0,
          added: 0,
          transferred: 0,
          skipped: parseResult.summary.totalRows,
          failed: 0,
        };
        job.reconciliation = reconciliationSummary;
        await job.save();

        return json({
          ok: true,
          mode: 'execute',
          dryRun: true,
          jobId,
          wouldExecute: true,
          reconciliation: reconciliationSummary,
          message: 'Dry run complete - no changes were made to the database',
        });
      }

      // Filter records that are ready for import
      const readyRecords = masterResolution.records.filter(r => !r.hasProblems);

      if (readyRecords.length === 0) {
        job.status = 'FAILED';
        job.completedAt = new Date();
        job.errors = masterResolution.records.flatMap(r => r.problems);
        await job.save();

        return json({
          ok: false,
          jobId,
          error: 'No valid records to import - all records have problems',
          problems: masterResolution.records.flatMap(r => r.problems),
        }, 422);
      }

      // Execute import with transaction
      let result;
      try {
        result = await withTransaction(async (session) => {
          return await executeHSRImport(readyRecords, operation, { ...scope, user: session }, session);
        });

        job.status = 'COMPLETED';
        job.completedAt = new Date();
        job.result = result;
        job.reconciliation = reconciliationSummary;
        await job.save();
      } catch (error) {
        job.status = 'FAILED';
        job.completedAt = new Date();
        job.errors = [{ message: error.message, stack: error.stack }];
        await job.save();

        return json({
          ok: false,
          jobId,
          error: error.message || 'Import failed',
          details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
        }, 500);
      }

      return json({
        ok: true,
        mode: 'execute',
        jobId,
        operation,
        targetLocation: location.name,
        result,
        reconciliation: reconciliationSummary,
      });
    }
  } catch (error) {
    console.error('HSR import error:', error);
    return json({
      error: error.message || 'Import failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, 500);
  }
});
