import { handler, json } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { readImportSessionMeta } from '@/lib/importSessionStore';
import { assertSessionOwner } from '@/lib/barcodeImportAccess';
import { sessionPreview } from '@/lib/barcodeMasterImportService';

/* GET /api/barcode-import/session?token=&sheet=&filter=&page=&perPage=
   The stored preview. Rows are paginated and filtered on the server; the
   complete analysis never leaves it. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RX = /^[a-f0-9]{48}$/;

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const token = String(sp.get('token') || '');
  if (!TOKEN_RX.test(token)) {
    return json({ error: 'This import session is not valid. Upload the workbook again.', code: 'BAD_IMPORT_TOKEN' }, 410);
  }

  const meta = await readImportSessionMeta(token);
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: meta.locationId });
  assertSessionOwner(meta, session);
  await dbConnect();

  const analysis = meta.analysis || {};
  const page = sessionPreview(meta, {
    sheet: sp.get('sheet') === 'master' ? 'master' : 'barcode',
    filter: sp.get('filter') || 'all',
    page: sp.get('page'),
    perPage: sp.get('perPage'),
    strategy: sp.get('strategy') || undefined,
  });

  return json({
    ok: true,
    token,
    scope: meta.scope,
    fileName: meta.fileName,
    finYear: meta.finYear,
    businessId: meta.businessId,
    locationId: meta.locationId,
    createdAt: meta.createdAt,
    execution: meta.execution || null,
    blocking: analysis.blocking || null,
    warnings: analysis.warnings || [],
    workbook: analysis.workbook || {},
    summary: analysis.summary || {},
    strategies: analysis.strategies || {},
    missingMasters: analysis.missingMasters || [],
    masterMappings: analysis.masterMappings || [],
    masterCreations: meta.masterCreations || [],
    business: analysis.business || null,
    barcode: {
      present: Boolean(analysis.barcode?.present),
      sheetName: analysis.barcode?.sheetName || '',
      headerRow: analysis.barcode?.headerRow || 0,
      headers: analysis.barcode?.headers || [],
    },
    master: {
      present: Boolean(analysis.master?.present),
      sheetName: analysis.master?.sheetName || '',
      headerRow: analysis.master?.headerRow || 0,
      headers: analysis.master?.headers || [],
    },
    page,
  });
});
