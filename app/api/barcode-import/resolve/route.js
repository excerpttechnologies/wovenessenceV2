import { handler, json } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { readImportSessionMeta } from '@/lib/importSessionStore';
import { assertSessionOwner } from '@/lib/barcodeImportAccess';
import { createSessionMasters, reanalyzeSession, analysisOverview } from '@/lib/barcodeMasterImportService';

/* POST /api/barcode-import/resolve
     { token, masters: [{ type, values }] }

   Creates masters typed into the preview's "Create missing master" dialog,
   then revalidates the SAME stored workbook and answers with the fresh
   analysis. This is the in-page alternative to filling the Master Data
   sheet, and it uses the identical validators and writer. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RX = /^[a-f0-9]{48}$/;

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

  /* { revalidate: true } re-reads the stored workbook without creating
     anything. The wizard uses it after the operator creates a master in
     another tab, so the preview is judged against the database as it is
     now, not as it was at upload. */
  if (body?.revalidate === true && !(Array.isArray(body?.masters) && body.masters.length)) {
    const analysis = await reanalyzeSession(token);
    return json({ ok: true, created: [], failed: [], analysis: analysisOverview(analysis), masterMappings: analysis.masterMappings || [] });
  }

  const result = await createSessionMasters({
    token,
    masters: Array.isArray(body?.masters) ? body.masters : [],
    user: session,
  });

  return json({
    ok: true,
    created: result.created,
    failed: result.failed,
    analysis: analysisOverview(result.analysis),
    masterMappings: result.analysis?.masterMappings || [],
  });
});
