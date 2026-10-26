import { handler } from '@/lib/apiError';
import dbConnect from '@/lib/db';
import { requirePermission, PERMISSIONS } from '@/lib/rbac';
import { readImportSessionMeta } from '@/lib/importSessionStore';
import { assertSessionOwner } from '@/lib/barcodeImportAccess';
import { executeImportSession } from '@/lib/barcodeMasterImportService';
import { STRATEGIES_BY_SCOPE, IMPORT_SCOPES } from '@/lib/barcodeMasterImportConstants';

/* POST /api/barcode-import/execute
     { token, strategy, replaceStock }

   Answers with NDJSON so the wizard can show real progress on a large
   workbook: one { type, ... } object per line, ending with `done` or
   `error`. Every count in the final line comes from writes that actually
   happened - not from the preview.

   A stock update is refused outright unless replaceStock === true, before a
   single write, so a missing confirmation can never silently overwrite
   quantities. */
export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const TOKEN_RX = /^[a-f0-9]{48}$/;

function line(controller, value) {
  const encoder = new TextEncoder();
  controller.enqueue(encoder.encode(JSON.stringify(value) + '\n'));
}

export const POST = handler(async (req) => {
  const body = await req.json().catch(() => ({}));
  const token = String(body?.token || '');
  const strategy = String(body?.strategy || '');
  const replaceStock = body?.replaceStock === true;

  if (!TOKEN_RX.test(token)) {
    return Response.json({ error: 'This import session is not valid. Upload the workbook again.', code: 'BAD_IMPORT_TOKEN' }, { status: 410 });
  }

  const meta = await readImportSessionMeta(token);
  const session = await requirePermission(PERMISSIONS.BARCODE_GENERATE, { locationId: meta.locationId });
  assertSessionOwner(meta, session);
  await dbConnect();

  if (meta.scope !== IMPORT_SCOPES.MASTER_DATA) {
    const allowed = STRATEGIES_BY_SCOPE[meta.scope] || [];
    if (!allowed.includes(strategy)) {
      return Response.json({ error: 'Choose one of the strategies offered for this import type.', code: 'BAD_STRATEGY' }, { status: 422 });
    }
  }
  if (meta.scope === IMPORT_SCOPES.BARCODE_STOCK && !replaceStock) {
    return Response.json({
      error: 'Tick "Replace existing stock quantities" before running a stock update. Nothing has been changed.',
      code: 'REPLACE_NOT_CONFIRMED',
    }, { status: 422 });
  }

  const stream = new ReadableStream({
    async start(controller) {
      let closed = false;
      const safeLine = (value) => {
        if (closed) return;
        try {
          line(controller, value);
        } catch {
          closed = true;
        }
      };
      try {
        const result = await executeImportSession({
          token,
          strategy,
          replaceStock,
          user: session,
          onProgress: safeLine,
        });
        safeLine({ type: 'complete', ...result });
      } catch (err) {
        safeLine({
          type: 'error',
          error: err?.message || 'The import failed.',
          code: err?.code || 'IMPORT_FAILED',
        });
      } finally {
        if (!closed) {
          try { controller.close(); } catch { /* client disconnected */ }
        }
      }
    },
  });

  return new Response(stream, {
    status: 200,
    headers: {
      'Content-Type': 'application/x-ndjson; charset=utf-8',
      'Cache-Control': 'no-store, no-transform',
      'X-Accel-Buffering': 'no',
    },
  });
});
