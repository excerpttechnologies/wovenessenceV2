import fs from 'fs/promises';
import { resolveProductGalleryFile, mimeForGalleryFile } from '@/lib/productGallery';

/* GET /api/product-gallery/<sku>/<file>
   Public product photos. The storefront is a different origin and cannot carry
   an ERP session, so these are intentionally not session-gated (unlike
   /api/files, which holds invoices and other private documents). */

export async function GET(_req, { params }) {
  const { path: segments } = await params;
  const abs = resolveProductGalleryFile(segments);
  if (!abs) return new Response('Not found', { status: 404 });

  let data;
  try {
    data = await fs.readFile(abs);
  } catch {
    return new Response('Not found', { status: 404 });
  }

  return new Response(data, {
    headers: {
      'Content-Type': mimeForGalleryFile(abs),
      'Content-Length': String(data.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    },
  });
}
