import { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { BarcodeLabel } from '@/lib/barcodeLabel';
import Item from '@/models/Item';
import ProductGroup from '@/models/ProductGroup';
import Uom from '@/models/Uom';
import Hsn from '@/models/Hsn';

/* /api/ecom-product - list only, read-only.

   The E-commerce catalogue: one row per item in the master, with its stock
   counted from the barcode rows generated against it.

   A NEW route on purpose: /api/ecom-setting already exists and holds the
   storefront's markup / COD / shipping configuration. It is a different thing
   and is not touched here. Nothing else was modified either - this route only
   reads Item, ProductGroup, Uom, Hsn and BarcodeLabel as they are.

   Nothing is written. There is no POST, PUT or DELETE.

   ---------------------------------------------------------------------------
   HOW STOCK IS JOINED, AND WHY IT IS MATCHED TWO WAYS.

   A barcode row records which item it belongs to in `itemCode`. In practice
   that field holds one of two things:

     - the item's ITEM CODE (7A3693), when the code was scanned and confirmed
       with Enter, so GCRBarcodeGeneration's lookup filled the row in; or
     - the item's NAME (15-S-ELI), when it was typed and never confirmed - the
       keystroke handler writes whatever was typed straight through.

   So a barcode row is matched to an item on EITHER field. Matching on
   itemCode alone silently reports zero stock for everything entered the
   second way, which is most of the seeded data.

   Stock is the number of barcode rows (a BATCH row carries its own quantity),
   so an item nobody has generated barcodes for reads 0.
   --------------------------------------------------------------------------- */

const json = (d, s = 200) => Response.json(d, { status: s });

const num = (v) => { const n = Number(v); return Number.isFinite(n) ? n : 0; };

const PER_PAGE = 10;

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const business = sp.get('business');

  /* Item is scoped by business only - it carries no location or finYear,
     like every other master in this project. */
  const filter = {};
  if (business) filter.businessId = business;

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ name: rx }, { itemCode: rx }, { prefix: rx }];
  }

  const total = await Item.countDocuments(filter);
  const items = await Item.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  /* ------------------------------------- resolve the page's references -- */
  const subGroupIds = [...new Set(items.map((i) => i.subGroupId).filter(Boolean).map(String))];
  const uomIds = [...new Set(items.map((i) => i.uomId).filter(Boolean).map(String))];
  const hsnIds = [...new Set(items.map((i) => i.hsnId).filter(Boolean).map(String))];

  const [subGroups, uoms, hsns] = await Promise.all([
    subGroupIds.length
      ? ProductGroup.find({ _id: { $in: subGroupIds } }).select('name parentId').lean() : [],
    uomIds.length ? Uom.find({ _id: { $in: uomIds } }).select('name shortName').lean() : [],
    hsnIds.length ? Hsn.find({ _id: { $in: hsnIds } }).select('code').lean() : [],
  ]);

  const subGroupById = new Map(subGroups.map((g) => [String(g._id), g]));
  const uomById = new Map(uoms.map((u) => [String(u._id), u]));
  const hsnById = new Map(hsns.map((h) => [String(h._id), h]));

  /* Group is the PARENT of the item's sub group. A sub group sitting at the
     top of the tree is its own group, which is why the deployed catalogue
     shows the same name in both columns for most rows. */
  const parentIds = [...new Set(
    subGroups.map((g) => g.parentId).filter(Boolean).map(String)
  )];
  const parents = parentIds.length
    ? await ProductGroup.find({ _id: { $in: parentIds } }).select('name').lean()
    : [];
  const parentName = new Map(parents.map((g) => [String(g._id), g.name || '']));

  /* ------------------------------------------------------------- stock -- */
  /* one query for the whole page, matching on either field - see the note at
     the top of this file */
  const keys = [...new Set(
    items.flatMap((i) => [i.itemCode, i.name]).filter(Boolean).map(String)
  )];

  /* Case matters here and must not: the master says "Maharanni" while the
     barcode rows say "maharanni". An anchored case-insensitive match on each
     key keeps the join honest without lower-casing stored data. */
  const stockFilter = {
    itemCode: { $in: keys.map((k) => new RegExp('^' + escapeRegex(k) + '$', 'i')) },
  };
  if (business) stockFilter.businessId = String(business);
  const finYear = sp.get('finYear');
  if (finYear) stockFilter.finYear = finYear;
  /* locationId on a barcode row is frequently blank, so a chosen location
     matches that location OR an unassigned one - filtering strictly would
     report zero stock for goods that are really there */
  const location = sp.get('location');
  if (location) stockFilter.locationId = { $in: [String(location), '', null] };

  const barcodes = keys.length
    ? await BarcodeLabel.find(stockFilter).select('itemCode qty').lean()
    : [];

  /* keyed lower-case for the same reason the query is case-insensitive */
  const stockByKey = new Map();
  barcodes.forEach((b) => {
    const key = String(b.itemCode || '').toLowerCase();
    if (!key) return;
    /* a UNIQUE row is one piece; a BATCH row carries the lot's quantity */
    stockByKey.set(key, num(stockByKey.get(key)) + (num(b.qty) || 1));
  });

  /* An item NAME is not unique - this database has 241 items all called
     "15-S-ELI". So barcode rows keyed by name cannot be attributed to one of
     them, and crediting every namesake would report the same 16 pieces 241
     times over.

     Count how many items share each of this page's names, and only fall back
     to the name when exactly one does. Where it is ambiguous the item reads 0,
     which is the truth: the stock exists, but not against a known item.

     aggregate() does not cast ids the way find() does, so businessId is
     converted explicitly - the same trap the dashboard hit. */
  const names = [...new Set(items.map((i) => i.name).filter(Boolean).map(String))];
  const nameCounts = names.length
    ? await Item.aggregate([
      {
        $match: {
          name: { $in: names },
          ...(business && isValidObjectId(business)
            ? { businessId: new Types.ObjectId(business) }
            : {}),
        },
      },
      { $group: { _id: { $toLower: '$name' }, n: { $sum: 1 } } },
    ])
    : [];
  const sharedName = new Map(nameCounts.map((r) => [String(r._id), r.n]));

  /* --------------------------------------------------------------- map -- */
  const rows = items.map((i) => {
    const sub = subGroupById.get(String(i.subGroupId));
    const uom = uomById.get(String(i.uomId));
    const hsn = hsnById.get(String(i.hsnId));

    const subGroupName = sub?.name || '';
    const groupName = (sub?.parentId && parentName.get(String(sub.parentId))) || subGroupName;

    /* itemCode is the reliable join. The name is used only when it points at
       exactly one item - see the note above stockByKey. */
    const code = String(i.itemCode || '').toLowerCase();
    const nm = String(i.name || '').toLowerCase();
    const byCode = stockByKey.get(code) || 0;
    const nameIsUnique = (sharedName.get(nm) || 0) === 1;
    const byName = nameIsUnique ? (stockByKey.get(nm) || 0) : 0;
    const stock = byCode || byName;

    return {
      _id: String(i._id),
      name: i.name || '',
      itemCode: i.itemCode || '',
      hsnCode: hsn?.code || '',
      group: groupName,
      subGroup: subGroupName,
      stock,
      uom: uom?.name || uom?.shortName || '',
    };
  });

  return json({
    rows,
    /* no ObjectId columns on this list, so nothing to resolve */
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}
