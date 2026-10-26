import { handler, json } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { isValidObjectId } from 'mongoose';
import { readImportSessionMeta } from '@/lib/importSessionStore';
import { assertSessionOwner } from '@/lib/barcodeImportAccess';
import {
  analysisOverview,
  saveSessionMappings,
  searchImportMasters,
} from '@/lib/barcodeMasterImportService';

/* GET /api/barcode-import/masters?business=&type=&q=
   Searches the selected business's real masters for the "Select existing
   master" dialog. Only matches leave the server. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RX = /^[a-f0-9]{48}$/;

export const GET = handler(async (req) => {
  const sp = new URL(req.url).searchParams;
  const businessId = String(sp.get('business') || '');
  const type = String(sp.get('type') || '');
  if (!isValidObjectId(businessId)) {
    return json({ error: 'Choose the business this import belongs to.', code: 'BUSINESS_REQUIRED' }, 422);
  }

  await requirePermission(PERMISSIONS.BARCODE_GENERATE);
  await dbConnect();

  const result = await searchImportMasters({
    businessId,
    type,
    q: sp.get('q') || '',
    limit: sp.get('limit') || 40,
  });
  return json({ ok: true, ...result });
});

/* POST /api/barcode-import/masters
     { token, mappings: [{ type, masterId, value, field, parent, fields, key }],
       removeKeys: [] }

   Persists explicit workbook-value -> master choices on the stored session,
   re-runs the analysis against the same workbook and returns the fresh
   preview. Nothing is imported here. */
export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || '');
  if (!TOKEN_RX.test(token)) {
    return json({ error: 'This import session is not valid. Upload the workbook again.', code: 'BAD_IMPORT_TOKEN' }, 410);
  }

  const meta = await readImportSessionMeta(token);
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: meta.locationId });
  assertSessionOwner(meta, session);
  await dbConnect();

  const result = await saveSessionMappings({
    token,
    mappings: Array.isArray(body?.mappings) ? body.mappings : [],
    removeKeys: Array.isArray(body?.removeKeys) ? body.removeKeys : [],
    user: session,
  });

  return json({
    ok: true,
    mappings: result.mappings,
    saved: result.saved,
    analysis: analysisOverview(result.analysis),
  });
});

/* DELETE is intentionally not offered: removing a mapping is expressed as a
   normal POST with removeKeys, so it takes the same ownership check and
   revalidates the workbook in the same step. */

export const PUT = handler(async () => json({ error: 'Use POST to save mappings.', code: 'METHOD_NOT_ALLOWED' }, 405));
