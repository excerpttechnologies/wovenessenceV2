import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Item from '@/models/Item';
import EcommerceProduct from '@/models/EcommerceProduct';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { barcodeSearchPattern } from '@/lib/barcodeValue';
import {
  screenDenial, screenDenialAny, SCREENS, ACTIONS as PERM, ITEM_LOOKUP_SCREENS,
} from '@/lib/screenPermission';

/* Permission gate for this screen.

   READING THE ITEM LIST answers to Item read OR to any screen that resolves
   item codes - Print Label, Barcode Generation (reached from a GRC), GRT
   scanning and the till. See ITEM_LOOKUP_SCREENS in lib/screenPermission.js.

   Without that, gating Item read would stop a GRC operator scanning a code,
   which has nothing to do with administering the Item master. Writing still
   needs Item's own permission. */
const ITEM = { screen: SCREENS.ITEM, label: 'items' };

import { FIELDS } from '@/app/admin/inventory/item/fields';
import { sortedPage } from '@/lib/listSort';

/* /api/item - list + create. */

const json = (d, s = 200) => Response.json(d, { status: s });
const PER_PAGE = 10;
const LEGACY_ECOMMERCE_FIELDS = new Set([
  'ecommItemCode', 'productType', 'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
  'weaveDescription', 'fabricDescription', 'craftDescription', 'occasionDescription', 'colourDescription',
  'printDescriptionOverride', 'slug', 'seoTitle', 'seoDescription', 'ecommOffPercent',
  'barcodePriceOverride', 'barcodeQtyOverride', 'barcodeStatusOverride', 'isFeatured',
  'salesCount', 'displayName', 'additionalImages', 'isPublished', 'status',
]);
const itemFieldsOnly = (item) => Object.fromEntries(
  Object.entries(item).filter(([field]) => !LEGACY_ECOMMERCE_FIELDS.has(field))
);

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  /* Item read, or any screen that legitimately resolves item codes. */
  const denied = await screenDenialAny({
    session, screens: ITEM_LOOKUP_SCREENS, action: PERM.READ,
    businessId: sp.get('business'), label: 'items',
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  const barcodeImageByCode = {};
  const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    /* a barcode may be typed with or without the spaces around '*' */
    const barcodeRx = { $regex: barcodeSearchPattern(search), $options: 'i' };
    const barcodeRows = await BarcodeLabel.find({ $or: [{ barcodeGenerated: barcodeRx }, { oldBarcode: barcodeRx }] }).select('itemCode imageUrl').limit(100).lean();
    const barcodeCodes = barcodeRows.map((row) => row.itemCode).filter(Boolean);
    barcodeRows.forEach((row) => { if (row.itemCode && row.imageUrl) barcodeImageByCode[String(row.itemCode)] = row.imageUrl; });
    const ecommerceMatches = await EcommerceProduct.find({
      ...(filter.businessId ? { businessId: filter.businessId } : {}),
      ecommItemCode: rx,
    }).select('itemId').lean();
    filter.$or = [
      { name: rx }, { prefix: rx }, { itemCode: rx }, { description: rx },
      { _id: { $in: ecommerceMatches.map((product) => product.itemId) } },
    ];
    if (barcodeCodes.length) filter.$or.push({ itemCode: { $in: barcodeCodes } });
  }

  const total = await Item.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(Item, filter, sp, {
    page,
    perPage,
    keys: ['name', 'itemType', 'prefix', 'itemCode'],
    refs: ['hsnId', 'uomId', 'subGroupId'],
  })) ?? await Item.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...itemFieldsOnly(r), _id: String(r._id), image: r.image || barcodeImageByCode[String(r.itemCode)] || '' })),
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

  const denied = await screenDenial({
    session, ...ITEM, action: PERM.CREATE, businessId: body.business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const { errors, doc, ok } = validate(FIELDS, body.data || {});
  if (!ok) return json({ errors }, 422);
  if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  const created = await Item.create(doc);
  return json({ ok: true, id: String(created._id) });
}
