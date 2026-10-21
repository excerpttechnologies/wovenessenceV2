import { requireSession } from '@/lib/session';
import {
  saveBuffer, extForMime, ALLOWED_MIME, MAX_UPLOAD_BYTES,
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

  const file = form.get('file');
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file received.' }, 400);
  }

  const type = String(file.type || '').toLowerCase();
  if (!ALLOWED_MIME.includes(type)) {
    return json({
      error: 'That file type is not allowed. Accepted: '
        + ALLOWED_MIME.map(extForMime).join(', ') + '.',
    }, 415);
  }

  if (file.size > MAX_UPLOAD_BYTES) {
    return json({
      error: 'File is too large. The limit is '
        + Math.round(MAX_UPLOAD_BYTES / (1024 * 1024)) + ' MB.',
    }, 413);
  }

  try {
    const buffer = Buffer.from(await file.arrayBuffer());
    /* size is re-checked against what actually arrived rather than trusting
       the declared size on the part header */
    if (buffer.length > MAX_UPLOAD_BYTES) {
      return json({ error: 'File is too large.' }, 413);
    }

    const saved = await saveBuffer(buffer, type);
    return json({
      url: saved.url,
      name: file.name || '',
      size: saved.bytes,
      type,
    });
  } catch (e) {
    return json({ error: 'Could not store that file.' }, 500);
  }
}
