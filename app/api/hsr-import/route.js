import { isValidObjectId } from 'mongoose';
import { createHash, randomBytes } from 'crypto';
import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import Business from '@/models/Business';
import CompanyLocation from '@/models/CompanyLocation';
import HsrImportJob from '@/models/HsrImportJob';
import { parseHSRWorkbook } from '@/lib/hsrWorkbookImport';
import { resolveBatchHSRMasters, summarizeUnmatchedMasters } from '@/lib/hsrMasterResolution';
import {
  reconcileBatchWarehouseStock,
  generateReconciliationSummary,
  IMPORT_OPERATIONS,
} from '@/lib/hsrWarehouseReconciliation';
import { executeHSRImport } from '@/lib/hsrImportOperations';

/* ==========================================================================
   HSR EXCEL IMPORT API

   The browser uploads multipart/form-data (it always did), so this route
   reads FormData - never req.json(). A JSON body cannot carry the workbook and
   was the reason every HSR upload failed before any validation ran.

   analyze  - parse + resolve masters + reconcile stock, write nothing
   execute  - write barcodes and stock movements. The whole import is NOT
              wrapped in one transaction: each operation wraps its own chunks,
              so one bad row cannot roll back 20,000 good ones, and a retry can
              continue from what was already committed.
   ========================================================================== */

const MAX_BYTES = 40 * 1024 * 1024;
const OPERATIONS = Object.values(IMPORT_OPERATIONS);

const truthy = (value) => ['true', '1', 'on', 'yes'].includes(String(value || '').trim().toLowerCase());

const cleanId = (value) => String(value ?? '').trim();

export const POST = handler(async (req) => {
  const contentType = String(req.headers.get('content-type') || '');
  if (!contentType.toLowerCase().includes('multipart/form-data')) {
    return json({ error: 'Upload the HSR workbook as multipart/form-data' }, 422);
  }

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Could not read the uploaded form data' }, 422);
  }

  const mode = String(form.get('mode') || 'analyze') === 'execute' ? 'execute' : 'analyze';
  const dryRun = truthy(form.get('dryRun'));
  const operation = String(form.get('operation') || IMPORT_OPERATIONS.ADD_STOCK);
  const finYear = String(form.get('finYear') || '').trim();
  const sourceLocationId = cleanId(form.get('sourceLocation')) || null;

  if (!OPERATIONS.includes(operation)) {
    return json({ error: `Unknown import operation: ${operation}` }, 422);
  }

  const file = form.get('file');
  if (!file || typeof file === 'string' || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No Excel workbook was uploaded' }, 422);
  }
  if (file.size > MAX_BYTES) {
    return json({ error: 'The workbook is larger than 40 MB' }, 422);
  }

  const locationId = cleanId(form.get('location'));
  if (!locationId || !isValidObjectId(locationId)) {
    return json({ error: 'Select a valid target warehouse' }, 422);
  }

  /* Importing requires barcode generation permission, scoped to the target. */
  const auth = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId });
  await dbConnect();

  const location = await CompanyLocation.findById(locationId).select('name businessId').lean();
  if (!location) {
    return json({ error: 'Target warehouse not found' }, 422);
  }

  /* The workbook can be imported without sending a business id: the target
     warehouse already determines it. A supplied business must agree. */
  let businessId = cleanId(form.get('business')) || String(location.businessId || '');
  if (!businessId || !isValidObjectId(businessId)) {
    return json({ error: 'Could not determine the business for the target warehouse' }, 422);
  }
  if (!isValidObjectId(String(location.businessId)) || String(location.businessId) !== businessId) {
    return json({ error: 'Target warehouse does not belong to the selected business' }, 422);
  }

  const business = await Business.findById(businessId).select('_id').lean();
  if (!business) {
    return json({ error: 'Business not found' }, 422);
  }

  let sourceLocationName = null;
  if (sourceLocationId) {
    if (!isValidObjectId(sourceLocationId)) {
      return json({ error: 'Select a valid source warehouse' }, 422);
    }
    const sourceLocation = await CompanyLocation.findById(sourceLocationId).select('name businessId').lean();
    if (!sourceLocation) {
      return json({ error: 'Source warehouse not found' }, 422);
    }
    if (String(sourceLocation.businessId) !== businessId) {
      return json({ error: 'Source warehouse does not belong to the selected business' }, 422);
    }
    if (sourceLocationId === locationId) {
      return json({ error: 'Source and target warehouses must be different' }, 422);
    }
    sourceLocationName = sourceLocation.name || '';
  }

  let buffer;
  try {
    buffer = Buffer.from(await file.arrayBuffer());
  } catch {
    return json({ error: 'Could not read the uploaded workbook' }, 422);
  }
  if (!buffer.length) {
    return json({ error: 'The uploaded workbook is empty' }, 422);
  }

  let parseResult;
  try {
    parseResult = parseHSRWorkbook(buffer);
  } catch (error) {
    return json({ error: error.message || 'The workbook could not be parsed' }, 422);
  }

  /* Stable identity for every workbook line. A retry of the same file resolves
     to the same row even after a partial write, which is what makes stock
     opening idempotent instead of doubling the quantity. */
  const fileHash = createHash('sha256').update(buffer).digest('hex').slice(0, 16);
  const fileName = String(file.name || form.get('fileName') || 'hsr_opening_stock.xlsx');
  for (const record of parseResult.records) {
    record.fileHash = fileHash;
    record.fileName = fileName;
    record.clientRowId = `hsr:${fileHash}:${record.line}`;
  }

  const validRecords = parseResult.records.filter((r) => !r.hasProblems);
  const masterResolution = await resolveBatchHSRMasters(validRecords, businessId);

  const scope = {
    businessId,
    targetLocationId: locationId,
    sourceLocationId,
    finYear,
    stockPointId: cleanId(form.get('stockPoint')) || null,
  };

  const warehouseReconciliation = await reconcileBatchWarehouseStock(
    masterResolution.records,
    scope
  );
  const reconciliationSummary = generateReconciliationSummary(
    warehouseReconciliation.reconciliations,
    operation,
    scope
  );
  const reconciledRecords = warehouseReconciliation.reconciliations;
  const readyRecords = reconciledRecords.filter((r) => !r.hasProblems);
  const unmatched = masterResolution.unmatched || [];
  const assignmentSafety = await assignmentWarnings(scope);

  if (mode === 'analyze') {
    return json({
      ok: true,
      mode: 'analyze',
      operation,
      workbook: {
        fileName,
        sheetName: parseResult.analysis.sheetName,
        totalRows: parseResult.summary.totalRows,
        validRows: parseResult.summary.validRows,
        invalidRows: parseResult.summary.invalidRows,
        ignored: parseResult.summary.ignored,
        duplicates: 0,
      },
      masters: {
        matched: masterResolution.mastersMatched,
        unmatched: unmatched.slice(0, 200),
        unmatchedCount: unmatched.length,
        summary: summarizeUnmatchedMasters(unmatched),
        warnings: masterResolution.warnings.slice(0, 50),
      },
      reconciliation: {
        operation,
        operationLabel: operation,
        targetLocation: location.name,
        sourceLocation: sourceLocationName,
        summary: reconciliationSummary,
        safety: assignmentSafety,
      },
      records: {
        total: reconciledRecords.length,
        withProblems: reconciledRecords.filter((r) => r.hasProblems).length,
        ready: readyRecords.length,
        ignoredRows: parseResult.left.slice(0, 20),
        sample: reconciledRecords.slice(0, 10).map((r) => ({
          line: r.line,
          itemCode: r.values?.itemCode,
          itemName: r.values?.itemName,
          excelQty: r.values?.openQty,
          hasProblems: r.hasProblems,
          problems: (r.problems || []).slice(0, 3),
          warnings: (r.warnings || []).slice(0, 3),
        })),
      },
    });
  }

  /* ================================================================ execute */

  const jobId = randomBytes(16).toString('hex');
  const job = new HsrImportJob({
    jobId,
    businessId,
    locationId,
    sourceLocationId,
    operation,
    source: 'HSR',
    fileName,
    fileHash,
    rowCount: readyRecords.length,
    status: 'RUNNING',
    startedAt: new Date(),
    finYear,
    dryRun,
    userId: isValidObjectId(auth.id) ? auth.id : null,
    userName: auth.name || '',
    userEmail: auth.email || '',
  });
  await job.save();

  const reconciliationForJob = {
    totalExcelQty: reconciliationSummary.totalExcelQty || 0,
    totalExistingTargetQty: reconciliationSummary.totalExistingTargetQty || 0,
    totalProposedTargetQty: reconciliationSummary.totalProposedTargetQty || 0,
    itemsWithExistingStock: reconciliationSummary.itemsWithExistingStock || 0,
    itemsWithoutExistingStock: reconciliationSummary.itemsWithoutExistingStock || 0,
    itemsWithPriceDifferences: reconciliationSummary.itemsWithPriceDifferences || 0,
  };

  if (dryRun) {
    job.status = 'COMPLETED';
    job.completedAt = new Date();
    job.result = {
      total: readyRecords.length,
      inserted: 0,
      updated: 0,
      replaced: 0,
      added: 0,
      transferred: 0,
      skipped: readyRecords.length,
      failed: 0,
    };
    job.reconciliation = reconciliationForJob;
    await job.save();

    return json({
      ok: true,
      mode: 'execute',
      dryRun: true,
      jobId,
      operation,
      targetLocation: location.name,
      reconciliation: reconciliationSummary,
      safety: assignmentSafety,
      result: {
        total: readyRecords.length,
        inserted: 0,
        updated: 0,
        replaced: 0,
        added: 0,
        transferred: 0,
        skipped: readyRecords.length,
        failed: 0,
      },
      message: 'Dry run complete - no changes were made to the database',
    });
  }

  if (!readyRecords.length) {
    job.status = 'FAILED';
    job.completedAt = new Date();
    job.errors = reconciledRecords.flatMap((r) => r.problems || []).slice(0, 500);
    await job.save();

    return json({
      ok: false,
      jobId,
      error: 'No valid records to import - all records have problems',
      problems: reconciledRecords.flatMap((r) => r.problems || []).slice(0, 200),
    }, 422);
  }

  let result;
  try {
    result = await executeHSRImport(readyRecords, operation, scope, {
      id: auth.id,
      name: auth.name || auth.email || '',
      email: auth.email || '',
    });
  } catch (error) {
    job.status = 'FAILED';
    job.completedAt = new Date();
    job.errors = [{ message: error.message, line: error.line || null }];
    await job.save();

    return json({
      ok: false,
      jobId,
      error: error.message || 'Import failed',
      details: process.env.NODE_ENV === 'development' ? error.stack : undefined,
    }, 500);
  }

  const counts = {
    total: Number(result.total) || 0,
    inserted: Number(result.inserted) || 0,
    updated: Number(result.updated) || 0,
    replaced: Number(result.replaced) || 0,
    added: Number(result.added) || 0,
    transferred: Number(result.transferred) || 0,
    skipped: Number(result.skipped) || 0,
    failed: Number(result.failed) || 0,
    recovered: Number(result.recovered) || 0,
  };

  job.status = counts.failed > 0 ? 'PARTIAL' : 'COMPLETED';
  if (counts.failed > 0 && counts.total === counts.failed) job.status = 'FAILED';
  job.completedAt = new Date();
  job.result = counts;
  job.reconciliation = reconciliationForJob;
  job.errors = (result.failedDetails || []).slice(0, 500);
  job.warnings = (result.skippedDetails || []).slice(0, 200);
  await job.save();

  return json({
    ok: true,
    mode: 'execute',
    jobId,
    operation,
    targetLocation: location.name,
    reconciliation: reconciliationSummary,
    safety: assignmentSafety,
    result: counts,
    details: (result.details || []).slice(0, 200),
    skippedDetails: (result.skippedDetails || []).slice(0, 200),
    failedDetails: (result.failedDetails || []).slice(0, 500),
  });
});

/* Warnings that make an import surprising even when every master exists:
   a barcode series with no Barcode Setting, or a missing financial year. */
async function assignmentWarnings(scope) {
  const warnings = [];
  if (!scope.finYear) {
    warnings.push('Financial year is blank - barcodes and movements will be stored without one.');
  }
  return warnings;
}
