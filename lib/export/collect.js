import { isSecretKey } from '../exportFields.js';
import { ExportEndpointError } from './registry.js';

/* ==========================================================================
   COLLECTING EVERY MATCHING ROW.

   The screen pages at 10 or 15 rows; an export must not. This walks the SAME
   list endpoint page by page - 500 rows a request - until the endpoint says
   there are no more pages. It follows the endpoint's reported perPage and
   pages rather than assuming the 500 it asked for was honoured, because many
   routes cap lower.

   Nothing is written to the database and every request carries the caller's
   own session, so the endpoint still applies the role, company and location
   rules it applies to the screen.
   ========================================================================== */

export const DEFAULT_EXPORT_PAGE = 1000;
export const DEFAULT_EXPORT_MAX = 100000;

export class ExportCollectError extends Error {
  constructor(message, status = 502, code = 'EXPORT_COLLECT') {
    super(message);
    this.name = 'ExportCollectError';
    this.status = status;
    this.code = code;
  }
}

const PAGE_PARAMS = new Set(['page', 'perPage', 'export', 'format', '_']);

export function sanitizeExportParams(params) {
  const out = {};
  if (!params || typeof params !== 'object' || Array.isArray(params)) return out;
  Object.entries(params).slice(0, 60).forEach(([key, value]) => {
    if (!key || PAGE_PARAMS.has(key)) return;
    if (!/^[A-Za-z0-9_.\-\[\]]+$/.test(key)) return;
    if (key.startsWith('$') || key.startsWith('__')) return;
    if (isSecretKey(key)) return;
    if (value === undefined || value === null || value === '') return;
    if (typeof value === 'string') {
      if (value.length > 500) return;
      out[key] = value;
      return;
    }
    if (typeof value === 'number' && Number.isFinite(value)) {
      out[key] = String(value);
      return;
    }
    if (typeof value === 'boolean') {
      out[key] = value ? '1' : '0';
    }
  });
  return out;
}

export function describeFilters(params) {
  const entries = Object.entries(sanitizeExportParams(params));
  if (!entries.length) return '(none)';
  return entries.map(([key, value]) => `${key}=${value}`).join(', ');
}

function pageCount(data, page, perPage, total) {
  const reported = Number(data?.pages);
  if (Number.isFinite(reported) && reported >= 1) return Math.floor(reported);
  if (Number.isFinite(total) && total > 0 && perPage > 0) return Math.max(1, Math.ceil(total / perPage));
  return null;
}

/* fetchPage({ page, perPage }) must return the parsed JSON of the list route,
   with the caller's filters already added. Injected so the batching can be
   tested without a running Next server. */
export async function collectListRows({
  fetchPage,
  perPage = DEFAULT_EXPORT_PAGE,
  maxRows = DEFAULT_EXPORT_MAX,
  maxPages = 5000,
} = {}) {
  if (typeof fetchPage !== 'function') throw new ExportCollectError('No page reader was supplied.', 500);

  const rows = [];
  const labels = {};
  const warnings = [];
  let page = 1;
  let pages = null;
  let total = 0;
  let servedPerPage = perPage;
  let truncated = false;
  let capped = false;
  let lastSignature = '';

  while (page <= maxPages) {
    const data = await fetchPage({ page, perPage });
    if (!data || typeof data !== 'object') {
      throw new ExportCollectError('The list endpoint returned an unreadable response.', 502);
    }
    if (!Array.isArray(data.rows)) {
      throw new ExportCollectError(
        'This endpoint does not return a list of records, so there is nothing to export in full.',
        422,
        'EXPORT_NOT_A_LIST',
      );
    }

    const received = data.rows;
    if (!received.length) break;

    /* A route that ignores `page` would otherwise loop forever. The signature
       of the first and last row is enough to notice the same page twice. */
    const signature = `${received.length}:${received[0]?._id || ''}:${received[received.length - 1]?._id || ''}`;
    if (signature === lastSignature) {
      warnings.push('The list endpoint returned the same page twice; the export stopped there.');
      break;
    }
    lastSignature = signature;

    rows.push(...received);
    if (data.labels && typeof data.labels === 'object') Object.assign(labels, data.labels);
    servedPerPage = Math.max(1, Number(data.perPage) || received.length || perPage);
    total = Number(data.total) || total || rows.length;
    if (data.capped) capped = true;

    if (rows.length > maxRows) {
      rows.length = maxRows;
      truncated = true;
      break;
    }

    pages = pageCount(data, page, servedPerPage, total);
    if (pages === null) {
      if (received.length < servedPerPage) break;
    } else if (page >= pages) {
      break;
    }
    page += 1;
  }

  if (page > maxPages && pages !== null && page <= pages) truncated = true;
  if (capped) warnings.push('One or more source collections reached a server-side cap; the export may not contain every underlying record.');
  if (truncated) {
    warnings.push(`The export stopped at ${maxRows.toLocaleString('en-IN')} rows. Narrow the filter to export the rest.`);
  }

  return {
    rows,
    labels,
    total: Math.max(total, rows.length),
    pages: pages || 1,
    truncated,
    capped,
    warnings,
  };
}

const OBJECT_ID = /^[0-9a-f]{24}$/i;

export function normalizeSelectedIds(ids) {
  if (!Array.isArray(ids)) return [];
  const seen = new Set();
  const out = [];
  ids.forEach((id) => {
    const value = String(id || '').trim();
    if (!OBJECT_ID.test(value) || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  });
  return out.slice(0, 5000);
}

/* Selected rows are read from each resource's own detail endpoint, not from
   the current page. This is why selecting a handful of suppliers on page one
   still exports their complete documents, including fields the list route
   might one day decide not to return.

   A detail route in this project answers { doc }, { row } or { rows: [ ... ] };
   all three are accepted. A 404 is skipped with a warning rather than failing
   the whole file, because a record can be deleted between selection and
   export. */
export async function collectSelectedRows({ ids, fetchOne, concurrency = 8 } = {}) {
  const selected = normalizeSelectedIds(ids);
  if (!selected.length) {
    return { rows: [], labels: {}, warnings: ['No valid selected record ids were supplied.'], missing: 0 };
  }
  if (typeof fetchOne !== 'function') throw new ExportCollectError('No record reader was supplied.', 500);

  const rows = [];
  const warnings = [];
  let missing = 0;
  let cursor = 0;

  async function worker() {
    while (cursor < selected.length) {
      const id = selected[cursor];
      cursor += 1;
      try {
        const data = await fetchOne(id);
        const doc = data?.doc || data?.row || (Array.isArray(data?.rows) ? data.rows[0] : null);
        if (!doc) { missing += 1; continue; }
        rows.push(doc);
      } catch (error) {
        if (error && (error.status === 404 || error.code === 'NOT_FOUND')) { missing += 1; continue; }
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: Math.min(concurrency, selected.length) }, worker));
  if (missing) warnings.push(`${missing} selected record${missing === 1 ? '' : 's'} could not be read (probably deleted) and ${missing === 1 ? 'was' : 'were'} left out.`);
  if (rows.length > 1) {
    /* The detail reads run concurrently, so their order is whichever finished
       first. Put them back in selection order for a predictable file. */
    const byId = new Map(rows.map((row) => [String(row._id), row]));
    const ordered = selected.map((id) => byId.get(id)).filter(Boolean);
    return { rows: ordered, labels: {}, warnings, missing };
  }
  return { rows, labels: {}, warnings, missing };
}

export function exportError(error) {
  if (error instanceof ExportEndpointError || error instanceof ExportCollectError) {
    return { status: error.status, body: { error: error.message, code: error.code } };
  }
  if (error && error.status && error.message) {
    return { status: error.status, body: { error: error.message, code: error.code || 'EXPORT' } };
  }
  return null;
}
