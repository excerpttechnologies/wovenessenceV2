import crypto from 'crypto';
import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { handler, json } from '@/lib/apiError';
import {
  requirePermission, canUseLocation, can, PERMISSIONS,
} from '@/lib/rbac';
import Business from '@/models/Business';
import ItemWiseImportJob from '@/models/ItemWiseImportJob';
import {
  createImportSession, readImportSessionMeta, readImportSessionWorkbook, updateImportSession,
} from '@/lib/importSessionStore';
import { buildTemplateWorkbook, buildErrorWorkbook } from '@/lib/itemWiseSummaryImport';
import { analyzeBuffer, executeApprovedImport, MAX_CLIENT_ANALYSIS_ROWS } from '@/lib/itemWiseSummaryServer';
import { STRATEGIES, MAX_IMPORT_BYTES } from '@/lib/itemWiseSummaryConstants';

/* ==========================================================================
   ITEM WISE SUMMARY IMPORT API

   GET  /api/item-wise-summary-import?template=1        the 33-column template
   GET  /api/item-wise-summary-import?errors=<token>    row error workbook
   POST /api/item-wise-summary-import                   action:
        analyze  - upload + validate; creates the import session token
        preview  - filtered, paged rows from the stored analysis
        execute  - re-reads the stored upload, writes approved rows

   The browser never sends a prepared row list back for writing: execution
   always re-parses the uploaded workbook and re-resolves the masters, so a
   tampered preview cannot import something the operator did not see.
   ========================================================================== */

const ACTIONS = new Set(['analyze', 'preview', 'execute']);

function workbookResponse(buffer, fileName) {
  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'Cache-Control': 'no-store',
    },
  });
}

async function readBody(req) {
  const contentType = String(req.headers.get('content-type') || '');
  if (contentType.includes('multipart/form-data')) {
    const form = await req.formData();
    const file = form.get('file');
    const fields = {};
    form.forEach((value, key) => {
      if (key !== 'file') fields[key] = value;
    });
    let buffer = null;
    let fileName = '';
    if (file && typeof file === 'object' && typeof file.arrayBuffer === 'function') {
      buffer = Buffer.from(await file.arrayBuffer());
      fileName = file.name || '';
    }
    return { buffer, fileName, fields };
  }

  const body = await req.json().catch(() => ({}));
  let buffer = null;
  if (typeof body?.file === 'string' && body.file) {
    buffer = Buffer.from(body.file.replace(/^data:[^;]+;base64,/, ''), 'base64');
  }
  return { buffer, fileName: body?.fileName || '', fields: body || {} };
}

function parseApprovals(value) {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}

function strategyOf(value) {
  const text = String(value || '');
  if (Object.values(STRATEGIES).includes(text)) return text;
  return STRATEGIES.CREATE;
}

function clientAnalysis(analysis, { includeRows = false } = {}) {
  const rows = includeRows ? analysis.rows.slice(0, MAX_CLIENT_ANALYSIS_ROWS) : analysis.rows.slice(0, 100);
  return {
    layout: analysis.layout,
    layoutLabel: analysis.layoutLabel,
    sheetName: analysis.sheetName,
    headerRow: analysis.headerRow,
    strategy: analysis.strategy,
    summary: analysis.summary,
    filters: analysis.filters,
    locations: analysis.locations,
    missingMasters: analysis.missingMasters,
    duplicates: analysis.duplicates.slice(0, 100),
    warnings: analysis.warnings,
    preview: rows,
    previewTotal: analysis.rows.length,
    previewTruncated: includeRows ? analysis.rows.length > MAX_CLIENT_ANALYSIS_ROWS : analysis.rows.length > 100,
  };
}

export const GET = handler(async (req) => {
  const session = await requirePermission(PERMISSIONS.REPORTS_VIEW);
  void session;
  const search = new URL(req.url).searchParams;

  if (search.get('template') === '1') {
    const buffer = buildTemplateWorkbook();
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': 'attachment; filename="Item_Wise_Summary_Import_Template.xlsx"',
        'Cache-Control': 'no-store',
      },
    });
  }

  const token = String(search.get('errors') || '').trim();
  if (token) {
    const meta = await readImportSessionMeta(token);
    const analysis = meta.analysis || {};
    const buffer = buildErrorWorkbook({
      rows: analysis.rows || [],
      summary: analysis.summary || {},
    });
    return new Response(buffer, {
      status: 200,
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="Item_Wise_Summary_Import_Errors_${new Date().toISOString().slice(0, 10)}.xlsx"`,
        'Cache-Control': 'no-store',
      },
    });
  }

  return json({ error: 'Nothing requested. Use ?template=1 or ?errors=<token>.' }, 400);
});

export const POST = handler(async (req) => {
  const { buffer, fileName, fields } = await readBody(req);
  const action = String(fields.action || '').trim();
  if (!ACTIONS.has(action)) {
    return json({ error: 'Unknown import action. Use analyze, preview or execute.' }, 422);
  }

  await dbConnect();

  /* ------------------------------------------------------------- analyze -- */
  if (action === 'analyze') {
    const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE);

    const businessId = String(fields.business || '').trim();
    if (!businessId || !isValidObjectId(businessId)) {
      return json({ error: 'Select the business this workbook belongs to.' }, 422);
    }
    const business = await Business.findById(businessId).select('_id name').lean();
    if (!business) return json({ error: 'Business not found.' }, 422);

    const strategy = strategyOf(fields.strategy);
    if (strategy === STRATEGIES.CREATE && !can(session, PERMISSIONS.MASTERS_MANAGE)) {
      return json({ error: 'Your role can import with existing masters, but cannot create new masters.' }, 403);
    }

    if (!buffer || !buffer.length) {
      return json({ error: 'Choose an Excel workbook to validate.' }, 422);
    }
    if (buffer.length > MAX_IMPORT_BYTES) {
      return json({ error: `The workbook is larger than ${Math.round(MAX_IMPORT_BYTES / 1024 / 1024)} MB. Split it and import in parts.` }, 413);
    }
    const lower = String(fileName || '').toLowerCase();
    if (lower && !lower.endsWith('.xlsx') && !lower.endsWith('.xls')) {
      return json({ error: 'Upload an .xlsx file. The Item Wise Summary template is .xlsx.' }, 422);
    }

    const finYear = String(fields.finYear || '').trim();
    const approvals = parseApprovals(fields.approvals);
    const analyzed = await analyzeBuffer({
      buffer,
      fileName,
      businessId,
      finYear,
      strategy,
      approvals,
      locationAllowed: (locationId) => canUseLocation(session, locationId),
    });

    const priorJob = await ItemWiseImportJob.findOne({
      businessId,
      fileHash: analyzed.fileHash,
      status: { $in: ['COMPLETED', 'PARTIAL'] },
    }).select('jobId status completedAt summary').lean();

    const payload = clientAnalysis(analyzed.analysis);
    const meta = await createImportSession({
      buffer,
      fileName: fileName || 'Item_Wise_Summary.xlsx',
      scope: strategy,
      businessId,
      locationId: '',
      finYear,
      userId: session.id || session._id || '',
      userName: session.name || '',
      userEmail: session.email || '',
      fileHash: analyzed.fileHash,
      analysis: {
        ...payload,
        rows: analyzed.analysis.rows.slice(0, MAX_CLIENT_ANALYSIS_ROWS),
        priorJob: priorJob ? {
          jobId: priorJob.jobId,
          status: priorJob.status,
          completedAt: priorJob.completedAt,
        } : null,
      },
    });

    return json({
      ok: true,
      action,
      token: meta.token,
      fileName: meta.fileName,
      fileHash: analyzed.fileHash,
      business: { id: String(business._id), name: business.name || '' },
      priorJob: priorJob ? {
        jobId: priorJob.jobId,
        status: priorJob.status,
        completedAt: priorJob.completedAt,
        summary: priorJob.summary || {},
      } : null,
      ...payload,
    });
  }

  /* ------------------------------------------------------------- preview -- */
  if (action === 'preview') {
    await requirePermission(PERMISSIONS.BARCODE_GENERATE);
    const meta = await readImportSessionMeta(fields.token);
    const rows = meta.analysis?.rows || [];
    const filter = String(fields.filter || 'all');
    const page = Math.max(1, Number(fields.page) || 1);
    const pageSize = Math.min(200, Math.max(10, Number(fields.pageSize) || 50));

    const filtered = filter === 'all' ? rows : rows.filter((row) => row.status === filter);
    const start = (page - 1) * pageSize;
    return json({
      ok: true,
      rows: filtered.slice(start, start + pageSize),
      total: filtered.length,
      page,
      pageSize,
      pages: Math.max(1, Math.ceil(filtered.length / pageSize)),
      filters: meta.analysis?.filters || {},
      summary: meta.analysis?.summary || {},
    });
  }

  /* ------------------------------------------------------------- execute -- */
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE);
  const meta = await readImportSessionMeta(fields.token);
  const ownId = String(session.id || session._id || '');
  if (meta.userId && ownId && String(meta.userId) !== ownId && !can(session, PERMISSIONS.ADMIN_ALL)) {
    return json({ error: 'This import was validated by another user. Validate the workbook again.' }, 403);
  }
  const strategy = strategyOf(fields.strategy || meta.scope);
  if (strategy === STRATEGIES.CREATE && !can(session, PERMISSIONS.MASTERS_MANAGE)) {
    return json({ error: 'Your role cannot create new masters.' }, 403);
  }
  if (fields.confirm !== true && fields.confirm !== 'true') {
    return json({ error: 'Confirm the import after reviewing the preview.' }, 422);
  }
  const replaceStock = fields.replaceStock === true || fields.replaceStock === 'true';
  if (strategy === STRATEGIES.UPDATE && !replaceStock) {
    return json({ error: 'Tick "Replace existing stock" before running an update import.' }, 422);
  }

  const force = fields.force === true || fields.force === 'true';
  if (!force) {
    const priorJob = await ItemWiseImportJob.findOne({
      businessId: meta.businessId,
      fileHash: meta.fileHash,
      status: { $in: ['COMPLETED', 'PARTIAL'] },
    }).select('jobId status completedAt').lean();
    if (priorJob) {
      return json({
        error: `This workbook was already imported (job ${priorJob.jobId}). Tick "Re-run this workbook" to run it again; existing barcodes are skipped, not duplicated.`,
        code: 'ALREADY_IMPORTED',
        jobId: priorJob.jobId,
      }, 409);
    }
  }

  const workbook = await readImportSessionWorkbook(meta.token);
  const jobId = crypto.randomBytes(12).toString('hex');
  const job = await ItemWiseImportJob.create({
    jobId,
    businessId: meta.businessId,
    finYear: meta.finYear,
    strategy,
    fileName: meta.fileName,
    fileHash: meta.fileHash,
    status: 'RUNNING',
    summary: meta.analysis?.summary || {},
    userId: String(session.id || session._id || ''),
    userName: session.name || '',
    userEmail: session.email || '',
    startedAt: new Date(),
  });

  try {
    const { result, analysis } = await executeApprovedImport({
      buffer: workbook,
      fileName: meta.fileName,
      businessId: meta.businessId,
      finYear: meta.finYear,
      strategy,
      approvals: parseApprovals(fields.approvals),
      replaceStock,
      user: session,
      locationAllowed: (locationId) => canUseLocation(session, locationId),
      jobId,
      sheetName: meta.analysis?.sheetName || '',
    });

    const status = result.failed > 0
      ? (result.imported + result.updated > 0 ? 'PARTIAL' : 'FAILED')
      : 'COMPLETED';

    await ItemWiseImportJob.updateOne({ jobId }, {
      $set: {
        status,
        summary: result,
        mastersCreated: result.mastersCreatedByType || {},
        masterFailures: result.masterFailures || [],
        errors: result.errors || [],
        errorCount: result.errorCount || 0,
        completedAt: new Date(),
      },
    });

    await updateImportSession(meta.token, {
      execution: { jobId, status, result, executedAt: new Date().toISOString() },
    });

    return json({
      ok: status !== 'FAILED',
      action,
      jobId,
      status,
      result,
      summary: analysis.summary,
      filters: analysis.filters,
      missingMasters: analysis.missingMasters,
      locations: analysis.locations,
    }, status === 'FAILED' ? 422 : 200);
  } catch (error) {
    await ItemWiseImportJob.updateOne({ jobId }, {
      $set: {
        status: 'FAILED',
        errors: [{ message: error.message, code: error.code || 'IMPORT_FAILED' }],
        errorCount: 1,
        completedAt: new Date(),
      },
    });
    throw error;
  }
});
