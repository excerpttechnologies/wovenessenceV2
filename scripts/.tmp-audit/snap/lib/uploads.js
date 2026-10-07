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
};
const MIME_BY_EXT = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([m, e]) => [e, m])
);

export const ALLOWED_MIME = Object.keys(EXT_BY_MIME);

export function extForMime(mime) {
  return EXT_BY_MIME[String(mime).toLowerCase()] || null;
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
