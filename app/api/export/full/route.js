import { requireSession } from '@/lib/session';
import { buildFullExportWorkbook } from '@/lib/export/workbook';
import {
  collectListRows,
  collectSelectedRows,
  describeFilters,
  exportError,
  sanitizeExportParams,
  ExportCollectError,
  DEFAULT_EXPORT_MAX,
  DEFAULT_EXPORT_PAGE,
} from '@/lib/export/collect';
import {
  labelForEndpoint,
  normalizeListEndpoint,
} from '@/lib/export/registry';
import { toFileBase } from '@/lib/exportFields';

export const dynamic = 'force-dynamic';

/* ==========================================================================
   POST /api/export/full

   One route for every list screen's "all fields" export. It does not contain
   a single resource's filter logic: it asks that resource's own list endpoint
   for the pages, forwarding the caller's cookie, so the file matches the
   screen's filters and the endpoint's permission / company / location rules.

   Request:
     {
       endpoint: '/api/supplier',
       params:   { business, location, finYear, search, ...filters },
       title:    'Supplier Master',
       fileBase: 'Supplier_Master',
       selectedIds: ['...']        // optional
     }

   Response: a real .xlsx workbook (see lib/export/workbook.js).
   ========================================================================== */

const MAX_BODY_BYTES = 100_000;

function jsonError(status, message, code = 'EXPORT') {
  return Response.json(
    { error: message, code },
    { status, headers: { 'Cache-Control': 'private, no-store' } },
  );
}

function appOrigin(req) {
  try {
    const url = new URL(req.url);
    if (url.origin && url.origin !== 'null') return url.origin;
  } catch { /* fall through */ }
  return process.env.NEXT_PUBLIC_APP_URL
    || `http://127.0.0.1:${process.env.PORT || 3000}`;
}

function maxRows() {
  const configured = Number(process.env.EXPORT_MAX_ROWS);
  if (!Number.isFinite(configured) || configured <= 0) return DEFAULT_EXPORT_MAX;
  return Math.min(500_000, Math.max(1000, Math.floor(configured)));
}

async function readJson(req) {
  const declared = Number(req.headers.get('content-length') || 0);
  if (declared > MAX_BODY_BYTES) {
    throw new ExportCollectError('The export request is too large.', 413, 'EXPORT_BODY');
  }
  try {
    return await req.json();
  } catch {
    throw new ExportCollectError('The export request was not valid JSON.', 400, 'EXPORT_BODY');
  }
}

function internalHeaders(req) {
  const headers = {
    accept: 'application/json',
    'x-requested-with': 'groo-full-export',
  };
  const cookie = req.headers.get('cookie');
  if (cookie) headers.cookie = cookie;
  return headers;
}

async function getJson(url, req) {
  const options = { headers: internalHeaders(req), cache: 'no-store' };
  /* Node 18+ supports AbortSignal.timeout. A hung internal request must not
     hold the export open forever. */
  try { options.signal = AbortSignal.timeout(90_000); } catch { /* older runtime */ }
  const response = await fetch(url, options);
  const data = await response.json().catch(() => ({}));
  return { response, data };
}

function fetchFailure(data, response, what) {
  const message = data?.error || `The ${what} refused the export (${response.status}).`;
  const status = response.status === 401 ? 401 : response.status === 403 ? 403 : 502;
  return new ExportCollectError(message, status, 'EXPORT_LIST');
}

export async function POST(req) {
  try {
    const session = await requireSession();
    if (!session) return jsonError(401, 'Unauthorized', 'UNAUTHORIZED');

    const body = await readJson(req);
    const endpoint = normalizeListEndpoint(body.endpoint);
    const params = sanitizeExportParams(body.params);
    const title = String(body.title || labelForEndpoint(endpoint)).slice(0, 120);
    const fileBase = toFileBase(body.fileBase || title);
    const origin = appOrigin(req);

    const selectedIds = Array.isArray(body.selectedIds) ? body.selectedIds : [];
    let collected;
    if (selectedIds.length) {
      collected = await collectSelectedRows({
        ids: selectedIds,
        fetchOne: async (id) => {
          const { response, data } = await getJson(`${origin}${endpoint}/${encodeURIComponent(id)}`, req);
          if (response.status === 404) return null;
          if (!response.ok) throw fetchFailure(data, response, 'record endpoint');
          return data;
        },
      });
    } else {
      collected = await collectListRows({
        maxRows: maxRows(),
        fetchPage: async ({ page, perPage }) => {
          const qs = new URLSearchParams();
          Object.entries(params).forEach(([key, value]) => qs.set(key, value));
          qs.set('page', String(page));
          qs.set('perPage', String(perPage || DEFAULT_EXPORT_PAGE));
          const { response, data } = await getJson(`${origin}${endpoint}?${qs.toString()}`, req);
          if (!response.ok) throw fetchFailure(data, response, 'list endpoint');
          return data;
        },
      });
    }

    const workbook = buildFullExportWorkbook({
      records: collected.rows,
      labels: collected.labels || {},
      meta: {
        title,
        fileBase,
        filters: describeFilters(params),
        warnings: collected.warnings || [],
        emptyMessage: 'No records matched the selected filters.',
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
        'X-Export-Truncated': collected.truncated ? '1' : '0',
      },
    });
  } catch (error) {
    const known = exportError(error);
    if (known) return jsonError(known.status, known.body.error, known.body.code);
    console.error('[export/full]', error);
    return jsonError(500, 'Could not build the export. Please retry.', 'INTERNAL');
  }
}
