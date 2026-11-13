// // // // // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // // // // import dbConnect from '@/lib/db';
// // // // // import { requireSession } from '@/lib/session';
// // // // // import { escapeRegex } from '@/lib/validate';

// // // // // /* /api/product-eccom - list only, read-only (19-10-2026).

// // // // //    Reads the `ecommerceproduct` collection that the separate e-commerce
// // // // //    project writes (one row per published product, built from barcodeLabel).
// // // // //    It is read through the raw driver - no Mongoose schema - on purpose: the
// // // // //    e-commerce side is still adding fields, and a schema here would silently
// // // // //    drop any field it does not list. Whatever is stored comes back as it is.

// // // // //    ?fields=1 answers just the field names present in the collection, so the
// // // // //    product-eccom page can build one column per field and a field added on the
// // // // //    e-commerce side shows up without a change here.

// // // // //    ?classifications=1 answers the business's productclassificationoption
// // // // //    rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
// // // // //    the choices the Add form offers for those lists.

// // // // //    POST adds one product (the Add form). No PUT or DELETE. */

// // // // // const json = (d, s = 200) => Response.json(d, { status: s });
// // // // // const COLLECTION = 'ecommerceproduct';
// // // // // const PER_PAGE = 10;
// // // // // /* fields never shown as columns */
// // // // // const HIDDEN = new Set(['_id', '__v']);

// // // // // /* ObjectIds become their string, everything else is passed through */
// // // // // function plain(value) {
// // // // //   if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
// // // // //   if (Array.isArray(value)) return value.map(plain);
// // // // //   if (value instanceof Date) return value;
// // // // //   if (value && typeof value === 'object') {
// // // // //     return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
// // // // //   }
// // // // //   return value;
// // // // // }

// // // // // /* a business id may be stored as an ObjectId or as its string */
// // // // // const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });

// // // // // export async function GET(req) {
// // // // //   const session = await requireSession();
// // // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // // //   const sp = new URL(req.url).searchParams;
// // // // //   await dbConnect();
// // // // //   const col = mongoose.connection.db.collection(COLLECTION);

// // // // //   const filter = {};
// // // // //   const b = sp.get('business');
// // // // //   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

// // // // //   /* the by* choices for the Add form, from productclassificationoption */
// // // // //   if (sp.get('classifications') === '1') {
// // // // //     const opts = await mongoose.connection.db.collection('productclassificationoption')
// // // // //       .find({ ...filter, isActive: { $ne: false } })
// // // // //       .sort({ type: 1, displayOrder: 1, name: 1 })
// // // // //       .toArray();
// // // // //     const byType = {};
// // // // //     opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
// // // // //     return json({ classifications: byType });
// // // // //   }

// // // // //   /* the field names actually present, in first-seen order */
// // // // //   if (sp.get('fields') === '1') {
// // // // //     const sample = await col.find(filter).limit(500).toArray();
// // // // //     const seen = [];
// // // // //     sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
// // // // //     const types = {};
// // // // //     sample.forEach((d) => seen.forEach((k) => {
// // // // //       if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
// // // // //       const v = d[k];
// // // // //       types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
// // // // //         : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
// // // // //     }));
// // // // //     return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
// // // // //   }

// // // // //   const page = Math.max(1, Number(sp.get('page') || 1));
// // // // //   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

// // // // //   const search = (sp.get('search') || '').trim();
// // // // //   if (search) {
// // // // //     const rx = { $regex: escapeRegex(search), $options: 'i' };
// // // // //     filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
// // // // //   }

// // // // //   /* column-header sort: any plain field name; newest first otherwise */
// // // // //   const sortBy = sp.get('sortBy');
// // // // //   const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
// // // // //   const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
// // // // //     ? { [sortBy]: dir, _id: 1 }
// // // // //     : { createdAt: -1, _id: -1 };

// // // // //   const total = await col.countDocuments(filter);
// // // // //   const rows = await col.find(filter)
// // // // //     .sort(sort)
// // // // //     .collation({ locale: 'en', strength: 2, numericOrdering: true })
// // // // //     .skip((page - 1) * perPage)
// // // // //     .limit(perPage)
// // // // //     .toArray();

// // // // //   return json({
// // // // //     rows: rows.map((r) => ({ ...plain(r), _id: String(r._id) })),
// // // // //     labels: {},
// // // // //     total,
// // // // //     page,
// // // // //     pages: Math.max(1, Math.ceil(total / perPage)),
// // // // //     perPage,
// // // // //   });
// // // // // }

// // // // // /* ---------------------------------------------------------------- add ---

// // // // //    One product per item per business - the collection's own unique index
// // // // //    (businessId + itemId). Every field the form sends is stored with the type
// // // // //    the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
// // // // //    ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
// // // // //    know about are passed through as text, so a field added on the e-commerce
// // // // //    side can be filled in here too. */
// // // // // const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
// // // // // const BOOL_FIELDS = new Set(['isFeatured', 'isPublished']);
// // // // // const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
// // // // // const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

// // // // // export async function POST(req) {
// // // // //   const session = await requireSession();
// // // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // // //   const body = await req.json().catch(() => ({}));
// // // // //   const data = body.data || {};
// // // // //   const business = body.business;
// // // // //   if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
// // // // //   if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
// // // // //   if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

// // // // //   await dbConnect();
// // // // //   const col = mongoose.connection.db.collection(COLLECTION);

// // // // //   const doc = {
// // // // //     businessId: new Types.ObjectId(business),
// // // // //     itemId: new Types.ObjectId(data.itemId),
// // // // //   };
// // // // //   Object.entries(data).forEach(([k, v]) => {
// // // // //     if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
// // // // //     if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
// // // // //     else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
// // // // //     else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
// // // // //     else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
// // // // //     else if (Array.isArray(v)) doc[k] = v;
// // // // //     else doc[k] = v === null || v === undefined ? '' : String(v);
// // // // //   });
// // // // //   /* the shape the e-commerce project writes when a field is left empty */
// // // // //   ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
// // // // //   if (!doc.additionalImages) doc.additionalImages = [];
// // // // //   if (!doc.status) doc.status = 'active';

// // // // //   const exists = await col.findOne({ businessId: doc.businessId, itemId: doc.itemId }, { projection: { displayName: 1 } });
// // // // //   if (exists) {
// // // // //     const msg = 'This item already has an e-commerce product' + (exists.displayName ? ' ("' + exists.displayName + '")' : '') + '.';
// // // // //     return json({ errors: { itemId: msg }, error: msg }, 409);
// // // // //   }

// // // // //   const now = new Date();
// // // // //   doc.createdAt = now;
// // // // //   doc.updatedAt = now;
// // // // //   doc.__v = 0;
// // // // //   try {
// // // // //     const res = await col.insertOne(doc);
// // // // //     return json({ ok: true, id: String(res.insertedId) });
// // // // //   } catch (e) {
// // // // //     if (e && e.code === 11000) return json({ error: 'This item already has an e-commerce product.' }, 409);
// // // // //     throw e;
// // // // //   }
// // // // // }





// // // // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';
// // // // import { escapeRegex } from '@/lib/validate';
// // // // import ProductImage from '@/models/ProductImage';
// // // // import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';

// // // // /* /api/product-eccom - list only, read-only (19-10-2026).

// // // //    Reads the `ecommerceproduct` collection that the separate e-commerce
// // // //    project writes (one row per published product, built from barcodeLabel).
// // // //    It is read through the raw driver - no Mongoose schema - on purpose: the
// // // //    e-commerce side is still adding fields, and a schema here would silently
// // // //    drop any field it does not list. Whatever is stored comes back as it is.

// // // //    ?fields=1 answers just the field names present in the collection, so the
// // // //    product-eccom page can build one column per field and a field added on the
// // // //    e-commerce side shows up without a change here.

// // // //    ?classifications=1 answers the business's productclassificationoption
// // // //    rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
// // // //    the choices the Add form offers for those lists.

// // // //    POST adds one product (the Add form). No PUT or DELETE. */

// // // // const json = (d, s = 200) => Response.json(d, { status: s });
// // // // const COLLECTION = 'ecommerceproduct';
// // // // const PER_PAGE = 10;
// // // // /* fields never shown as columns */
// // // // const HIDDEN = new Set(['_id', '__v']);

// // // // /* ObjectIds become their string, everything else is passed through */
// // // // function plain(value) {
// // // //   if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
// // // //   if (Array.isArray(value)) return value.map(plain);
// // // //   if (value instanceof Date) return value;
// // // //   if (value && typeof value === 'object') {
// // // //     return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
// // // //   }
// // // //   return value;
// // // // }

// // // // /* a business id may be stored as an ObjectId or as its string */
// // // // const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });
// // // // const itemCodeMapKey = (businessId, itemCode) =>
// // // //   `${String(businessId || '')}:${String(itemCode || '').trim().toLowerCase()}`;

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   await dbConnect();
// // // //   const col = mongoose.connection.db.collection(COLLECTION);

// // // //   const filter = {};
// // // //   const b = sp.get('business');
// // // //   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

// // // //   const barcode = (sp.get('barcodeLookup') || '').trim();
// // // //   if (barcode) {
// // // //     if (!b || !isValidObjectId(b)) return json({ error: 'Select a valid business before looking up a barcode.' }, 422);

// // // //     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
// // // //     const barcodeBusinessMatch = {
// // // //       $or: [
// // // //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// // // //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// // // //       ],
// // // //     };
// // // //     let barcodeRows = await barcodeCollection.find({
// // // //       $and: [barcodeBusinessMatch, inventoryBarcodeFilter(barcode)],
// // // //     }).limit(50).toArray();
// // // //     if (!barcodeRows.length) {
// // // //       const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
// // // //       barcodeRows = await barcodeCollection.find({
// // // //         $and: [
// // // //           barcodeBusinessMatch,
// // // //           {
// // // //             $or: [
// // // //               { barcodeGenerated: barcodeRx },
// // // //               { barcodeNo: barcodeRx },
// // // //               { oldBarcode: barcodeRx },
// // // //             ],
// // // //           },
// // // //         ],
// // // //       }).limit(50).toArray();
// // // //     }
// // // //     const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
// // // //       [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
// // // //         .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
// // // //     );
// // // //     if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

// // // //     const itemCollection = mongoose.connection.db.collection('item');
// // // //     const itemBusinessFilter = { businessId: idMatch(b) };
// // // //     let item = barcodeRow.itemId && isValidObjectId(String(barcodeRow.itemId))
// // // //       ? await itemCollection.findOne({ _id: new Types.ObjectId(String(barcodeRow.itemId)), ...itemBusinessFilter })
// // // //       : null;
// // // //     const possibleItemKeys = [...new Set([
// // // //       barcodeRow.itemCode,
// // // //       barcodeRow.itemName,
// // // //       barcodeRow.printDescription,
// // // //       barcodeRow.supplierDescription,
// // // //     ].map((value) => String(value || '').trim()).filter(Boolean))];
// // // //     if (!item && possibleItemKeys.length) {
// // // //       const exactMatches = possibleItemKeys.map((value) => {
// // // //         const escaped = escapeRegex(value);
// // // //         return [
// // // //           { itemCode: { $regex: `^${escaped}$`, $options: 'i' } },
// // // //           { name: { $regex: `^${escaped}$`, $options: 'i' } },
// // // //         ];
// // // //       }).flat();
// // // //       item = await itemCollection.findOne({
// // // //         ...itemBusinessFilter,
// // // //         $or: exactMatches,
// // // //       });
// // // //     }
// // // //     if (!item && barcodeRow.itemCode) {
// // // //       const linkedProduct = await col.findOne({
// // // //         businessId: idMatch(b),
// // // //         ecommItemCode: { $regex: `^${escapeRegex(String(barcodeRow.itemCode).trim())}$`, $options: 'i' },
// // // //       });
// // // //       if (linkedProduct?.itemId && isValidObjectId(String(linkedProduct.itemId))) {
// // // //         item = await itemCollection.findOne({
// // // //           _id: new Types.ObjectId(String(linkedProduct.itemId)),
// // // //           ...itemBusinessFilter,
// // // //         });
// // // //       }
// // // //     }
// // // //     if (!item) return json({ error: 'No inventory item is linked to this barcode.' }, 404);

// // // //     const [group, hsn, product] = await Promise.all([
// // // //       item.subGroupId && isValidObjectId(String(item.subGroupId))
// // // //         ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(item.subGroupId)) })
// // // //         : barcodeRow.groupId && isValidObjectId(String(barcodeRow.groupId))
// // // //           ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(barcodeRow.groupId)) })
// // // //           : barcodeRow.groupId
// // // //             ? mongoose.connection.db.collection('productgroup').findOne({
// // // //               $or: [
// // // //                 { name: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// // // //                 { prefix: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// // // //               ],
// // // //             })
// // // //             : null,
// // // //       item.hsnId && isValidObjectId(String(item.hsnId))
// // // //         ? mongoose.connection.db.collection('hsn').findOne({ _id: new Types.ObjectId(String(item.hsnId)) })
// // // //         : barcodeRow.hsn
// // // //           ? mongoose.connection.db.collection('hsn').findOne({ code: { $regex: `^${escapeRegex(String(barcodeRow.hsn).trim())}$`, $options: 'i' } })
// // // //         : null,
// // // //       col.findOne({ businessId: idMatch(b), itemId: { $in: [item._id, String(item._id)] } }),
// // // //     ]);
// // // //     const itemCode = item.itemCode || barcodeRow.itemCode || '';
// // // //     const defaultData = {
// // // //       displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
// // // //       ecommItemCode: itemCode,
// // // //       productType: item.itemType || '',
// // // //       printDescriptionOverride: barcodeRow.printDescription || item.description || barcodeRow.supplierDescription || '',
// // // //       ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
// // // //       barcodePriceOverride: Number(barcodeRow.retailPrice || item.rsp || barcodeRow.offerPrice) || 0,
// // // //       barcodeQtyOverride: Number(barcodeRow.qtyNum || barcodeRow.qty) || 0,
// // // //       status: 'active',
// // // //       isActive: true,
// // // //       isPublished: false,
// // // //       isFeatured: false,
// // // //     };
// // // //     const savedProduct = product ? plain(product) : {};

// // // //     return json({
// // // //       barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
// // // //       item: {
// // // //         id: String(item._id),
// // // //         itemCode,
// // // //         name: item.name || barcodeRow.itemName || '',
// // // //         itemType: item.itemType || '',
// // // //         group: group?.name || barcodeRow.groupId || '',
// // // //         hsnCode: hsn?.code || barcodeRow.hsn || '',
// // // //       },
// // // //       data: {
// // // //         ...defaultData,
// // // //         ...savedProduct,
// // // //         displayName: savedProduct.displayName || defaultData.displayName,
// // // //         ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
// // // //         productType: savedProduct.productType || defaultData.productType,
// // // //         printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
// // // //         ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
// // // //         barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
// // // //         barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
// // // //         status: savedProduct.status || defaultData.status,
// // // //       },
// // // //     });
// // // //   }

// // // //   /* the by* choices for the Add form, from productclassificationoption */
// // // //   if (sp.get('classifications') === '1') {
// // // //     const opts = await mongoose.connection.db.collection('productclassificationoption')
// // // //       .find({ ...filter, isActive: { $ne: false } })
// // // //       .sort({ type: 1, displayOrder: 1, name: 1 })
// // // //       .toArray();
// // // //     const byType = {};
// // // //     opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
// // // //     return json({ classifications: byType });
// // // //   }

// // // //   /* the field names actually present, in first-seen order */
// // // //   if (sp.get('fields') === '1') {
// // // //     const sample = await col.find(filter).limit(500).toArray();
// // // //     const seen = [];
// // // //     sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
// // // //     const types = {};
// // // //     sample.forEach((d) => seen.forEach((k) => {
// // // //       if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
// // // //       const v = d[k];
// // // //       types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
// // // //         : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
// // // //     }));
// // // //     return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
// // // //   }

// // // //   const page = Math.max(1, Number(sp.get('page') || 1));
// // // //   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

// // // //   const search = (sp.get('search') || '').trim();
// // // //   if (search) {
// // // //     const rx = { $regex: escapeRegex(search), $options: 'i' };
// // // //     filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
// // // //   }

// // // //   /* column-header sort: any plain field name; newest first otherwise */
// // // //   const sortBy = sp.get('sortBy');
// // // //   const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
// // // //   const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
// // // //     ? { [sortBy]: dir, _id: 1 }
// // // //     : { updatedAt: -1, createdAt: -1, _id: -1 };

// // // //   const total = await col.countDocuments(filter);
// // // //   const rows = await col.find(filter)
// // // //     .sort(sort)
// // // //     .collation({ locale: 'en', strength: 2, numericOrdering: true })
// // // //     .skip((page - 1) * perPage)
// // // //     .limit(perPage)
// // // //     .toArray();

// // // //   const classificationIds = [...new Set(rows.flatMap((row) =>
// // // //     ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
// // // //       .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
// // // //       .map((value) => String(value || ''))
// // // //       .filter(isValidObjectId)
// // // //   ))].map((id) => new Types.ObjectId(id));
// // // //   const classificationOptions = classificationIds.length
// // // //     ? await mongoose.connection.db.collection('productclassificationoption')
// // // //       .find({ _id: { $in: classificationIds } }, { projection: { name: 1 } })
// // // //       .toArray()
// // // //     : [];
// // // //   const classificationNameById = new Map(classificationOptions.map((option) => [
// // // //     String(option._id),
// // // //     option.name || '',
// // // //   ]));

// // // //   const itemIds = [...new Set(rows
// // // //     .map((row) => String(row.itemId || ''))
// // // //     .filter(isValidObjectId))]
// // // //     .map((id) => new Types.ObjectId(id));
// // // //   const itemFilter = { _id: { $in: itemIds } };
// // // //   if (b && isValidObjectId(b)) itemFilter.businessId = idMatch(b);
// // // //   const items = itemIds.length
// // // //     ? await mongoose.connection.db.collection('item')
// // // //       .find(itemFilter, { projection: { name: 1, itemCode: 1, image: 1 } })
// // // //       .toArray()
// // // //     : [];
// // // //   const itemById = new Map(items.map((item) => [String(item._id), item]));
// // // //   const businessIds = [...new Set(rows
// // // //     .map((row) => String(row.businessId || ''))
// // // //     .filter(isValidObjectId))]
// // // //     .map((id) => new Types.ObjectId(id));
// // // //   const businesses = businessIds.length
// // // //     ? await mongoose.connection.db.collection('business')
// // // //       .find({ _id: { $in: businessIds } }, { projection: { name: 1, businessPrintName: 1 } })
// // // //       .toArray()
// // // //     : [];
// // // //   const businessNameById = new Map(businesses.map((business) => [
// // // //     String(business._id),
// // // //     business.name || business.businessPrintName || '',
// // // //   ]));
// // // //   const itemCodes = [...new Set([
// // // //     ...items.map((item) => item.itemCode),
// // // //     ...rows.map((row) => row.ecommItemCode),
// // // //   ].map((value) => String(value || '').trim()).filter(Boolean))];
// // // //   const barcodeListFilter = {
// // // //     $or: [
// // // //       { itemId: { $in: [...itemIds, ...itemIds.map(String)] } },
// // // //       ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
// // // //     ],
// // // //   };
// // // //   if (b && isValidObjectId(b)) {
// // // //     barcodeListFilter.$and = [{
// // // //       $or: [
// // // //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// // // //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// // // //       ],
// // // //     }];
// // // //   }
// // // //   const barcodes = itemIds.length || itemCodes.length
// // // //     ? await mongoose.connection.db.collection('barcodeLabel')
// // // //       .find(barcodeListFilter, {
// // // //         projection: {
// // // //           itemId: 1,
// // // //           businessId: 1,
// // // //           currentBusinessId: 1,
// // // //           itemCode: 1,
// // // //           barcodeGenerated: 1,
// // // //           barcodeNo: 1,
// // // //           oldBarcode: 1,
// // // //           imageUrl: 1,
// // // //           filePath: 1,
// // // //         },
// // // //       })
// // // //       .collation({ locale: 'en', strength: 2 })
// // // //       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// // // //       .toArray()
// // // //     : [];
// // // //   const barcodeByItemId = new Map();
// // // //   const barcodeByItemCode = new Map();
// // // //   const imageByBarcode = new Map();
// // // //   const imageByItemId = new Map();
// // // //   const imageByItemCode = new Map();
// // // //   const barcodeValues = new Set();
// // // //   barcodes.forEach((barcode) => {
// // // //     const values = [barcode.barcodeGenerated, barcode.barcodeNo, barcode.oldBarcode]
// // // //       .map((value) => String(value || '').trim())
// // // //       .filter(Boolean);
// // // //     const value = values[0] || '';
// // // //     const itemId = barcode.itemId ? String(barcode.itemId) : '';
// // // //     if (itemId && value && !barcodeByItemId.has(itemId)) barcodeByItemId.set(itemId, value);
// // // //     values.forEach((barcodeValue) => barcodeValues.add(barcodeValue));
// // // //     const itemCodeKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// // // //     const currentItemCodeKey = itemCodeMapKey(barcode.currentBusinessId, barcode.itemCode);
// // // //     if (barcode.itemCode && value && !barcodeByItemCode.has(itemCodeKey)) {
// // // //       barcodeByItemCode.set(itemCodeKey, value);
// // // //     }
// // // //     if (barcode.itemCode && value && !barcodeByItemCode.has(currentItemCodeKey)) {
// // // //       barcodeByItemCode.set(currentItemCodeKey, value);
// // // //     }
// // // //     const storedImage = String(barcode.imageUrl || barcode.filePath || '').trim();
// // // //     const image = imageUrl(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
// // // //     if (!image) return;
// // // //     values.forEach((barcodeValue) => {
// // // //       const key = String(barcodeValue).trim().toLowerCase();
// // // //       if (key && !imageByBarcode.has(key)) imageByBarcode.set(key, image);
// // // //     });
// // // //     if (itemId && !imageByItemId.has(itemId)) imageByItemId.set(itemId, image);
// // // //     if (barcode.itemCode && !imageByItemCode.has(itemCodeKey)) imageByItemCode.set(itemCodeKey, image);
// // // //     if (barcode.itemCode && !imageByItemCode.has(currentItemCodeKey)) imageByItemCode.set(currentItemCodeKey, image);
// // // //   });
// // // //   rows.forEach((row) => {
// // // //     const value = String(row.barcode || '').trim();
// // // //     if (value) barcodeValues.add(value);
// // // //   });
// // // //   const productImageLookups = [
// // // //     ...[...barcodeValues].map((value) => ({
// // // //       barcodeGenerated: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
// // // //     })),
// // // //     ...itemCodes.map((value) => ({
// // // //       itemCode: { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' },
// // // //     })),
// // // //   ];
// // // //   const productImages = productImageLookups.length
// // // //     ? await ProductImage.find({ $or: productImageLookups })
// // // //       .sort({ createdAt: -1 })
// // // //       .select('barcodeGenerated itemCode imageUrl filePath')
// // // //       .lean()
// // // //     : [];
// // // //   const productImageBarcodes = new Set();
// // // //   productImages.forEach((productImage) => {
// // // //     const key = String(productImage.barcodeGenerated || '').trim().toLowerCase();
// // // //     const image = imageUrl(productImage.imageUrl || productImage.filePath || '');
// // // //     if (key && image && !productImageBarcodes.has(key)) {
// // // //       imageByBarcode.set(key, image);
// // // //       productImageBarcodes.add(key);
// // // //     }
// // // //     const itemCodeKey = String(productImage.itemCode || '').trim();
// // // //     if (image && itemCodeKey) {
// // // //       items.filter((item) =>
// // // //         String(item.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // // //       ).forEach((item) => {
// // // //         const mapKey = itemCodeMapKey(item.businessId, item.itemCode);
// // // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // // //       });
// // // //       rows.filter((row) =>
// // // //         String(row.ecommItemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // // //       ).forEach((row) => {
// // // //         const mapKey = itemCodeMapKey(row.businessId, row.ecommItemCode);
// // // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // // //       });
// // // //       barcodes.filter((barcode) =>
// // // //         String(barcode.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // // //       ).forEach((barcode) => {
// // // //         const mapKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// // // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // // //       });
// // // //     }
// // // //   });

// // // //   return json({
// // // //     rows: rows.map((r) => {
// // // //       const row = plain(r);
// // // //       const item = itemById.get(String(r.itemId));
// // // //       const businessName = businessNameById.get(String(r.businessId));
// // // //       const barcode = row.barcode
// // // //         || barcodeByItemId.get(String(r.itemId))
// // // //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// // // //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// // // //         || '';
// // // //       const productImage = [
// // // //         row.barcodeImage,
// // // //         row.barcodeImageUrl,
// // // //         row.productImageUrl,
// // // //         row.imageUrl,
// // // //         row.image,
// // // //         row.primaryImage,
// // // //         ...(Array.isArray(row.productImages) ? row.productImages : []),
// // // //         ...(Array.isArray(row.imageUrls) ? row.imageUrls : []),
// // // //         ...(Array.isArray(row.images) ? row.images : []),
// // // //         ...(Array.isArray(row.additionalImages)
// // // //           ? row.additionalImages
// // // //           : row.additionalImages ? [row.additionalImages] : []),
// // // //         item?.image,
// // // //       ].map((value) => {
// // // //         if (value && typeof value === 'object') {
// // // //           return value.url || value.imageUrl || value.src || value.path || '';
// // // //         }
// // // //         return value;
// // // //       }).find((value) => typeof value === 'string' && value.trim());
// // // //       return {
// // // //         ...row,
// // // //         ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
// // // //           `${key}Display`,
// // // //           (Array.isArray(r[key]) ? r[key] : [])
// // // //             .map((value) => classificationNameById.get(String(value)) || String(value || ''))
// // // //             .filter(Boolean)
// // // //             .join(', '),
// // // //         ])),
// // // //         barcode,
// // // //         barcodeImage: imageByBarcode.get(String(barcode).trim().toLowerCase())
// // // //           || imageByItemId.get(String(r.itemId))
// // // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// // // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// // // //           || (productImage ? imageUrl(productImage) : ''),
// // // //         businessName: businessName || '',
// // // //         itemLabel: item ? [item.itemCode, item.name].filter(Boolean).join(' - ') : '',
// // // //         ecommItemCode: row.ecommItemCode || item?.itemCode || '',
// // // //         _id: String(r._id),
// // // //       };
// // // //     }),
// // // //     labels: {},
// // // //     total,
// // // //     page,
// // // //     pages: Math.max(1, Math.ceil(total / perPage)),
// // // //     perPage,
// // // //   });
// // // // }

// // // // /* ---------------------------------------------------------------- add ---

// // // //    One product per item per business - the collection's own unique index
// // // //    (businessId + itemId). Every field the form sends is stored with the type
// // // //    the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
// // // //    ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
// // // //    know about are passed through as text, so a field added on the e-commerce
// // // //    side can be filled in here too. */
// // // // const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
// // // // const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished']);
// // // // const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
// // // // const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

// // // // export async function POST(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const body = await req.json().catch(() => ({}));
// // // //   const data = body.data || {};
// // // //   const business = body.business;
// // // //   if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
// // // //   if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
// // // //   if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

// // // //   await dbConnect();
// // // //   const col = mongoose.connection.db.collection(COLLECTION);

// // // //   const doc = {
// // // //     businessId: new Types.ObjectId(business),
// // // //     itemId: new Types.ObjectId(data.itemId),
// // // //   };
// // // //   Object.entries(data).forEach(([k, v]) => {
// // // //     if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
// // // //     if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
// // // //     else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
// // // //     else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
// // // //     else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
// // // //     else if (Array.isArray(v)) doc[k] = v;
// // // //     else doc[k] = v === null || v === undefined ? '' : String(v);
// // // //   });
// // // //   /* the shape the e-commerce project writes when a field is left empty */
// // // //   ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
// // // //   if (!doc.additionalImages) doc.additionalImages = [];
// // // //   if (!doc.status) doc.status = 'active';
// // // //   if (doc.isActive === undefined) doc.isActive = true;

// // // //   const now = new Date();
// // // //   doc.updatedAt = now;
// // // //   const productFilter = {
// // // //     businessId: idMatch(business),
// // // //     itemId: idMatch(data.itemId),
// // // //   };
// // // //   const existing = await col.findOne(productFilter, { projection: { _id: 1 } });
// // // //   if (existing) {
// // // //     const result = await col.updateOne(productFilter, { $set: doc });
// // // //     if (!result.matchedCount) {
// // // //       return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
// // // //     }
// // // //     return json({ ok: true, id: String(existing._id), updated: true });
// // // //   }

// // // //   doc.createdAt = now;
// // // //   doc.__v = 0;
// // // //   try {
// // // //     const res = await col.insertOne(doc);
// // // //     return json({ ok: true, id: String(res.insertedId) });
// // // //   } catch (e) {
// // // //     if (e && e.code === 11000) {
// // // //       const existingAfterRace = await col.findOne(productFilter, { projection: { _id: 1 } });
// // // //       if (!existingAfterRace) throw e;
// // // //       delete doc.createdAt;
// // // //       delete doc.__v;
// // // //       const result = await col.updateOne(productFilter, { $set: doc });
// // // //       if (!result.matchedCount) throw e;
// // // //       return json({ ok: true, id: String(existingAfterRace._id), updated: true });
// // // //     }
// // // //     throw e;
// // // //   }
// // // // }







// // // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';
// // // import { escapeRegex } from '@/lib/validate';
// // // import ProductImage from '@/models/ProductImage';
// // // import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';
// // // import ProductClassificationOption from '@/models/ProductClassificationOption';
// // // import { DUPATTA_FABRIC_OPTIONS } from '@/lib/productClassificationConstants';

// // // /* /api/product-eccom - list only, read-only (19-10-2026).

// // //    Reads the `ecommerceproduct` collection that the separate e-commerce
// // //    project writes (one row per published product, built from barcodeLabel).
// // //    It is read through the raw driver - no Mongoose schema - on purpose: the
// // //    e-commerce side is still adding fields, and a schema here would silently
// // //    drop any field it does not list. Whatever is stored comes back as it is.

// // //    ?fields=1 answers just the field names present in the collection, so the
// // //    product-eccom page can build one column per field and a field added on the
// // //    e-commerce side shows up without a change here.

// // //    ?classifications=1 answers the business's productclassificationoption
// // //    rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
// // //    the choices the Add form offers for those lists.

// // //    ?barcodeOptions=1 returns a bounded, business-scoped barcode search for
// // //    the Add form's barcode picker.

// // //    POST adds one product (the Add form). No PUT or DELETE. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });
// // // const COLLECTION = 'ecommerceproduct';
// // // const PER_PAGE = 10;
// // // const DEPLOYED_IMAGE_ORIGIN = 'https://erp.wovenessence.in';
// // // /* fields never shown as columns */
// // // const HIDDEN = new Set(['_id', '__v']);

// // // const normalizedFabricText = (value) => String(value || '')
// // //   .normalize('NFKD')
// // //   .replace(/[\u0300-\u036f]/g, '')
// // //   .toLowerCase()
// // //   .replace(/[^a-z0-9]+/g, ' ')
// // //   .trim();

// // // function matchDupattaFabric(values) {
// // //   const sourceText = values.map(normalizedFabricText).filter(Boolean).join(' ');
// // //   return DUPATTA_FABRIC_OPTIONS.find((name) => {
// // //     const normalizedName = normalizedFabricText(name);
// // //     const distinctiveName = normalizedName.replace(/\b(silk|dupatta)\b/g, '').trim();
// // //     return sourceText.includes(normalizedName)
// // //       || (distinctiveName && new RegExp(`\\b${escapeRegex(distinctiveName)}\\b`).test(sourceText));
// // //   }) || '';
// // // }

// // // function classificationTextValues(record) {
// // //   if (!record || typeof record !== 'object') return [];
// // //   return Object.entries(record)
// // //     .filter(([key]) => /^(?:displayName|printDescription|printDescriptionOverride|supplierDescription|itemName|description|fabric|fabricName|fabricDescription)$/i.test(key))
// // //     .flatMap(([, value]) => Array.isArray(value) ? value : [value])
// // //     .filter((value) => typeof value === 'string' || typeof value === 'number');
// // // }

// // // function productImageSource(value, ...barcodes) {
// // //   const source = imageUrl(value, ...barcodes);
// // //   return source.startsWith('/august_8A_images/')
// // //     ? `${DEPLOYED_IMAGE_ORIGIN}${source}`
// // //     : source;
// // // }

// // // /* ObjectIds become their string, everything else is passed through */
// // // function plain(value) {
// // //   if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
// // //   if (Array.isArray(value)) return value.map(plain);
// // //   if (value instanceof Date) return value;
// // //   if (value && typeof value === 'object') {
// // //     return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
// // //   }
// // //   return value;
// // // }

// // // /* a business id may be stored as an ObjectId or as its string */
// // // const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });
// // // const itemCodeMapKey = (businessId, itemCode) =>
// // //   `${String(businessId || '')}:${String(itemCode || '').trim().toLowerCase()}`;

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   await dbConnect();
// // //   const col = mongoose.connection.db.collection(COLLECTION);

// // //   const filter = {};
// // //   const b = sp.get('business');
// // //   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

// // //   if (sp.get('barcodeOptions') === '1') {
// // //     if (!b || !isValidObjectId(b)) {
// // //       return json({ error: 'Select a valid business before searching barcodes.' }, 422);
// // //     }
// // //     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
// // //     const barcodeBusinessMatch = {
// // //       $or: [
// // //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// // //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// // //       ],
// // //     };
// // //     const search = (sp.get('search') || '').trim();
// // //     const codeMatch = search
// // //       ? {
// // //         $or: ['barcodeNo', 'barcodeGenerated', 'oldBarcode'].map((field) => ({
// // //           [field]: { $regex: escapeRegex(search), $options: 'i' },
// // //         })),
// // //       }
// // //       : null;
// // //     const scopedQuery = codeMatch
// // //       ? { $and: [barcodeBusinessMatch, codeMatch] }
// // //       : barcodeBusinessMatch;
// // //     let barcodeRows = await barcodeCollection.find(scopedQuery)
// // //       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// // //       .limit(50)
// // //       .toArray();

// // //     if (!barcodeRows.length && search) {
// // //       const legacyRows = await barcodeCollection.find(codeMatch)
// // //         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// // //         .limit(100)
// // //         .toArray();
// // //       const itemIds = [...new Set(legacyRows
// // //         .map((row) => String(row.itemId || ''))
// // //         .filter(isValidObjectId))]
// // //         .map((id) => new Types.ObjectId(id));
// // //       const itemKeys = [...new Set(legacyRows
// // //         .flatMap((row) => [row.itemCode, row.itemName])
// // //         .map((value) => String(value || '').trim())
// // //         .filter(Boolean))];
// // //       const itemMatches = [
// // //         ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// // //         ...itemKeys.flatMap((value) => {
// // //           const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
// // //           return [{ itemCode: exact }, { name: exact }];
// // //         }),
// // //       ];
// // //       const linkedItems = itemMatches.length
// // //         ? await mongoose.connection.db.collection('item')
// // //           .find({ businessId: idMatch(b), $or: itemMatches })
// // //           .project({ _id: 1, itemCode: 1, name: 1 })
// // //           .toArray()
// // //         : [];
// // //       const linkedIds = new Set(linkedItems.map((item) => String(item._id)));
// // //       const linkedKeys = new Set(linkedItems.flatMap((item) =>
// // //         [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
// // //       ));
// // //       barcodeRows = legacyRows.filter((row) =>
// // //         (row.itemId && linkedIds.has(String(row.itemId)))
// // //         || [row.itemCode, row.itemName].some((value) =>
// // //           value && linkedKeys.has(String(value).trim().toLowerCase()))
// // //       );
// // //     }

// // //     const options = new Map();
// // //     barcodeRows.forEach((row) => {
// // //       const value = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
// // //       if (!value) return;
// // //       const key = value.toLowerCase();
// // //       if (!options.has(key)) {
// // //         options.set(key, {
// // //           value,
// // //           label: [value, row.itemCode || row.itemName].filter(Boolean).join(' - '),
// // //         });
// // //       }
// // //     });
// // //     return json({ options: [...options.values()] });
// // //   }

// // //   const barcode = (sp.get('barcodeLookup') || '').trim();
// // //   if (barcode) {
// // //     if (!b || !isValidObjectId(b)) return json({ error: 'Select a valid business before looking up a barcode.' }, 422);

// // //     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
// // //     const barcodeBusinessMatch = {
// // //       $or: [
// // //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// // //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// // //       ],
// // //     };
// // //     const findBarcodeRows = async (businessFilter = {}) => {
// // //       let rows = await barcodeCollection.find({
// // //         $and: [businessFilter, inventoryBarcodeFilter(barcode)],
// // //       }).limit(50).toArray();
// // //       if (rows.length) return rows;

// // //       const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
// // //       return barcodeCollection.find({
// // //         $and: [
// // //           businessFilter,
// // //           {
// // //             $or: [
// // //               { barcodeGenerated: barcodeRx },
// // //               { barcodeNo: barcodeRx },
// // //               { oldBarcode: barcodeRx },
// // //             ],
// // //           },
// // //         ],
// // //       }).limit(50).toArray();
// // //     };
// // //     let barcodeRows = await findBarcodeRows(barcodeBusinessMatch);
// // //     const itemCollection = mongoose.connection.db.collection('item');
// // //     const itemBusinessFilter = { businessId: idMatch(b) };

// // //     /* Legacy barcode rows can retain their originating business even after
// // //        their linked inventory item has moved. Accept those only when that
// // //        item is confirmed to belong to the selected business. */
// // //     if (!barcodeRows.length) {
// // //       const allBarcodeRows = await findBarcodeRows();
// // //       if (allBarcodeRows.length) {
// // //         const itemIds = [...new Set(allBarcodeRows
// // //           .map((row) => String(row.itemId || ''))
// // //           .filter(isValidObjectId)
// // //           .map((id) => new Types.ObjectId(id)))];
// // //         const itemCodes = [...new Set(allBarcodeRows
// // //           .map((row) => String(row.itemCode || '').trim())
// // //           .filter(Boolean))];
// // //         const itemMatches = [
// // //           ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// // //           ...itemCodes.map((code) => ({
// // //             itemCode: { $regex: `^${escapeRegex(code)}$`, $options: 'i' },
// // //           })),
// // //         ];
// // //         const linkedItems = itemMatches.length
// // //           ? await itemCollection.find({ ...itemBusinessFilter, $or: itemMatches }).toArray()
// // //           : [];
// // //         const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
// // //         const linkedItemCodes = new Set(linkedItems.map((item) =>
// // //           String(item.itemCode || '').trim().toLowerCase()));
// // //         barcodeRows = allBarcodeRows.filter((row) =>
// // //           (row.itemId && linkedItemIds.has(String(row.itemId)))
// // //           || (row.itemCode && linkedItemCodes.has(String(row.itemCode).trim().toLowerCase()))
// // //         );
// // //       }
// // //     }
// // //     const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
// // //       [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
// // //         .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
// // //     );
// // //     if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

// // //     let item = barcodeRow.itemId && isValidObjectId(String(barcodeRow.itemId))
// // //       ? await itemCollection.findOne({ _id: new Types.ObjectId(String(barcodeRow.itemId)), ...itemBusinessFilter })
// // //       : null;
// // //     const possibleItemKeys = [...new Set([
// // //       barcodeRow.itemCode,
// // //       barcodeRow.itemName,
// // //       barcodeRow.printDescription,
// // //       barcodeRow.supplierDescription,
// // //     ].map((value) => String(value || '').trim()).filter(Boolean))];
// // //     if (!item && possibleItemKeys.length) {
// // //       const exactMatches = possibleItemKeys.map((value) => {
// // //         const escaped = escapeRegex(value);
// // //         return [
// // //           { itemCode: { $regex: `^${escaped}$`, $options: 'i' } },
// // //           { name: { $regex: `^${escaped}$`, $options: 'i' } },
// // //         ];
// // //       }).flat();
// // //       item = await itemCollection.findOne({
// // //         ...itemBusinessFilter,
// // //         $or: exactMatches,
// // //       });
// // //     }
// // //     if (!item && barcodeRow.itemCode) {
// // //       const linkedProduct = await col.findOne({
// // //         businessId: idMatch(b),
// // //         ecommItemCode: { $regex: `^${escapeRegex(String(barcodeRow.itemCode).trim())}$`, $options: 'i' },
// // //       });
// // //       if (linkedProduct?.itemId && isValidObjectId(String(linkedProduct.itemId))) {
// // //         item = await itemCollection.findOne({
// // //           _id: new Types.ObjectId(String(linkedProduct.itemId)),
// // //           ...itemBusinessFilter,
// // //         });
// // //       }
// // //     }
// // //     if (!item) return json({ error: 'No inventory item is linked to this barcode.' }, 404);

// // //     const [group, hsn, product, productTypes, classificationOptions] = await Promise.all([
// // //       item.subGroupId && isValidObjectId(String(item.subGroupId))
// // //         ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(item.subGroupId)) })
// // //         : barcodeRow.groupId && isValidObjectId(String(barcodeRow.groupId))
// // //           ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(barcodeRow.groupId)) })
// // //           : barcodeRow.groupId
// // //             ? mongoose.connection.db.collection('productgroup').findOne({
// // //               $or: [
// // //                 { name: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// // //                 { prefix: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// // //               ],
// // //             })
// // //             : null,
// // //       item.hsnId && isValidObjectId(String(item.hsnId))
// // //         ? mongoose.connection.db.collection('hsn').findOne({ _id: new Types.ObjectId(String(item.hsnId)) })
// // //         : barcodeRow.hsn
// // //           ? mongoose.connection.db.collection('hsn').findOne({ code: { $regex: `^${escapeRegex(String(barcodeRow.hsn).trim())}$`, $options: 'i' } })
// // //         : null,
// // //       col.findOne({ businessId: idMatch(b), itemId: { $in: [item._id, String(item._id)] } }),
// // //       mongoose.connection.db.collection('producttypes')
// // //         .find({ businessId: { $in: [b, new Types.ObjectId(b)] }, isActive: { $ne: false } })
// // //         .project({ value: 1, label: 1 })
// // //         .toArray(),
// // //       mongoose.connection.db.collection('productclassificationoption')
// // //         .find({ businessId: idMatch(b), isActive: { $ne: false } })
// // //         .project({ type: 1, name: 1 })
// // //         .toArray(),
// // //     ]);
// // //     const barcodeImageCodes = [...new Set([
// // //       barcodeRow.barcodeGenerated,
// // //       barcodeRow.barcodeNo,
// // //       barcodeRow.oldBarcode,
// // //     ].map((value) => String(value || '').trim()).filter(Boolean))];
// // //     const barcodeImageRecord = barcodeImageCodes.length || item.itemCode
// // //       ? await ProductImage.findOne({
// // //         $or: [
// // //           ...(barcodeImageCodes.length ? [{ barcodeGenerated: { $in: barcodeImageCodes } }] : []),
// // //           ...(item.itemCode ? [{ itemCode: item.itemCode }] : []),
// // //         ],
// // //       }).sort({ createdAt: -1 }).select('imageUrl filePath').lean()
// // //       : null;
// // //     const barcodeImage = productImageSource(
// // //       barcodeRow.imageUrl
// // //         || barcodeRow.filePath
// // //         || barcodeImageRecord?.imageUrl
// // //         || barcodeImageRecord?.filePath
// // //         || '',
// // //       ...barcodeImageCodes,
// // //     );
// // //     const groupTypeCandidates = [group?.name, barcodeRow.groupId]
// // //       .map((value) => String(value || '').trim().toLowerCase())
// // //       .filter(Boolean);
// // //     const itemTypeCandidate = String(item.itemType || '').trim().toLowerCase();
// // //     const matchesProductType = (type, candidates) =>
// // //       candidates.includes(String(type.value || '').trim().toLowerCase())
// // //       || candidates.includes(String(type.label || '').trim().toLowerCase());
// // //     const matchedProductType = productTypes.find((type) =>
// // //       matchesProductType(type, groupTypeCandidates)
// // //     ) || productTypes.find((type) =>
// // //       matchesProductType(type, itemTypeCandidate ? [itemTypeCandidate] : [])
// // //     );
// // //     const productType = matchedProductType?.value || item.itemType || group?.name || barcodeRow.groupId || '';
// // //     const itemCode = item.itemCode || barcodeRow.itemCode || '';
// // //     const defaultData = {
// // //       displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
// // //       ecommItemCode: itemCode,
// // //       image: barcodeImage,
// // //       productType,
// // //       printDescriptionOverride: barcodeRow.printDescription || item.description || barcodeRow.supplierDescription || '',
// // //       ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
// // //       barcodePriceOverride: Number(barcodeRow.retailPrice || item.rsp || barcodeRow.offerPrice) || 0,
// // //       barcodeQtyOverride: Number(barcodeRow.qtyNum || barcodeRow.qty) || 0,
// // //       status: 'active',
// // //       isActive: true,
// // //       isPublished: false,
// // //       isFeatured: false,
// // //     };
// // //     const savedProduct = product ? plain(product) : {};
// // //     const classificationById = new Map(classificationOptions.map((option) => [
// // //       String(option._id),
// // //       option,
// // //     ]));
// // //     const classificationByName = new Map(classificationOptions.map((option) => [
// // //       `${option.type}:${String(option.name || '').trim().toLowerCase()}`,
// // //       option,
// // //     ]));
// // //     const classificationDefaults = Object.fromEntries(
// // //       ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].map((field) => {
// // //         const savedValues = savedProduct[field];
// // //         const barcodeValues = barcodeRow[field] ?? barcodeRow.customFields?.[field];
// // //         const source = Array.isArray(savedValues) && savedValues.length
// // //           ? savedValues
// // //           : savedValues && !Array.isArray(savedValues) ? savedValues : barcodeValues;
// // //         const values = Array.isArray(source)
// // //           ? source
// // //           : String(source || '').split(',').map((value) => value.trim()).filter(Boolean);
// // //         const selected = values.map((value) => {
// // //           const text = value && typeof value === 'object'
// // //             ? String(value._bsontype === 'ObjectId' ? value : value._id || value.id || value.value || value.name || '').trim()
// // //             : String(value || '').trim();
// // //           if (!text) return '';
// // //           const option = isValidObjectId(text)
// // //             ? classificationById.get(text)
// // //             : classificationByName.get(`${field}:${text.toLowerCase()}`);
// // //           return option && option.type === field ? String(option._id) : '';
// // //         }).filter(Boolean);
// // //         if (field === 'byFabric' && String(productType).trim().toUpperCase() === 'DUPATTA') {
// // //           const savedFabricNames = values
// // //             .map((value) => {
// // //               const text = value && typeof value === 'object'
// // //                 ? String(value.name || value.label || '').trim()
// // //                 : String(value || '').trim();
// // //               return DUPATTA_FABRIC_OPTIONS.find((name) =>
// // //                 name.toLowerCase() === text.toLowerCase()
// // //               ) || '';
// // //             })
// // //             .filter(Boolean);
// // //           const optionFabricNames = selected
// // //             .map((id) => classificationById.get(id)?.name || '')
// // //             .filter((name) => DUPATTA_FABRIC_OPTIONS.some((option) =>
// // //               option.toLowerCase() === name.toLowerCase()
// // //             ));
// // //           const matchedFabric = savedFabricNames[0] || optionFabricNames[0] || matchDupattaFabric([
// // //             barcodeRow.printDescription,
// // //             barcodeRow.supplierDescription,
// // //             barcodeRow.itemName,
// // //             barcodeRow.itemCode,
// // //             ...classificationTextValues(barcodeRow),
// // //             ...classificationTextValues(savedProduct),
// // //             item.name,
// // //             item.itemCode,
// // //             item.description,
// // //             ...classificationTextValues(item),
// // //           ]);
// // //           if (matchedFabric) return [field, [matchedFabric]];
// // //         }
// // //         return [field, [...new Set(selected)]];
// // //       })
// // //     );

// // //     return json({
// // //       barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
// // //       item: {
// // //         id: String(item._id),
// // //         itemCode,
// // //         name: item.name || barcodeRow.itemName || '',
// // //         itemType: item.itemType || '',
// // //         group: group?.name || barcodeRow.groupId || '',
// // //         hsnCode: hsn?.code || barcodeRow.hsn || '',
// // //       },
// // //       data: {
// // //         ...defaultData,
// // //         ...savedProduct,
// // //         ...classificationDefaults,
// // //         displayName: savedProduct.displayName || defaultData.displayName,
// // //         ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
// // //         image: savedProduct.image || defaultData.image,
// // //         productType: defaultData.productType || savedProduct.productType || '',
// // //         printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
// // //         ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
// // //         barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
// // //         barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
// // //         status: savedProduct.status || defaultData.status,
// // //       },
// // //     });
// // //   }

// // //   /* the by* choices for the Add form, from productclassificationoption */
// // //   if (sp.get('classifications') === '1') {
// // //     const opts = await mongoose.connection.db.collection('productclassificationoption')
// // //       .find({ ...filter, isActive: { $ne: false } })
// // //       .sort({ type: 1, displayOrder: 1, name: 1 })
// // //       .toArray();
// // //     const byType = {};
// // //     opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
// // //     return json({ classifications: byType });
// // //   }

// // //   /* the field names actually present, in first-seen order */
// // //   if (sp.get('fields') === '1') {
// // //     const sample = await col.find(filter).limit(500).toArray();
// // //     const seen = [];
// // //     sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
// // //     const types = {};
// // //     sample.forEach((d) => seen.forEach((k) => {
// // //       if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
// // //       const v = d[k];
// // //       types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
// // //         : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
// // //     }));
// // //     return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
// // //   }

// // //   const page = Math.max(1, Number(sp.get('page') || 1));
// // //   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

// // //   const search = (sp.get('search') || '').trim();
// // //   if (search) {
// // //     const rx = { $regex: escapeRegex(search), $options: 'i' };
// // //     filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
// // //   }

// // //   /* column-header sort: any plain field name; newest first otherwise */
// // //   const sortBy = sp.get('sortBy');
// // //   const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
// // //   const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
// // //     ? { [sortBy]: dir, _id: 1 }
// // //     : { updatedAt: -1, createdAt: -1, _id: -1 };

// // //   const total = await col.countDocuments(filter);
// // //   const rows = await col.find(filter)
// // //     .sort(sort)
// // //     .collation({ locale: 'en', strength: 2, numericOrdering: true })
// // //     .skip((page - 1) * perPage)
// // //     .limit(perPage)
// // //     .toArray();

// // //   const classificationIds = [...new Set(rows.flatMap((row) =>
// // //     ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
// // //       .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
// // //       .map((value) => String(value || ''))
// // //       .filter(isValidObjectId)
// // //   ))].map((id) => new Types.ObjectId(id));
// // //   const classificationOptions = classificationIds.length
// // //     ? await mongoose.connection.db.collection('productclassificationoption')
// // //       .find({ _id: { $in: classificationIds } }, { projection: { name: 1 } })
// // //       .toArray()
// // //     : [];
// // //   const classificationNameById = new Map(classificationOptions.map((option) => [
// // //     String(option._id),
// // //     option.name || '',
// // //   ]));

// // //   const itemIds = [...new Set(rows
// // //     .map((row) => String(row.itemId || ''))
// // //     .filter(isValidObjectId))]
// // //     .map((id) => new Types.ObjectId(id));
// // //   const itemFilter = { _id: { $in: itemIds } };
// // //   if (b && isValidObjectId(b)) itemFilter.businessId = idMatch(b);
// // //   const items = itemIds.length
// // //     ? await mongoose.connection.db.collection('item')
// // //       .find(itemFilter, { projection: { name: 1, itemCode: 1, image: 1 } })
// // //       .toArray()
// // //     : [];
// // //   const itemById = new Map(items.map((item) => [String(item._id), item]));
// // //   const businessIds = [...new Set(rows
// // //     .map((row) => String(row.businessId || ''))
// // //     .filter(isValidObjectId))]
// // //     .map((id) => new Types.ObjectId(id));
// // //   const businesses = businessIds.length
// // //     ? await mongoose.connection.db.collection('business')
// // //       .find({ _id: { $in: businessIds } }, { projection: { name: 1, businessPrintName: 1 } })
// // //       .toArray()
// // //     : [];
// // //   const businessNameById = new Map(businesses.map((business) => [
// // //     String(business._id),
// // //     business.name || business.businessPrintName || '',
// // //   ]));
// // //   const itemCodes = [...new Set([
// // //     ...items.map((item) => item.itemCode),
// // //     ...rows.map((row) => row.ecommItemCode),
// // //   ].map((value) => String(value || '').trim()).filter(Boolean))];
// // //   const barcodeListFilter = {
// // //     $or: [
// // //       { itemId: { $in: [...itemIds, ...itemIds.map(String)] } },
// // //       ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
// // //     ],
// // //   };
// // //   if (b && isValidObjectId(b)) {
// // //     barcodeListFilter.$and = [{
// // //       $or: [
// // //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// // //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// // //       ],
// // //     }];
// // //   }
// // //   let barcodes = itemIds.length || itemCodes.length
// // //     ? await mongoose.connection.db.collection('barcodeLabel')
// // //       .find(barcodeListFilter, {
// // //         projection: {
// // //           itemId: 1,
// // //           businessId: 1,
// // //           currentBusinessId: 1,
// // //           itemCode: 1,
// // //           barcodeGenerated: 1,
// // //           barcodeNo: 1,
// // //           oldBarcode: 1,
// // //           imageUrl: 1,
// // //           filePath: 1,
// // //         },
// // //       })
// // //       .collation({ locale: 'en', strength: 2 })
// // //       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// // //       .toArray()
// // //     : [];
// // //   if (b && isValidObjectId(b) && (itemIds.length || itemCodes.length)) {
// // //     const linkedItemMatches = [
// // //       ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// // //       ...itemCodes.flatMap((value) => {
// // //         const exact = { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' };
// // //         return [{ itemCode: exact }, { name: exact }];
// // //       }),
// // //     ];
// // //     const linkedItems = linkedItemMatches.length
// // //       ? await mongoose.connection.db.collection('item')
// // //         .find({ businessId: idMatch(b), $or: linkedItemMatches })
// // //         .project({ _id: 1, itemCode: 1, name: 1 })
// // //         .toArray()
// // //       : [];
// // //     const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
// // //     const linkedItemKeys = new Set(linkedItems.flatMap((item) =>
// // //       [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
// // //     ).filter(Boolean));
// // //     const legacyBarcodeMatches = [
// // //       ...(linkedItemIds.size
// // //         ? [{ itemId: { $in: [...linkedItemIds, ...[...linkedItemIds].map((id) => new Types.ObjectId(id))] } }]
// // //         : []),
// // //       ...[...linkedItemKeys].flatMap((value) => {
// // //         const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
// // //         return [{ itemCode: exact }, { itemName: exact }];
// // //       }),
// // //     ];
// // //     const legacyBarcodes = legacyBarcodeMatches.length
// // //       ? await mongoose.connection.db.collection('barcodeLabel')
// // //         .find({ $or: legacyBarcodeMatches }, {
// // //           projection: {
// // //             itemId: 1,
// // //             businessId: 1,
// // //             currentBusinessId: 1,
// // //             itemCode: 1,
// // //             barcodeGenerated: 1,
// // //             barcodeNo: 1,
// // //             oldBarcode: 1,
// // //             imageUrl: 1,
// // //             filePath: 1,
// // //           },
// // //         })
// // //         .collation({ locale: 'en', strength: 2 })
// // //         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// // //         .toArray()
// // //       : [];
// // //     const existingBarcodeIds = new Set(barcodes.map((barcode) => String(barcode._id)));
// // //     barcodes = [
// // //       ...barcodes,
// // //       ...legacyBarcodes.filter((barcode) =>
// // //         !existingBarcodeIds.has(String(barcode._id))
// // //         && ((barcode.itemId && linkedItemIds.has(String(barcode.itemId)))
// // //           || [barcode.itemCode, barcode.itemName].some((value) =>
// // //             value && linkedItemKeys.has(String(value).trim().toLowerCase())))
// // //       ),
// // //     ];
// // //   }
// // //   const barcodeByItemId = new Map();
// // //   const barcodeByItemCode = new Map();
// // //   const imageByBarcode = new Map();
// // //   const imageByItemId = new Map();
// // //   const imageByItemCode = new Map();
// // //   const barcodeValues = new Set();
// // //   barcodes.forEach((barcode) => {
// // //     const values = [barcode.barcodeGenerated, barcode.barcodeNo, barcode.oldBarcode]
// // //       .map((value) => String(value || '').trim())
// // //       .filter(Boolean);
// // //     const value = values[0] || '';
// // //     const itemId = barcode.itemId ? String(barcode.itemId) : '';
// // //     if (itemId && value && !barcodeByItemId.has(itemId)) barcodeByItemId.set(itemId, value);
// // //     values.forEach((barcodeValue) => barcodeValues.add(barcodeValue));
// // //     const itemCodeKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// // //     const currentItemCodeKey = itemCodeMapKey(barcode.currentBusinessId, barcode.itemCode);
// // //     if (barcode.itemCode && value && !barcodeByItemCode.has(itemCodeKey)) {
// // //       barcodeByItemCode.set(itemCodeKey, value);
// // //     }
// // //     if (barcode.itemCode && value && !barcodeByItemCode.has(currentItemCodeKey)) {
// // //       barcodeByItemCode.set(currentItemCodeKey, value);
// // //     }
// // //     const storedImage = String(barcode.imageUrl || barcode.filePath || '').trim();
// // //     const image = productImageSource(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
// // //     if (!image) return;
// // //     values.forEach((barcodeValue) => {
// // //       const key = String(barcodeValue).trim().toLowerCase();
// // //       if (key && !imageByBarcode.has(key)) imageByBarcode.set(key, image);
// // //     });
// // //     if (itemId && !imageByItemId.has(itemId)) imageByItemId.set(itemId, image);
// // //     if (barcode.itemCode && !imageByItemCode.has(itemCodeKey)) imageByItemCode.set(itemCodeKey, image);
// // //     if (barcode.itemCode && !imageByItemCode.has(currentItemCodeKey)) imageByItemCode.set(currentItemCodeKey, image);
// // //   });
// // //   rows.forEach((row) => {
// // //     const value = String(row.barcode || '').trim();
// // //     if (value) barcodeValues.add(value);
// // //   });
// // //   const productImageLookups = [
// // //     ...[...barcodeValues].map((value) => ({
// // //       barcodeGenerated: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
// // //     })),
// // //     ...itemCodes.map((value) => ({
// // //       itemCode: { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' },
// // //     })),
// // //   ];
// // //   const productImages = productImageLookups.length
// // //     ? await ProductImage.find({ $or: productImageLookups })
// // //       .sort({ createdAt: -1 })
// // //       .select('barcodeGenerated itemCode imageUrl filePath')
// // //       .lean()
// // //     : [];
// // //   const productImageBarcodes = new Set();
// // //   productImages.forEach((productImage) => {
// // //     const key = String(productImage.barcodeGenerated || '').trim().toLowerCase();
// // //     const image = productImageSource(productImage.imageUrl || productImage.filePath || '');
// // //     if (key && image && !productImageBarcodes.has(key)) {
// // //       imageByBarcode.set(key, image);
// // //       productImageBarcodes.add(key);
// // //     }
// // //     const itemCodeKey = String(productImage.itemCode || '').trim();
// // //     if (image && itemCodeKey) {
// // //       items.filter((item) =>
// // //         String(item.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // //       ).forEach((item) => {
// // //         const mapKey = itemCodeMapKey(item.businessId, item.itemCode);
// // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // //       });
// // //       rows.filter((row) =>
// // //         String(row.ecommItemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // //       ).forEach((row) => {
// // //         const mapKey = itemCodeMapKey(row.businessId, row.ecommItemCode);
// // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // //       });
// // //       barcodes.filter((barcode) =>
// // //         String(barcode.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// // //       ).forEach((barcode) => {
// // //         const mapKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// // //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// // //       });
// // //     }
// // //   });

// // //   return json({
// // //     rows: rows.map((r) => {
// // //       const row = plain(r);
// // //       const item = itemById.get(String(r.itemId));
// // //       const businessName = businessNameById.get(String(r.businessId));
// // //       const barcode = row.barcode
// // //         || barcodeByItemId.get(String(r.itemId))
// // //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// // //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// // //         || '';
// // //       const productImage = [
// // //         row.image,
// // //         row.productImageUrl,
// // //         row.primaryImage,
// // //         row.imageUrl,
// // //         row.barcodeImage,
// // //         row.barcodeImageUrl,
// // //         ...(Array.isArray(row.productImages) ? row.productImages : []),
// // //         ...(Array.isArray(row.imageUrls) ? row.imageUrls : []),
// // //         ...(Array.isArray(row.images) ? row.images : []),
// // //         ...(Array.isArray(row.additionalImages)
// // //           ? row.additionalImages
// // //           : row.additionalImages ? [row.additionalImages] : []),
// // //         item?.image,
// // //       ].map((value) => {
// // //         if (value && typeof value === 'object') {
// // //           return value.url || value.imageUrl || value.src || value.path || '';
// // //         }
// // //         return value;
// // //       }).find((value) => typeof value === 'string' && value.trim());
// // //       return {
// // //         ...row,
// // //         ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
// // //           `${key}Display`,
// // //           (Array.isArray(r[key]) ? r[key] : [])
// // //             .map((value) => classificationNameById.get(String(value)) || String(value || ''))
// // //             .filter(Boolean)
// // //             .join(', '),
// // //         ])),
// // //         barcode,
// // //         barcodeImage: (productImage ? productImageSource(productImage) : '')
// // //           || imageByBarcode.get(String(barcode).trim().toLowerCase())
// // //           || imageByItemId.get(String(r.itemId))
// // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// // //           || '',
// // //         businessName: businessName || '',
// // //         itemLabel: item ? [item.itemCode, item.name].filter(Boolean).join(' - ') : '',
// // //         ecommItemCode: row.ecommItemCode || item?.itemCode || '',
// // //         _id: String(r._id),
// // //       };
// // //     }),
// // //     labels: {},
// // //     total,
// // //     page,
// // //     pages: Math.max(1, Math.ceil(total / perPage)),
// // //     perPage,
// // //   });
// // // }

// // // /* ---------------------------------------------------------------- add ---

// // //    One product per item per business - the collection's own unique index
// // //    (businessId + itemId). Every field the form sends is stored with the type
// // //    the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
// // //    ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
// // //    know about are passed through as text, so a field added on the e-commerce
// // //    side can be filled in here too. */
// // // const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
// // // const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished']);
// // // const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
// // // const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

// // // export async function POST(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const body = await req.json().catch(() => ({}));
// // //   const data = body.data || {};
// // //   const business = body.business;
// // //   if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
// // //   if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
// // //   if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

// // //   await dbConnect();
// // //   const col = mongoose.connection.db.collection(COLLECTION);

// // //   const doc = {
// // //     businessId: new Types.ObjectId(business),
// // //     itemId: new Types.ObjectId(data.itemId),
// // //   };
// // //   Object.entries(data).forEach(([k, v]) => {
// // //     if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
// // //     if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
// // //     else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
// // //     else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
// // //     else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
// // //     else if (Array.isArray(v)) doc[k] = v;
// // //     else doc[k] = v === null || v === undefined ? '' : String(v);
// // //   });
// // //   if (String(data.productType || '').trim().toUpperCase() === 'DUPATTA' && Array.isArray(data.byFabric)) {
// // //     const fabricNames = data.byFabric
// // //       .map((value) => String(value || '').trim())
// // //       .filter((name) => DUPATTA_FABRIC_OPTIONS.includes(name));
// // //     const fabricOptions = await Promise.all(fabricNames.map((name) =>
// // //       ProductClassificationOption.findOneAndUpdate(
// // //         {
// // //           businessId: new Types.ObjectId(business),
// // //           type: 'byFabric',
// // //           name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
// // //         },
// // //         {
// // //           $setOnInsert: {
// // //             businessId: new Types.ObjectId(business),
// // //             type: 'byFabric',
// // //             name,
// // //             displayOrder: 100 + DUPATTA_FABRIC_OPTIONS.indexOf(name),
// // //             isActive: true,
// // //           },
// // //         },
// // //         { upsert: true, new: true }
// // //       ).select('_id').lean()
// // //     ));
// // //     doc.byFabric = [
// // //       ...new Set([
// // //         ...doc.byFabric.map(String),
// // //         ...fabricOptions.map((option) => String(option._id)),
// // //       ]),
// // //     ].map((id) => new Types.ObjectId(id));
// // //   }
// // //   /* the shape the e-commerce project writes when a field is left empty */
// // //   ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
// // //   if (!doc.additionalImages) doc.additionalImages = [];
// // //   if (!doc.status) doc.status = 'active';
// // //   if (doc.isActive === undefined) doc.isActive = true;

// // //   const now = new Date();
// // //   doc.updatedAt = now;
// // //   const productFilter = {
// // //     businessId: idMatch(business),
// // //     itemId: idMatch(data.itemId),
// // //   };
// // //   const existing = await col.findOne(productFilter, { projection: { _id: 1 } });
// // //   if (existing) {
// // //     const result = await col.updateOne(productFilter, { $set: doc });
// // //     if (!result.matchedCount) {
// // //       return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
// // //     }
// // //     return json({ ok: true, id: String(existing._id), updated: true });
// // //   }

// // //   doc.createdAt = now;
// // //   doc.__v = 0;
// // //   try {
// // //     const res = await col.insertOne(doc);
// // //     return json({ ok: true, id: String(res.insertedId) });
// // //   } catch (e) {
// // //     if (e && e.code === 11000) {
// // //       const existingAfterRace = await col.findOne(productFilter, { projection: { _id: 1 } });
// // //       if (!existingAfterRace) throw e;
// // //       delete doc.createdAt;
// // //       delete doc.__v;
// // //       const result = await col.updateOne(productFilter, { $set: doc });
// // //       if (!result.matchedCount) throw e;
// // //       return json({ ok: true, id: String(existingAfterRace._id), updated: true });
// // //     }
// // //     throw e;
// // //   }
// // // }





// // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';
// // import { escapeRegex } from '@/lib/validate';
// // import ProductImage from '@/models/ProductImage';
// // import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';
// // import ProductClassificationOption from '@/models/ProductClassificationOption';
// // import { DUPATTA_FABRIC_OPTIONS } from '@/lib/productClassificationConstants';

// // /* /api/product-eccom - list only, read-only (19-10-2026).

// //    Reads the `ecommerceproduct` collection that the separate e-commerce
// //    project writes (one row per published product, built from barcodeLabel).
// //    It is read through the raw driver - no Mongoose schema - on purpose: the
// //    e-commerce side is still adding fields, and a schema here would silently
// //    drop any field it does not list. Whatever is stored comes back as it is.

// //    ?fields=1 answers just the field names present in the collection, so the
// //    product-eccom page can build one column per field and a field added on the
// //    e-commerce side shows up without a change here.

// //    ?classifications=1 answers the business's productclassificationoption
// //    rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
// //    the choices the Add form offers for those lists.

// //    ?barcodeOptions=1 returns a bounded, business-scoped barcode search for
// //    the Add form's barcode picker.

// //    POST adds one product (the Add form). No PUT or DELETE. */

// // const json = (d, s = 200) => Response.json(d, { status: s });
// // const COLLECTION = 'ecommerceproduct';
// // const PER_PAGE = 10;
// // const DEPLOYED_IMAGE_ORIGIN = 'https://erp.wovenessence.in';
// // /* fields never shown as columns */
// // const HIDDEN = new Set(['_id', '__v']);

// // const normalizedFabricText = (value) => String(value || '')
// //   .normalize('NFKD')
// //   .replace(/[\u0300-\u036f]/g, '')
// //   .toLowerCase()
// //   .replace(/[^a-z0-9]+/g, ' ')
// //   .trim();

// // function matchDupattaFabric(values) {
// //   const sourceText = values.map(normalizedFabricText).filter(Boolean).join(' ');
// //   return DUPATTA_FABRIC_OPTIONS.find((name) => {
// //     const normalizedName = normalizedFabricText(name);
// //     const distinctiveName = normalizedName.replace(/\b(silk|dupatta)\b/g, '').trim();
// //     return sourceText.includes(normalizedName)
// //       || (distinctiveName && new RegExp(`\\b${escapeRegex(distinctiveName)}\\b`).test(sourceText));
// //   }) || '';
// // }

// // function classificationTextValues(record) {
// //   if (!record || typeof record !== 'object') return [];
// //   return Object.entries(record)
// //     .filter(([key]) => /^(?:displayName|printDescription|printDescriptionOverride|supplierDescription|itemName|description|fabric|fabricName|fabricDescription)$/i.test(key))
// //     .flatMap(([, value]) => Array.isArray(value) ? value : [value])
// //     .filter((value) => typeof value === 'string' || typeof value === 'number');
// // }

// // function productImageSource(value, ...barcodes) {
// //   const source = imageUrl(value, ...barcodes);
// //   return source.startsWith('/august_8A_images/')
// //     ? `${DEPLOYED_IMAGE_ORIGIN}${source}`
// //     : source;
// // }

// // /* ObjectIds become their string, everything else is passed through */
// // function plain(value) {
// //   if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
// //   if (Array.isArray(value)) return value.map(plain);
// //   if (value instanceof Date) return value;
// //   if (value && typeof value === 'object') {
// //     return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
// //   }
// //   return value;
// // }

// // /* a business id may be stored as an ObjectId or as its string */
// // const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });
// // const itemCodeMapKey = (businessId, itemCode) =>
// //   `${String(businessId || '')}:${String(itemCode || '').trim().toLowerCase()}`;

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   await dbConnect();
// //   const col = mongoose.connection.db.collection(COLLECTION);

// //   const filter = {};
// //   const b = sp.get('business');
// //   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

// //   if (sp.get('barcodeOptions') === '1') {
// //     if (!b || !isValidObjectId(b)) {
// //       return json({ error: 'Select a valid business before searching barcodes.' }, 422);
// //     }
// //     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
// //     const barcodeBusinessMatch = {
// //       $or: [
// //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// //       ],
// //     };
// //     const search = (sp.get('search') || '').trim();
// //     const codeMatch = search
// //       ? {
// //         $or: ['barcodeNo', 'barcodeGenerated', 'oldBarcode'].map((field) => ({
// //           [field]: { $regex: escapeRegex(search), $options: 'i' },
// //         })),
// //       }
// //       : null;
// //     const scopedQuery = codeMatch
// //       ? { $and: [barcodeBusinessMatch, codeMatch] }
// //       : barcodeBusinessMatch;
// //     let barcodeRows = await barcodeCollection.find(scopedQuery)
// //       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// //       .limit(50)
// //       .toArray();

// //     if (!barcodeRows.length && search) {
// //       const legacyRows = await barcodeCollection.find(codeMatch)
// //         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// //         .limit(100)
// //         .toArray();
// //       const itemIds = [...new Set(legacyRows
// //         .map((row) => String(row.itemId || ''))
// //         .filter(isValidObjectId))]
// //         .map((id) => new Types.ObjectId(id));
// //       const itemKeys = [...new Set(legacyRows
// //         .flatMap((row) => [row.itemCode, row.itemName])
// //         .map((value) => String(value || '').trim())
// //         .filter(Boolean))];
// //       const itemMatches = [
// //         ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// //         ...itemKeys.flatMap((value) => {
// //           const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
// //           return [{ itemCode: exact }, { name: exact }];
// //         }),
// //       ];
// //       const linkedItems = itemMatches.length
// //         ? await mongoose.connection.db.collection('item')
// //           .find({ businessId: idMatch(b), $or: itemMatches })
// //           .project({ _id: 1, itemCode: 1, name: 1 })
// //           .toArray()
// //         : [];
// //       const linkedIds = new Set(linkedItems.map((item) => String(item._id)));
// //       const linkedKeys = new Set(linkedItems.flatMap((item) =>
// //         [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
// //       ));
// //       barcodeRows = legacyRows.filter((row) =>
// //         (row.itemId && linkedIds.has(String(row.itemId)))
// //         || [row.itemCode, row.itemName].some((value) =>
// //           value && linkedKeys.has(String(value).trim().toLowerCase()))
// //       );
// //     }

// //     const options = new Map();
// //     barcodeRows.forEach((row) => {
// //       const value = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
// //       if (!value) return;
// //       const key = value.toLowerCase();
// //       if (!options.has(key)) {
// //         options.set(key, {
// //           value,
// //           label: [value, row.itemCode || row.itemName].filter(Boolean).join(' - '),
// //         });
// //       }
// //     });
// //     return json({ options: [...options.values()] });
// //   }

// //   const barcode = (sp.get('barcodeLookup') || '').trim();
// //   if (barcode) {
// //     if (!b || !isValidObjectId(b)) return json({ error: 'Select a valid business before looking up a barcode.' }, 422);

// //     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
// //     const barcodeBusinessMatch = {
// //       $or: [
// //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// //       ],
// //     };
// //     const findBarcodeRows = async (businessFilter = {}) => {
// //       let rows = await barcodeCollection.find({
// //         $and: [businessFilter, inventoryBarcodeFilter(barcode)],
// //       }).limit(50).toArray();
// //       if (rows.length) return rows;

// //       const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
// //       return barcodeCollection.find({
// //         $and: [
// //           businessFilter,
// //           {
// //             $or: [
// //               { barcodeGenerated: barcodeRx },
// //               { barcodeNo: barcodeRx },
// //               { oldBarcode: barcodeRx },
// //             ],
// //           },
// //         ],
// //       }).limit(50).toArray();
// //     };
// //     let barcodeRows = await findBarcodeRows(barcodeBusinessMatch);
// //     const itemCollection = mongoose.connection.db.collection('item');
// //     const itemBusinessFilter = { businessId: idMatch(b) };

// //     /* Legacy barcode rows can retain their originating business even after
// //        their linked inventory item has moved. Accept those only when that
// //        item is confirmed to belong to the selected business. */
// //     if (!barcodeRows.length) {
// //       const allBarcodeRows = await findBarcodeRows();
// //       if (allBarcodeRows.length) {
// //         const itemIds = [...new Set(allBarcodeRows
// //           .map((row) => String(row.itemId || ''))
// //           .filter(isValidObjectId)
// //           .map((id) => new Types.ObjectId(id)))];
// //         const itemCodes = [...new Set(allBarcodeRows
// //           .map((row) => String(row.itemCode || '').trim())
// //           .filter(Boolean))];
// //         const itemMatches = [
// //           ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// //           ...itemCodes.map((code) => ({
// //             itemCode: { $regex: `^${escapeRegex(code)}$`, $options: 'i' },
// //           })),
// //         ];
// //         const linkedItems = itemMatches.length
// //           ? await itemCollection.find({ ...itemBusinessFilter, $or: itemMatches }).toArray()
// //           : [];
// //         const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
// //         const linkedItemCodes = new Set(linkedItems.map((item) =>
// //           String(item.itemCode || '').trim().toLowerCase()));
// //         barcodeRows = allBarcodeRows.filter((row) =>
// //           (row.itemId && linkedItemIds.has(String(row.itemId)))
// //           || (row.itemCode && linkedItemCodes.has(String(row.itemCode).trim().toLowerCase()))
// //         );
// //       }
// //     }
// //     const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
// //       [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
// //         .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
// //     );
// //     if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

// //     let item = barcodeRow.itemId && isValidObjectId(String(barcodeRow.itemId))
// //       ? await itemCollection.findOne({ _id: new Types.ObjectId(String(barcodeRow.itemId)), ...itemBusinessFilter })
// //       : null;
// //     const possibleItemKeys = [...new Set([
// //       barcodeRow.itemCode,
// //       barcodeRow.itemName,
// //       barcodeRow.printDescription,
// //       barcodeRow.supplierDescription,
// //     ].map((value) => String(value || '').trim()).filter(Boolean))];
// //     if (!item && possibleItemKeys.length) {
// //       const exactMatches = possibleItemKeys.map((value) => {
// //         const escaped = escapeRegex(value);
// //         return [
// //           { itemCode: { $regex: `^${escaped}$`, $options: 'i' } },
// //           { name: { $regex: `^${escaped}$`, $options: 'i' } },
// //         ];
// //       }).flat();
// //       item = await itemCollection.findOne({
// //         ...itemBusinessFilter,
// //         $or: exactMatches,
// //       });
// //     }
// //     if (!item && barcodeRow.itemCode) {
// //       const linkedProduct = await col.findOne({
// //         businessId: idMatch(b),
// //         ecommItemCode: { $regex: `^${escapeRegex(String(barcodeRow.itemCode).trim())}$`, $options: 'i' },
// //       });
// //       if (linkedProduct?.itemId && isValidObjectId(String(linkedProduct.itemId))) {
// //         item = await itemCollection.findOne({
// //           _id: new Types.ObjectId(String(linkedProduct.itemId)),
// //           ...itemBusinessFilter,
// //         });
// //       }
// //     }
// //     if (!item) return json({ error: 'No inventory item is linked to this barcode.' }, 404);

// //     const [group, hsn, product, productTypes, classificationOptions] = await Promise.all([
// //       item.subGroupId && isValidObjectId(String(item.subGroupId))
// //         ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(item.subGroupId)) })
// //         : barcodeRow.groupId && isValidObjectId(String(barcodeRow.groupId))
// //           ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(barcodeRow.groupId)) })
// //           : barcodeRow.groupId
// //             ? mongoose.connection.db.collection('productgroup').findOne({
// //               $or: [
// //                 { name: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// //                 { prefix: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
// //               ],
// //             })
// //             : null,
// //       item.hsnId && isValidObjectId(String(item.hsnId))
// //         ? mongoose.connection.db.collection('hsn').findOne({ _id: new Types.ObjectId(String(item.hsnId)) })
// //         : barcodeRow.hsn
// //           ? mongoose.connection.db.collection('hsn').findOne({ code: { $regex: `^${escapeRegex(String(barcodeRow.hsn).trim())}$`, $options: 'i' } })
// //         : null,
// //       col.findOne({ businessId: idMatch(b), itemId: { $in: [item._id, String(item._id)] } }),
// //       mongoose.connection.db.collection('producttypes')
// //         .find({ businessId: { $in: [b, new Types.ObjectId(b)] }, isActive: { $ne: false } })
// //         .project({ value: 1, label: 1 })
// //         .toArray(),
// //       mongoose.connection.db.collection('productclassificationoption')
// //         .find({ businessId: idMatch(b), isActive: { $ne: false } })
// //         .project({ type: 1, name: 1 })
// //         .toArray(),
// //     ]);
// //     const barcodeImageCodes = [...new Set([
// //       barcodeRow.barcodeGenerated,
// //       barcodeRow.barcodeNo,
// //       barcodeRow.oldBarcode,
// //     ].map((value) => String(value || '').trim()).filter(Boolean))];
// //     const barcodeImageRecord = barcodeImageCodes.length || item.itemCode
// //       ? await ProductImage.findOne({
// //         $or: [
// //           ...(barcodeImageCodes.length ? [{ barcodeGenerated: { $in: barcodeImageCodes } }] : []),
// //           ...(item.itemCode ? [{ itemCode: item.itemCode }] : []),
// //         ],
// //       }).sort({ createdAt: -1 }).select('imageUrl filePath').lean()
// //       : null;
// //     const barcodeImage = productImageSource(
// //       barcodeRow.imageUrl
// //         || barcodeRow.filePath
// //         || barcodeImageRecord?.imageUrl
// //         || barcodeImageRecord?.filePath
// //         || '',
// //       ...barcodeImageCodes,
// //     );
// //     const groupTypeCandidates = [group?.name, barcodeRow.groupId]
// //       .map((value) => String(value || '').trim().toLowerCase())
// //       .filter(Boolean);
// //     const itemTypeCandidate = String(item.itemType || '').trim().toLowerCase();
// //     const matchesProductType = (type, candidates) =>
// //       candidates.includes(String(type.value || '').trim().toLowerCase())
// //       || candidates.includes(String(type.label || '').trim().toLowerCase());
// //     const matchedProductType = productTypes.find((type) =>
// //       matchesProductType(type, groupTypeCandidates)
// //     ) || productTypes.find((type) =>
// //       matchesProductType(type, itemTypeCandidate ? [itemTypeCandidate] : [])
// //     );
// //     const productType = matchedProductType?.value || item.itemType || group?.name || barcodeRow.groupId || '';
// //     const itemCode = item.itemCode || barcodeRow.itemCode || '';
// //     const defaultData = {
// //       displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
// //       ecommItemCode: itemCode,
// //       image: barcodeImage,
// //       productType,
// //       printDescriptionOverride: barcodeRow.printDescription || item.description || barcodeRow.supplierDescription || '',
// //       ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
// //       barcodePriceOverride: Number(barcodeRow.retailPrice || item.rsp || barcodeRow.offerPrice) || 0,
// //       barcodeQtyOverride: Number(barcodeRow.qtyNum || barcodeRow.qty) || 0,
// //       status: 'active',
// //       isActive: true,
// //       isPublished: false,
// //       isFeatured: false,
// //     };
// //     const savedProduct = product ? plain(product) : {};
// //     const classificationById = new Map(classificationOptions.map((option) => [
// //       String(option._id),
// //       option,
// //     ]));
// //     const classificationByName = new Map(classificationOptions.map((option) => [
// //       `${option.type}:${String(option.name || '').trim().toLowerCase()}`,
// //       option,
// //     ]));
// //     const classificationDefaults = Object.fromEntries(
// //       ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].map((field) => {
// //         const savedValues = savedProduct[field];
// //         const barcodeValues = barcodeRow[field] ?? barcodeRow.customFields?.[field];
// //         const source = Array.isArray(savedValues) && savedValues.length
// //           ? savedValues
// //           : savedValues && !Array.isArray(savedValues) ? savedValues : barcodeValues;
// //         const values = Array.isArray(source)
// //           ? source
// //           : String(source || '').split(',').map((value) => value.trim()).filter(Boolean);
// //         const selected = values.map((value) => {
// //           const text = value && typeof value === 'object'
// //             ? String(value._bsontype === 'ObjectId' ? value : value._id || value.id || value.value || value.name || '').trim()
// //             : String(value || '').trim();
// //           if (!text) return '';
// //           const option = isValidObjectId(text)
// //             ? classificationById.get(text)
// //             : classificationByName.get(`${field}:${text.toLowerCase()}`);
// //           return option && option.type === field ? String(option._id) : '';
// //         }).filter(Boolean);
// //         if (field === 'byFabric' && String(productType).trim().toUpperCase() === 'DUPATTA') {
// //           const savedFabricNames = values
// //             .map((value) => {
// //               const text = value && typeof value === 'object'
// //                 ? String(value.name || value.label || '').trim()
// //                 : String(value || '').trim();
// //               return DUPATTA_FABRIC_OPTIONS.find((name) =>
// //                 name.toLowerCase() === text.toLowerCase()
// //               ) || '';
// //             })
// //             .filter(Boolean);
// //           const optionFabricNames = selected
// //             .map((id) => classificationById.get(id)?.name || '')
// //             .filter((name) => DUPATTA_FABRIC_OPTIONS.some((option) =>
// //               option.toLowerCase() === name.toLowerCase()
// //             ));
// //           const matchedFabric = savedFabricNames[0] || optionFabricNames[0] || matchDupattaFabric([
// //             barcodeRow.printDescription,
// //             barcodeRow.supplierDescription,
// //             barcodeRow.itemName,
// //             barcodeRow.itemCode,
// //             ...classificationTextValues(barcodeRow),
// //             ...classificationTextValues(savedProduct),
// //             item.name,
// //             item.itemCode,
// //             item.description,
// //             ...classificationTextValues(item),
// //           ]);
// //           if (matchedFabric) return [field, [matchedFabric]];
// //         }
// //         return [field, [...new Set(selected)]];
// //       })
// //     );

// //     return json({
// //       barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
// //       /* the label's own number, as stored (case included) - what the Add form saves */
// //       barcodeNo: barcodeRow.barcodeNo || barcodeRow.oldBarcode || '',
// //       item: {
// //         id: String(item._id),
// //         itemCode,
// //         name: item.name || barcodeRow.itemName || '',
// //         itemType: item.itemType || '',
// //         group: group?.name || barcodeRow.groupId || '',
// //         hsnCode: hsn?.code || barcodeRow.hsn || '',
// //       },
// //       data: {
// //         ...defaultData,
// //         ...savedProduct,
// //         ...classificationDefaults,
// //         displayName: savedProduct.displayName || defaultData.displayName,
// //         ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
// //         image: savedProduct.image || defaultData.image,
// //         productType: defaultData.productType || savedProduct.productType || '',
// //         printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
// //         ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
// //         barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
// //         barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
// //         status: savedProduct.status || defaultData.status,
// //       },
// //     });
// //   }

// //   /* the by* choices for the Add form, from productclassificationoption */
// //   if (sp.get('classifications') === '1') {
// //     const opts = await mongoose.connection.db.collection('productclassificationoption')
// //       .find({ ...filter, isActive: { $ne: false } })
// //       .sort({ type: 1, displayOrder: 1, name: 1 })
// //       .toArray();
// //     const byType = {};
// //     opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
// //     return json({ classifications: byType });
// //   }

// //   /* the field names actually present, in first-seen order */
// //   if (sp.get('fields') === '1') {
// //     const sample = await col.find(filter).limit(500).toArray();
// //     const seen = [];
// //     sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
// //     const types = {};
// //     sample.forEach((d) => seen.forEach((k) => {
// //       if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
// //       const v = d[k];
// //       types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
// //         : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
// //     }));
// //     return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
// //   }

// //   const page = Math.max(1, Number(sp.get('page') || 1));
// //   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

// //   const search = (sp.get('search') || '').trim();
// //   if (search) {
// //     const rx = { $regex: escapeRegex(search), $options: 'i' };
// //     filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
// //   }

// //   /* column-header sort: any plain field name; newest first otherwise */
// //   const sortBy = sp.get('sortBy');
// //   const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
// //   const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
// //     ? { [sortBy]: dir, _id: 1 }
// //     : { updatedAt: -1, createdAt: -1, _id: -1 };

// //   const total = await col.countDocuments(filter);
// //   const rows = await col.find(filter)
// //     .sort(sort)
// //     .collation({ locale: 'en', strength: 2, numericOrdering: true })
// //     .skip((page - 1) * perPage)
// //     .limit(perPage)
// //     .toArray();

// //   const classificationIds = [...new Set(rows.flatMap((row) =>
// //     ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
// //       .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
// //       .map((value) => String(value || ''))
// //       .filter(isValidObjectId)
// //   ))].map((id) => new Types.ObjectId(id));
// //   const classificationOptions = classificationIds.length
// //     ? await mongoose.connection.db.collection('productclassificationoption')
// //       .find({ _id: { $in: classificationIds } }, { projection: { name: 1 } })
// //       .toArray()
// //     : [];
// //   const classificationNameById = new Map(classificationOptions.map((option) => [
// //     String(option._id),
// //     option.name || '',
// //   ]));

// //   const itemIds = [...new Set(rows
// //     .map((row) => String(row.itemId || ''))
// //     .filter(isValidObjectId))]
// //     .map((id) => new Types.ObjectId(id));
// //   const itemFilter = { _id: { $in: itemIds } };
// //   if (b && isValidObjectId(b)) itemFilter.businessId = idMatch(b);
// //   const items = itemIds.length
// //     ? await mongoose.connection.db.collection('item')
// //       .find(itemFilter, { projection: { name: 1, itemCode: 1, image: 1 } })
// //       .toArray()
// //     : [];
// //   const itemById = new Map(items.map((item) => [String(item._id), item]));
// //   const businessIds = [...new Set(rows
// //     .map((row) => String(row.businessId || ''))
// //     .filter(isValidObjectId))]
// //     .map((id) => new Types.ObjectId(id));
// //   const businesses = businessIds.length
// //     ? await mongoose.connection.db.collection('business')
// //       .find({ _id: { $in: businessIds } }, { projection: { name: 1, businessPrintName: 1 } })
// //       .toArray()
// //     : [];
// //   const businessNameById = new Map(businesses.map((business) => [
// //     String(business._id),
// //     business.name || business.businessPrintName || '',
// //   ]));
// //   const itemCodes = [...new Set([
// //     ...items.map((item) => item.itemCode),
// //     ...rows.map((row) => row.ecommItemCode),
// //   ].map((value) => String(value || '').trim()).filter(Boolean))];
// //   const barcodeListFilter = {
// //     $or: [
// //       { itemId: { $in: [...itemIds, ...itemIds.map(String)] } },
// //       ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
// //     ],
// //   };
// //   if (b && isValidObjectId(b)) {
// //     barcodeListFilter.$and = [{
// //       $or: [
// //         { businessId: { $in: [b, new Types.ObjectId(b)] } },
// //         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
// //       ],
// //     }];
// //   }
// //   let barcodes = itemIds.length || itemCodes.length
// //     ? await mongoose.connection.db.collection('barcodeLabel')
// //       .find(barcodeListFilter, {
// //         projection: {
// //           itemId: 1,
// //           businessId: 1,
// //           currentBusinessId: 1,
// //           itemCode: 1,
// //           barcodeGenerated: 1,
// //           barcodeNo: 1,
// //           oldBarcode: 1,
// //           imageUrl: 1,
// //           filePath: 1,
// //         },
// //       })
// //       .collation({ locale: 'en', strength: 2 })
// //       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// //       .toArray()
// //     : [];
// //   if (b && isValidObjectId(b) && (itemIds.length || itemCodes.length)) {
// //     const linkedItemMatches = [
// //       ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
// //       ...itemCodes.flatMap((value) => {
// //         const exact = { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' };
// //         return [{ itemCode: exact }, { name: exact }];
// //       }),
// //     ];
// //     const linkedItems = linkedItemMatches.length
// //       ? await mongoose.connection.db.collection('item')
// //         .find({ businessId: idMatch(b), $or: linkedItemMatches })
// //         .project({ _id: 1, itemCode: 1, name: 1 })
// //         .toArray()
// //       : [];
// //     const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
// //     const linkedItemKeys = new Set(linkedItems.flatMap((item) =>
// //       [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
// //     ).filter(Boolean));
// //     const legacyBarcodeMatches = [
// //       ...(linkedItemIds.size
// //         ? [{ itemId: { $in: [...linkedItemIds, ...[...linkedItemIds].map((id) => new Types.ObjectId(id))] } }]
// //         : []),
// //       ...[...linkedItemKeys].flatMap((value) => {
// //         const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
// //         return [{ itemCode: exact }, { itemName: exact }];
// //       }),
// //     ];
// //     const legacyBarcodes = legacyBarcodeMatches.length
// //       ? await mongoose.connection.db.collection('barcodeLabel')
// //         .find({ $or: legacyBarcodeMatches }, {
// //           projection: {
// //             itemId: 1,
// //             businessId: 1,
// //             currentBusinessId: 1,
// //             itemCode: 1,
// //             barcodeGenerated: 1,
// //             barcodeNo: 1,
// //             oldBarcode: 1,
// //             imageUrl: 1,
// //             filePath: 1,
// //           },
// //         })
// //         .collation({ locale: 'en', strength: 2 })
// //         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
// //         .toArray()
// //       : [];
// //     const existingBarcodeIds = new Set(barcodes.map((barcode) => String(barcode._id)));
// //     barcodes = [
// //       ...barcodes,
// //       ...legacyBarcodes.filter((barcode) =>
// //         !existingBarcodeIds.has(String(barcode._id))
// //         && ((barcode.itemId && linkedItemIds.has(String(barcode.itemId)))
// //           || [barcode.itemCode, barcode.itemName].some((value) =>
// //             value && linkedItemKeys.has(String(value).trim().toLowerCase())))
// //       ),
// //     ];
// //   }
// //   const barcodeByItemId = new Map();
// //   const barcodeByItemCode = new Map();
// //   const imageByBarcode = new Map();
// //   const imageByItemId = new Map();
// //   const imageByItemCode = new Map();
// //   const barcodeValues = new Set();
// //   barcodes.forEach((barcode) => {
// //     const values = [barcode.barcodeGenerated, barcode.barcodeNo, barcode.oldBarcode]
// //       .map((value) => String(value || '').trim())
// //       .filter(Boolean);
// //     const value = values[0] || '';
// //     const itemId = barcode.itemId ? String(barcode.itemId) : '';
// //     if (itemId && value && !barcodeByItemId.has(itemId)) barcodeByItemId.set(itemId, value);
// //     values.forEach((barcodeValue) => barcodeValues.add(barcodeValue));
// //     const itemCodeKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// //     const currentItemCodeKey = itemCodeMapKey(barcode.currentBusinessId, barcode.itemCode);
// //     if (barcode.itemCode && value && !barcodeByItemCode.has(itemCodeKey)) {
// //       barcodeByItemCode.set(itemCodeKey, value);
// //     }
// //     if (barcode.itemCode && value && !barcodeByItemCode.has(currentItemCodeKey)) {
// //       barcodeByItemCode.set(currentItemCodeKey, value);
// //     }
// //     const storedImage = String(barcode.imageUrl || barcode.filePath || '').trim();
// //     const image = productImageSource(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
// //     if (!image) return;
// //     values.forEach((barcodeValue) => {
// //       const key = String(barcodeValue).trim().toLowerCase();
// //       if (key && !imageByBarcode.has(key)) imageByBarcode.set(key, image);
// //     });
// //     if (itemId && !imageByItemId.has(itemId)) imageByItemId.set(itemId, image);
// //     if (barcode.itemCode && !imageByItemCode.has(itemCodeKey)) imageByItemCode.set(itemCodeKey, image);
// //     if (barcode.itemCode && !imageByItemCode.has(currentItemCodeKey)) imageByItemCode.set(currentItemCodeKey, image);
// //   });
// //   rows.forEach((row) => {
// //     const value = String(row.barcode || '').trim();
// //     if (value) barcodeValues.add(value);
// //   });
// //   const productImageLookups = [
// //     ...[...barcodeValues].map((value) => ({
// //       barcodeGenerated: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
// //     })),
// //     ...itemCodes.map((value) => ({
// //       itemCode: { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' },
// //     })),
// //   ];
// //   const productImages = productImageLookups.length
// //     ? await ProductImage.find({ $or: productImageLookups })
// //       .sort({ createdAt: -1 })
// //       .select('barcodeGenerated itemCode imageUrl filePath')
// //       .lean()
// //     : [];
// //   const productImageBarcodes = new Set();
// //   productImages.forEach((productImage) => {
// //     const key = String(productImage.barcodeGenerated || '').trim().toLowerCase();
// //     const image = productImageSource(productImage.imageUrl || productImage.filePath || '');
// //     if (key && image && !productImageBarcodes.has(key)) {
// //       imageByBarcode.set(key, image);
// //       productImageBarcodes.add(key);
// //     }
// //     const itemCodeKey = String(productImage.itemCode || '').trim();
// //     if (image && itemCodeKey) {
// //       items.filter((item) =>
// //         String(item.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// //       ).forEach((item) => {
// //         const mapKey = itemCodeMapKey(item.businessId, item.itemCode);
// //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// //       });
// //       rows.filter((row) =>
// //         String(row.ecommItemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// //       ).forEach((row) => {
// //         const mapKey = itemCodeMapKey(row.businessId, row.ecommItemCode);
// //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// //       });
// //       barcodes.filter((barcode) =>
// //         String(barcode.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
// //       ).forEach((barcode) => {
// //         const mapKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
// //         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
// //       });
// //     }
// //   });

// //   return json({
// //     rows: rows.map((r) => {
// //       const row = plain(r);
// //       const item = itemById.get(String(r.itemId));
// //       const businessName = businessNameById.get(String(r.businessId));
// //       const barcode = row.barcode
// //         || barcodeByItemId.get(String(r.itemId))
// //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// //         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// //         || '';
// //       const productImage = [
// //         row.image,
// //         row.productImageUrl,
// //         row.primaryImage,
// //         row.imageUrl,
// //         row.barcodeImage,
// //         row.barcodeImageUrl,
// //         ...(Array.isArray(row.productImages) ? row.productImages : []),
// //         ...(Array.isArray(row.imageUrls) ? row.imageUrls : []),
// //         ...(Array.isArray(row.images) ? row.images : []),
// //         ...(Array.isArray(row.additionalImages)
// //           ? row.additionalImages
// //           : row.additionalImages ? [row.additionalImages] : []),
// //         item?.image,
// //       ].map((value) => {
// //         if (value && typeof value === 'object') {
// //           return value.url || value.imageUrl || value.src || value.path || '';
// //         }
// //         return value;
// //       }).find((value) => typeof value === 'string' && value.trim());
// //       return {
// //         ...row,
// //         ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
// //           `${key}Display`,
// //           (Array.isArray(r[key]) ? r[key] : [])
// //             .map((value) => classificationNameById.get(String(value)) || String(value || ''))
// //             .filter(Boolean)
// //             .join(', '),
// //         ])),
// //         barcode,
// //         barcodeImage: (productImage ? productImageSource(productImage) : '')
// //           || imageByBarcode.get(String(barcode).trim().toLowerCase())
// //           || imageByItemId.get(String(r.itemId))
// //           || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// //           || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// //           || '',
// //         businessName: businessName || '',
// //         itemLabel: item ? [item.itemCode, item.name].filter(Boolean).join(' - ') : '',
// //         ecommItemCode: row.ecommItemCode || item?.itemCode || '',
// //         _id: String(r._id),
// //       };
// //     }),
// //     labels: {},
// //     total,
// //     page,
// //     pages: Math.max(1, Math.ceil(total / perPage)),
// //     perPage,
// //   });
// // }

// // /* ---------------------------------------------------------------- add ---

// //    One product per item per business - the collection's own unique index
// //    (businessId + itemId). Every field the form sends is stored with the type
// //    the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
// //    ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
// //    know about are passed through as text, so a field added on the e-commerce
// //    side can be filled in here too. */
// // const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
// // const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished']);
// // const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
// // const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

// // export async function POST(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const body = await req.json().catch(() => ({}));
// //   const data = body.data || {};
// //   const business = body.business;
// //   if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
// //   if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
// //   if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

// //   await dbConnect();
// //   const col = mongoose.connection.db.collection(COLLECTION);

// //   const doc = {
// //     businessId: new Types.ObjectId(business),
// //     itemId: new Types.ObjectId(data.itemId),
// //   };
// //   Object.entries(data).forEach(([k, v]) => {
// //     if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
// //     if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
// //     else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
// //     else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
// //     else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
// //     else if (Array.isArray(v)) doc[k] = v;
// //     else doc[k] = v === null || v === undefined ? '' : String(v);
// //   });
// //   if (String(data.productType || '').trim().toUpperCase() === 'DUPATTA' && Array.isArray(data.byFabric)) {
// //     const fabricNames = data.byFabric
// //       .map((value) => String(value || '').trim())
// //       .filter((name) => DUPATTA_FABRIC_OPTIONS.includes(name));
// //     const fabricOptions = await Promise.all(fabricNames.map((name) =>
// //       ProductClassificationOption.findOneAndUpdate(
// //         {
// //           businessId: new Types.ObjectId(business),
// //           type: 'byFabric',
// //           name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
// //         },
// //         {
// //           $setOnInsert: {
// //             businessId: new Types.ObjectId(business),
// //             type: 'byFabric',
// //             name,
// //             displayOrder: 100 + DUPATTA_FABRIC_OPTIONS.indexOf(name),
// //             isActive: true,
// //           },
// //         },
// //         { upsert: true, new: true }
// //       ).select('_id').lean()
// //     ));
// //     doc.byFabric = [
// //       ...new Set([
// //         ...doc.byFabric.map(String),
// //         ...fabricOptions.map((option) => String(option._id)),
// //       ]),
// //     ].map((id) => new Types.ObjectId(id));
// //   }
// //   /* the shape the e-commerce project writes when a field is left empty */
// //   ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
// //   if (!doc.additionalImages) doc.additionalImages = [];
// //   if (!doc.status) doc.status = 'active';
// //   if (doc.isActive === undefined) doc.isActive = true;

// //   const now = new Date();
// //   doc.updatedAt = now;
// //   const productFilter = {
// //     businessId: idMatch(business),
// //     itemId: idMatch(data.itemId),
// //   };
// //   const existing = await col.findOne(productFilter, { projection: { _id: 1 } });
// //   if (existing) {
// //     const result = await col.updateOne(productFilter, { $set: doc });
// //     if (!result.matchedCount) {
// //       return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
// //     }
// //     return json({ ok: true, id: String(existing._id), updated: true });
// //   }

// //   doc.createdAt = now;
// //   doc.__v = 0;
// //   try {
// //     const res = await col.insertOne(doc);
// //     return json({ ok: true, id: String(res.insertedId) });
// //   } catch (e) {
// //     if (e && e.code === 11000) {
// //       const existingAfterRace = await col.findOne(productFilter, { projection: { _id: 1 } });
// //       if (!existingAfterRace) throw e;
// //       delete doc.createdAt;
// //       delete doc.__v;
// //       const result = await col.updateOne(productFilter, { $set: doc });
// //       if (!result.matchedCount) throw e;
// //       return json({ ok: true, id: String(existingAfterRace._id), updated: true });
// //     }
// //     throw e;
// //   }
// // }










// import mongoose, { isValidObjectId, Types } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
// import { escapeRegex } from '@/lib/validate';
// import ProductImage from '@/models/ProductImage';
// import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';
// import ProductClassificationOption from '@/models/ProductClassificationOption';
// import { DUPATTA_FABRIC_OPTIONS } from '@/lib/productClassificationConstants';

// /* /api/product-eccom - list only, read-only (19-10-2026).

//    Reads the `ecommerceproduct` collection that the separate e-commerce
//    project writes (one row per published product, built from barcodeLabel).
//    It is read through the raw driver - no Mongoose schema - on purpose: the
//    e-commerce side is still adding fields, and a schema here would silently
//    drop any field it does not list. Whatever is stored comes back as it is.

//    ?fields=1 answers just the field names present in the collection, so the
//    product-eccom page can build one column per field and a field added on the
//    e-commerce side shows up without a change here.

//    ?classifications=1 answers the business's productclassificationoption
//    rows grouped by type (byColour, byCraft, byFabric, byOccasion, byWeave) -
//    the choices the Add form offers for those lists.

//    ?barcodeOptions=1 returns a bounded, business-scoped barcode search for
//    the Add form's barcode picker.

//    POST adds one product (the Add form). No PUT or DELETE. */

// const json = (d, s = 200) => Response.json(d, { status: s });
// const COLLECTION = 'ecommerceproduct';
// const PER_PAGE = 10;
// const DEPLOYED_IMAGE_ORIGIN = 'https://erp.wovenessence.in';
// /* fields never shown as columns */
// const HIDDEN = new Set(['_id', '__v']);

// const normalizedFabricText = (value) => String(value || '')
//   .normalize('NFKD')
//   .replace(/[\u0300-\u036f]/g, '')
//   .toLowerCase()
//   .replace(/[^a-z0-9]+/g, ' ')
//   .trim();

// function matchDupattaFabric(values) {
//   const sourceText = values.map(normalizedFabricText).filter(Boolean).join(' ');
//   return DUPATTA_FABRIC_OPTIONS.find((name) => {
//     const normalizedName = normalizedFabricText(name);
//     const distinctiveName = normalizedName.replace(/\b(silk|dupatta)\b/g, '').trim();
//     return sourceText.includes(normalizedName)
//       || (distinctiveName && new RegExp(`\\b${escapeRegex(distinctiveName)}\\b`).test(sourceText));
//   }) || '';
// }

// function classificationTextValues(record) {
//   if (!record || typeof record !== 'object') return [];
//   return Object.entries(record)
//     .filter(([key]) => /^(?:displayName|printDescription|printDescriptionOverride|supplierDescription|itemName|description|fabric|fabricName|fabricDescription)$/i.test(key))
//     .flatMap(([, value]) => Array.isArray(value) ? value : [value])
//     .filter((value) => typeof value === 'string' || typeof value === 'number');
// }

// function productImageSource(value, ...barcodes) {
//   const source = imageUrl(value, ...barcodes);
//   return source.startsWith('/august_8A_images/')
//     ? `${DEPLOYED_IMAGE_ORIGIN}${source}`
//     : source;
// }

// /* ObjectIds become their string, everything else is passed through */
// function plain(value) {
//   if (value instanceof Types.ObjectId || value?._bsontype === 'ObjectId') return String(value);
//   if (Array.isArray(value)) return value.map(plain);
//   if (value instanceof Date) return value;
//   if (value && typeof value === 'object') {
//     return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, plain(v)]));
//   }
//   return value;
// }

// /* a business id may be stored as an ObjectId or as its string */
// const idMatch = (id) => ({ $in: [id, new Types.ObjectId(id)] });
// const itemCodeMapKey = (businessId, itemCode) =>
//   `${String(businessId || '')}:${String(itemCode || '').trim().toLowerCase()}`;

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   await dbConnect();
//   const col = mongoose.connection.db.collection(COLLECTION);

//   const filter = {};
//   const b = sp.get('business');
//   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

//   if (sp.get('barcodeOptions') === '1') {
//     if (!b || !isValidObjectId(b)) {
//       return json({ error: 'Select a valid business before searching barcodes.' }, 422);
//     }
//     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
//     const barcodeBusinessMatch = {
//       $or: [
//         { businessId: { $in: [b, new Types.ObjectId(b)] } },
//         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
//       ],
//     };
//     const search = (sp.get('search') || '').trim();
//     const codeMatch = search
//       ? {
//         $or: ['barcodeNo', 'barcodeGenerated', 'oldBarcode'].map((field) => ({
//           [field]: { $regex: escapeRegex(search), $options: 'i' },
//         })),
//       }
//       : null;
//     const scopedQuery = codeMatch
//       ? { $and: [barcodeBusinessMatch, codeMatch] }
//       : barcodeBusinessMatch;
//     let barcodeRows = await barcodeCollection.find(scopedQuery)
//       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
//       .limit(50)
//       .toArray();

//     if (!barcodeRows.length && search) {
//       const legacyRows = await barcodeCollection.find(codeMatch)
//         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
//         .limit(100)
//         .toArray();
//       const itemIds = [...new Set(legacyRows
//         .map((row) => String(row.itemId || ''))
//         .filter(isValidObjectId))]
//         .map((id) => new Types.ObjectId(id));
//       const itemKeys = [...new Set(legacyRows
//         .flatMap((row) => [row.itemCode, row.itemName])
//         .map((value) => String(value || '').trim())
//         .filter(Boolean))];
//       const itemMatches = [
//         ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
//         ...itemKeys.flatMap((value) => {
//           const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
//           return [{ itemCode: exact }, { name: exact }];
//         }),
//       ];
//       const linkedItems = itemMatches.length
//         ? await mongoose.connection.db.collection('item')
//           .find({ businessId: idMatch(b), $or: itemMatches })
//           .project({ _id: 1, itemCode: 1, name: 1 })
//           .toArray()
//         : [];
//       const linkedIds = new Set(linkedItems.map((item) => String(item._id)));
//       const linkedKeys = new Set(linkedItems.flatMap((item) =>
//         [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
//       ));
//       barcodeRows = legacyRows.filter((row) =>
//         (row.itemId && linkedIds.has(String(row.itemId)))
//         || [row.itemCode, row.itemName].some((value) =>
//           value && linkedKeys.has(String(value).trim().toLowerCase()))
//       );
//     }

//     const options = new Map();
//     barcodeRows.forEach((row) => {
//       const value = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
//       if (!value) return;
//       const key = value.toLowerCase();
//       if (!options.has(key)) {
//         options.set(key, {
//           value,
//           label: [value, row.itemCode || row.itemName].filter(Boolean).join(' - '),
//         });
//       }
//     });
//     return json({ options: [...options.values()] });
//   }

//   const barcode = (sp.get('barcodeLookup') || '').trim();
//   if (barcode) {
//     if (!b || !isValidObjectId(b)) return json({ error: 'Select a valid business before looking up a barcode.' }, 422);

//     const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
//     const barcodeBusinessMatch = {
//       $or: [
//         { businessId: { $in: [b, new Types.ObjectId(b)] } },
//         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
//       ],
//     };
//     const findBarcodeRows = async (businessFilter = {}) => {
//       let rows = await barcodeCollection.find({
//         $and: [businessFilter, inventoryBarcodeFilter(barcode)],
//       }).limit(50).toArray();
//       if (rows.length) return rows;

//       const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
//       return barcodeCollection.find({
//         $and: [
//           businessFilter,
//           {
//             $or: [
//               { barcodeGenerated: barcodeRx },
//               { barcodeNo: barcodeRx },
//               { oldBarcode: barcodeRx },
//             ],
//           },
//         ],
//       }).limit(50).toArray();
//     };
//     let barcodeRows = await findBarcodeRows(barcodeBusinessMatch);
//     const itemCollection = mongoose.connection.db.collection('item');
//     const itemBusinessFilter = { businessId: idMatch(b) };

//     /* Legacy barcode rows can retain their originating business even after
//        their linked inventory item has moved. Accept those only when that
//        item is confirmed to belong to the selected business. */
//     if (!barcodeRows.length) {
//       const allBarcodeRows = await findBarcodeRows();
//       if (allBarcodeRows.length) {
//         const itemIds = [...new Set(allBarcodeRows
//           .map((row) => String(row.itemId || ''))
//           .filter(isValidObjectId)
//           .map((id) => new Types.ObjectId(id)))];
//         const itemCodes = [...new Set(allBarcodeRows
//           .map((row) => String(row.itemCode || '').trim())
//           .filter(Boolean))];
//         const itemMatches = [
//           ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
//           ...itemCodes.map((code) => ({
//             itemCode: { $regex: `^${escapeRegex(code)}$`, $options: 'i' },
//           })),
//         ];
//         const linkedItems = itemMatches.length
//           ? await itemCollection.find({ ...itemBusinessFilter, $or: itemMatches }).toArray()
//           : [];
//         const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
//         const linkedItemCodes = new Set(linkedItems.map((item) =>
//           String(item.itemCode || '').trim().toLowerCase()));
//         barcodeRows = allBarcodeRows.filter((row) =>
//           (row.itemId && linkedItemIds.has(String(row.itemId)))
//           || (row.itemCode && linkedItemCodes.has(String(row.itemCode).trim().toLowerCase()))
//         );
//       }
//     }
//     const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
//       [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
//         .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
//     );
//     if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

//     let item = barcodeRow.itemId && isValidObjectId(String(barcodeRow.itemId))
//       ? await itemCollection.findOne({ _id: new Types.ObjectId(String(barcodeRow.itemId)), ...itemBusinessFilter })
//       : null;
//     const possibleItemKeys = [...new Set([
//       barcodeRow.itemCode,
//       barcodeRow.itemName,
//       barcodeRow.printDescription,
//       barcodeRow.supplierDescription,
//     ].map((value) => String(value || '').trim()).filter(Boolean))];
//     if (!item && possibleItemKeys.length) {
//       const exactMatches = possibleItemKeys.map((value) => {
//         const escaped = escapeRegex(value);
//         return [
//           { itemCode: { $regex: `^${escaped}$`, $options: 'i' } },
//           { name: { $regex: `^${escaped}$`, $options: 'i' } },
//         ];
//       }).flat();
//       item = await itemCollection.findOne({
//         ...itemBusinessFilter,
//         $or: exactMatches,
//       });
//     }
//     if (!item && barcodeRow.itemCode) {
//       const linkedProduct = await col.findOne({
//         businessId: idMatch(b),
//         ecommItemCode: { $regex: `^${escapeRegex(String(barcodeRow.itemCode).trim())}$`, $options: 'i' },
//       });
//       if (linkedProduct?.itemId && isValidObjectId(String(linkedProduct.itemId))) {
//         item = await itemCollection.findOne({
//           _id: new Types.ObjectId(String(linkedProduct.itemId)),
//           ...itemBusinessFilter,
//         });
//       }
//     }
//     if (!item) return json({ error: 'No inventory item is linked to this barcode.' }, 404);

//     const [group, hsn, product, productTypes, classificationOptions] = await Promise.all([
//       item.subGroupId && isValidObjectId(String(item.subGroupId))
//         ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(item.subGroupId)) })
//         : barcodeRow.groupId && isValidObjectId(String(barcodeRow.groupId))
//           ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(barcodeRow.groupId)) })
//           : barcodeRow.groupId
//             ? mongoose.connection.db.collection('productgroup').findOne({
//               $or: [
//                 { name: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
//                 { prefix: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
//               ],
//             })
//             : null,
//       item.hsnId && isValidObjectId(String(item.hsnId))
//         ? mongoose.connection.db.collection('hsn').findOne({ _id: new Types.ObjectId(String(item.hsnId)) })
//         : barcodeRow.hsn
//           ? mongoose.connection.db.collection('hsn').findOne({ code: { $regex: `^${escapeRegex(String(barcodeRow.hsn).trim())}$`, $options: 'i' } })
//         : null,
//       col.findOne({ businessId: idMatch(b), itemId: { $in: [item._id, String(item._id)] } }),
//       mongoose.connection.db.collection('producttypes')
//         .find({ businessId: { $in: [b, new Types.ObjectId(b)] }, isActive: { $ne: false } })
//         .project({ value: 1, label: 1 })
//         .toArray(),
//       mongoose.connection.db.collection('productclassificationoption')
//         .find({ businessId: idMatch(b), isActive: { $ne: false } })
//         .project({ type: 1, name: 1 })
//         .toArray(),
//     ]);
//     const barcodeImageCodes = [...new Set([
//       barcodeRow.barcodeGenerated,
//       barcodeRow.barcodeNo,
//       barcodeRow.oldBarcode,
//     ].map((value) => String(value || '').trim()).filter(Boolean))];
//     const barcodeImageRecord = barcodeImageCodes.length || item.itemCode
//       ? await ProductImage.findOne({
//         $or: [
//           ...(barcodeImageCodes.length ? [{ barcodeGenerated: { $in: barcodeImageCodes } }] : []),
//           ...(item.itemCode ? [{ itemCode: item.itemCode }] : []),
//         ],
//       }).sort({ createdAt: -1 }).select('imageUrl filePath').lean()
//       : null;
//     const barcodeImage = productImageSource(
//       barcodeRow.imageUrl
//         || barcodeRow.filePath
//         || barcodeImageRecord?.imageUrl
//         || barcodeImageRecord?.filePath
//         || '',
//       ...barcodeImageCodes,
//     );
//     const groupTypeCandidates = [group?.name, barcodeRow.groupId]
//       .map((value) => String(value || '').trim().toLowerCase())
//       .filter(Boolean);
//     const itemTypeCandidate = String(item.itemType || '').trim().toLowerCase();
//     const matchesProductType = (type, candidates) =>
//       candidates.includes(String(type.value || '').trim().toLowerCase())
//       || candidates.includes(String(type.label || '').trim().toLowerCase());
//     const matchedProductType = productTypes.find((type) =>
//       matchesProductType(type, groupTypeCandidates)
//     ) || productTypes.find((type) =>
//       matchesProductType(type, itemTypeCandidate ? [itemTypeCandidate] : [])
//     );
//     const productType = matchedProductType?.value || item.itemType || group?.name || barcodeRow.groupId || '';
//     const itemCode = item.itemCode || barcodeRow.itemCode || '';
//     const defaultData = {
//       displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
//       ecommItemCode: itemCode,
//       image: barcodeImage,
//       productType,
//       printDescriptionOverride: barcodeRow.printDescription || item.description || barcodeRow.supplierDescription || '',
//       ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
//       barcodePriceOverride: Number(barcodeRow.retailPrice || item.rsp || barcodeRow.offerPrice) || 0,
//       barcodeQtyOverride: Number(barcodeRow.qtyNum || barcodeRow.qty) || 0,
//       status: 'active',
//       isActive: true,
//       isPublished: false,
//       isFeatured: false,
//     };
//     const savedProduct = product ? plain(product) : {};
//     const classificationById = new Map(classificationOptions.map((option) => [
//       String(option._id),
//       option,
//     ]));
//     const classificationByName = new Map(classificationOptions.map((option) => [
//       `${option.type}:${String(option.name || '').trim().toLowerCase()}`,
//       option,
//     ]));
//     const classificationDefaults = Object.fromEntries(
//       ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].map((field) => {
//         const savedValues = savedProduct[field];
//         const barcodeValues = barcodeRow[field] ?? barcodeRow.customFields?.[field];
//         const source = Array.isArray(savedValues) && savedValues.length
//           ? savedValues
//           : savedValues && !Array.isArray(savedValues) ? savedValues : barcodeValues;
//         const values = Array.isArray(source)
//           ? source
//           : String(source || '').split(',').map((value) => value.trim()).filter(Boolean);
//         const selected = values.map((value) => {
//           const text = value && typeof value === 'object'
//             ? String(value._bsontype === 'ObjectId' ? value : value._id || value.id || value.value || value.name || '').trim()
//             : String(value || '').trim();
//           if (!text) return '';
//           const option = isValidObjectId(text)
//             ? classificationById.get(text)
//             : classificationByName.get(`${field}:${text.toLowerCase()}`);
//           return option && option.type === field ? String(option._id) : '';
//         }).filter(Boolean);
//         if (field === 'byFabric' && String(productType).trim().toUpperCase() === 'DUPATTA') {
//           const savedFabricNames = values
//             .map((value) => {
//               const text = value && typeof value === 'object'
//                 ? String(value.name || value.label || '').trim()
//                 : String(value || '').trim();
//               return DUPATTA_FABRIC_OPTIONS.find((name) =>
//                 name.toLowerCase() === text.toLowerCase()
//               ) || '';
//             })
//             .filter(Boolean);
//           const optionFabricNames = selected
//             .map((id) => classificationById.get(id)?.name || '')
//             .filter((name) => DUPATTA_FABRIC_OPTIONS.some((option) =>
//               option.toLowerCase() === name.toLowerCase()
//             ));
//           const matchedFabric = savedFabricNames[0] || optionFabricNames[0] || matchDupattaFabric([
//             barcodeRow.printDescription,
//             barcodeRow.supplierDescription,
//             barcodeRow.itemName,
//             barcodeRow.itemCode,
//             ...classificationTextValues(barcodeRow),
//             ...classificationTextValues(savedProduct),
//             item.name,
//             item.itemCode,
//             item.description,
//             ...classificationTextValues(item),
//           ]);
//           if (matchedFabric) return [field, [matchedFabric]];
//         }
//         return [field, [...new Set(selected)]];
//       })
//     );

//     return json({
//       barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
//       /* the label's own number, as stored (case included) - what the Add form saves */
//       barcodeNo: barcodeRow.barcodeNo || barcodeRow.oldBarcode || '',
//       item: {
//         id: String(item._id),
//         itemCode,
//         name: item.name || barcodeRow.itemName || '',
//         itemType: item.itemType || '',
//         group: group?.name || barcodeRow.groupId || '',
//         hsnCode: hsn?.code || barcodeRow.hsn || '',
//       },
//       data: {
//         ...defaultData,
//         ...savedProduct,
//         ...classificationDefaults,
//         displayName: savedProduct.displayName || defaultData.displayName,
//         ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
//         image: savedProduct.image || defaultData.image,
//         /* a saved product keeps the type it was saved with, so editing never resets it */
//         productType: savedProduct.productType || defaultData.productType || '',
//         printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
//         ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
//         barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
//         barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
//         status: savedProduct.status || defaultData.status,
//       },
//     });
//   }

//   /* the by* choices for the Add form, from productclassificationoption */
//   if (sp.get('classifications') === '1') {
//     const opts = await mongoose.connection.db.collection('productclassificationoption')
//       .find({ ...filter, isActive: { $ne: false } })
//       .sort({ type: 1, displayOrder: 1, name: 1 })
//       .toArray();
//     const byType = {};
//     opts.forEach((o) => { (byType[o.type] ||= []).push({ value: String(o._id), label: o.name || '' }); });
//     return json({ classifications: byType });
//   }

//   /* the field names actually present, in first-seen order */
//   if (sp.get('fields') === '1') {
//     const sample = await col.find(filter).limit(500).toArray();
//     const seen = [];
//     sample.forEach((d) => Object.keys(d).forEach((k) => { if (!HIDDEN.has(k) && !seen.includes(k)) seen.push(k); }));
//     const types = {};
//     sample.forEach((d) => seen.forEach((k) => {
//       if (types[k] || d[k] === undefined || d[k] === null || d[k] === '') return;
//       const v = d[k];
//       types[k] = Array.isArray(v) ? 'array' : v instanceof Date ? 'date' : typeof v === 'boolean' ? 'boolean'
//         : typeof v === 'number' ? 'number' : (v instanceof Types.ObjectId || v?._bsontype === 'ObjectId') ? 'id' : 'text';
//     }));
//     return json({ fields: seen.map((k) => ({ k, type: types[k] || 'text' })) });
//   }

//   const page = Math.max(1, Number(sp.get('page') || 1));
//   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));

//   const search = (sp.get('search') || '').trim();
//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
//   }

//   /* column-header sort: any plain field name; newest first otherwise */
//   const sortBy = sp.get('sortBy');
//   const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
//   const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
//     ? { [sortBy]: dir, _id: 1 }
//     : { updatedAt: -1, createdAt: -1, _id: -1 };

//   const total = await col.countDocuments(filter);
//   const rows = await col.find(filter)
//     .sort(sort)
//     .collation({ locale: 'en', strength: 2, numericOrdering: true })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .toArray();

//   const classificationIds = [...new Set(rows.flatMap((row) =>
//     ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
//       .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
//       .map((value) => String(value || ''))
//       .filter(isValidObjectId)
//   ))].map((id) => new Types.ObjectId(id));
//   const classificationOptions = classificationIds.length
//     ? await mongoose.connection.db.collection('productclassificationoption')
//       .find({ _id: { $in: classificationIds } }, { projection: { name: 1 } })
//       .toArray()
//     : [];
//   const classificationNameById = new Map(classificationOptions.map((option) => [
//     String(option._id),
//     option.name || '',
//   ]));

//   const itemIds = [...new Set(rows
//     .map((row) => String(row.itemId || ''))
//     .filter(isValidObjectId))]
//     .map((id) => new Types.ObjectId(id));
//   const itemFilter = { _id: { $in: itemIds } };
//   if (b && isValidObjectId(b)) itemFilter.businessId = idMatch(b);
//   const items = itemIds.length
//     ? await mongoose.connection.db.collection('item')
//       .find(itemFilter, { projection: { name: 1, itemCode: 1, image: 1 } })
//       .toArray()
//     : [];
//   const itemById = new Map(items.map((item) => [String(item._id), item]));
//   const businessIds = [...new Set(rows
//     .map((row) => String(row.businessId || ''))
//     .filter(isValidObjectId))]
//     .map((id) => new Types.ObjectId(id));
//   const businesses = businessIds.length
//     ? await mongoose.connection.db.collection('business')
//       .find({ _id: { $in: businessIds } }, { projection: { name: 1, businessPrintName: 1 } })
//       .toArray()
//     : [];
//   const businessNameById = new Map(businesses.map((business) => [
//     String(business._id),
//     business.name || business.businessPrintName || '',
//   ]));
//   const itemCodes = [...new Set([
//     ...items.map((item) => item.itemCode),
//     ...rows.map((row) => row.ecommItemCode),
//   ].map((value) => String(value || '').trim()).filter(Boolean))];
//   const barcodeListFilter = {
//     $or: [
//       { itemId: { $in: [...itemIds, ...itemIds.map(String)] } },
//       ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
//     ],
//   };
//   if (b && isValidObjectId(b)) {
//     barcodeListFilter.$and = [{
//       $or: [
//         { businessId: { $in: [b, new Types.ObjectId(b)] } },
//         { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
//       ],
//     }];
//   }
//   let barcodes = itemIds.length || itemCodes.length
//     ? await mongoose.connection.db.collection('barcodeLabel')
//       .find(barcodeListFilter, {
//         projection: {
//           itemId: 1,
//           businessId: 1,
//           currentBusinessId: 1,
//           itemCode: 1,
//           barcodeGenerated: 1,
//           barcodeNo: 1,
//           oldBarcode: 1,
//           imageUrl: 1,
//           filePath: 1,
//         },
//       })
//       .collation({ locale: 'en', strength: 2 })
//       .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
//       .toArray()
//     : [];
//   if (b && isValidObjectId(b) && (itemIds.length || itemCodes.length)) {
//     const linkedItemMatches = [
//       ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
//       ...itemCodes.flatMap((value) => {
//         const exact = { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' };
//         return [{ itemCode: exact }, { name: exact }];
//       }),
//     ];
//     const linkedItems = linkedItemMatches.length
//       ? await mongoose.connection.db.collection('item')
//         .find({ businessId: idMatch(b), $or: linkedItemMatches })
//         .project({ _id: 1, itemCode: 1, name: 1 })
//         .toArray()
//       : [];
//     const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
//     const linkedItemKeys = new Set(linkedItems.flatMap((item) =>
//       [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
//     ).filter(Boolean));
//     const legacyBarcodeMatches = [
//       ...(linkedItemIds.size
//         ? [{ itemId: { $in: [...linkedItemIds, ...[...linkedItemIds].map((id) => new Types.ObjectId(id))] } }]
//         : []),
//       ...[...linkedItemKeys].flatMap((value) => {
//         const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
//         return [{ itemCode: exact }, { itemName: exact }];
//       }),
//     ];
//     const legacyBarcodes = legacyBarcodeMatches.length
//       ? await mongoose.connection.db.collection('barcodeLabel')
//         .find({ $or: legacyBarcodeMatches }, {
//           projection: {
//             itemId: 1,
//             businessId: 1,
//             currentBusinessId: 1,
//             itemCode: 1,
//             barcodeGenerated: 1,
//             barcodeNo: 1,
//             oldBarcode: 1,
//             imageUrl: 1,
//             filePath: 1,
//           },
//         })
//         .collation({ locale: 'en', strength: 2 })
//         .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
//         .toArray()
//       : [];
//     const existingBarcodeIds = new Set(barcodes.map((barcode) => String(barcode._id)));
//     barcodes = [
//       ...barcodes,
//       ...legacyBarcodes.filter((barcode) =>
//         !existingBarcodeIds.has(String(barcode._id))
//         && ((barcode.itemId && linkedItemIds.has(String(barcode.itemId)))
//           || [barcode.itemCode, barcode.itemName].some((value) =>
//             value && linkedItemKeys.has(String(value).trim().toLowerCase())))
//       ),
//     ];
//   }
//   const barcodeByItemId = new Map();
//   const barcodeByItemCode = new Map();
//   const imageByBarcode = new Map();
//   const imageByItemId = new Map();
//   const imageByItemCode = new Map();
//   const barcodeValues = new Set();
//   barcodes.forEach((barcode) => {
//     const values = [barcode.barcodeGenerated, barcode.barcodeNo, barcode.oldBarcode]
//       .map((value) => String(value || '').trim())
//       .filter(Boolean);
//     const value = values[0] || '';
//     const itemId = barcode.itemId ? String(barcode.itemId) : '';
//     if (itemId && value && !barcodeByItemId.has(itemId)) barcodeByItemId.set(itemId, value);
//     values.forEach((barcodeValue) => barcodeValues.add(barcodeValue));
//     const itemCodeKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
//     const currentItemCodeKey = itemCodeMapKey(barcode.currentBusinessId, barcode.itemCode);
//     if (barcode.itemCode && value && !barcodeByItemCode.has(itemCodeKey)) {
//       barcodeByItemCode.set(itemCodeKey, value);
//     }
//     if (barcode.itemCode && value && !barcodeByItemCode.has(currentItemCodeKey)) {
//       barcodeByItemCode.set(currentItemCodeKey, value);
//     }
//     const storedImage = String(barcode.imageUrl || barcode.filePath || '').trim();
//     const image = productImageSource(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
//     if (!image) return;
//     values.forEach((barcodeValue) => {
//       const key = String(barcodeValue).trim().toLowerCase();
//       if (key && !imageByBarcode.has(key)) imageByBarcode.set(key, image);
//     });
//     if (itemId && !imageByItemId.has(itemId)) imageByItemId.set(itemId, image);
//     if (barcode.itemCode && !imageByItemCode.has(itemCodeKey)) imageByItemCode.set(itemCodeKey, image);
//     if (barcode.itemCode && !imageByItemCode.has(currentItemCodeKey)) imageByItemCode.set(currentItemCodeKey, image);
//   });
//   rows.forEach((row) => {
//     const value = String(row.barcode || '').trim();
//     if (value) barcodeValues.add(value);
//   });
//   const productImageLookups = [
//     ...[...barcodeValues].map((value) => ({
//       barcodeGenerated: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
//     })),
//     ...itemCodes.map((value) => ({
//       itemCode: { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' },
//     })),
//   ];
//   const productImages = productImageLookups.length
//     ? await ProductImage.find({ $or: productImageLookups })
//       .sort({ createdAt: -1 })
//       .select('barcodeGenerated itemCode imageUrl filePath')
//       .lean()
//     : [];
//   const productImageBarcodes = new Set();
//   productImages.forEach((productImage) => {
//     const key = String(productImage.barcodeGenerated || '').trim().toLowerCase();
//     const image = productImageSource(productImage.imageUrl || productImage.filePath || '');
//     if (key && image && !productImageBarcodes.has(key)) {
//       imageByBarcode.set(key, image);
//       productImageBarcodes.add(key);
//     }
//     const itemCodeKey = String(productImage.itemCode || '').trim();
//     if (image && itemCodeKey) {
//       items.filter((item) =>
//         String(item.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
//       ).forEach((item) => {
//         const mapKey = itemCodeMapKey(item.businessId, item.itemCode);
//         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
//       });
//       rows.filter((row) =>
//         String(row.ecommItemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
//       ).forEach((row) => {
//         const mapKey = itemCodeMapKey(row.businessId, row.ecommItemCode);
//         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
//       });
//       barcodes.filter((barcode) =>
//         String(barcode.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
//       ).forEach((barcode) => {
//         const mapKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
//         if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
//       });
//     }
//   });

//   return json({
//     rows: rows.map((r) => {
//       const row = plain(r);
//       const item = itemById.get(String(r.itemId));
//       const businessName = businessNameById.get(String(r.businessId));
//       const barcode = row.barcode
//         || barcodeByItemId.get(String(r.itemId))
//         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
//         || barcodeByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
//         || '';
//       const productImage = [
//         row.image,
//         row.productImageUrl,
//         row.primaryImage,
//         row.imageUrl,
//         row.barcodeImage,
//         row.barcodeImageUrl,
//         ...(Array.isArray(row.productImages) ? row.productImages : []),
//         ...(Array.isArray(row.imageUrls) ? row.imageUrls : []),
//         ...(Array.isArray(row.images) ? row.images : []),
//         ...(Array.isArray(row.additionalImages)
//           ? row.additionalImages
//           : row.additionalImages ? [row.additionalImages] : []),
//         item?.image,
//       ].map((value) => {
//         if (value && typeof value === 'object') {
//           return value.url || value.imageUrl || value.src || value.path || '';
//         }
//         return value;
//       }).find((value) => typeof value === 'string' && value.trim());
//       return {
//         ...row,
//         ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
//           `${key}Display`,
//           (Array.isArray(r[key]) ? r[key] : [])
//             .map((value) => classificationNameById.get(String(value)) || String(value || ''))
//             .filter(Boolean)
//             .join(', '),
//         ])),
//         barcode,
//         barcodeImage: (productImage ? productImageSource(productImage) : '')
//           || imageByBarcode.get(String(barcode).trim().toLowerCase())
//           || imageByItemId.get(String(r.itemId))
//           || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
//           || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
//           || '',
//         businessName: businessName || '',
//         itemLabel: item ? [item.itemCode, item.name].filter(Boolean).join(' - ') : '',
//         ecommItemCode: row.ecommItemCode || item?.itemCode || '',
//         _id: String(r._id),
//       };
//     }),
//     labels: {},
//     total,
//     page,
//     pages: Math.max(1, Math.ceil(total / perPage)),
//     perPage,
//   });
// }

// /* ---------------------------------------------------------------- add ---

//    One product per item per business - the collection's own unique index
//    (businessId + itemId). Every field the form sends is stored with the type
//    the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
//    ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
//    know about are passed through as text, so a field added on the e-commerce
//    side can be filled in here too. */
// const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
// const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished']);
// const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
// const SYSTEM = new Set(['_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt']);

// export async function POST(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const body = await req.json().catch(() => ({}));
//   const data = body.data || {};
//   const business = body.business;
//   if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
//   if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);
//   if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

//   await dbConnect();
//   const col = mongoose.connection.db.collection(COLLECTION);

//   const doc = {
//     businessId: new Types.ObjectId(business),
//     itemId: new Types.ObjectId(data.itemId),
//   };
//   Object.entries(data).forEach(([k, v]) => {
//     if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) return;
//     if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
//     else if (BOOL_FIELDS.has(k)) doc[k] = v === true || v === 'true' || v === 'yes';
//     else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
//     else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
//     else if (Array.isArray(v)) doc[k] = v;
//     else doc[k] = v === null || v === undefined ? '' : String(v);
//   });
//   if (String(data.productType || '').trim().toUpperCase() === 'DUPATTA' && Array.isArray(data.byFabric)) {
//     const fabricNames = data.byFabric
//       .map((value) => String(value || '').trim())
//       .filter((name) => DUPATTA_FABRIC_OPTIONS.includes(name));
//     const fabricOptions = await Promise.all(fabricNames.map((name) =>
//       ProductClassificationOption.findOneAndUpdate(
//         {
//           businessId: new Types.ObjectId(business),
//           type: 'byFabric',
//           name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
//         },
//         {
//           $setOnInsert: {
//             businessId: new Types.ObjectId(business),
//             type: 'byFabric',
//             name,
//             displayOrder: 100 + DUPATTA_FABRIC_OPTIONS.indexOf(name),
//             isActive: true,
//           },
//         },
//         { upsert: true, new: true }
//       ).select('_id').lean()
//     ));
//     doc.byFabric = [
//       ...new Set([
//         ...doc.byFabric.map(String),
//         ...fabricOptions.map((option) => String(option._id)),
//       ]),
//     ].map((id) => new Types.ObjectId(id));
//   }
//   /* the shape the e-commerce project writes when a field is left empty */
//   ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
//   if (!doc.additionalImages) doc.additionalImages = [];
//   if (!doc.status) doc.status = 'active';
//   if (doc.isActive === undefined) doc.isActive = true;

//   const now = new Date();
//   doc.updatedAt = now;
//   const productFilter = {
//     businessId: idMatch(business),
//     itemId: idMatch(data.itemId),
//   };
//   const existing = await col.findOne(productFilter, { projection: { _id: 1 } });
//   if (existing) {
//     const result = await col.updateOne(productFilter, { $set: doc });
//     if (!result.matchedCount) {
//       return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
//     }
//     return json({ ok: true, id: String(existing._id), updated: true });
//   }

//   doc.createdAt = now;
//   doc.__v = 0;
//   try {
//     const res = await col.insertOne(doc);
//     return json({ ok: true, id: String(res.insertedId) });
//   } catch (e) {
//     if (e && e.code === 11000) {
//       const existingAfterRace = await col.findOne(productFilter, { projection: { _id: 1 } });
//       if (!existingAfterRace) throw e;
//       delete doc.createdAt;
//       delete doc.__v;
//       const result = await col.updateOne(productFilter, { $set: doc });
//       if (!result.matchedCount) throw e;
//       return json({ ok: true, id: String(existingAfterRace._id), updated: true });
//     }
//     throw e;
//   }
// }










import mongoose, { isValidObjectId, Types } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { escapeRegex } from '@/lib/validate';
import { parseEcommerceVisibility } from '@/lib/ecommerceVisibility';
import ProductImage from '@/models/ProductImage';
import { barcodeFilter as inventoryBarcodeFilter, erpImageForBarcode, imageUrl, unitFor } from '@/lib/inventory';
import { BARCODE_STATUS } from '@/lib/barcodeLabel';
import { classificationOptionsById, listClassificationOptions } from '@/lib/classificationCollections';
import { Agent, Supplier } from '@/lib/contacts';

/* /api/product-eccom - list only, read-only (19-10-2026).

   Reads the `ecommerceproduct` collection that the separate e-commerce
   project writes (one row per published product, built from barcodeLabel).
   It is read through the raw driver - no Mongoose schema - on purpose: the
   e-commerce side is still adding fields, and a schema here would silently
   drop any field it does not list. Whatever is stored comes back as it is.

   ?fields=1 answers just the field names present in the collection, so the
   product-eccom page can build one column per field and a field added on the
   e-commerce side shows up without a change here.

   ?classifications=1 answers the business's classification names grouped by
   type (byColour, byCraft, byFabric, byOccasion, byWeave) - the choices the
   Add form offers for those lists. Since 29-10-2026 they come from byweave /
   byfabric / bycraft / byoccasion / bycolour (lib/classificationCollections.js);
   productclassificationoption is no longer used.

   ?barcodeOptions=1 returns a bounded, business-scoped barcode search for
   the Add form's barcode picker.

   POST adds one product (the Add form). No PUT or DELETE. */

const json = (d, s = 200) => Response.json(d, { status: s });
const COLLECTION = 'ecommerceproduct';
const PER_PAGE = 10;
/* fields never shown as columns */
const HIDDEN = new Set(['_id', '__v']);

const normalizedFabricText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

/* the first of `names` (the Dupatta group's By Fabric names) that the text mentions */
function matchDupattaFabric(values, names) {
  const sourceText = values.map(normalizedFabricText).filter(Boolean).join(' ');
  return names.find((name) => {
    const normalizedName = normalizedFabricText(name);
    const distinctiveName = normalizedName.replace(/\b(silk|dupatta)\b/g, '').trim();
    return sourceText.includes(normalizedName)
      || (distinctiveName && new RegExp(`\\b${escapeRegex(distinctiveName)}\\b`).test(sourceText));
  }) || '';
}

function classificationTextValues(record) {
  if (!record || typeof record !== 'object') return [];
  return Object.entries(record)
    .filter(([key]) => /^(?:displayName|printDescription|printDescriptionOverride|supplierDescription|itemName|description|fabric|fabricName|fabricDescription)$/i.test(key))
    .flatMap(([, value]) => Array.isArray(value) ? value : [value])
    .filter((value) => typeof value === 'string' || typeof value === 'number');
}

/* One resolver for every image source this screen reads: barcodeLabel.imageUrl /
   filePath, ecommerceproduct.image, or an uploaded productImage record. imageUrl()
   turns a stored path into a URL that actually loads (the legacy ERP files under
   /images/<prefix>/ are served from the ERP media origin, not from this app) and
   answers '' - not a dead link - when the photo genuinely is not there. */
const productImageSource = (value, ...barcodes) => imageUrl(value, ...barcodes)
  /* nothing stored on the row: the legacy ERP still files a photo under the
     barcode itself, so try that before giving up on this product */
  || barcodes.map((barcode) => erpImageForBarcode(barcode)).find(Boolean)
  || '';

/* ONE PRODUCT ROW, MANY BARCODES.

   The e-commerce collection holds one row per ITEM (unique index businessId +
   itemId), but an item is not a piece: 3PC-ASUIT carries a whole batch of
   labels (8A2837, 9A1058, ...), and each of those is a different physical
   garment with its own photo, its own print description and its own price.
   The row itself names the barcode it was saved for (`barcode`).

   So its image, its product type and its By Weave / By Fabric / By Craft /
   By Occasion choices describe THAT barcode and nobody else's. Reading them
   for a sibling barcode is what put 9A1058's beige photo, and its saree
   classification, under 8A2837 - which is why the reference ERP (one row per
   barcode) and this screen disagreed about the same number.

   An empty barcode on older rows predates the barcode box and remains eligible
   for the barcode being looked up. Only the row's PRIMARY barcode owns its
   per-barcode fields: a sibling number, even when listed in `barcodes`, is a
   different piece and must never inherit this row's image/price/type. */
const primaryBarcodeOf = (product) => String(
  product?.barcode || product?.barcodeNo || product?.barcodeGenerated || ''
).trim();

const productOwnsBarcode = (product, barcode) => {
  const saved = primaryBarcodeOf(product).toLowerCase();
  if (!saved) return true;
  return saved === String(barcode || '').trim().toLowerCase();
};

/* ------------------------------------------------- per-barcode visibility ---

   One e-commerce product row describes one ITEM, but an item carries many
   barcodes. The row-level `isPublished` used to answer "show in e-commerce"
   for every one of them, so ticking the box on one barcode silently published
   its siblings too. `publishedBarcodes` records the barcodes the operator
   actually ticked, and `isPublished` stays as the aggregate the storefront
   reads (one product per item).

   Rows written before `publishedBarcodes` existed have no per-barcode answer.
   For those only the barcode the row was saved for follows the old flag; a
   sibling starts unchecked instead of inheriting another garment's setting. */
const barcodeVisibilityKey = (value) => String(value || '').trim().toLowerCase();

const explicitPublishedBarcodes = (product) => (
  Array.isArray(product?.publishedBarcodes) ? product.publishedBarcodes : null
);

const productVisibleForBarcode = (product, barcode) => {
  const key = barcodeVisibilityKey(barcode);
  if (!product || !key) return false;
  const explicit = explicitPublishedBarcodes(product);
  if (explicit) return explicit.some((value) => barcodeVisibilityKey(value) === key);
  /* legacy row: only its own saved barcode follows isPublished */
  const primary = barcodeVisibilityKey(product.barcode || product.barcodeNo || product.barcodeGenerated);
  return Boolean(primary && primary === key)
    && parseEcommerceVisibility(product.isPublished) === true;
};

/* The product's published list after setting ONE barcode. Other barcodes are
   carried over untouched, so saving 9A1058 can never disable 8A2837. */
const withBarcodeVisibility = (product, barcode, publish) => {
  const key = barcodeVisibilityKey(barcode);
  const explicit = explicitPublishedBarcodes(product);
  if (!explicit && publish === undefined) {
    /* old caller that does not send the flag: leave the row exactly as it was */
    return { list: undefined, isPublished: parseEcommerceVisibility(product?.isPublished) ?? false };
  }
  const primary = primaryBarcodeOf(product);
  const base = explicit
    ? explicit.filter(Boolean)
    : (primary && productVisibleForBarcode(product, primary) ? [primary] : []);
  const byKey = new Map(base.map((value) => [barcodeVisibilityKey(value), String(value).trim()]));
  if (key && publish === true) byKey.set(key, String(barcode).trim());
  if (key && publish === false) byKey.delete(key);
  const list = [...byKey.values()].filter(Boolean);
  return { list, isPublished: list.length > 0 };
};

/* the fields of a saved product that describe its own barcode rather than the
   item - dropped entirely when the product belongs to a different label */
const PER_BARCODE_FIELDS = [
  'image', 'productType', 'printDescriptionOverride',
  'barcodePriceOverride', 'barcodeQtyOverride',
  'byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour',
];
const withoutPerBarcodeFields = (product) => {
  if (!product) return {};
  const row = { ...product };
  PER_BARCODE_FIELDS.forEach((key) => { delete row[key]; });
  return row;
};

/* A stored image whose file name is ANOTHER barcode's number is a sibling
   piece's photo living on the item's single row (e.g. 4A1174.jpg saved on the
   row filed for 4A1139), so it must not be shown for this label. Files named
   after anything else - item codes, uploaded hashes - are left alone. */
const BARCODE_FILE_NAME = /^\d{1,2}[A-Z]\d{3,6}$/i;
const imageBelongsToBarcode = (src, codes) => {
  const stem = String(src || '').split(/[?#]/)[0].split('/').pop().replace(/\.[a-z0-9]+$/i, '');
  if (!BARCODE_FILE_NAME.test(stem)) return true;
  return codes.some((code) => code.toLowerCase() === stem.toLowerCase());
};
const ownBarcodeImage = (src, codes) => (src && imageBelongsToBarcode(src, codes) ? src : '');

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
const itemCodeMapKey = (businessId, itemCode) =>
  `${String(businessId || '')}:${String(itemCode || '').trim().toLowerCase()}`;

/* ------------------------------------------------- product list filters ---

   The Ecommerce Product page offers the Master Stock Report's filters. These
   products are built from barcodeLabel, so the same fields (and the same
   relationships - item -> group, supplier -> city/agent) are what the filter
   has to read. Everything below resolves to clauses on barcodeLabel and is
   applied in Mongo BEFORE paging, so a filtered list still pages and counts
   the correct set.

   The two spellings the collection stores are both accepted throughout:
   supplierId holds either a vendor _id or its contactId code, prices/pcts are
   declared Strings but the warehouse import wrote real Numbers, and uom holds
   a unit NAME rather than the Uom _id.
   ------------------------------------------------------------------------- */
const trimmed = (v) => String(v ?? '').trim();

const manyValues = (sp, key) => String(sp.get(key) || '')
  .split(',')
  .map((v) => v.trim())
  .filter(Boolean);

const containsAny = (values) => ({
  $in: values.map((v) => new RegExp(escapeRegex(v), 'i')),
});

const numericExpr = (path) => ({
  $convert: { input: path, to: 'double', onError: null, onNull: null },
});

/* COST PRICE as the rest of the app computes it: finalNet when it carries a
   figure, else purRate. */
const COST_EXPR = {
  $let: {
    vars: {
      fn: { $convert: { input: '$finalNet', to: 'double', onError: 0, onNull: 0 } },
      pr: { $convert: { input: '$purRate', to: 'double', onError: 0, onNull: 0 } },
    },
    in: { $cond: [{ $gt: ['$$fn', 0] }, '$$fn', '$$pr'] },
  },
};

/* One clause for "this barcode row belongs to one of these items", using the
   same keys the list itself uses to reach a row's item: the real itemId, the
   itemCode and the itemName an older import may have left the style code in. */
function itemLinkClause(items) {
  const ids = items.map((item) => item._id).filter(Boolean);
  const keys = [...new Set(items
    .flatMap((item) => [trimmed(item.itemCode), trimmed(item.name)])
    .filter(Boolean))];
  if (!ids.length && !keys.length) {
    /* a group/item that reaches nothing must match nothing, not drop the
       filter and return the whole catalogue */
    return { $or: [{ itemId: { $in: [] } }] };
  }
  return {
    $or: [
      { itemId: { $in: [...ids, ...ids.map(String)] } },
      ...(keys.length ? [{ itemCode: { $in: keys } }, { itemName: { $in: keys } }] : []),
    ],
  };
}

const vendorKeys = (vendors) => [...new Set(vendors
  .flatMap((vendor) => [String(vendor._id), trimmed(vendor.contactId)])
  .filter(Boolean))];

const FILTER_KEYS = [
  'barcodeNo', 'groupName', 'itemId', 'hsn', 'gst', 'locationFilter',
  'city', 'supplierId', 'agentId', 'uom',
  'rspMin', 'rspMax', 'rspOfferPriceMin', 'rspOfferPriceMax',
  'wspMin', 'wspMax', 'ecomMin', 'ecomMax',
  'ageMin', 'ageMax', 'costPriceMin', 'costPriceMax', 'discount',
  'patternSupplierNo', 'patternGrcNo', 'patternSlNo', 'patternQty',
  'startDate', 'endDate',
];

async function resolveProductFilters(sp, businessId) {
  const ands = [];
  const exprs = [];
  const active = FILTER_KEYS.some((key) => trimmed(sp.get(key)) !== '');
  const database = mongoose.connection.db;
  const itemCollection = database.collection('item');

  const barcodeNos = manyValues(sp, 'barcodeNo');
  if (barcodeNos.length) {
    ands.push({
      $or: [
        { barcodeNo: containsAny(barcodeNos) },
        { barcodeGenerated: containsAny(barcodeNos) },
        { oldBarcode: containsAny(barcodeNos) },
      ],
    });
  }

  const hsn = trimmed(sp.get('hsn'));
  if (hsn) ands.push({ hsn: { $regex: escapeRegex(hsn), $options: 'i' } });

  /* GST % compared as a NUMBER - see the Master Stock Report route: the same
     slab is stored as "5" on generated rows and 5 on imported ones. */
  const gstRaw = trimmed(sp.get('gst')).replace(/%/g, '').trim();
  if (gstRaw) {
    const gstNum = Number(gstRaw);
    exprs.push(Number.isFinite(gstNum)
      ? { $eq: [numericExpr('$gst'), gstNum] }
      : { $literal: false });
  }

  /* UOM is picked as a Uom _id but stored as the unit's NAME. */
  const uomRaw = trimmed(sp.get('uom'));
  if (uomRaw) {
    let names = [uomRaw];
    if (isValidObjectId(uomRaw)) {
      const unit = await database.collection('uom')
        .findOne({ _id: new Types.ObjectId(uomRaw) }, { projection: { name: 1, shortName: 1 } });
      names = [trimmed(unit?.name), trimmed(unit?.shortName)].filter(Boolean);
    }
    ands.push({ uom: { $in: names.map((name) => new RegExp('^' + escapeRegex(name) + '$', 'i')) } });
  }

  /* GROUP NAME is the ITEM's group (Item.subGroupId), the same source the
     Master Stock Report reads it from. */
  const groupQ = trimmed(sp.get('groupName'));
  if (groupQ) {
    const groupRows = isValidObjectId(groupQ)
      ? await database.collection('productgroup')
        .find({ _id: new Types.ObjectId(groupQ) }, { projection: { _id: 1 } }).toArray()
      : await database.collection('productgroup')
        .find({ name: { $regex: escapeRegex(groupQ), $options: 'i' } }, { projection: { _id: 1 } }).toArray();
    const groupIds = groupRows.map((group) => group._id);
    const groupItems = groupIds.length
      ? await itemCollection
        .find({ subGroupId: { $in: groupIds } }, { projection: { itemCode: 1, name: 1 } }).toArray()
      : [];
    ands.push(itemLinkClause(groupItems));
  }

  const itemPicks = manyValues(sp, 'itemId').filter((value) => isValidObjectId(value));
  if (itemPicks.length) {
    const pickedItems = await itemCollection.find(
      { _id: { $in: itemPicks.map((value) => new Types.ObjectId(value)) } },
      { projection: { itemCode: 1, name: 1 } },
    ).toArray();
    ands.push(itemLinkClause(pickedItems));
  }

  /* SUPPLIER and AGENT resolve to the vendor's two possible keys, so a pick
     finds both the generated (id) and imported (code) stock rows. */
  const supplierPicks = manyValues(sp, 'supplierId');
  if (supplierPicks.length) {
    const keys = new Set(supplierPicks);
    for (const pick of supplierPicks) {
      // eslint-disable-next-line no-await-in-loop
      const vendor = isValidObjectId(pick)
        ? await Supplier.findById(pick).select('contactId').lean()
        : await Supplier.findOne({ contactId: pick }).select('contactId').lean();
      if (vendor) {
        keys.add(String(vendor._id));
        if (trimmed(vendor.contactId)) keys.add(trimmed(vendor.contactId));
      }
    }
    ands.push({ supplierId: { $in: [...keys] } });
  }

  const city = trimmed(sp.get('city'));
  if (city) {
    const cityRx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
    const vendors = await Supplier
      .find({ $or: [{ billingCity: cityRx }, { shippingCity: cityRx }] })
      .select('contactId').lean();
    ands.push({ supplierId: { $in: vendorKeys(vendors) } });
  }

  const agentPicks = manyValues(sp, 'agentId').filter((value) => isValidObjectId(value));
  if (agentPicks.length) {
    const agentVendors = await Supplier
      .find({ agentId: { $in: agentPicks.map((value) => new Types.ObjectId(value)) } })
      .select('contactId').lean();
    ands.push({ supplierId: { $in: vendorKeys(agentVendors) } });
  }

  /* Barcode Pattern section, read exactly as the Master Stock Report does. */
  const patternSupplierNo = trimmed(sp.get('patternSupplierNo'));
  if (patternSupplierNo) {
    const vendors = await Supplier.find({
      contactId: { $regex: '^\\s*' + escapeRegex(patternSupplierNo) + '\\s*$', $options: 'i' },
    }).select('contactId').lean();
    ands.push({ supplierId: { $in: vendorKeys(vendors) } });
  }
  const patternGrcNo = trimmed(sp.get('patternGrcNo')).replace(/^GRC\s*/i, '').trim();
  if (patternGrcNo) {
    ands.push({ grcNo: { $regex: '^\\s*' + escapeRegex(patternGrcNo) + '\\s*$', $options: 'i' } });
  }
  const patternSlNo = trimmed(sp.get('patternSlNo'));
  if (patternSlNo) {
    ands.push({ billSlNo: { $regex: '^\\s*' + escapeRegex(patternSlNo) + '\\s*$', $options: 'i' } });
  }
  const patternQtyRaw = trimmed(sp.get('patternQty'));
  if (patternQtyRaw) {
    const patternQty = Number(patternQtyRaw);
    exprs.push(Number.isFinite(patternQty)
      ? { $eq: [numericExpr('$qtyNum'), patternQty] }
      : { $literal: false });
  }

  /* PRICE RANGES - inclusive, blank bound ignored, and rows with no recorded
     price excluded so a Max does not sweep in every unpriced unit. */
  const addRange = (expr, minKey, maxKey) => {
    const minRaw = trimmed(sp.get(minKey)).replace(/%/g, '').trim();
    const maxRaw = trimmed(sp.get(maxKey)).replace(/%/g, '').trim();
    const low = Number(minRaw);
    const high = Number(maxRaw);
    const hasLow = minRaw !== '' && Number.isFinite(low);
    const hasHigh = maxRaw !== '' && Number.isFinite(high);
    if (!hasLow && !hasHigh) return;
    exprs.push({ $ne: [expr, null] });
    if (hasLow) exprs.push({ $gte: [expr, low] });
    if (hasHigh) exprs.push({ $lte: [expr, high] });
  };
  addRange(COST_EXPR, 'costPriceMin', 'costPriceMax');
  addRange(numericExpr('$retailPrice'), 'rspMin', 'rspMax');
  addRange(numericExpr('$offerPrice'), 'rspOfferPriceMin', 'rspOfferPriceMax');
  addRange(numericExpr('$wspPrice'), 'wspMin', 'wspMax');
  addRange(numericExpr('$dpPrice'), 'ecomMin', 'ecomMax');
  addRange(numericExpr('$stockAge'), 'ageMin', 'ageMax');

  const discRaw = trimmed(sp.get('discount')).replace(/%/g, '').trim();
  if (discRaw) {
    const discount = Number(discRaw);
    exprs.push(Number.isFinite(discount)
      ? { $eq: [numericExpr('$disc2'), discount] }
      : { $literal: false });
  }

  /* LOCATION FILTER - the same expression the Master Stock Report uses, so a
     row is matched by the location it actually sits at now (currentLocationId)
     with its originating locationId as the fallback. Empty = unrestricted. */
  const locationFilter = trimmed(sp.get('locationFilter'));
  if (locationFilter) {
    exprs.push({
      $eq: [
        { $toString: { $ifNull: ['$currentLocationId', '$locationId'] } },
        locationFilter,
      ],
    });
  }

  const startDate = trimmed(sp.get('startDate'));
  const endDate = trimmed(sp.get('endDate'));
  if (startDate || endDate) {
    const stockDate = {};
    if (startDate && !Number.isNaN(new Date(startDate).getTime())) stockDate.$gte = new Date(startDate);
    if (endDate && !Number.isNaN(new Date(endDate + 'T23:59:59.999').getTime())) {
      stockDate.$lte = new Date(endDate + 'T23:59:59.999');
    }
    if (Object.keys(stockDate).length) ands.push({ stockDate });
  }

  return { ands, exprs, active };
}

async function listAllErpBarcodes({ businessId, search, page, perPage, sortBy, sortDir, productFilter = null }) {
  const database = mongoose.connection.db;
  const itemCollection = database.collection('item');
  const barcodeCollection = database.collection('barcodeLabel');
  const productCollection = database.collection(COLLECTION);
  const items = await itemCollection.find({ businessId: idMatch(businessId) }, {
    /* subGroupId is the item's GROUP - the product type is read from its name
       (see the page's type map below) */
    projection: { itemCode: 1, name: 1, image: 1, subGroupId: 1 },
  }).toArray();
  const itemIds = items.flatMap((item) => [
    item._id,
    String(item._id),
  ]);
  const itemCodes = [...new Set(items
    .map((item) => String(item.itemCode || '').trim())
    .filter(Boolean))];
  const itemNames = [...new Set(items
    .map((item) => String(item.name || '').trim())
    .filter(Boolean))];
  const barcodeScope = {
    $or: [
      { businessId: idMatch(businessId) },
      { currentBusinessId: idMatch(businessId) },
    ],
  };
  const legacyItemLinks = [
    ...(itemIds.length ? [{ itemId: { $in: itemIds } }] : []),
    ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
    ...(itemNames.length ? [{ itemName: { $in: itemNames } }] : []),
  ];
  const legacyScope = {
    $and: [
      {
        $or: [
          { businessId: { $exists: false } },
          { businessId: '' },
          { businessId: null },
        ],
      },
      {
        $or: [
          { currentBusinessId: { $exists: false } },
          { currentBusinessId: '' },
          { currentBusinessId: null },
        ],
      },
      { $or: legacyItemLinks },
    ],
  };
  const barcodeFilter = {
    $and: [
      { $or: [barcodeScope, ...(legacyItemLinks.length ? [legacyScope] : [])] },
      {
        $or: [
          { barcodeNo: { $exists: true, $nin: ['', null] } },
          { barcodeGenerated: { $exists: true, $nin: ['', null] } },
          { oldBarcode: { $exists: true, $nin: ['', null] } },
        ],
      },
    ],
  };
  /* The product page's filters, applied before the read so count and paging
     describe the filtered set rather than all stock. */
  if (productFilter?.ands?.length) barcodeFilter.$and.push(...productFilter.ands);
  /* A unit with no stock left is never part of this listing. qtyNum is the
     live quantity; qty is the older imported spelling. The test runs in Mongo,
     so the count, sort and paging all describe the same positive-stock set
     instead of dropping zeros after a page has already been cut. */
  const qtyValue = {
    $convert: {
      input: { $ifNull: ['$qtyNum', '$qty'] },
      to: 'double',
      onError: null,
      onNull: null,
    },
  };
  const exprs = [{ $gt: [qtyValue, 0] }, ...(productFilter?.exprs || [])];
  barcodeFilter.$expr = exprs.length === 1 ? exprs[0] : { $and: exprs };
  /* Available means the unit is still in stock. A SOLD / VOID / HISTORY /
     IN_TRANSIT row can keep a positive qty in old data, but it is not stock
     the shop can sell. Rows written before the lifecycle existed have no
     status; they are treated as in stock so the list does not lose them. */
  barcodeFilter.$and.push({
    $or: [
      { status: BARCODE_STATUS.IN_STOCK },
      { status: { $exists: false } },
      { status: '' },
      { status: null },
    ],
  });

  const barcodeRows = await barcodeCollection.find(barcodeFilter, {
    projection: {
      businessId: 1,
      currentBusinessId: 1,
      itemId: 1,
      itemCode: 1,
      itemName: 1,
      barcodeNo: 1,
      barcodeGenerated: 1,
      oldBarcode: 1,
      printDescription: 1,
      supplierDescription: 1,
      imageUrl: 1,
      filePath: 1,
      createdAt: 1,
      updatedAt: 1,
      status: 1,
      qtyNum: 1,
      qty: 1,
    },
  }).toArray();
  const products = await productCollection.find({ businessId: idMatch(businessId) }).toArray();

  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const itemByCode = new Map(items.flatMap((item) => [
    [String(item.itemCode || '').trim().toLowerCase(), item],
    [String(item.name || '').trim().toLowerCase(), item],
  ]).filter(([key]) => key));
  const productByBarcode = new Map();
  const productByItemId = new Map();
  const productByItemCode = new Map();
  products.forEach((product) => {
    [product.barcode, product.barcodeNo, product.barcodeGenerated]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean)
      .forEach((value) => { if (!productByBarcode.has(value)) productByBarcode.set(value, product); });
    if (product.itemId && !productByItemId.has(String(product.itemId))) {
      productByItemId.set(String(product.itemId), product);
    }
    const code = String(product.ecommItemCode || '').trim().toLowerCase();
    if (code && !productByItemCode.has(code)) productByItemCode.set(code, product);
  });

  /* THE TYPE OF EACH ROW, from its item's group (the item master), then from the
     label's own group name - the same chain the single-barcode form uses.

     A row whose item's saved product is filed under a sibling barcode has no
     type of its own (see productOwnsBarcode), and a saved type that contradicts
     the item's group is stale (written before the form locked the field to the
     group), so a group that names a real product type wins over it. */
  const pageGroupIds = [...new Set(barcodeRows.flatMap((barcodeRow) => [
    itemById.get(String(barcodeRow.itemId))?.subGroupId,
    barcodeRow.groupId,
  ]).map((value) => String(value || '').trim()).filter((value) => isValidObjectId(value)))];
  const groupNameById = new Map();
  const typeByGroupName = new Map();
  if (pageGroupIds.length) {
    const [pageGroups, typeRows] = await Promise.all([
      database.collection('productgroup')
        .find({ _id: { $in: pageGroupIds.map((gid) => new Types.ObjectId(gid)) } })
        .project({ name: 1 }).toArray(),
      database.collection('producttypes')
        .find({ businessId: { $in: [businessId, new Types.ObjectId(businessId)] }, isActive: { $ne: false } })
        .project({ value: 1, label: 1 }).toArray(),
    ]);
    pageGroups.forEach((group) => groupNameById.set(String(group._id), String(group.name || '')));
    typeRows.forEach((type) => {
      const value = String(type.value || '').trim();
      if (!value) return;
      if (!typeByGroupName.has(value.toLowerCase())) typeByGroupName.set(value.toLowerCase(), value);
      const label = String(type.label || '').trim().toLowerCase();
      if (label && !typeByGroupName.has(label)) typeByGroupName.set(label, value);
    });
  }
  /* one pass over the rows, keyed by each item - never a scan per group */
  const typeByItemId = new Map();
  if (typeByGroupName.size) {
    for (const barcodeRow of barcodeRows) {
      const itemId = String(barcodeRow.itemId);
      if (typeByItemId.has(itemId)) continue;
      const item = itemById.get(itemId);
      const candidates = [
        groupNameById.get(String(item?.subGroupId || '')),
        barcodeRow.customFields?.groupName,
        isValidObjectId(String(barcodeRow.groupId || '')) ? '' : barcodeRow.groupId,
        groupNameById.get(String(barcodeRow.groupId || '')),
      ];
      for (const candidate of candidates) {
        const matched = typeByGroupName.get(String(candidate || '').trim().toLowerCase());
        if (matched) { typeByItemId.set(itemId, matched); break; }
      }
    }
  }

  const records = barcodeRows.map((barcodeRow) => {
    const barcode = String(
      barcodeRow.barcodeNo || barcodeRow.barcodeGenerated || barcodeRow.oldBarcode || ''
    ).trim();
    const item = itemById.get(String(barcodeRow.itemId))
      || itemByCode.get(String(barcodeRow.itemCode || '').trim().toLowerCase())
      || itemByCode.get(String(barcodeRow.itemName || '').trim().toLowerCase());
    const product = productByBarcode.get(barcode.toLowerCase())
      || (barcodeRow.itemId && productByItemId.get(String(barcodeRow.itemId)))
      || productByItemCode.get(String(barcodeRow.itemCode || item?.itemCode || '').trim().toLowerCase());
    /* the saved product's own photo/type/classifications belong to ITS barcode
       (see productOwnsBarcode) - this row keeps its own otherwise */
    const productForBarcode = product && productOwnsBarcode(product, barcode) ? product : null;
    const itemCode = String(item?.itemCode || barcodeRow.itemCode || '').trim();
    const itemName = String(item?.name || barcodeRow.itemName || '').trim();
    const barcodeCodes = [barcodeRow.barcodeNo, barcodeRow.barcodeGenerated, barcodeRow.oldBarcode]
      .map((value) => String(value || '').trim()).filter(Boolean);
    /* the item's group (what the Add form locks the field to) wins; a saved
       type only fills in when no group names a real product type */
    const resolvedProductType = typeByItemId.get(String(barcodeRow.itemId))
      || productForBarcode?.productType
      || '';
    const image = productImageSource(
      barcodeRow.imageUrl || barcodeRow.filePath
        || ownBarcodeImage(productForBarcode?.image, barcodeCodes)
        || ownBarcodeImage(item?.image, barcodeCodes)
        || '',
      ...barcodeCodes,
    );
    return {
      ...(product
        ? (productForBarcode ? plain(product) : withoutPerBarcodeFields(plain(product)))
        : {}),
      _id: `erp-barcode-${String(barcodeRow._id)}`,
      barcode,
      barcodeImage: image,
      itemId: item ? String(item._id) : product?.itemId || '',
      itemLabel: [itemCode, itemName].filter(Boolean).join(' - '),
      ecommItemCode: product?.ecommItemCode || itemCode,
      displayName: product?.displayName || barcodeRow.printDescription || itemName || itemCode,
      businessId: String(barcodeRow.currentBusinessId || barcodeRow.businessId || businessId),
      businessName: '',
      productType: resolvedProductType,
      isPublished: productVisibleForBarcode(product, barcode),
      salesCount: product?.salesCount || 0,
      /* qtyNum comes from the live barcodeLabel row - this is the stock
         quantity in the DB, not the override stored in the ecommerceproduct.
         qty is the older imported spelling and is read only when qtyNum is
         missing, exactly as the query above reads it. */
      dbQty: barcodeRow.qtyNum != null
        ? Number(barcodeRow.qtyNum) || 0
        : barcodeRow.qty != null ? Number(barcodeRow.qty) || 0 : null,
      createdAt: product?.createdAt || barcodeRow.createdAt,
      updatedAt: product?.updatedAt || barcodeRow.updatedAt,
      _searchText: [
        barcode, itemCode, itemName, barcodeRow.printDescription,
        barcodeRow.supplierDescription, product?.ecommItemCode,
        product?.displayName, resolvedProductType, product?.status,
      ].filter(Boolean).join(' ').toLowerCase(),
    };
  });

  const filtered = search
    ? records.filter((row) => row._searchText.includes(search.toLowerCase()))
    : records;
  const sortKey = sortBy || 'barcode';
  const direction = sortDir === 'desc' ? -1 : 1;
  filtered.sort((a, b) => {
    const left = a[sortKey] ?? '';
    const right = b[sortKey] ?? '';
    if (typeof left === 'number' && typeof right === 'number') return (left - right) * direction;
    const leftValue = left instanceof Date ? left.getTime() : left;
    const rightValue = right instanceof Date ? right.getTime() : right;
    if (typeof leftValue === 'number' && typeof rightValue === 'number') {
      return (leftValue - rightValue) * direction;
    }
    const compared = String(leftValue).localeCompare(String(rightValue), 'en', {
      numeric: true,
      sensitivity: 'base',
    }) * direction;
    return compared || String(a.barcode || '').localeCompare(String(b.barcode || ''), 'en', {
      numeric: true,
      sensitivity: 'base',
    });
  });
  const total = filtered.length;
  const rows = filtered.slice((page - 1) * perPage, page * perPage);

  /* Staff-uploaded photos live in `productImage` (written by the mobile app),
     keyed by the barcode they were shot against - a source the barcode row
     itself does not carry. They were only ever read by the single-barcode
     lookup, so a product whose photo came from the app showed no image in this
     listing at all. Fill only this page's rows that have no photo of their own,
     matched strictly on the row's own barcode first (then the item code), so a
     photo can never land on another product. Records that carry inline
     imageData instead of a URL cannot be served and are skipped. */
  const missingPhoto = rows.filter((row) => !row.barcodeImage);
  if (missingPhoto.length) {
    const wantedBarcodes = [...new Set(missingPhoto
      .map((row) => String(row.barcode || '').trim())
      .filter(Boolean))];
    const wantedCodes = [...new Set(missingPhoto
      .map((row) => String(row.ecommItemCode || '').trim())
      .filter(Boolean))];
    const uploadedPhotos = (wantedBarcodes.length || wantedCodes.length)
      ? await ProductImage.find({
        $or: [
          ...(wantedBarcodes.length ? [{ barcodeGenerated: { $in: wantedBarcodes } }] : []),
          ...(wantedCodes.length ? [{ itemCode: { $in: wantedCodes } }] : []),
        ],
      })
        .collation({ locale: 'en', strength: 2 })
        .sort({ createdAt: -1 })
        .select('barcodeGenerated itemCode imageUrl filePath')
        .lean()
      : [];
    const photoByBarcode = new Map();
    const photoByItemCode = new Map();
    uploadedPhotos.forEach((photo) => {
      const url = productImageSource(photo.imageUrl || photo.filePath || '');
      if (!url) return;
      const barcodeKey = String(photo.barcodeGenerated || '').trim().toLowerCase();
      if (barcodeKey && !photoByBarcode.has(barcodeKey)) photoByBarcode.set(barcodeKey, url);
      const codeKey = String(photo.itemCode || '').trim().toLowerCase();
      if (codeKey && !photoByItemCode.has(codeKey)) photoByItemCode.set(codeKey, url);
    });
    rows.forEach((row) => {
      if (row.barcodeImage) return;
      row.barcodeImage = photoByBarcode.get(String(row.barcode || '').trim().toLowerCase())
        || photoByItemCode.get(String(row.ecommItemCode || '').trim().toLowerCase())
        || '';
    });
  }

  const classificationIds = [...new Set(rows.flatMap((row) =>
    ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
      .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
      .map((value) => String(value || ''))
      .filter(isValidObjectId)
  ))];
  const classificationNameById = new Map([...(await classificationOptionsById(classificationIds))]
    .map(([id, option]) => [id, option.name]));
  const businessRecord = await database.collection('business').findOne(
    { _id: new Types.ObjectId(businessId) },
    { projection: { name: 1, businessPrintName: 1 } },
  );
  const businessName = businessRecord?.name || businessRecord?.businessPrintName || '';

  return {
    rows: rows.map((record) => {
      const row = { ...record };
      delete row._searchText;
      return {
        ...row,
        ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
          `${key}Display`,
          (Array.isArray(row[key]) ? row[key] : [])
            .map((value) => classificationNameById.get(String(value)) || String(value || ''))
            .filter(Boolean)
            .join(', '),
        ])),
        businessName,
      };
    }),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  };
}

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();
  const col = mongoose.connection.db.collection(COLLECTION);

  const filter = {};
  const b = sp.get('business');
  if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

  if (sp.get('barcodeOptions') === '1') {
    if (!b || !isValidObjectId(b)) {
      return json({ error: 'Select a valid business before searching barcodes.' }, 422);
    }
    const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
    const barcodeBusinessMatch = {
      $or: [
        { businessId: { $in: [b, new Types.ObjectId(b)] } },
        { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
      ],
    };
    const search = (sp.get('search') || '').trim();
    const codeMatch = search
      ? {
        $or: ['barcodeNo', 'barcodeGenerated', 'oldBarcode'].map((field) => ({
          [field]: { $regex: escapeRegex(search), $options: 'i' },
        })),
      }
      : null;
    const scopedQuery = codeMatch
      ? { $and: [barcodeBusinessMatch, codeMatch] }
      : barcodeBusinessMatch;
    let barcodeRows = await barcodeCollection.find(scopedQuery)
      .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
      .limit(50)
      .toArray();

    if (!barcodeRows.length && search) {
      const legacyRows = await barcodeCollection.find(codeMatch)
        .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
        .limit(100)
        .toArray();
      const itemIds = [...new Set(legacyRows
        .map((row) => String(row.itemId || ''))
        .filter(isValidObjectId))]
        .map((id) => new Types.ObjectId(id));
      const itemKeys = [...new Set(legacyRows
        .flatMap((row) => [row.itemCode, row.itemName])
        .map((value) => String(value || '').trim())
        .filter(Boolean))];
      const itemMatches = [
        ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
        ...itemKeys.flatMap((value) => {
          const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
          return [{ itemCode: exact }, { name: exact }];
        }),
      ];
      const linkedItems = itemMatches.length
        ? await mongoose.connection.db.collection('item')
          .find({ businessId: idMatch(b), $or: itemMatches })
          .project({ _id: 1, itemCode: 1, name: 1 })
          .toArray()
        : [];
      const linkedIds = new Set(linkedItems.map((item) => String(item._id)));
      const linkedKeys = new Set(linkedItems.flatMap((item) =>
        [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
      ));
      barcodeRows = legacyRows.filter((row) =>
        (row.itemId && linkedIds.has(String(row.itemId)))
        || [row.itemCode, row.itemName].some((value) =>
          value && linkedKeys.has(String(value).trim().toLowerCase()))
      );
    }

    const options = new Map();
    barcodeRows.forEach((row) => {
      const value = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
      if (!value) return;
      const key = value.toLowerCase();
      if (!options.has(key)) {
        options.set(key, {
          value,
          label: [value, row.itemCode || row.itemName].filter(Boolean).join(' - '),
        });
      }
    });
    return json({ options: [...options.values()] });
  }

  /* ------------------------------------------------ identify lookup ---

     ?productLookup=<value>&by=<field> answers the products that match one
     identifying value, for the Add form's other identifier boxes.

     Every candidate carries the barcode the form's existing lookup already
     knows how to expand into a full product, so nothing is populated a second
     time here: the form feeds the barcode back through ?barcodeLookup and the
     price, quantity, supplier, classification and photo all come from that one
     code path.

     by: barcode | itemCode | ecommItemCode | name | supplierCode. A unique
     identifier is matched exactly first (case-insensitive) and only falls back
     to a contains match when nothing matched exactly, so a partial code never
     wins over the real one. Several matches come back as a list - the form
     shows it and the user picks, rather than an arbitrary product being taken.
     -------------------------------------------------------------------- */
  const identifyValue = (sp.get('productLookup') || '').trim();
  if (identifyValue) {
    if (!b || !isValidObjectId(b)) {
      return json({ error: 'Select a valid business before looking up a product.' }, 422);
    }
    if (identifyValue.length < 2) return json({ matches: [] });

    const BY = ['barcode', 'itemCode', 'ecommItemCode', 'name', 'supplierCode'];
    const byParam = (sp.get('by') || '').trim();
    const by = BY.includes(byParam) ? byParam : 'barcode';

    const database = mongoose.connection.db;
    const itemCollection = database.collection('item');
    const barcodeCollection = database.collection('barcodeLabel');
    const itemProjection = { itemCode: 1, name: 1, itemType: 1 };
    const barcodeProjection = {
      itemId: 1,
      itemCode: 1,
      itemName: 1,
      barcodeNo: 1,
      barcodeGenerated: 1,
      oldBarcode: 1,
    };
    const barcodeScope = {
      $or: [
        { businessId: idMatch(b) },
        { currentBusinessId: idMatch(b) },
      ],
    };
    const exactRx = (value) => ({ $regex: `^\\s*${escapeRegex(value)}\\s*$`, $options: 'i' });
    const anyRx = (value) => ({ $regex: escapeRegex(value), $options: 'i' });

    /* items matching one field: exact first, then a contains match */
    const findItems = async (field) => {
      const exact = await itemCollection.find(
        { businessId: idMatch(b), [field]: exactRx(identifyValue) },
        { projection: itemProjection },
      ).limit(20).toArray();
      if (exact.length) return exact;
      return itemCollection.find(
        { businessId: idMatch(b), [field]: anyRx(identifyValue) },
        { projection: itemProjection },
      ).limit(20).toArray();
    };

    /* the barcode rows a set of items is filed under */
    const findBarcodeRowsForItems = async (items) => {
      const ids = items.map((item) => String(item._id));
      const codes = [...new Set(items
        .map((item) => String(item.itemCode || '').trim())
        .filter(Boolean))];
      if (!ids.length && !codes.length) return [];
      return barcodeCollection.find({
        $and: [
          barcodeScope,
          {
            $or: [
              { itemId: { $in: [...ids, ...ids.filter(isValidObjectId).map((id) => new Types.ObjectId(id))] } },
              ...(codes.length ? [{ itemCode: { $in: codes } }] : []),
            ],
          },
        ],
      }, { projection: barcodeProjection }).limit(200).toArray();
    };

    let barcodeRows = [];
    let items = [];

    if (by === 'barcode') {
      const fields = ['barcodeNo', 'barcodeGenerated', 'oldBarcode'];
      barcodeRows = await barcodeCollection.find({
        $and: [barcodeScope, { $or: fields.map((field) => ({ [field]: exactRx(identifyValue) })) }],
      }, { projection: barcodeProjection }).limit(20).toArray();
      if (!barcodeRows.length) {
        barcodeRows = await barcodeCollection.find({
          $and: [barcodeScope, { $or: fields.map((field) => ({ [field]: anyRx(identifyValue) })) }],
        }, { projection: barcodeProjection }).limit(20).toArray();
      }
    } else if (by === 'supplierCode') {
      /* the Supplier No. the barcode pattern section filters on: the vendor's
         contactId, exact first */
      let vendors = await Supplier.find({ contactId: exactRx(identifyValue) })
        .select('contactId').limit(20).lean();
      if (!vendors.length) {
        vendors = await Supplier.find({ contactId: anyRx(identifyValue) })
          .select('contactId').limit(20).lean();
      }
      const keys = vendorKeys(vendors);
      if (keys.length) {
        barcodeRows = await barcodeCollection.find({
          $and: [barcodeScope, { supplierId: { $in: keys } }],
        }, { projection: barcodeProjection }).limit(50).toArray();
      }
    } else if (by === 'name') {
      items = await findItems('name');
    } else {
      /* itemCode, and ecommItemCode which is the same code on every product
         this screen writes */
      items = await findItems('itemCode');
      if (!items.length && by === 'ecommItemCode') {
        const products = await col.find(
          { businessId: idMatch(b), ecommItemCode: anyRx(identifyValue) },
          { projection: { itemId: 1 } },
        ).limit(20).toArray();
        const productItemIds = products
          .map((product) => String(product.itemId || ''))
          .filter(isValidObjectId)
          .map((id) => new Types.ObjectId(id));
        if (productItemIds.length) {
          items = await itemCollection.find(
            { _id: { $in: productItemIds } },
            { projection: itemProjection },
          ).toArray();
        }
      }
    }

    if (items.length && !barcodeRows.length) barcodeRows = await findBarcodeRowsForItems(items);

    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const matches = new Map();
    barcodeRows.forEach((row) => {
      const value = String(row.barcodeNo || row.barcodeGenerated || row.oldBarcode || '').trim();
      const item = itemById.get(String(row.itemId));
      const itemCode = String(item?.itemCode || row.itemCode || '').trim();
      const itemName = String(item?.name || row.itemName || '').trim();
      const key = value.toLowerCase() || 'item:' + String(row.itemId || '');
      if (matches.has(key)) return;
      matches.set(key, {
        barcode: value,
        itemId: String(row.itemId || (item ? item._id : '')),
        itemCode,
        name: itemName,
        label: [value, itemCode, itemName].filter(Boolean).join(' - '),
      });
    });
    /* an item with no barcode row of its own can still be chosen - the form
       fills what it can and says the item has no barcode */
    items.forEach((item) => {
      const key = 'item:' + String(item._id);
      if ([...matches.values()].some((match) => match.itemId === String(item._id))) return;
      matches.set(key, {
        barcode: '',
        itemId: String(item._id),
        itemCode: String(item.itemCode || '').trim(),
        name: String(item.name || '').trim(),
        label: [item.itemCode, item.name].filter(Boolean).join(' - '),
      });
    });

    return json({ by, value: identifyValue, matches: [...matches.values()].slice(0, 20) });
  }

  /* ------------------------------------------ barcode filter profile ---

     ?barcodeProfile=<barcode> answers the FILTER values of one product, so the
     Ecommerce -> Product filter card can fill every section from the barcode
     the operator typed.

     The values come back in exactly the shapes resolveProductFilters() reads
     them back in: a ref picker carries the record's _id, GST and the pattern
     figures are numbers as text, and each price range gets the SAME figure at
     both ends, because the filter is inclusive - Min 180 / Max 180 selects the
     product priced 180 instead of inventing a range around it. Nothing is
     invented: a price, HSN, city or unit the row does not carry comes back
     empty and the card leaves that box alone.

     Duplicate barcode rows are NOT merged and no one of them is chosen for the
     operator: identical value sets collapse, and each remaining set comes back
     as a candidate the card lists so the supplier and price are a choice, not
     an accident of row order.
     -------------------------------------------------------------------- */
  const profileBarcode = (sp.get('barcodeProfile') || '').trim();
  if (profileBarcode) {
    if (!b || !isValidObjectId(b)) {
      return json({ error: 'Select a valid business before looking up a barcode.' }, 422);
    }
    if (profileBarcode.length < 2) return json({ barcode: profileBarcode, candidates: [] });

    const database = mongoose.connection.db;
    const text = (value) => String(value ?? '').trim();
    /* the figure as the filter compares it - '' when the row has none, so a
       missing price leaves its box empty instead of filtering on 0 */
    const figure = (value) => {
      if (text(value) === '') return '';
      const number = Number(text(value));
      return Number.isFinite(number) ? String(Number(number.toFixed(2))) : '';
    };

    const exact = { $regex: `^\\s*${escapeRegex(profileBarcode)}\\s*$`, $options: 'i' };
    const rows = await database.collection('barcodeLabel').find({
      $and: [
        { $or: [{ businessId: idMatch(b) }, { currentBusinessId: idMatch(b) }] },
        { $or: [{ barcodeNo: exact }, { barcodeGenerated: exact }, { oldBarcode: exact }] },
      ],
    }).limit(50).toArray();
    if (!rows.length) {
      return json({ error: `Barcode "${profileBarcode}" was not found in this business.` }, 404);
    }

    const itemIds = [...new Set(rows.map((row) => text(row.itemId)).filter(isValidObjectId))]
      .map((id) => new Types.ObjectId(id));
    const itemCodes = [...new Set(rows.map((row) => text(row.itemCode)).filter(Boolean))];
    const items = (itemIds.length || itemCodes.length)
      ? await database.collection('item').find({
        $and: [
          { businessId: idMatch(b) },
          {
            $or: [
              ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
              ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
            ],
          },
        ],
      }, { projection: { itemCode: 1, name: 1, subGroupId: 1 } }).toArray()
      : [];

    const groupIds = [...new Set(items.map((item) => text(item.subGroupId)).filter(isValidObjectId))]
      .map((id) => new Types.ObjectId(id));
    const groups = groupIds.length
      ? await database.collection('productgroup')
        .find({ _id: { $in: groupIds } }, { projection: { name: 1 } }).toArray()
      : [];

    /* the row's supplier is stored as the vendor's id on generated rows and as
       its G-code on imported ones - read it either way */
    const supplierKeys = [...new Set(rows.map((row) => text(row.supplierId)).filter(Boolean))];
    const supplierIds = supplierKeys.filter(isValidObjectId).map((id) => new Types.ObjectId(id));
    const suppliers = supplierKeys.length
      ? await Supplier.find({
        $or: [
          ...(supplierIds.length ? [{ _id: { $in: supplierIds } }] : []),
          { contactId: { $in: supplierKeys } },
        ],
      }).select('businessName firstName lastName contactId billingCity shippingCity agentId').lean()
      : [];
    const agentIds = [...new Set(suppliers.map((vendor) => text(vendor.agentId)).filter(isValidObjectId))]
      .map((id) => new Types.ObjectId(id));
    const agents = agentIds.length
      ? await Agent.find({ _id: { $in: agentIds } })
        .select('businessName firstName lastName contactId').lean()
      : [];

    /* UOM is stored on the row as the unit's NAME, while the picker (and so
       the filter) uses its _id */
    const uomNames = [...new Set(rows.map((row) => text(row.uom)).filter(Boolean))];
    const units = uomNames.length
      ? await database.collection('uom')
        .find({ $or: [{ name: { $in: uomNames } }, { shortName: { $in: uomNames } }] })
        .collation({ locale: 'en', strength: 2 })
        .project({ name: 1, shortName: 1 }).toArray()
      : [];

    const contactName = (contact) => text(contact.businessName)
      || [contact.firstName, contact.lastName].map(text).filter(Boolean).join(' ')
      || '(untitled)';
    const contactLabel = (contact) => {
      const name = contactName(contact);
      const code = text(contact.contactId);
      return code ? `${name} (${code})` : name;
    };
    const itemById = new Map(items.map((item) => [String(item._id), item]));
    const itemByCode = new Map(items.map((item) => [text(item.itemCode).toLowerCase(), item]));
    const groupById = new Map(groups.map((group) => [String(group._id), group]));
    const agentById = new Map(agents.map((agent) => [String(agent._id), agent]));
    const supplierByKey = new Map();
    suppliers.forEach((vendor) => {
      supplierByKey.set(String(vendor._id), vendor);
      if (text(vendor.contactId)) supplierByKey.set(text(vendor.contactId).toLowerCase(), vendor);
    });
    const unitByName = new Map();
    units.forEach((unit) => {
      [unit.name, unit.shortName].forEach((value) => {
        if (text(value)) unitByName.set(text(value).toLowerCase(), unit);
      });
    });

    const candidates = new Map();
    rows.forEach((row) => {
      const item = itemById.get(text(row.itemId))
        || itemByCode.get(text(row.itemCode).toLowerCase()) || null;
      const groupValue = item?.subGroupId && isValidObjectId(text(item.subGroupId))
        ? text(item.subGroupId) : '';
      const group = groupValue ? groupById.get(groupValue) : null;
      const vendor = supplierByKey.get(text(row.supplierId))
        || supplierByKey.get(text(row.supplierId).toLowerCase()) || null;
      const agent = vendor?.agentId ? agentById.get(text(vendor.agentId)) : null;
      const unit = unitByName.get(text(row.uom).toLowerCase()) || null;
      /* COST PRICE as the filter computes it: finalNet when it carries a
         figure, else purRate */
      const finalNet = Number(text(row.finalNet));
      const cost = Number.isFinite(finalNet) && finalNet > 0 ? finalNet : figure(row.purRate);
      const rsp = figure(row.retailPrice);
      const offer = figure(row.offerPrice);
      const wsp = figure(row.wspPrice);
      const ecom = figure(row.dpPrice);
      const age = figure(row.stockAge);

      const values = {
        barcodeNo: text(row.barcodeNo || row.barcodeGenerated || row.oldBarcode),
        /* ONLY when the group document still exists. The filter resolves a
           group to its items through that document, so filling an id whose
           group was deleted (16 of this business's 25) would make Search
           return nothing at all - worse than leaving the box empty. */
        groupName: group ? groupValue : '',
        itemId: item ? [String(item._id)] : [],
        hsn: text(row.hsn),
        gst: figure(row.gst),
        city: text(vendor?.billingCity) || text(vendor?.shippingCity),
        supplierId: vendor ? [String(vendor._id)] : [],
        agentId: agent ? [String(agent._id)] : [],
        uom: unit ? String(unit._id) : '',
        rspMin: rsp, rspMax: rsp,
        rspOfferPriceMin: offer, rspOfferPriceMax: offer,
        wspMin: wsp, wspMax: wsp,
        ecomMin: ecom, ecomMax: ecom,
        ageMin: age, ageMax: age,
        costPriceMin: figure(cost), costPriceMax: figure(cost),
        discount: figure(row.disc2),
        patternSupplierNo: text(vendor?.contactId),
        patternGrcNo: text(row.grcNo).replace(/^GRC\s*/i, ''),
        patternSlNo: text(row.billSlNo),
        patternQty: figure(row.qtyNum),
      };
      /* what the card shows in each picker, so a filled ref reads as a name
         rather than a raw id */
      const labels = {
        groupName: [group ? text(group.name) : ''],
        itemId: [item ? (text(item.name) || text(item.itemCode)) : ''],
        supplierId: [vendor ? contactLabel(vendor) : ''],
        agentId: [agent ? contactLabel(agent) : ''],
        uom: [unit ? (text(unit.name) || text(unit.shortName)) : ''],
      };

      const key = JSON.stringify(values);
      if (candidates.has(key)) return;
      const stockDate = row.stockDate ? new Date(row.stockDate) : null;
      candidates.set(key, {
        id: String(row._id),
        label: [
          vendor ? contactName(vendor) : '',
          rsp ? 'RSP ' + rsp : '',
          values.patternQty ? 'Qty ' + values.patternQty : '',
          stockDate && !Number.isNaN(stockDate.getTime())
            ? stockDate.toLocaleDateString('en-IN') : '',
        ].filter(Boolean).join(' · '),
        values,
        labels,
      });
    });

    return json({
      barcode: profileBarcode,
      rows: rows.length,
      candidates: [...candidates.values()].slice(0, 8),
    });
  }

  const barcode = (sp.get('barcodeLookup') || '').trim();
  if (barcode) {
    if (!b || !isValidObjectId(b)) return json({ error: 'Select a valid business before looking up a barcode.' }, 422);

    const barcodeCollection = mongoose.connection.db.collection('barcodeLabel');
    const barcodeBusinessMatch = {
      $or: [
        { businessId: { $in: [b, new Types.ObjectId(b)] } },
        { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
      ],
    };
    const findBarcodeRows = async (businessFilter = {}) => {
      let rows = await barcodeCollection.find({
        $and: [businessFilter, inventoryBarcodeFilter(barcode)],
      }).limit(50).toArray();
      if (rows.length) return rows;

      const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
      return barcodeCollection.find({
        $and: [
          businessFilter,
          {
            $or: [
              { barcodeGenerated: barcodeRx },
              { barcodeNo: barcodeRx },
              { oldBarcode: barcodeRx },
            ],
          },
        ],
      }).limit(50).toArray();
    };
    let barcodeRows = await findBarcodeRows(barcodeBusinessMatch);
    const itemCollection = mongoose.connection.db.collection('item');
    const itemBusinessFilter = { businessId: idMatch(b) };

    /* Legacy barcode rows can retain their originating business even after
       their linked inventory item has moved. Accept those only when that
       item is confirmed to belong to the selected business. */
    if (!barcodeRows.length) {
      const allBarcodeRows = await findBarcodeRows();
      if (allBarcodeRows.length) {
        const itemIds = [...new Set(allBarcodeRows
          .map((row) => String(row.itemId || ''))
          .filter(isValidObjectId)
          .map((id) => new Types.ObjectId(id)))];
        const itemCodes = [...new Set(allBarcodeRows
          .map((row) => String(row.itemCode || '').trim())
          .filter(Boolean))];
        const itemMatches = [
          ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
          ...itemCodes.map((code) => ({
            itemCode: { $regex: `^${escapeRegex(code)}$`, $options: 'i' },
          })),
        ];
        const linkedItems = itemMatches.length
          ? await itemCollection.find({ ...itemBusinessFilter, $or: itemMatches }).toArray()
          : [];
        const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
        const linkedItemCodes = new Set(linkedItems.map((item) =>
          String(item.itemCode || '').trim().toLowerCase()));
        barcodeRows = allBarcodeRows.filter((row) =>
          (row.itemId && linkedItemIds.has(String(row.itemId)))
          || (row.itemCode && linkedItemCodes.has(String(row.itemCode).trim().toLowerCase()))
        );
      }
    }
    const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
      [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
        .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
    );
    if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

    let item = barcodeRow.itemId && isValidObjectId(String(barcodeRow.itemId))
      ? await itemCollection.findOne({ _id: new Types.ObjectId(String(barcodeRow.itemId)), ...itemBusinessFilter })
      : null;
    const possibleItemKeys = [...new Set([
      barcodeRow.itemCode,
      barcodeRow.itemName,
      barcodeRow.printDescription,
      barcodeRow.supplierDescription,
    ].map((value) => String(value || '').trim()).filter(Boolean))];
    if (!item && possibleItemKeys.length) {
      const exactMatches = possibleItemKeys.map((value) => {
        const escaped = escapeRegex(value);
        return [
          { itemCode: { $regex: `^${escaped}$`, $options: 'i' } },
          { name: { $regex: `^${escaped}$`, $options: 'i' } },
        ];
      }).flat();
      item = await itemCollection.findOne({
        ...itemBusinessFilter,
        $or: exactMatches,
      });
    }
    if (!item && barcodeRow.itemCode) {
      const linkedProduct = await col.findOne({
        businessId: idMatch(b),
        ecommItemCode: { $regex: `^${escapeRegex(String(barcodeRow.itemCode).trim())}$`, $options: 'i' },
      });
      if (linkedProduct?.itemId && isValidObjectId(String(linkedProduct.itemId))) {
        item = await itemCollection.findOne({
          _id: new Types.ObjectId(String(linkedProduct.itemId)),
          ...itemBusinessFilter,
        });
      }
    }
    if (!item) return json({ error: 'No inventory item is linked to this barcode.' }, 404);

    const [group, hsn, product, productTypes, classificationOptions] = await Promise.all([
      item.subGroupId && isValidObjectId(String(item.subGroupId))
        ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(item.subGroupId)) })
        : barcodeRow.groupId && isValidObjectId(String(barcodeRow.groupId))
          ? mongoose.connection.db.collection('productgroup').findOne({ _id: new Types.ObjectId(String(barcodeRow.groupId)) })
          : barcodeRow.groupId
            ? mongoose.connection.db.collection('productgroup').findOne({
              $or: [
                { name: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
                { prefix: { $regex: `^${escapeRegex(String(barcodeRow.groupId).trim())}$`, $options: 'i' } },
              ],
            })
            : null,
      item.hsnId && isValidObjectId(String(item.hsnId))
        ? mongoose.connection.db.collection('hsn').findOne({ _id: new Types.ObjectId(String(item.hsnId)) })
        : barcodeRow.hsn
          ? mongoose.connection.db.collection('hsn').findOne({ code: { $regex: `^${escapeRegex(String(barcodeRow.hsn).trim())}$`, $options: 'i' } })
        : null,
      col.findOne({ businessId: idMatch(b), itemId: { $in: [item._id, String(item._id)] } }),
      mongoose.connection.db.collection('producttypes')
        .find({ businessId: { $in: [b, new Types.ObjectId(b)] }, isActive: { $ne: false } })
        .project({ value: 1, label: 1 })
        .toArray(),
      listClassificationOptions(b),
    ]);
    const barcodeImageCodes = [...new Set([
      barcodeRow.barcodeGenerated,
      barcodeRow.barcodeNo,
      barcodeRow.oldBarcode,
    ].map((value) => String(value || '').trim()).filter(Boolean))];
    /* a staff photo is filed against the BARCODE it was shot at; the item-code
       clause is only the fallback for photos taken before that number existed.
       Asked in that order, so a photo of a sibling piece can never win. */
    const barcodeImageRecord = barcodeImageCodes.length
      ? await ProductImage.findOne({ barcodeGenerated: { $in: barcodeImageCodes } })
        .sort({ createdAt: -1 }).select('imageUrl filePath').lean()
      : null;
    const barcodeImageRecordByItem = !barcodeImageRecord && item.itemCode
      ? await ProductImage.findOne({ itemCode: item.itemCode })
        .sort({ createdAt: -1 }).select('imageUrl filePath').lean()
      : null;
    const barcodeImage = productImageSource(
      barcodeRow.imageUrl
        || barcodeRow.filePath
        || barcodeImageRecord?.imageUrl
        || barcodeImageRecord?.filePath
        || barcodeImageRecordByItem?.imageUrl
        || barcodeImageRecordByItem?.filePath
        || '',
      ...barcodeImageCodes,
    );
    /* the label's own group name (SAREES, FABRICS...) also sets the type - its groupId can point
       to a deleted product group (29-10-2026) */
    const groupTypeCandidates = [barcodeRow.customFields?.groupName, group?.name, barcodeRow.groupId]
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean);
    const itemTypeCandidate = String(item.itemType || '').trim().toLowerCase();
    const matchesProductType = (type, candidates) =>
      candidates.includes(String(type.value || '').trim().toLowerCase())
      || candidates.includes(String(type.label || '').trim().toLowerCase());
    const matchedProductType = productTypes.find((type) =>
      matchesProductType(type, groupTypeCandidates)
    ) || productTypes.find((type) =>
      matchesProductType(type, itemTypeCandidate ? [itemTypeCandidate] : [])
    );
    const productType = matchedProductType?.value || item.itemType || group?.name || barcodeRow.groupId || '';
    const itemCode = item.itemCode || barcodeRow.itemCode || '';
    const defaultData = {
      displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
      ecommItemCode: itemCode,
      image: barcodeImage,
      productType,
      printDescriptionOverride: barcodeRow.printDescription || item.description || barcodeRow.supplierDescription || '',
      ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
      barcodePriceOverride: Number(barcodeRow.retailPrice || item.rsp || barcodeRow.offerPrice) || 0,
      barcodeQtyOverride: Number(barcodeRow.qtyNum || barcodeRow.qty) || 0,
      status: 'active',
      isActive: true,
      isPublished: false,
      isFeatured: false,
    };
    /* THIS BARCODE'S OWN NUMBER, as stored - what productOwnsBarcode compares
       the saved row against */
    const lookedUpBarcode = String(
      barcodeRow.barcodeNo || barcodeRow.barcodeGenerated || barcodeRow.oldBarcode || barcode
    ).trim();
    const productForBarcode = product && productOwnsBarcode(product, lookedUpBarcode)
      ? product
      : null;
    /* when the row belongs to a SIBLING barcode of the same item, its photo,
       type, print description, price/qty override and classification choices
       are another garment's and are dropped here - once, for every field
       below that reads savedProduct (image, productType, byWeave...) */
    const savedProduct = product
      ? (productForBarcode ? plain(product) : withoutPerBarcodeFields(plain(product)))
      : {};
    /* Visibility is answered per barcode below; the alias list and the primary
       barcode are the row's business, not a value the form should echo back. */
    ['barcode', 'barcodes', 'publishedBarcodes'].forEach((key) => { delete savedProduct[key]; });
    const classificationById = new Map(classificationOptions.map((option) => [
      String(option._id),
      option,
    ]));
    const classificationByName = new Map(classificationOptions.map((option) => [
      `${option.type}:${String(option.name || '').trim().toLowerCase()}`,
      option,
    ]));
    const classificationDefaults = Object.fromEntries(
      ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour'].map((field) => {
        const savedValues = savedProduct[field];
        const barcodeValues = barcodeRow[field] ?? barcodeRow.customFields?.[field];
        const source = Array.isArray(savedValues) && savedValues.length
          ? savedValues
          : savedValues && !Array.isArray(savedValues) ? savedValues : barcodeValues;
        const values = Array.isArray(source)
          ? source
          : String(source || '').split(',').map((value) => value.trim()).filter(Boolean);
        const selected = values.map((value) => {
          const text = value && typeof value === 'object'
            ? String(value._bsontype === 'ObjectId' ? value : value._id || value.id || value.value || value.name || '').trim()
            : String(value || '').trim();
          if (!text) return '';
          const option = isValidObjectId(text)
            ? classificationById.get(text)
            : classificationByName.get(`${field}:${text.toLowerCase()}`);
          return option && option.type === field ? String(option._id) : '';
        }).filter(Boolean);
        /* Dupatta with no fabric yet: suggest the Dupatta group's By Fabric name
           that the descriptions mention (29-10-2026 - names from byfabric) */
        if (field === 'byFabric' && !selected.length && String(productType).trim().toUpperCase() === 'DUPATTA') {
          const dupattaFabrics = classificationOptions.filter((option) =>
            option.type === 'byFabric' && option.productType === 'DUPATTA');
          const matchedFabric = matchDupattaFabric([
            barcodeRow.printDescription,
            barcodeRow.supplierDescription,
            barcodeRow.itemName,
            barcodeRow.itemCode,
            ...classificationTextValues(barcodeRow),
            ...classificationTextValues(savedProduct),
            item.name,
            item.itemCode,
            item.description,
            ...classificationTextValues(item),
          ], dupattaFabrics.map((option) => option.name));
          const matched = dupattaFabrics.find((option) => option.name === matchedFabric);
          if (matched) return [field, [String(matched._id)]];
        }
        return [field, [...new Set(selected)]];
      })
    );

    return json({
      barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
      /* the label's own number, as stored (case included) - what the Add form saves */
      barcodeNo: barcodeRow.barcodeNo || barcodeRow.oldBarcode || '',
      /* which saved product this barcode relates to, and whether that product
         is actually its own - the form warns before a save moves it */
      productMatch: product ? {
        id: String(product._id),
        savedBarcode: primaryBarcodeOf(product),
        ownsBarcode: Boolean(productForBarcode),
      } : null,
      item: {
        id: String(item._id),
        itemCode,
        name: item.name || barcodeRow.itemName || '',
        itemType: item.itemType || '',
        /* a name, never an id: a groupId whose product group is gone falls back to the
           label's own group name (29-10-2026) */
        group: group?.name || barcodeRow.customFields?.groupName
          || (isValidObjectId(String(barcodeRow.groupId || '')) ? '' : barcodeRow.groupId) || '',
        hsnCode: hsn?.code || barcodeRow.hsn || '',
      },
      data: {
        ...defaultData,
        ...savedProduct,
        ...classificationDefaults,
        /* the checkbox belongs to THIS barcode, never to the item's aggregate
           flag or to whichever sibling barcode the row was saved for */
        isPublished: productVisibleForBarcode(product, lookedUpBarcode),
        barcode: lookedUpBarcode,
        displayName: savedProduct.displayName || defaultData.displayName,
        ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
        /* resolved, not echoed: a saved image may be a legacy relative
           "/images/<prefix>/..." path, which only loads from the ERP media
           origin. The label's own file comes first, exactly as in the listing,
           so the form and the row show the same photo; a stored path that
           names a SIBLING barcode's file is skipped (imageBelongsToBarcode). */
        image: productImageSource(
          barcodeRow.imageUrl || barcodeRow.filePath
            || ownBarcodeImage(savedProduct.image, barcodeImageCodes) || '',
          ...barcodeImageCodes,
        ) || defaultData.image,
        /* the item's group names a real type -> that is the type (the form locks
           the field to it); a saved type only fills in when the group names none */
        productType: matchedProductType?.value || savedProduct.productType || defaultData.productType || '',
        printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
        ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
        barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
        barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
        status: savedProduct.status || defaultData.status,
      },
    });
  }

  /* the by* choices for the Add form, from byweave / byfabric / ... (29-10-2026) */
  if (sp.get('classifications') === '1') {
    const opts = b && isValidObjectId(b) ? await listClassificationOptions(b) : [];
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
  if (sp.get('allErpBarcodes') === '1') {
    if (!b || !isValidObjectId(b)) {
      return json({ error: 'Select a valid business before loading ERP barcodes.' }, 422);
    }
    const productFilter = await resolveProductFilters(sp, b);
    const rows = await listAllErpBarcodes({
      businessId: b,
      search,
      page,
      perPage,
      sortBy: sp.get('sortBy'),
      sortDir: sp.get('sortDir'),
      productFilter,
    });
    return json(rows);
  }

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ displayName: rx }, { ecommItemCode: rx }, { slug: rx }, { productType: rx }, { status: rx }];
  }

  /* column-header sort: any plain field name; newest first otherwise */
  const sortBy = sp.get('sortBy');
  const dir = sp.get('sortDir') === 'desc' ? -1 : sp.get('sortDir') === 'asc' ? 1 : 0;
  const sort = sortBy && dir && /^[A-Za-z_][A-Za-z0-9_]*$/.test(sortBy) && !HIDDEN.has(sortBy)
    ? { [sortBy]: dir, _id: 1 }
    : { updatedAt: -1, createdAt: -1, _id: -1 };

  const total = await col.countDocuments(filter);
  const rows = await col.find(filter)
    .sort(sort)
    .collation({ locale: 'en', strength: 2, numericOrdering: true })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .toArray();

  const classificationIds = [...new Set(rows.flatMap((row) =>
    ['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave']
      .flatMap((key) => Array.isArray(row[key]) ? row[key] : [])
      .map((value) => String(value || ''))
      .filter(isValidObjectId)
  ))];
  const classificationNameById = new Map([...(await classificationOptionsById(classificationIds))]
    .map(([id, option]) => [id, option.name]));

  const itemIds = [...new Set(rows
    .map((row) => String(row.itemId || ''))
    .filter(isValidObjectId))]
    .map((id) => new Types.ObjectId(id));
  const itemFilter = { _id: { $in: itemIds } };
  if (b && isValidObjectId(b)) itemFilter.businessId = idMatch(b);
  const items = itemIds.length
    ? await mongoose.connection.db.collection('item')
      .find(itemFilter, { projection: { name: 1, itemCode: 1, image: 1 } })
      .toArray()
    : [];
  const itemById = new Map(items.map((item) => [String(item._id), item]));
  const businessIds = [...new Set(rows
    .map((row) => String(row.businessId || ''))
    .filter(isValidObjectId))]
    .map((id) => new Types.ObjectId(id));
  const businesses = businessIds.length
    ? await mongoose.connection.db.collection('business')
      .find({ _id: { $in: businessIds } }, { projection: { name: 1, businessPrintName: 1 } })
      .toArray()
    : [];
  const businessNameById = new Map(businesses.map((business) => [
    String(business._id),
    business.name || business.businessPrintName || '',
  ]));
  const itemCodes = [...new Set([
    ...items.map((item) => item.itemCode),
    ...rows.map((row) => row.ecommItemCode),
  ].map((value) => String(value || '').trim()).filter(Boolean))];
  const barcodeListFilter = {
    $or: [
      { itemId: { $in: [...itemIds, ...itemIds.map(String)] } },
      ...(itemCodes.length ? [{ itemCode: { $in: itemCodes } }] : []),
    ],
  };
  if (b && isValidObjectId(b)) {
    barcodeListFilter.$and = [{
      $or: [
        { businessId: { $in: [b, new Types.ObjectId(b)] } },
        { currentBusinessId: { $in: [b, new Types.ObjectId(b)] } },
      ],
    }];
  }
  let barcodes = itemIds.length || itemCodes.length
    ? await mongoose.connection.db.collection('barcodeLabel')
      .find(barcodeListFilter, {
        projection: {
          itemId: 1,
          businessId: 1,
          currentBusinessId: 1,
          itemCode: 1,
          barcodeGenerated: 1,
          barcodeNo: 1,
          oldBarcode: 1,
          imageUrl: 1,
          filePath: 1,
        },
      })
      .collation({ locale: 'en', strength: 2 })
      .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
      .toArray()
    : [];
  if (b && isValidObjectId(b) && (itemIds.length || itemCodes.length)) {
    const linkedItemMatches = [
      ...(itemIds.length ? [{ _id: { $in: itemIds } }] : []),
      ...itemCodes.flatMap((value) => {
        const exact = { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' };
        return [{ itemCode: exact }, { name: exact }];
      }),
    ];
    const linkedItems = linkedItemMatches.length
      ? await mongoose.connection.db.collection('item')
        .find({ businessId: idMatch(b), $or: linkedItemMatches })
        .project({ _id: 1, itemCode: 1, name: 1 })
        .toArray()
      : [];
    const linkedItemIds = new Set(linkedItems.map((item) => String(item._id)));
    const linkedItemKeys = new Set(linkedItems.flatMap((item) =>
      [item.itemCode, item.name].map((value) => String(value || '').trim().toLowerCase())
    ).filter(Boolean));
    const legacyBarcodeMatches = [
      ...(linkedItemIds.size
        ? [{ itemId: { $in: [...linkedItemIds, ...[...linkedItemIds].map((id) => new Types.ObjectId(id))] } }]
        : []),
      ...[...linkedItemKeys].flatMap((value) => {
        const exact = { $regex: `^${escapeRegex(value)}$`, $options: 'i' };
        return [{ itemCode: exact }, { itemName: exact }];
      }),
    ];
    const legacyBarcodes = legacyBarcodeMatches.length
      ? await mongoose.connection.db.collection('barcodeLabel')
        .find({ $or: legacyBarcodeMatches }, {
          projection: {
            itemId: 1,
            businessId: 1,
            currentBusinessId: 1,
            itemCode: 1,
            barcodeGenerated: 1,
            barcodeNo: 1,
            oldBarcode: 1,
            imageUrl: 1,
            filePath: 1,
          },
        })
        .collation({ locale: 'en', strength: 2 })
        .sort({ barcodeNo: 1, barcodeGenerated: 1, _id: 1 })
        .toArray()
      : [];
    const existingBarcodeIds = new Set(barcodes.map((barcode) => String(barcode._id)));
    barcodes = [
      ...barcodes,
      ...legacyBarcodes.filter((barcode) =>
        !existingBarcodeIds.has(String(barcode._id))
        && ((barcode.itemId && linkedItemIds.has(String(barcode.itemId)))
          || [barcode.itemCode, barcode.itemName].some((value) =>
            value && linkedItemKeys.has(String(value).trim().toLowerCase())))
      ),
    ];
  }
  const barcodeByItemId = new Map();
  const barcodeByItemCode = new Map();
  const imageByBarcode = new Map();
  const imageByItemId = new Map();
  const imageByItemCode = new Map();
  const barcodeValues = new Set();
  barcodes.forEach((barcode) => {
    const values = [barcode.barcodeGenerated, barcode.barcodeNo, barcode.oldBarcode]
      .map((value) => String(value || '').trim())
      .filter(Boolean);
    const value = values[0] || '';
    const itemId = barcode.itemId ? String(barcode.itemId) : '';
    if (itemId && value && !barcodeByItemId.has(itemId)) barcodeByItemId.set(itemId, value);
    values.forEach((barcodeValue) => barcodeValues.add(barcodeValue));
    const itemCodeKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
    const currentItemCodeKey = itemCodeMapKey(barcode.currentBusinessId, barcode.itemCode);
    if (barcode.itemCode && value && !barcodeByItemCode.has(itemCodeKey)) {
      barcodeByItemCode.set(itemCodeKey, value);
    }
    if (barcode.itemCode && value && !barcodeByItemCode.has(currentItemCodeKey)) {
      barcodeByItemCode.set(currentItemCodeKey, value);
    }
    const storedImage = String(barcode.imageUrl || barcode.filePath || '').trim();
    const image = productImageSource(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
    if (!image) return;
    values.forEach((barcodeValue) => {
      const key = String(barcodeValue).trim().toLowerCase();
      if (key && !imageByBarcode.has(key)) imageByBarcode.set(key, image);
    });
    if (itemId && !imageByItemId.has(itemId)) imageByItemId.set(itemId, image);
    if (barcode.itemCode && !imageByItemCode.has(itemCodeKey)) imageByItemCode.set(itemCodeKey, image);
    if (barcode.itemCode && !imageByItemCode.has(currentItemCodeKey)) imageByItemCode.set(currentItemCodeKey, image);
  });
  rows.forEach((row) => {
    const value = String(row.barcode || '').trim();
    if (value) barcodeValues.add(value);
  });
  const productImageLookups = [
    ...[...barcodeValues].map((value) => ({
      barcodeGenerated: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
    })),
    ...itemCodes.map((value) => ({
      itemCode: { $regex: `^${escapeRegex(String(value))}$`, $options: 'i' },
    })),
  ];
  const productImages = productImageLookups.length
    ? await ProductImage.find({ $or: productImageLookups })
      .sort({ createdAt: -1 })
      .select('barcodeGenerated itemCode imageUrl filePath')
      .lean()
    : [];
  const productImageBarcodes = new Set();
  productImages.forEach((productImage) => {
    const key = String(productImage.barcodeGenerated || '').trim().toLowerCase();
    const image = productImageSource(productImage.imageUrl || productImage.filePath || '');
    if (key && image && !productImageBarcodes.has(key)) {
      imageByBarcode.set(key, image);
      productImageBarcodes.add(key);
    }
    const itemCodeKey = String(productImage.itemCode || '').trim();
    if (image && itemCodeKey) {
      items.filter((item) =>
        String(item.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
      ).forEach((item) => {
        const mapKey = itemCodeMapKey(item.businessId, item.itemCode);
        if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
      });
      rows.filter((row) =>
        String(row.ecommItemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
      ).forEach((row) => {
        const mapKey = itemCodeMapKey(row.businessId, row.ecommItemCode);
        if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
      });
      barcodes.filter((barcode) =>
        String(barcode.itemCode || '').trim().toLowerCase() === itemCodeKey.toLowerCase()
      ).forEach((barcode) => {
        const mapKey = itemCodeMapKey(barcode.businessId, barcode.itemCode);
        if (!imageByItemCode.has(mapKey)) imageByItemCode.set(mapKey, image);
      });
    }
  });

  return json({
    rows: rows.map((r) => {
      const row = plain(r);
      const item = itemById.get(String(r.itemId));
      const businessName = businessNameById.get(String(r.businessId));
      const barcode = row.barcode
        || barcodeByItemId.get(String(r.itemId))
        || barcodeByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
        || barcodeByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
        || '';
      const productImage = [
        row.image,
        row.productImageUrl,
        row.primaryImage,
        row.imageUrl,
        row.barcodeImage,
        row.barcodeImageUrl,
        ...(Array.isArray(row.productImages) ? row.productImages : []),
        ...(Array.isArray(row.imageUrls) ? row.imageUrls : []),
        ...(Array.isArray(row.images) ? row.images : []),
        ...(Array.isArray(row.additionalImages)
          ? row.additionalImages
          : row.additionalImages ? [row.additionalImages] : []),
        item?.image,
      ].map((value) => {
        if (value && typeof value === 'object') {
          return value.url || value.imageUrl || value.src || value.path || '';
        }
        return value;
      }).find((value) => typeof value === 'string' && value.trim());
      return {
        ...row,
        ...Object.fromEntries(['byFabric', 'byColour', 'byCraft', 'byOccasion', 'byWeave'].map((key) => [
          `${key}Display`,
          (Array.isArray(r[key]) ? r[key] : [])
            .map((value) => classificationNameById.get(String(value)) || String(value || ''))
            .filter(Boolean)
            .join(', '),
        ])),
        barcode,
        barcodeImage: (productImage ? productImageSource(productImage) : '')
          || imageByBarcode.get(String(barcode).trim().toLowerCase())
          || imageByItemId.get(String(r.itemId))
          || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
          || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
          || '',
        businessName: businessName || '',
        itemLabel: item ? [item.itemCode, item.name].filter(Boolean).join(' - ') : '',
        ecommItemCode: row.ecommItemCode || item?.itemCode || '',
        _id: String(r._id),
      };
    }),
    labels: {},
    total,
    page,
    pages: Math.max(1, Math.ceil(total / perPage)),
    perPage,
  });
}

/* --------------------------------------------------- publish / show ---

   The list's bulk Enable/Disable actions send the barcode rows the operator
   selected: { business, items: [{ barcode, itemId }], isPublished }. Only the
   named barcode's answer changes; a sibling barcode on the same item keeps
   whatever it had. The legacy { productIds } form still works and toggles the
   row's primary barcode.

   A product reaches the storefront only when it is published, isActive and
   status "active", so publishing turns the other two on as well. */
export async function PATCH(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const business = body.business;
  if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);

  const publish = parseEcommerceVisibility(body.isPublished);
  if (publish === undefined) return json({ error: 'isPublished must be true or false.' }, 422);

  const itemTargets = Array.isArray(body.items) ? body.items : [];
  const barcodeTargets = (Array.isArray(body.barcodes) ? body.barcodes : [])
    .map((value) => String(value || '').trim())
    .filter(Boolean);
  const productIds = (Array.isArray(body.productIds) ? body.productIds : [])
    .map(String)
    .filter((id) => isValidObjectId(id));
  if (!itemTargets.length && !barcodeTargets.length && !productIds.length) {
    return json({ error: 'Select at least one product.' }, 422);
  }

  await dbConnect();
  const database = mongoose.connection.db;
  const col = database.collection(COLLECTION);
  const barcodeCol = database.collection('barcodeLabel');
  const itemCol = database.collection('item');
  const businessFilter = { businessId: idMatch(business) };
  const exact = (value) => ({
    $regex: `^${escapeRegex(String(value || '').trim())}$`,
    $options: 'i',
  });
  const barcodeCodeMatch = (barcode) => ({
    $or: [
      { barcodeNo: exact(barcode) },
      { barcodeGenerated: exact(barcode) },
      { oldBarcode: exact(barcode) },
    ],
  });

  const itemById = async (id) => (isValidObjectId(String(id || ''))
    ? itemCol.findOne({ _id: new Types.ObjectId(String(id)), businessId: idMatch(business) })
    : null);

  /* Barcodes are NOT unique - the same number can sit on several labels, even
     within one business. Fetch every candidate and keep only the label that
     belongs to the item the caller named, so a recycled number can never
     resolve to another item's product. */
  const findBarcodeLabel = async (barcode, itemId) => {
    if (!barcode) return null;
    const rows = await barcodeCol.find({
      $and: [
        {
          $or: [
            { businessId: idMatch(business) },
            { currentBusinessId: idMatch(business) },
          ],
        },
        barcodeCodeMatch(barcode),
      ],
    }).limit(25).toArray();
    if (!rows.length) return null;
    const want = String(itemId || '').trim();
    if (!isValidObjectId(want)) return rows[0];
    const byItem = rows.filter((row) => String(row.itemId || '').trim() === want);
    if (byItem.length) return byItem[0];
    /* a label with no itemId can still be this item's when its item code is */
    const item = await itemById(want);
    const itemCode = String(item?.itemCode || '').trim().toLowerCase();
    if (itemCode) {
      const byCode = rows.filter((row) =>
        !String(row.itemId || '').trim()
        && String(row.itemCode || '').trim().toLowerCase() === itemCode);
      if (byCode.length) return byCode[0];
    }
    return null;
  };

  /* The item this label belongs to: its own itemId wins; a label without one
     is accepted only when the caller's item carries the same item code. */
  const resolveItemIdForLabel = async (label, itemId) => {
    const labelItemId = String(label?.itemId || '').trim();
    if (isValidObjectId(labelItemId)) return labelItemId;
    const want = String(itemId || '').trim();
    if (!isValidObjectId(want)) return '';
    const item = await itemById(want);
    const labelCode = String(label?.itemCode || '').trim().toLowerCase();
    const itemCode = String(item?.itemCode || '').trim().toLowerCase();
    if (labelCode && itemCode && labelCode === itemCode) return want;
    return '';
  };

  /* The e-commerce product is unique per (businessId, itemId). The ecommItemCode
     fallback exists for rows filed under a code instead of the item id, and it
     is only accepted when the row really belongs to THIS item - matching a code
     alone used to attach the visibility flag to a different item's product. */
  const findProductForItem = async (itemId, itemCode) => {
    const byItem = await col.findOne({ ...businessFilter, itemId: idMatch(itemId) });
    if (byItem) return byItem;
    if (itemCode) {
      const byCode = await col.findOne({
        ...businessFilter,
        ecommItemCode: exact(itemCode),
      });
      if (byCode && String(byCode.itemId || '').trim() === String(itemId)) return byCode;
    }
    return null;
  };

  /* Build the ecommerceproduct document for a barcode that has none yet, from
     the same live ERP sources the barcode lookup / Add form use: item master,
     product group -> product type, label photo and per-barcode prices. */
  const buildProductDoc = async (label, itemId) => {
    const item = await itemById(itemId);
    if (!item) return null;
    const codes = [label.barcodeNo, label.barcodeGenerated, label.oldBarcode]
      .map((value) => String(value || '').trim()).filter(Boolean);
    const barcode = String(
      label.barcodeNo || label.barcodeGenerated || label.oldBarcode || ''
    ).trim();

    let groupName = '';
    const groupId = String(item.subGroupId || label.groupId || '').trim();
    if (isValidObjectId(groupId)) {
      const group = await database.collection('productgroup')
        .findOne({ _id: new Types.ObjectId(groupId) }, { projection: { name: 1 } });
      groupName = String(group?.name || '');
    }
    if (!groupName && label.groupId && !isValidObjectId(String(label.groupId))) {
      groupName = String(label.groupId).trim();
    }
    groupName = groupName || String(label.customFields?.groupName || '').trim();

    const typeRows = await database.collection('producttypes')
      .find({ businessId: { $in: [business, new Types.ObjectId(business)] }, isActive: { $ne: false } })
      .project({ value: 1, label: 1 })
      .toArray();
    const candidates = [groupName, String(item.itemType || '')]
      .map((value) => String(value || '').trim().toLowerCase()).filter(Boolean);
    const matchedType = typeRows.find((type) =>
      candidates.includes(String(type.value || '').trim().toLowerCase())
      || candidates.includes(String(type.label || '').trim().toLowerCase()));
    const productType = matchedType?.value || item.itemType || groupName || '';

    const imageRecord = codes.length
      ? await ProductImage.findOne({ barcodeGenerated: { $in: codes } })
        .sort({ createdAt: -1 }).select('imageUrl filePath').lean()
      : null;
    const imageByItem = !imageRecord && item.itemCode
      ? await ProductImage.findOne({ itemCode: item.itemCode })
        .sort({ createdAt: -1 }).select('imageUrl filePath').lean()
      : null;
    const image = productImageSource(
      label.imageUrl || label.filePath
        || imageRecord?.imageUrl || imageRecord?.filePath
        || imageByItem?.imageUrl || imageByItem?.filePath
        || '',
      ...codes,
    );

    const classOptions = await listClassificationOptions(business);
    const classById = new Map(classOptions.map((option) => [String(option._id), option]));
    const classByName = new Map(classOptions.map((option) => [
      `${option.type}:${String(option.name || '').trim().toLowerCase()}`, option,
    ]));
    const by = {};
    for (const field of ['byWeave', 'byFabric', 'byCraft', 'byOccasion', 'byColour']) {
      const source = label[field] ?? label.customFields?.[field];
      const values = Array.isArray(source)
        ? source
        : String(source || '').split(',').map((value) => value.trim()).filter(Boolean);
      const ids = [...new Set(values.map((value) => {
        const text = value && typeof value === 'object'
          ? String(value._id || value.name || '').trim()
          : String(value || '').trim();
        if (!text) return '';
        const option = isValidObjectId(text)
          ? classById.get(text)
          : classByName.get(`${field}:${text.toLowerCase()}`);
        return option && option.type === field ? String(option._id) : '';
      }).filter(Boolean))];
      by[field] = ids.map((id) => new Types.ObjectId(id));
    }

    const now = new Date();
    return {
      businessId: new Types.ObjectId(business),
      itemId: new Types.ObjectId(itemId),
      barcode,
      barcodes: codes,
      ecommItemCode: String(item.itemCode || label.itemCode || ''),
      displayName: String(item.name || label.itemName || label.printDescription || label.supplierDescription || ''),
      productType,
      image,
      printDescriptionOverride: String(label.printDescription || item.description || label.supplierDescription || ''),
      ecommOffPercent: Number(item.offerPriceNetPrice) || 0,
      barcodePriceOverride: Number(label.retailPrice || item.rsp || label.offerPrice) || 0,
      barcodeQtyOverride: Number(label.qtyNum ?? label.qty ?? 0) || 0,
      ...by,
      status: 'active',
      isActive: true,
      isPublished: false,
      publishedBarcodes: [],
      createdAt: now,
      updatedAt: now,
      __v: 0,
    };
  };

  /* One entry per product: several selected barcodes of the same item must be
     applied together, or the second read would undo the first. A barcode with
     no saved product yet is keyed by its item so the doc can be created. */
  const targets = new Map();
  const addTarget = ({ product = null, itemId = '', barcode = '', label = null }) => {
    const key = product ? `p:${product._id}` : `i:${itemId}`;
    if (!product && !isValidObjectId(itemId)) return false;
    if (!targets.has(key)) targets.set(key, { product, itemId, barcodes: new Set(), label });
    const entry = targets.get(key);
    if (label && !entry.label) entry.label = label;
    const value = String(barcode || '').trim();
    if (value) entry.barcodes.add(value);
    return true;
  };

  let skipped = 0;
  for (const target of itemTargets) {
    const barcode = String(target?.barcode || '').trim();
    const itemId = String(target?.itemId || '').trim();
    const label = await findBarcodeLabel(barcode, itemId);
    const resolvedItemId = await resolveItemIdForLabel(label, itemId);
    /* the caller named an item: the barcode must really belong to it */
    if (itemId && isValidObjectId(itemId) && resolvedItemId !== itemId) {
      skipped += 1;
      continue;
    }
    const item = resolvedItemId ? await itemById(resolvedItemId) : null;
    const product = resolvedItemId
      ? await findProductForItem(resolvedItemId, item?.itemCode || label?.itemCode)
      : null;
    /* publishedBarcodes must carry the label's canonical number - the one the
       listing computes - not an alias the caller happened to send */
    const canonical = label
      ? String(label.barcodeNo || label.barcodeGenerated || label.oldBarcode || barcode).trim()
      : barcode;
    const ok = label
      ? addTarget({ product, itemId: resolvedItemId, barcode: canonical, label })
      : addTarget({ product, itemId: resolvedItemId, barcode: canonical });
    if (!ok) skipped += 1;
  }
  for (const barcode of barcodeTargets) {
    const label = await findBarcodeLabel(barcode, '');
    const resolvedItemId = await resolveItemIdForLabel(label, '');
    const item = resolvedItemId ? await itemById(resolvedItemId) : null;
    const product = resolvedItemId
      ? await findProductForItem(resolvedItemId, item?.itemCode || label?.itemCode)
      : null;
    const canonical = label
      ? String(label.barcodeNo || label.barcodeGenerated || label.oldBarcode || barcode).trim()
      : barcode;
    const ok = addTarget({ product, itemId: resolvedItemId, barcode: canonical, label });
    if (!ok) skipped += 1;
  }
  for (const id of productIds) {
    const product = await col.findOne({ ...businessFilter, _id: new Types.ObjectId(id) });
    /* legacy productId form flips the aggregate flag only - no barcode is
       toggled, so no per-barcode visibility changes either */
    if (!addTarget({ product, itemId: String(product?.itemId || ''), barcode: '' })) skipped += 1;
  }

  const now = new Date();
  let updated = 0;
  let inserted = 0;
  const failures = [];
  for (const { product, itemId, barcodes, label } of targets.values()) {
    try {
      if (product) {
        /* no barcode to toggle: the legacy productId form flips the aggregate */
        let working = barcodes.size ? product : { ...product, isPublished: publish };
        for (const barcode of barcodes) {
          const next = withBarcodeVisibility(working, barcode, publish);
          working = {
            ...working,
            publishedBarcodes: next.list,
            isPublished: next.isPublished,
          };
        }

        const set = { isPublished: working.isPublished, updatedAt: now };
        if (barcodes.size) {
          set.publishedBarcodes = working.publishedBarcodes || [];
        } else if (!publish) {
          /* legacy row toggled by productId: it has no barcode target, so clearing
             the list is the only visibility state it has */
          set.publishedBarcodes = [];
        }
        if (working.isPublished) {
          set.isActive = true;
          set.status = 'active';
        }
        const result = await col.updateOne({ _id: product._id }, { $set: set });
        if (result.matchedCount) updated += 1;
        continue;
      }

      /* No saved product for this item: only an activation creates one. A
         deactivation has nothing to remove, so it is skipped instead of
         writing a hidden stub. */
      if (publish !== true) {
        skipped += 1;
        continue;
      }
      const doc = await buildProductDoc(label, itemId);
      if (!doc) {
        skipped += 1;
        continue;
      }
      for (const barcode of barcodes) {
        const next = withBarcodeVisibility(doc, barcode, true);
        doc.publishedBarcodes = next.list || [];
        doc.isPublished = next.isPublished;
      }
      if (!doc.isPublished) {
        /* every selected barcode failed validation: nothing to publish */
        skipped += 1;
        continue;
      }
      doc.isActive = true;
      doc.status = 'active';
      try {
        await col.insertOne(doc);
        inserted += 1;
      } catch (e) {
        if (e && e.code === 11000) {
          /* another request created the row first: apply only the visibility
             fields to it, never the insert payload */
          const existing = await col.findOne({
            ...businessFilter,
            itemId: idMatch(itemId),
          });
          if (!existing) throw e;
          let working = existing;
          for (const barcode of barcodes) {
            const next = withBarcodeVisibility(working, barcode, true);
            working = { ...working, publishedBarcodes: next.list, isPublished: next.isPublished };
          }
          await col.updateOne({ _id: existing._id }, {
            $set: {
              isPublished: working.isPublished,
              publishedBarcodes: working.publishedBarcodes || [],
              isActive: true,
              status: 'active',
              updatedAt: now,
            },
          });
          updated += 1;
        } else {
          throw e;
        }
      }
    } catch (e) {
      failures.push({
        barcode: [...(barcodes || [])][0] || '',
        itemId: String(itemId || ''),
        error: String(e?.message || e),
      });
    }
  }

  return json({
    ok: failures.length === 0,
    updated,
    inserted,
    skipped,
    failed: failures.length,
    failures,
    isPublished: publish,
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
const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished', 'isBestBuy']);
const ID_LIST_FIELDS = new Set(['byColour', 'byCraft', 'byFabric', 'byOccasion', 'byWeave']);
const SYSTEM = new Set([
  '_id', '__v', 'businessId', 'itemId', 'createdAt', 'updatedAt',
  /* visibility and barcode ownership are handled explicitly below */
  'barcode', 'barcodes', 'publishedBarcodes', 'isPublished',
]);

export async function POST(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const body = await req.json().catch(() => ({}));
  const data = body.data || {};
  const business = body.business;
  if (!business || !isValidObjectId(business)) return json({ error: 'Select a Business in the top bar first.' }, 400);
  if (!data.itemId || !isValidObjectId(data.itemId)) return json({ errors: { itemId: 'Select the item this product is for.' }, error: 'Select the item this product is for.' }, 422);

  await dbConnect();
  const col = mongoose.connection.db.collection(COLLECTION);
  const productFilter = {
    businessId: idMatch(business),
    itemId: idMatch(data.itemId),
  };
  /* The barcode the form is actually looking at. Never trust `data.barcode`
     alone: a lookup can have moved the form to another barcode while the old
     value was still in state. */
  const requestedBarcode = String(body.barcode || data.barcode || '').trim();
  const additionalBarcode = String(body.addBarcodeToExisting || '').trim();
  const requestedPublish = parseEcommerceVisibility(data.isPublished);
  if (data.isPublished !== undefined && requestedPublish === undefined) {
    return json({ errors: { isPublished: 'isPublished must be true or false.' }, error: 'isPublished must be true or false.' }, 422);
  }

  /* A sibling barcode is only a valid target when the label is linked to this
     same item. The check is scoped to the selected business. */
  const labelBelongsToItem = async (barcode, itemId, itemCode) => {
    const linkedLabel = await mongoose.connection.db.collection('barcodeLabel').findOne({
      $and: [
        {
          $or: [
            { businessId: idMatch(business) },
            { currentBusinessId: idMatch(business) },
          ],
        },
        {
          $or: [
            { barcodeNo: { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' } },
            { barcodeGenerated: { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' } },
            { oldBarcode: { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' } },
          ],
        },
        {
          $or: [
            { itemId: { $in: [new Types.ObjectId(itemId), itemId] } },
            ...(itemCode ? [{ itemCode: { $regex: `^${escapeRegex(itemCode)}$`, $options: 'i' } }] : []),
          ],
        },
      ],
    }, { projection: { _id: 1 } });
    return Boolean(linkedLabel);
  };

  /* A sibling barcode has its own "Show in E-commerce" answer. Saving it
     changes that answer only - the row's fields, its primary barcode and every
     other barcode's visibility stay exactly as they were. */
  const saveVisibilityOnly = async (existing, barcode) => {
    if (requestedPublish === undefined) {
      return json({
        ok: true,
        id: String(existing._id),
        updated: false,
        visibilityOnly: true,
        isPublished: productVisibleForBarcode(existing, barcode),
      });
    }
    const next = withBarcodeVisibility(existing, barcode, requestedPublish);
    const set = {
      publishedBarcodes: next.list,
      isPublished: next.isPublished,
      updatedAt: new Date(),
    };
    if (next.isPublished) {
      set.isActive = true;
      set.status = 'active';
    }
    const result = await col.updateOne({ _id: existing._id }, { $set: set });
    if (!result.matchedCount) {
      return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
    }
    return json({
      ok: true,
      id: String(existing._id),
      updated: true,
      visibilityOnly: true,
      isPublished: next.isPublished,
    });
  };

  if (additionalBarcode) {
    const existing = await col.findOne(productFilter);
    if (!existing) return json({ error: 'The existing product could not be found. Please retry the barcode lookup.' }, 409);
    const itemCode = String(existing.ecommItemCode || '').trim();
    if (!(await labelBelongsToItem(additionalBarcode, data.itemId, itemCode))) {
      return json({ error: 'This barcode is not linked to the existing product item.' }, 422);
    }
    return saveVisibilityOnly(existing, additionalBarcode);
  }

  const existing = await col.findOne(productFilter);

  /* Infer a sibling save even when the client did not send
     addBarcodeToExisting: the item already has a product filed under a
     different barcode, so this save may only touch this barcode's flag. */
  if (existing && requestedBarcode && !productOwnsBarcode(existing, requestedBarcode)) {
    const itemCode = String(existing.ecommItemCode || data.ecommItemCode || '').trim();
    if (!(await labelBelongsToItem(requestedBarcode, data.itemId, itemCode))) {
      return json({ error: 'This barcode is not linked to the existing product item.' }, 422);
    }
    return saveVisibilityOnly(existing, requestedBarcode);
  }

  if (!String(data.displayName || '').trim()) return json({ errors: { displayName: 'Display Name is required.' }, error: 'Display Name is required.' }, 422);

  const doc = {
    businessId: new Types.ObjectId(business),
    itemId: new Types.ObjectId(data.itemId),
  };
  for (const [k, v] of Object.entries(data)) {
    if (SYSTEM.has(k) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(k)) continue;
    if (BOOL_FIELDS.has(k)) {
      const parsed = parseEcommerceVisibility(v);
      if (parsed === undefined) {
        return json({ errors: { [k]: `${k} must be true or false.` }, error: `${k} must be true or false.` }, 422);
      }
      doc[k] = parsed;
    } else if (NUMBER_FIELDS.has(k)) doc[k] = v === '' || v === null || v === undefined ? 0 : Number(v) || 0;
    else if (ID_LIST_FIELDS.has(k)) doc[k] = (Array.isArray(v) ? v : []).filter((x) => isValidObjectId(x)).map((x) => new Types.ObjectId(x));
    else if (k === 'additionalImages') doc[k] = (Array.isArray(v) ? v : String(v || '').split(/\r?\n/)).map((x) => String(x).trim()).filter(Boolean);
    else if (Array.isArray(v)) doc[k] = v;
    else doc[k] = v === null || v === undefined ? '' : String(v);
  }

  const now = new Date();
  doc.updatedAt = now;

  const updateExisting = async (existingDoc) => {
    const set = { ...doc };
    if (requestedBarcode) set.barcode = requestedBarcode;
    if (requestedPublish !== undefined) {
      if (requestedBarcode) {
        const next = withBarcodeVisibility(existingDoc, requestedBarcode, requestedPublish === true);
        set.publishedBarcodes = next.list;
        set.isPublished = next.isPublished;
      } else {
        set.isPublished = requestedPublish;
      }
    }
    if (set.isPublished === true) {
      set.isActive = true;
      set.status = 'active';
    }
    const result = await col.updateOne({ _id: existingDoc._id }, { $set: set });
    if (!result.matchedCount) {
      return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
    }
    return json({
      ok: true,
      id: String(existingDoc._id),
      updated: true,
      isPublished: set.isPublished ?? existingDoc.isPublished,
    });
  };

  if (existing) return updateExisting(existing);

  /* Apply collection defaults only to new products. Partial updates must not
     reset visibility, status, or classifications omitted from the request. */
  ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
  if (!doc.additionalImages) doc.additionalImages = [];
  if (!doc.status) doc.status = 'active';
  if (doc.isActive === undefined) doc.isActive = true;
  if (requestedBarcode) {
    doc.barcode = requestedBarcode;
    doc.publishedBarcodes = requestedPublish === true ? [requestedBarcode] : [];
    doc.isPublished = requestedPublish === true;
  } else {
    doc.isPublished = requestedPublish === true;
  }
  if (doc.isPublished) {
    doc.isActive = true;
    doc.status = 'active';
  }
  doc.createdAt = now;
  doc.__v = 0;
  try {
    const res = await col.insertOne(doc);
    return json({ ok: true, id: String(res.insertedId) });
  } catch (e) {
    if (e && e.code === 11000) {
      /* Another request inserted the row first. Re-read it and apply the same
         per-barcode rule instead of overwriting its visibility list. */
      const existingAfterRace = await col.findOne(productFilter);
      if (!existingAfterRace) throw e;
      /* The other request may have filed the row under a sibling barcode. This
         save may then only answer for its own barcode, exactly like the normal
         sibling path, and must not move the row's fields. */
      if (requestedBarcode && !productOwnsBarcode(existingAfterRace, requestedBarcode)) {
        const itemCode = String(existingAfterRace.ecommItemCode || data.ecommItemCode || '').trim();
        if (!(await labelBelongsToItem(requestedBarcode, data.itemId, itemCode))) {
          return json({ error: 'This barcode is not linked to the existing product item.' }, 422);
        }
        return saveVisibilityOnly(existingAfterRace, requestedBarcode);
      }
      delete doc.createdAt;
      delete doc.__v;
      delete doc.barcode;
      delete doc.publishedBarcodes;
      delete doc.isPublished;
      return updateExisting(existingAfterRace);
    }
    throw e;
  }
}
