import { requireSession } from '@/lib/session';
import {
  saveBuffer, extForMime, isAllowedMime, resolveUploadMime,
  ALLOWED_MIME, MAX_UPLOAD_BYTES,
} from '@/lib/uploads';

/* POST /api/upload  -  multipart/form-data with one field, `file`.

   Returns { url, name, size, type }. The `url` is what gets stored in the
   record - a short string, so Item.image and the waybill fields keep their
   existing String type.

   The type is taken from the browser's Content-Type and checked against an
   allowlist. That is a convenience check, not a security boundary: reads go
   back out through /api/files, which sets the content type from the stored
   extension and never echoes anything the client supplied. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  let form;
  try {
    form = await req.formData();
  } catch {
    return json({ error: 'Expected a multipart form upload.' }, 400);
  }

  const rawFiles = form.getAll('files').concat(form.getAll('file'));
  const validFiles = rawFiles.filter((f) => f && typeof f.arrayBuffer === 'function');

  if (!validFiles.length) {
    return json({ error: 'No file received.' }, 400);
  }

  const savedFiles = [];

  for (const file of validFiles) {
    if (!file.size) continue;

    const type = resolveUploadMime(file.type, file.name);
    if (!isAllowedMime(type)) {
      return json({
        error: `File "${file.name || 'unnamed'}" has an unsupported format. Accepted: `
          + ALLOWED_MIME.map(extForMime).join(', ') + '.',
      }, 415);
    }

    if (file.size > MAX_UPLOAD_BYTES) {
      return json({
        error: `File "${file.name || 'unnamed'}" exceeds the ${Math.round(MAX_UPLOAD_BYTES / (1024 * 1024))} MB limit.`,
      }, 413);
    }

    try {
      const buffer = Buffer.from(await file.arrayBuffer());
      if (buffer.length > MAX_UPLOAD_BYTES) {
        return json({ error: `File "${file.name || 'unnamed'}" is too large.` }, 413);
      }

      const saved = await saveBuffer(buffer, type);
      savedFiles.push({
        url: saved.url,
        name: file.name || '',
        size: saved.bytes,
        type,
      });
    } catch (e) {
      console.error('File storage error:', e);
      return json({ error: `Could not store "${file.name || 'file'}".` }, 500);
    }
  }

  if (!savedFiles.length) {
    return json({ error: 'No valid non-empty files received.' }, 400);
  }

  const first = savedFiles[0];
  return json({
    url: first.url,
    name: first.name,
    size: first.size,
    type: first.type,
    files: savedFiles,
  });
}
