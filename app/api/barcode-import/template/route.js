import { isValidObjectId } from 'mongoose';
import { handler } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { requireAuthorizedScope } from '@/lib/locationAccess';
import { buildImportTemplate } from '@/lib/barcodeMasterImportService';
import { IMPORT_SCOPES } from '@/lib/barcodeMasterImportConstants';

/* GET /api/barcode-import/template?business=<id>&scope=<scope>
   The real workbook - Instructions, Barcode Import, Master Data and the
   existing-master reference sheet, with frozen headers, filters, text formats
   for barcodes and dropdowns where practical. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const businessId = String(sp.get('business') || '').trim();
  const scope = String(sp.get('scope') || IMPORT_SCOPES.BARCODE_MASTER);

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE);
  await dbConnect();
  const scopeAuth = await requireAuthorizedScope(session, {
    businessId: isValidObjectId(businessId) ? businessId : '',
  });
  const effectiveBusinessId = scopeAuth.businessId || businessId;

  const buffer = await buildImportTemplate({ businessId: effectiveBusinessId, scope });
  const names = {
    [IMPORT_SCOPES.BARCODE_MASTER]: 'barcode-master-data-import-template.xlsx',
    [IMPORT_SCOPES.BARCODE_STOCK]: 'barcode-stock-update-template.xlsx',
    [IMPORT_SCOPES.MASTER_DATA]: 'master-data-import-template.xlsx',
  };

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${names[scope] || 'barcode-import-template.xlsx'}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(buffer.length),
    },
  });
});
