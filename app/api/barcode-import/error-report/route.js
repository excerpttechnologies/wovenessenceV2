import { handler, json } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { readImportSessionMeta } from '@/lib/importSessionStore';
import { assertSessionOwner, workbookFileName } from '@/lib/barcodeImportAccess';
import { getSessionErrorWorkbook } from '@/lib/barcodeMasterImportService';

/* GET /api/barcode-import/error-report?token=
   Row, barcode, item code, supplier code, sheet, failed field, value,
   message, suggested correction and status - for every row the import
   rejected or could not write. */
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

  const buffer = await getSessionErrorWorkbook(token);
  const name = workbookFileName(`${String(meta.fileName || 'import').replace(/\.xlsx$/i, '')}-validation`, 'import-validation');

  return new Response(buffer, {
    status: 200,
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${name}"`,
      'Cache-Control': 'no-store',
      'Content-Length': String(buffer.length),
    },
  });
});
