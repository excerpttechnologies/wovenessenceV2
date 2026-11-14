import crypto from 'crypto';
import fs from 'fs/promises';
import path from 'path';

/* ==========================================================================
   ERP product gallery storage.

   Website product photos are public by design (the storefront <img> tags must
   load them without an ERP session), so these files live outside the
   session-gated /api/files store and are served by /api/product-gallery/...

   Names are content hashes, so re-uploading the same photograph is idempotent
   and a user-supplied name never touches the filesystem.
   ========================================================================== */

export const PRODUCT_GALLERY_ROOT = process.env.PRODUCT_GALLERY_DIR
  ? path.resolve(process.env.PRODUCT_GALLERY_DIR)
  : path.resolve(process.env.UPLOAD_DIR || path.join(process.cwd(), 'uploads'), 'product-gallery');

export const PRODUCT_GALLERY_MAX_BYTES = 8 * 1024 * 1024;

const EXT_BY_MIME = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

const MIME_BY_EXT = Object.fromEntries(
  Object.entries(EXT_BY_MIME).map(([mime, ext]) => [ext, mime]),
);

/* One path segment: no separators, no "." / "..". */
export function isSafeGallerySegment(value) {
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,119}$/i.test(value) && value !== '.' && value !== '..';
}

function ascii(bytes, start, length) {
  let value = '';
  for (let index = start; index < start + length; index += 1) {
    value += String.fromCharCode(bytes[index] ?? 0);
  }
  return value;
}

/** Detects the real image type from magic bytes; the declared MIME is not trusted. */
export function sniffGalleryImageType(bytes) {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (
    bytes.length >= 8
    && bytes[0] === 0x89
    && ascii(bytes, 1, 3) === 'PNG'
    && bytes[4] === 0x0d
    && bytes[5] === 0x0a
    && bytes[6] === 0x1a
    && bytes[7] === 0x0a
  ) return 'image/png';
  if (bytes.length >= 12 && ascii(bytes, 0, 4) === 'RIFF' && ascii(bytes, 8, 4) === 'WEBP') return 'image/webp';
  return undefined;
}

export async function saveProductGalleryImage({ sku, bytes, declaredMime }) {
  if (!isSafeGallerySegment(sku)) {
    throw Object.assign(new Error('Invalid product code for an image upload'), { status: 400, code: 'INVALID_SKU' });
  }
  if (!bytes.length) {
    throw Object.assign(new Error('The uploaded file is empty.'), { status: 400, code: 'EMPTY_FILE' });
  }
  if (bytes.length > PRODUCT_GALLERY_MAX_BYTES) {
    throw Object.assign(
      new Error(`Each image must be ${Math.round(PRODUCT_GALLERY_MAX_BYTES / (1024 * 1024))} MB or smaller.`),
      { status: 413, code: 'FILE_TOO_LARGE' },
    );
  }

  const mime = sniffGalleryImageType(bytes);
  if (!mime) {
    throw Object.assign(new Error('Upload a JPEG, PNG or WebP image.'), { status: 415, code: 'UNSUPPORTED_IMAGE' });
  }
  if (declaredMime && declaredMime !== mime && !(declaredMime === 'image/jpg' && mime === 'image/jpeg')) {
    throw Object.assign(new Error('The file content does not match its image type.'), { status: 415, code: 'MIME_MISMATCH' });
  }

  const ext = EXT_BY_MIME[mime];
  const hash = crypto.createHash('sha256').update(bytes).digest('hex').slice(0, 48);
  const fileName = `${hash}.${ext}`;
  const directory = path.join(PRODUCT_GALLERY_ROOT, sku.toLowerCase());
  await fs.mkdir(directory, { recursive: true });
  const file = path.join(directory, fileName);
  try {
    await fs.writeFile(file, bytes, { flag: 'wx' });
  } catch (error) {
    if (error?.code !== 'EEXIST') throw error;
  }

  return {
    fileName,
    url: `/api/product-gallery/${encodeURIComponent(sku.toLowerCase())}/${fileName}`,
    mime,
    bytes: bytes.length,
  };
}

/** Resolves a public gallery URL back to a file, refusing traversal. */
export function resolveProductGalleryFile(segments) {
  if (!Array.isArray(segments) || segments.length !== 2) return null;
  const [sku, fileName] = segments;
  if (!isSafeGallerySegment(sku) || !isSafeGallerySegment(fileName)) return null;
  const root = path.resolve(PRODUCT_GALLERY_ROOT);
  const abs = path.resolve(root, sku.toLowerCase(), fileName);
  if (abs !== root && !abs.startsWith(root + path.sep)) return null;
  return abs;
}

export function mimeForGalleryFile(fileName) {
  const ext = path.extname(String(fileName)).slice(1).toLowerCase();
  return MIME_BY_EXT[ext] || 'application/octet-stream';
}
