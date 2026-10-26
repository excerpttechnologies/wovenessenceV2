import { handler, json } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { isValidObjectId } from 'mongoose';
import { createSessionFromWorkbook, analysisOverview } from '@/lib/barcodeMasterImportService';
import { MAX_FILE_BYTES, IMPORT_SCOPES } from '@/lib/barcodeMasterImportConstants';

/* POST /api/barcode-import/analyze  (multipart/form-data)
     business, location, finYear, scope, file

   The workbook is stored server-side under a token; the browser receives the
   analysis, never the parsed rows it could edit and post back. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const SCOPE_ALIASES = {
  barcode: IMPORT_SCOPES.BARCODE_MASTER,
  barcode_master: IMPORT_SCOPES.BARCODE_MASTER,
  stock: IMPORT_SCOPES.BARCODE_STOCK,
  barcode_stock: IMPORT_SCOPES.BARCODE_STOCK,
  master: IMPORT_SCOPES.MASTER_DATA,
  master_data: IMPORT_SCOPES.MASTER_DATA,
};

export const POST = handler(async (req) => {
  const form = await req.formData();
  const file = form.get('file');
  const businessId = String(form.get('business') || '').trim();
  const locationId = String(form.get('location') || '').trim();
  const finYear = String(form.get('finYear') || '').trim();
  const rawScope = String(form.get('scope') || '').trim();
  const scope = SCOPE_ALIASES[rawScope.toLowerCase()] || rawScope;

  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'Choose an .xlsx workbook to upload.', code: 'NO_FILE' }, 422);
  }
  if (!Object.values(IMPORT_SCOPES).includes(scope)) {
    return json({ error: 'Choose a valid import type.', code: 'BAD_SCOPE' }, 422);
  }
  if (!isValidObjectId(businessId)) {
    return json({ error: 'Choose the business this import belongs to.', code: 'BUSINESS_REQUIRED' }, 422);
  }
  if (!isValidObjectId(locationId)) {
    return json({ error: 'Choose the location this import belongs to.', code: 'LOCATION_REQUIRED' }, 422);
  }
  if (file.size > MAX_FILE_BYTES) {
    return json({ error: 'This workbook is larger than the 20 MB limit. Split it into smaller files.', code: 'FILE_TOO_LARGE' }, 413);
  }
  if (!/\.(xlsx|xlsm)$/i.test(file.name || '')) {
    return json({ error: 'Upload an Excel workbook (.xlsx). Save the template as .xlsx first.', code: 'BAD_FILE_TYPE' }, 422);
  }

  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId });
  await dbConnect();

  const buffer = Buffer.from(await file.arrayBuffer());
  const result = await createSessionFromWorkbook({
    buffer,
    fileName: file.name || 'barcode-import.xlsx',
    scope,
    businessId,
    locationId,
    finYear,
    user: session,
  });

  return json({
    ok: true,
    token: result.token,
    fileName: file.name || 'barcode-import.xlsx',
    fileHash: result.fileHash,
    scope,
    analysis: analysisOverview(result.analysis),
  });
});
