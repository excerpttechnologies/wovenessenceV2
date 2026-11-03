import { requireSession } from '@/lib/session';
import { buildFullExportWorkbook } from '@/lib/export/workbook';
import { ExportCollectError, exportError } from '@/lib/export/collect';
import { toFileBase } from '@/lib/exportFields';

export const dynamic = 'force-dynamic';

/* ==========================================================================
   POST /api/export/rows

   For a screen whose data is not a database list endpoint - the GCR Barcode
   Generation grid is built and edited in the browser before it is saved - the
   full-field workbook still has to be a real .xlsx with a frozen header, an
   AutoFilter and text cells. This route accepts the rows the screen already
   holds and runs them through the same builder the list exports use.

   It reads and writes no database record. The row count and body size are
   capped so the endpoint cannot be used to make the server chew on an
   arbitrarily large request.
   ========================================================================== */

const MAX_ROWS = 50_000;
const MAX_BODY_BYTES = 30 * 1024 * 1024;

function jsonError(status, message, code = 'EXPORT_ROWS') {
  return Response.json(
    { error: message, code },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

async function readJson(req) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ExportCollectError('The rows are too large to export in one file. Narrow the selection.', 413, 'EXPORT_BODY');
  }
  try {
    return await req.json();
  } catch {
    throw new ExportCollectError('The export request was not valid JSON.', 400, 'EXPORT_BODY');
  }
}

export async function POST(req) {
  try {
    const session = await requireSession();
    if (!session) return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');

    const body = await readJson(req);
    const rows = Array.isArray(body.rows) ? body.rows : null;
    if (!rows) {
      throw new ExportCollectError('No rows were supplied for the export.', 400, 'EXPORT_ROWS');
    }
    if (rows.length > MAX_ROWS) {
      throw new ExportCollectError(
        `The screen holds more than ${MAX_ROWS.toLocaleString('en-IN')} rows; narrow it before exporting.`,
        413,
        'EXPORT_ROWS',
      );
    }

    const title = String(body.title || 'Export').slice(0, 120);
    const workbook = buildFullExportWorkbook({
      records: rows,
      labels: body.labels && typeof body.labels === 'object' ? body.labels : {},
      meta: {
        title,
        fileBase: toFileBase(body.fileBase || title),
        filters: typeof body.filters === 'string' ? body.filters.slice(0, 500) : '(screen contents)',
        warnings: Array.isArray(body.warnings)
          ? body.warnings.filter((w) => typeof w === 'string').slice(0, 20)
          : [],
        emptyMessage: 'The screen has no rows to export.',
      },
    });

    const bytes = new Uint8Array(workbook.buffer);
    return new Response(bytes, {
      status: 200,
      headers: {
        'Content-Type': workbook.mime,
        'Content-Disposition': `attachment; filename="${workbook.filename}"; filename*=UTF-8''${encodeURIComponent(workbook.filename)}`,
        'Content-Length': String(bytes.byteLength),
        'Cache-Control': 'private, no-store',
        'X-Export-Rows': String(workbook.rowCount),
        'X-Export-Columns': String(workbook.columnCount),
        'X-Export-Sheets': String(workbook.sheetNames.length),
      },
    });
  } catch (error) {
    const known = exportError(error);
    if (known) return jsonError(known.status, known.body.error, known.body.code);
    console.error('[export/rows]', error);
    return jsonError(500, 'Could not build the export. Please retry.', 'INTERNAL');
  }
}
