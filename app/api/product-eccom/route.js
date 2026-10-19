import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';

/* /api/product-eccom - list only, read-only (19-10-2026).

   Reads the `ecommerceproduct` collection that the separate e-commerce
   project writes (one row per published product, built from barcodeLabel).
   It is read through the raw driver - no Mongoose schema - on purpose: the
   e-commerce side is still adding fields, and a schema here would silently
   drop any field it does not list. Whatever is stored comes back as it is.

   ?fields=1 answers just the field names present in the collection, so the
   product-eccom page can build one column per field and a field added on the
   e-commerce side shows up without a change here.

   ?classifications=1 answers the business's productclassificationoption
   rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
   the choices the Add form offers for those lists.

   POST adds one product (the Add form). No PUT or DELETE. */

const json = (d, s = 200) => Response.json(d, { status: s });
const COLLECTION = 'ecommerceproduct';
const PER_PAGE = 10;
/* fields never shown as columns */
const HIDDEN = new Set(['_id', '__v']);

/* ObjectIds become their string, everything else is passed through */
function plain(value) {
  if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
  if (Array.isArray(value)) return value.map(plain);
  if (value instanceof Date) return value;
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
  }
  return value;
}

/* a business id may be stored as an ObjectId or as its string */
const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const col = mongoose.connection.db.collection(COLLECTION);

  const filter = {};
  const b = sp.get('business');
  if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

  /* the by* choices for the Add form, from productclassificationoption */
  if (sp.get('classifications') === '1') {
    const opts = await mongoose.connection.db.collection('productclassificationoption')
      .find({ ...filter, isActive: { $ne: false } })
      .sort({ type: 1, displayOrder: 1, name: 1 })
      .toArray();
    const byType = {};
    opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
    return json({ classifications: byType });
  }

  /* the field names actually present, in first-seen order */
  if (sp.get('fields') === '1') {
    const sample = await col.find(filter).limit(500).toArray();
    const seen = [];
    sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
    const types = {};
    sample.forEach((d) => seen.forEach((k) => {
      if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
      const v = d[k];
      types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
        : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
    }));
    return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
  }

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

  const search = (sp.get('search') || '').trim();
  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
  }

  /* column-header sort: any plain field name; newest first otherwise */
  const sortBy = sp.get('sortBy');
  const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
  const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
    ? { [sortBy]: dir, _id: 1 }
    : { createdAt: -1, _id: -1 };

  const total = await col.countDocuments(filter);
  const rows = await col.find(filter)
    .sort(sort)
    .collation({ locale: 'en', strength: 2, numericOrdering: true })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .toArray();

  return json({
    rows: rows.map((r) => ({ ...plain(r), _id: String(r._id) })),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

/* ---------------------------------------------------------------- add ---

   One product per item per business - the collection's own unique index
   (businessId + itemId). Every field the form sends is stored with the type
   the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
   ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
   know about are passed through as text, so a field added on the e-commerce
   side can be filled in here too. */
const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
const BOOL_FIELDS = new Set(['isFeatured', 'isPublished']);
const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const data = body.data || {};
  const business = body.business;
  if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
  if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
  if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

  await dbConnect();
  const col = mongoose.connection.db.collection(COLLECTION);

  const doc = {
    businessId: new Types.ObjectId(business),
    itemId: new Types.ObjectId(data.itemId),
  };
  Object.entries(data).forEach(([k, v]) => {
    if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
    if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
    else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
    else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
    else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
    else if (Array.isArray(v)) doc[k] = v;
    else doc[k] = v === null || v === undefined ? '' : String(v);
  });
  /* the shape the e-commerce project writes when a field is left empty */
  ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
  if (!doc.additionalImages) doc.additionalImages = [];
  if (!doc.status) doc.status = 'active';

  const exists = await col.findOne({ businessId: doc.businessId, itemId: doc.itemId }, { projection: { displayName: 1 } });
  if (exists) {
    const msg = 'This item already has an e-commerce product' + (exists.displayName ? ' ("' + exists.displayName + '")' : '') + '.';
    return json({ errors: { itemId: msg }, error: msg }, 409);
  }

  const now = new Date();
  doc.createdAt = now;
  doc.updatedAt = now;
  doc.__v = 0;
  try {
    const res = await col.insertOne(doc);
    return json({ ok: true, id: String(res.insertedId) });
  } catch (e) {
    if (e && e.code === 11000) return json({ error: 'This item already has an e-commerce product.' }, 409);
    throw e;
  }
}
