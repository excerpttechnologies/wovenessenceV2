import { requireSession } from '@/lib/session';
import { saveProductGalleryImage } from '@/lib/productGallery';

/* POST /api/product-eccom/gallery — multipart/form-data: file, sku
   Stores one website product photo for the e-commerce gallery and returns its
   public URL. The URL is written into ecommerceproduct.additionalImages by the
   existing Add/Edit form, so no separate gallery API is introduced. */

const json = (data, status = 200) => Response.json(data, { status });

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
  const sku = String(form.get('sku') || '').trim();
  if (!sku) return json({ error: 'Product code is required.' }, 422);
  if (!file || typeof file.arrayBuffer !== 'function') {
    return json({ error: 'No file received.' }, 400);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  try {
    const saved = await saveProductGalleryImage({
      sku,
      bytes,
      declaredMime: file.type || undefined,
    });
    return json({
      url: saved.url,
      name: file.name || '',
      size: saved.bytes,
      type: saved.mime,
    });
  } catch (error) {
    return json({ error: error?.message || 'Could not store that file.' }, error?.status || 500);
  }
}
