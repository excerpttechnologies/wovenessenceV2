// // // // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';
// // // // import { escapeRegex } from '@/lib/validate';

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

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   await dbConnect();
// // // //   const col = mongoose.connection.db.collection(COLLECTION);

// // // //   const filter = {};
// // // //   const b = sp.get('business');
// // // //   if (b && isValidObjectId(b)) filter.businessId = idMatch(b);

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
// // // //     : { createdAt: -1, _id: -1 };

// // // //   const total = await col.countDocuments(filter);
// // // //   const rows = await col.find(filter)
// // // //     .sort(sort)
// // // //     .collation({ locale: 'en', strength: 2, numericOrdering: true })
// // // //     .skip((page - 1) * perPage)
// // // //     .limit(perPage)
// // // //     .toArray();

// // // //   return json({
// // // //     rows: rows.map((r) => ({ ...plain(r), _id: String(r._id) })),
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
// // // // const BOOL_FIELDS = new Set(['isFeatured', 'isPublished']);
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

// // // //   const exists = await col.findOne({ businessId: doc.businessId, itemId: doc.itemId }, { projection: { displayName: 1 } });
// // // //   if (exists) {
// // // //     const msg = 'This item already has an e-commerce product' + (exists.displayName ? ' ("' + exists.displayName + '")' : '') + '.';
// // // //     return json({ errors: { itemId: msg }, error: msg }, 409);
// // // //   }

// // // //   const now = new Date();
// // // //   doc.createdAt = now;
// // // //   doc.updatedAt = now;
// // // //   doc.__v = 0;
// // // //   try {
// // // //     const res = await col.insertOne(doc);
// // // //     return json({ ok: true, id: String(res.insertedId) });
// // // //   } catch (e) {
// // // //     if (e && e.code === 11000) return json({ error: 'This item already has an e-commerce product.' }, 409);
// // // //     throw e;
// // // //   }
// // // // }





// // // import mongoose, { isValidObjectId, Types } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';
// // // import { escapeRegex } from '@/lib/validate';
// // // import ProductImage from '@/models/ProductImage';
// // // import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';

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

// // //    POST adds one product (the Add form). No PUT or DELETE. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });
// // // const COLLECTION = 'ecommerceproduct';
// // // const PER_PAGE = 10;
// // // /* fields never shown as columns */
// // // const HIDDEN = new Set(['_id', '__v']);

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
// // //     let barcodeRows = await barcodeCollection.find({
// // //       $and: [barcodeBusinessMatch, inventoryBarcodeFilter(barcode)],
// // //     }).limit(50).toArray();
// // //     if (!barcodeRows.length) {
// // //       const barcodeRx = { $regex: `^${escapeRegex(barcode)}$`, $options: 'i' };
// // //       barcodeRows = await barcodeCollection.find({
// // //         $and: [
// // //           barcodeBusinessMatch,
// // //           {
// // //             $or: [
// // //               { barcodeGenerated: barcodeRx },
// // //               { barcodeNo: barcodeRx },
// // //               { oldBarcode: barcodeRx },
// // //             ],
// // //           },
// // //         ],
// // //       }).limit(50).toArray();
// // //     }
// // //     const barcodeRow = unitFor(barcodeRows, barcode) || barcodeRows.find((row) =>
// // //       [row.barcodeNo, row.barcodeGenerated, row.oldBarcode]
// // //         .some((value) => String(value || '').trim().toLowerCase() === barcode.toLowerCase())
// // //     );
// // //     if (!barcodeRow) return json({ error: `Barcode "${barcode}" was not found in this business.` }, 404);

// // //     const itemCollection = mongoose.connection.db.collection('item');
// // //     const itemBusinessFilter = { businessId: idMatch(b) };
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

// // //     const [group, hsn, product] = await Promise.all([
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
// // //     ]);
// // //     const itemCode = item.itemCode || barcodeRow.itemCode || '';
// // //     const defaultData = {
// // //       displayName: item.name || barcodeRow.itemName || barcodeRow.printDescription || barcodeRow.supplierDescription || '',
// // //       ecommItemCode: itemCode,
// // //       productType: item.itemType || '',
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
// // //         displayName: savedProduct.displayName || defaultData.displayName,
// // //         ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
// // //         productType: savedProduct.productType || defaultData.productType,
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
// // //   const barcodes = itemIds.length || itemCodes.length
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
// // //     const image = imageUrl(storedImage, barcode.barcodeNo, barcode.barcodeGenerated, barcode.oldBarcode);
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
// // //     const image = imageUrl(productImage.imageUrl || productImage.filePath || '');
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
// // //         row.barcodeImage,
// // //         row.barcodeImageUrl,
// // //         row.productImageUrl,
// // //         row.imageUrl,
// // //         row.image,
// // //         row.primaryImage,
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
// // //         barcodeImage: imageByBarcode.get(String(barcode).trim().toLowerCase())
// // //           || imageByItemId.get(String(r.itemId))
// // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, item?.itemCode))
// // //           || imageByItemCode.get(itemCodeMapKey(r.businessId, row.ecommItemCode))
// // //           || (productImage ? imageUrl(productImage) : ''),
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
//         productType: defaultData.productType || savedProduct.productType || '',
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
import ProductImage from '@/models/ProductImage';
import { barcodeFilter as inventoryBarcodeFilter, imageUrl, unitFor } from '@/lib/inventory';
import ProductClassificationOption from '@/models/ProductClassificationOption';
import { DUPATTA_FABRIC_OPTIONS } from '@/lib/productClassificationConstants';

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

   ?barcodeOptions=1 returns a bounded, business-scoped barcode search for
   the Add form's barcode picker.

   POST adds one product (the Add form). No PUT or DELETE. */

const json = (d, s = 200) => Response.json(d, { status: s });
const COLLECTION = 'ecommerceproduct';
const PER_PAGE = 10;
const DEPLOYED_IMAGE_ORIGIN = 'https://erp.wovenessence.in';
/* fields never shown as columns */
const HIDDEN = new Set(['_id', '__v']);

const normalizedFabricText = (value) => String(value || '')
  .normalize('NFKD')
  .replace(/[\u0300-\u036f]/g, '')
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, ' ')
  .trim();

function matchDupattaFabric(values) {
  const sourceText = values.map(normalizedFabricText).filter(Boolean).join(' ');
  return DUPATTA_FABRIC_OPTIONS.find((name) => {
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

function productImageSource(value, ...barcodes) {
  const source = imageUrl(value, ...barcodes);
  return source.startsWith('/august_8A_images/')
    ? `${DEPLOYED_IMAGE_ORIGIN}${source}`
    : source;
}

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
      mongoose.connection.db.collection('productclassificationoption')
        .find({ businessId: idMatch(b), isActive: { $ne: false } })
        .project({ type: 1, name: 1 })
        .toArray(),
    ]);
    const barcodeImageCodes = [...new Set([
      barcodeRow.barcodeGenerated,
      barcodeRow.barcodeNo,
      barcodeRow.oldBarcode,
    ].map((value) => String(value || '').trim()).filter(Boolean))];
    const barcodeImageRecord = barcodeImageCodes.length || item.itemCode
      ? await ProductImage.findOne({
        $or: [
          ...(barcodeImageCodes.length ? [{ barcodeGenerated: { $in: barcodeImageCodes } }] : []),
          ...(item.itemCode ? [{ itemCode: item.itemCode }] : []),
        ],
      }).sort({ createdAt: -1 }).select('imageUrl filePath').lean()
      : null;
    const barcodeImage = productImageSource(
      barcodeRow.imageUrl
        || barcodeRow.filePath
        || barcodeImageRecord?.imageUrl
        || barcodeImageRecord?.filePath
        || '',
      ...barcodeImageCodes,
    );
    const groupTypeCandidates = [group?.name, barcodeRow.groupId]
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
    const savedProduct = product ? plain(product) : {};
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
        if (field === 'byFabric' && String(productType).trim().toUpperCase() === 'DUPATTA') {
          const savedFabricNames = values
            .map((value) => {
              const text = value && typeof value === 'object'
                ? String(value.name || value.label || '').trim()
                : String(value || '').trim();
              return DUPATTA_FABRIC_OPTIONS.find((name) =>
                name.toLowerCase() === text.toLowerCase()
              ) || '';
            })
            .filter(Boolean);
          const optionFabricNames = selected
            .map((id) => classificationById.get(id)?.name || '')
            .filter((name) => DUPATTA_FABRIC_OPTIONS.some((option) =>
              option.toLowerCase() === name.toLowerCase()
            ));
          const matchedFabric = savedFabricNames[0] || optionFabricNames[0] || matchDupattaFabric([
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
          ]);
          if (matchedFabric) return [field, [matchedFabric]];
        }
        return [field, [...new Set(selected)]];
      })
    );

    return json({
      barcode: barcodeRow.barcodeGenerated || barcodeRow.barcodeNo || barcodeRow.oldBarcode || barcode,
      /* the label's own number, as stored (case included) - what the Add form saves */
      barcodeNo: barcodeRow.barcodeNo || barcodeRow.oldBarcode || '',
      item: {
        id: String(item._id),
        itemCode,
        name: item.name || barcodeRow.itemName || '',
        itemType: item.itemType || '',
        group: group?.name || barcodeRow.groupId || '',
        hsnCode: hsn?.code || barcodeRow.hsn || '',
      },
      data: {
        ...defaultData,
        ...savedProduct,
        ...classificationDefaults,
        displayName: savedProduct.displayName || defaultData.displayName,
        ecommItemCode: savedProduct.ecommItemCode || defaultData.ecommItemCode,
        image: savedProduct.image || defaultData.image,
        /* a saved product keeps the type it was saved with, so editing never resets it */
        productType: savedProduct.productType || defaultData.productType || '',
        printDescriptionOverride: savedProduct.printDescriptionOverride || defaultData.printDescriptionOverride,
        ecommOffPercent: savedProduct.ecommOffPercent ?? defaultData.ecommOffPercent,
        barcodePriceOverride: savedProduct.barcodePriceOverride ?? defaultData.barcodePriceOverride,
        barcodeQtyOverride: savedProduct.barcodeQtyOverride ?? defaultData.barcodeQtyOverride,
        status: savedProduct.status || defaultData.status,
      },
    });
  }

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
  ))].map((id) => new Types.ObjectId(id));
  const classificationOptions = classificationIds.length
    ? await mongoose.connection.db.collection('productclassificationoption')
      .find({ _id: { $in: classificationIds } }, { projection: { name: 1 } })
      .toArray()
    : [];
  const classificationNameById = new Map(classificationOptions.map((option) => [
    String(option._id),
    option.name || '',
  ]));

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

/* ---------------------------------------------------------------- add ---

   One product per item per business - the collection's own unique index
   (businessId + itemId). Every field the form sends is stored with the type
   the e-commerce project uses: ids as ObjectIds, the by* lists as arrays of
   ObjectIds, numbers as numbers, flags as booleans. Fields the form does not
   know about are passed through as text, so a field added on the e-commerce
   side can be filled in here too. */
const NUMBER_FIELDS = new Set(['barcodePriceOverride', 'barcodeQtyOverride', 'ecommOffPercent', 'salesCount']);
const BOOL_FIELDS = new Set(['isActive', 'isFeatured', 'isPublished']);
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
  if (String(data.productType || '').trim().toUpperCase() === 'DUPATTA' && Array.isArray(data.byFabric)) {
    const fabricNames = data.byFabric
      .map((value) => String(value || '').trim())
      .filter((name) => DUPATTA_FABRIC_OPTIONS.includes(name));
    const fabricOptions = await Promise.all(fabricNames.map((name) =>
      ProductClassificationOption.findOneAndUpdate(
        {
          businessId: new Types.ObjectId(business),
          type: 'byFabric',
          name: { $regex: `^${escapeRegex(name)}$`, $options: 'i' },
        },
        {
          $setOnInsert: {
            businessId: new Types.ObjectId(business),
            type: 'byFabric',
            name,
            displayOrder: 100 + DUPATTA_FABRIC_OPTIONS.indexOf(name),
            isActive: true,
          },
        },
        { upsert: true, new: true }
      ).select('_id').lean()
    ));
    doc.byFabric = [
      ...new Set([
        ...doc.byFabric.map(String),
        ...fabricOptions.map((option) => String(option._id)),
      ]),
    ].map((id) => new Types.ObjectId(id));
  }
  /* the shape the e-commerce project writes when a field is left empty */
  ID_LIST_FIELDS.forEach((k) => { if (!doc[k]) doc[k] = []; });
  if (!doc.additionalImages) doc.additionalImages = [];
  if (!doc.status) doc.status = 'active';
  if (doc.isActive === undefined) doc.isActive = true;

  const now = new Date();
  doc.updatedAt = now;
  const productFilter = {
    businessId: idMatch(business),
    itemId: idMatch(data.itemId),
  };
  const existing = await col.findOne(productFilter, { projection: { _id: 1 } });
  if (existing) {
    const result = await col.updateOne(productFilter, { $set: doc });
    if (!result.matchedCount) {
      return json({ error: 'The existing product could not be found while saving. Please retry.' }, 409);
    }
    return json({ ok: true, id: String(existing._id), updated: true });
  }

  doc.createdAt = now;
  doc.__v = 0;
  try {
    const res = await col.insertOne(doc);
    return json({ ok: true, id: String(res.insertedId) });
  } catch (e) {
    if (e && e.code === 11000) {
      const existingAfterRace = await col.findOne(productFilter, { projection: { _id: 1 } });
      if (!existingAfterRace) throw e;
      delete doc.createdAt;
      delete doc.__v;
      const result = await col.updateOne(productFilter, { $set: doc });
      if (!result.matchedCount) throw e;
      return json({ ok: true, id: String(existingAfterRace._id), updated: true });
    }
    throw e;
  }
}
