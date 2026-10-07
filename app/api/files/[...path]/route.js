import fs from 'fs/promises';
import { requireSession } from '@/lib/session';
import { resolveStored, mimeForStoredName } from '@/lib/uploads';

/* GET /api/files/<prefix>/<hash>.<ext>

   Serves a stored upload. Session-gated like the rest of the app - an
   <img src> is a same-origin request, so the cookie rides along and this is
   invisible in normal use, but the files are not world-readable.

   The content type comes from the stored extension, which was chosen by the
   server from an allowlist at upload time. Nothing the client ever supplied
   is echoed back in a header.

   Filenames are content hashes, so a given URL's bytes can never change -
   hence the immutable cache. */

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

  return new Response(data, {
    headers: {
      'Content-Type': mimeForStoredName(abs),
      'Content-Length': String(data.length),
      'Cache-Control': 'private, max-age=31536000, immutable',
      /* a stored PDF should render or download, never execute in our origin */
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; img-src 'self'; object-src 'none'",
    },
  });
}
