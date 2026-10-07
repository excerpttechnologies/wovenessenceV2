import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import BarcodeItem, { LABEL_FIELD } from '@/models/BarcodeItem';
import ProductImage from '@/models/ProductImage';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { imageUrl } from '@/lib/inventory';

const FIELDS = [];

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const filter = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
  const l = sp.get('location'); if (l && isValidObjectId(l)) filter.locationId = l;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [];
  }

  const total = await BarcodeItem.countDocuments(filter);
  const rows = await BarcodeItem.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  // Attach the staff-uploaded product photo (if any) for each row's barcode.
  // ProductImage lives in the same MongoDB database, written by the mobile
  // app backend when staff scan + upload a photo. Matched on
  // barcodeGenerated === BarcodeItem[LABEL_FIELD] ("barcodeNo").
  const barcodes = [...new Set(rows.map((r) => r[LABEL_FIELD]).filter(Boolean))];
  const imageByBarcode = {};
  if (barcodes.length) {
    const images = await ProductImage.find({ barcodeGenerated: { $in: barcodes } })
      .sort({ createdAt: -1 })
      .lean();
    // Images are newest-first, so the first one seen per barcode is the
    // most recently uploaded - keep only that one.
    for (const img of images) {
      if (!imageByBarcode[img.barcodeGenerated]) {
        imageByBarcode[img.barcodeGenerated] = img.imageUrl;
      }
    }
  }

  /* No staff upload for this barcode falls back to the photo shipped under
     public/ for it - same resolution order the till and the inventory list
     use, so one unit does not show a picture on one screen and a blank on
     another. */
  const rowsWithImages = rows.map((r) => ({
    ...r,
    _id: String(r._id),
    productImageUrl: imageUrl(imageByBarcode[r[LABEL_FIELD]] || '', r[LABEL_FIELD], r.oldBarcode),
  }));

  return json({
    rows: rowsWithImages,
    labels: await resolveRefLabels(rows),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json();
  await dbConnect();

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;
  if (body.location && isValidObjectId(body.location)) doc.locationId = body.location;

  const created = await BarcodeItem.create(doc);
  return json({ ok: true, id: String(created._id) });
}