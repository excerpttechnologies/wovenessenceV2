import fs from 'fs/promises';
import path from 'path';
import { requireSession } from '@/lib/session';
import { resolveStored, mimeForStoredName } from '@/lib/uploads';

/* GET /api/files/<prefix>/<hash>.<ext>

   Serves a stored upload. Session-gated like the rest of the app - an
   <img src> is a same-origin request, so the cookie rides along and this is
   invisible in normal use, but the files are not world-readable.

   The content type comes from the stored extension, which was chosen by the
   server from an allowlist at upload time. Content-Disposition is set to
   inline to permit in-browser viewing for PDFs and images without forcing downloads. */

const json = (d, s = 200) => Response.json(d, { status: s });

export async function GET(req, { params }) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const { path: segments } = await params;
  const abs = resolveStored(segments);
  /* null means it tried to climb out of the upload root - answer the same
     404 as a genuinely missing file rather than confirming the difference */
  if (!abs) return json({ error: 'Not found' }, 404);

  let data;
  try {
    data = await fs.readFile(abs);
  } catch {
    return json({ error: 'Not found' }, 404);
  }

  const mime = mimeForStoredName(abs);
  const filename = path.basename(abs);

  const headers = {
    'Content-Type': mime,
    'Content-Length': String(data.length),
    'Content-Disposition': `inline; filename="${filename}"`,
    'Cache-Control': 'private, max-age=31536000, immutable',
    'X-Content-Type-Options': 'nosniff',
  };

  /* For PDFs, allow inline browser preview inside iframes and tabs */
  if (mime === 'application/pdf') {
    headers['Content-Security-Policy'] = "default-src 'self' blob:; object-src 'self' blob:; frame-ancestors 'self'";
  } else if (mime.startsWith('image/')) {
    headers['Content-Security-Policy'] = "default-src 'none'; img-src 'self' data: blob:; style-src 'unsafe-inline'";
  } else {
    headers['Content-Security-Policy'] = "default-src 'none'";
  }

  return new Response(data, { headers });
}
