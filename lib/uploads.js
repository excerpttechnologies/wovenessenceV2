import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/* ==========================================================================
   Server-side file storage.

   Files live on disk, outside `public/`, and are served back through
   /api/files/... rather than statically. Three reasons for that:

     - `public/` is snapshotted at build time; anything written there at
       runtime is invisible to the build output and easy to lose on a deploy
     - reads go through a route, so they can require a session like every
       other endpoint in this app. Product photos and vendor invoice scans
       are not things to leave world-readable
     - the stored value in Mongo stays a short URL string, so `Item.image`
       and the waybill fields keep their existing String type

   Names are the sha256 of the content, so the same file uploaded twice is
   stored once, two different files can never collide, and a user-supplied
   name never touches the filesystem - which removes path traversal at the
   source rather than trying to sanitise it.

   Set UPLOAD_DIR to move the store somewhere else (a mounted volume, say).
   ========================================================================== */

export const UPLOAD_ROOT = process.env.UPLOAD_DIR
  ? path.resolve(process.env.UPLOAD_DIR)
  : path.join(process.cwd(), 'uploads');

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/* Allowlist, not a blocklist - anything not named here is refused. */
const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  /* Spreadsheets and plain text - the other document formats this ERP
     actually exchanges with suppliers, alongside the invoice PDFs and Word
     files it already took. Added for the record attachments on Delivery and
     GRT; every other caller of this module simply gains them too. */
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/csv': 'csv',
  'text/plain': 'txt',
};

/* Other spellings a browser may put on a type that IS in the list above.
   Windows reports a .csv as application/vnd.ms-excel from some machines and
   as application/csv from others; neither is wrong and both are the same
   file, and a .jpg arrives as image/jpg often enough to be worth naming.
   Kept apart from EXT_BY_MIME so inverting that map still yields exactly one
   canonical MIME per extension for mimeForStoredName. */
const MIME_ALIASES = {
  'image/jpg': 'image/jpeg',
  'image/pjpeg': 'image/jpeg',
  'application/csv': 'text/csv',
  'text/comma-separated-values': 'text/csv',
  'application/excel': 'application/vnd.ms-excel',
  'application/x-msexcel': 'application/vnd.ms-excel',
  'application/x-excel': 'application/vnd.ms-excel',
};

const MIME_BY_EXT = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m])
);

export const ALLOWED_MIME = Object.keys(EXT_BY_MIME);

/* A browser sends "text/csv; charset=utf-8" as readily as "text/csv", and
   case is not significant - so a type is reduced to its bare, lower-case,
   canonical spelling before anything compares it. */
export function canonicalMime(mime) {
  const bare = String(mime || '').toLowerCase().split(';')[0].trim();
  return MIME_ALIASES[bare] || bare;
}

export function isAllowedMime(mime) {
  return Object.prototype.hasOwnProperty.call(EXT_BY_MIME, canonicalMime(mime));
}

export function extForMime(mime) {
  return EXT_BY_MIME[canonicalMime(mime)] || null;
}

/* Which of the two kinds an upload is. The dialog offers "Document" and
   "Photo", and the record stores which one arrived so a photo can be shown
   as a thumbnail and a document as a file row without guessing from the name
   later. Decided from the MIME, never from the extension on the name. */
export function kindForMime(mime) {
  return canonicalMime(mime).startsWith('image/') ? 'photo' : 'document';
}

export const IMAGE_MIME = ALLOWED_MIME.filter((m) => m.startsWith('image/'));
export const DOCUMENT_MIME = ALLOWED_MIME.filter((m) => !m.startsWith('image/'));

/* THE TYPE AN UPLOAD IS STORED AS.

   The browser's own Content-Type first. When it says nothing useful - an
   empty string, or application/octet-stream, which is exactly what Windows
   reports for a .docx or .xlsx on a machine with no Office installed, and for
   any extension with no registry association - fall back to the extension on
   the name.

   The extension is NOT trusted, and this is not a hole. It can only select
   among the eleven types already on the allowlist: an unknown extension falls
   through to the useless type it came from and is refused. The stored file is
   still named by its own sha256, never by anything the operator typed, and
   /api/files still serves it as whatever that chosen type maps to. So the
   worst a misleading name achieves is to have its own bytes served back as
   one of the types this application already accepts - which is the same
   position as a correctly-named file.

   A declared type that is real but NOT on the allowlist is returned
   unchanged, so the caller refuses it and the error names what arrived. */
export function resolveUploadMime(declared, filename) {
  const canon = canonicalMime(declared);
  if (isAllowedMime(canon)) return canon;
  /* a browser that gave a definite - if unwelcome - answer is believed */
  if (canon && canon !== 'application/octet-stream') return canon;
  const ext = String(filename || '').split('.').pop().toLowerCase();
  return MIME_BY_EXT[ext] || canon;
}

export function mimeForStoredName(name) {
  const ext = path.extname(String(name)).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}

/* Content-addressed: <first two hex chars>/<full hash>.<ext>. The prefix
   directory keeps any single folder from growing to tens of thousands of
   entries, which some filesystems handle badly. */
export async function saveBuffer(buffer, mime) {
  const ext = extForMime(mime);
  if (!ext) throw new Error('Unsupported file type: ' + mime);

  const hash = crypto.createHash('sha256').update(buffer).digest('hex');
  const rel = path.posix.join(hash.slice(0, 2), hash + '.' + ext);
  const abs = path.join(UPLOAD_ROOT, hash.slice(0, 2), hash + '.' + ext);

  await fs.mkdir(path.dirname(abs), { recursive: true });

  /* identical content is already on disk - reuse it rather than rewrite */
  try {
    await fs.access(abs);
  } catch {
    await fs.writeFile(abs, buffer);
  }

  return { rel, url: '/api/files/' + rel, bytes: buffer.length };
}

/* Resolve a request path back to a real file, refusing anything that climbs
   out of the upload root. Returns null rather than throwing so the caller
   can answer 404 without distinguishing "missing" from "not allowed". */
export function resolveStored(segments) {
  if (!Array.isArray(segments) || !segments.length) return null;
  if (segments.some((s) => !s || s === '.' || s === '..' || s.includes('\0'))) return null;

  const abs = path.resolve(UPLOAD_ROOT, ...segments);
  const root = path.resolve(UPLOAD_ROOT);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}
