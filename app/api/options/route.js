


// // // // // import { isValidObjectId } from 'mongoose';
// // // // // import dbConnect from '@/lib/db';
// // // // // import { requireSession } from '@/lib/session';

// // // // // /* /api/options?ref=<name>&business=<id>
// // // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // // //    old /api/settings/[action] handler.

// // // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // // //    name to a model file and the field to display. Nothing here renders a page. */

// // // // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // // // const REFS = {
// // // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // // //      the main branch the default selection. */
// // // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // // //   tax:                       { load: () => import('@/models/Tax') },
// // // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // // // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // // // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // // //   uom:                       { load: () => import('@/models/Uom') },
// // // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // // // //   item:                      { load: () => import('@/models/Item') },
// // // // //   logistic:                  { load: () => import('@/models/Logistic') },

// // // // //   /* Transportation module */
// // // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // // //   driver:                    { load: () => import('@/models/Driver') },
// // // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // // //   'delivery-unassigned':     {
// // // // //     load: () => import('@/models/Delivery'),
// // // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // // //   },
// // // // // };

// // // // // export async function GET(req) {
// // // // //   const session = await requireSession();
// // // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // // //   const sp = new URL(req.url).searchParams;
// // // // //   const ref = sp.get('ref');
// // // // //   const entry = REFS[ref];
// // // // //   if (!entry) return json({ options: [] });

// // // // //   await dbConnect();

// // // // //   const mod = await entry.load();
// // // // //   const Model = mod.default;
// // // // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // // // //   const filter = {};
// // // // //   if (entry.scoped !== false) {
// // // // //     const b = sp.get('business');
// // // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // // //   }
// // // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // // //   if (entry.where) Object.assign(filter, entry.where);

// // // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // // //   const q = (sp.get('q') || '').trim();
// // // // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // // //   const sort = entry.defaultField
// // // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // // //     : { [label]: 1 };

// // // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // // //   return json({
// // // // //     options: rows.map((r) => ({
// // // // //       value: String(r._id),
// // // // //       label: String(r[label] ?? '(untitled)'),
// // // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // // //     })),
// // // // //   });






 
// // // // import { isValidObjectId } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';

// // // // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// // // //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// // // //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// // // //    them. */
// // // // const contactOptionsModel = (kind) => import('@/lib/contacts')
// // // //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // // // /* /api/options?ref=<name>&business=<id>
// // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // //    old /api/settings/[action] handler.
 
// // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // //    name to a model file and the field to display. Nothing here renders a page. */
 
// // // // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// // // //    quick-add, and without a cache directive the browser is free to answer a
// // // //    repeat GET from its own memory cache - so a record created seconds ago
// // // //    did not appear until the page was reloaded. */
// // // // const json = (d, s = 200) => Response.json(d, {
// // // //   status: s,
// // // //   headers: { 'Cache-Control': 'no-store' },
// // // // });
 
// // // // const REFS = {
// // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // //      the main branch the default selection. */
// // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // //   /* Staff Management -> Sales Persons. Only Active people are offered:
// // // //      retiring someone should take them out of the till's picker without
// // // //      deleting the record the past bills point at. codeField appends the
// // // //      SP Code for display and makes it searchable, the same way supplier
// // // //      does with the G-code. */
// // // //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // //   tax:                       { load: () => import('@/models/Tax') },
// // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // //   /* The three contact forms each pick a type of their own kind - the Agent
// // // //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// // // //      Customer/Supplier/Agent selector on the Contact Type master. */
// // // //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// // // //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// // // //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// // // //   /* nameFallback: businessName is blank on a contact entered as a person -
// // // //      the Agent form does not even ask for it - so fall back to the personal
// // // //      name rather than showing "(untitled)" in every picker. This mirrors what
// // // //      lib/refLabels.js resolveRefLabels already does for list columns. */
// // // //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// // // //      business calls the G-code and uses to identify a vendor on paper. It is
// // // //      appended to the label, and searched, so typing either the name or the
// // // //      code finds the supplier. Without it the code was invisible in every
// // // //      picker and unsearchable, even though lists already showed it.

// // // //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// // // //      which mixed every company's vendors into one list and then truncated
// // // //      that list at 200 - so a company with 819 suppliers could not reach most
// // // //      of its own, and could pick another company's. */
// // // //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// // // //      right whether the kinds share `contact` or each has its own collection. */
// // // //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // // //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // // //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // //   uom:                       { load: () => import('@/models/Uom') },
// // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// // // //   item:                      { load: () => import('@/models/Item') },
// // // //   logistic:                  { load: () => import('@/models/Logistic') },
 
// // // //   /* Transportation module */
// // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // //   driver:                    { load: () => import('@/models/Driver') },
// // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // //   'delivery-unassigned':     {
// // // //     load: () => import('@/models/Delivery'),
// // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // //   },
// // // //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// // // //   /* Inter Company Sell */
// // // //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// // // //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// // // //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// // // //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// // // //   /* challans not yet pulled into an inter company sales invoice */
// // // //   'ic-delivery-challan-open': {
// // // //     load: () => import('@/models/IcDeliveryChallan'),
// // // //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// // // //   },

// // // //   /* Stock Transfers */
// // // //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// // // //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// // // //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// // // //   /* packets not yet consolidated into a stock transfer location */
// // // //   'stock-transfer-packet-open': {
// // // //     load: () => import('@/models/StockTransferPacket'),
// // // //     where: {
// // // //       $or: [
// // // //         { stockTransferLocationId: null },
// // // //         { stockTransferLocationId: { $exists: false } },
// // // //       ],
// // // //     },
// // // //   },
// // // // };
 
// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// // // //   const sp = new URL(req.url).searchParams;
// // // //   const ref = sp.get('ref');
// // // //   const entry = REFS[ref];
// // // //   if (!entry) return json({ options: [] });
 
// // // //   await dbConnect();
 
// // // //   const mod = await entry.load();
// // // //   const Model = mod.default;
// // // //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// // // //   const filter = {};
// // // //   if (entry.scoped !== false) {
// // // //     const b = sp.get('business');
// // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // //   }
// // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // //   if (entry.where) Object.assign(filter, entry.where);
 
// // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // //   const q = (sp.get('q') || '').trim();
// // // //   if (q) {
// // // //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// // // //     if (entry.nameFallback || entry.codeField) {
// // // //       /* Search the label, the fallback name fields AND the code.

// // // //          The fallbacks matter because businessName is empty on a contact
// // // //          entered as a person - typing "DIRECT" found nothing for them. The
// // // //          code matters because the business identifies a vendor by its G-code
// // // //          as often as by its name: typing "G524" must find the same supplier
// // // //          as typing "KARNATAKA".

// // // //          Wrapped in $and so it cannot collide with a ref that already uses
// // // //          $or in its own `where`. */
// // // //       (filter.$and ||= []).push({
// // // //         $or: [
// // // //           { [label]: rx },
// // // //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// // // //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// // // //         ],
// // // //       });
// // // //     } else {
// // // //       filter[label] = rx;
// // // //     }
// // // //   }
  
// // // //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// // // //   if (ref === 'attribute-addon') {
// // // //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// // // //   }
 
// // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // //   const sort = ref === 'supplier'
// // // //     ? { createdAt: -1, [label]: 1 }
// // // //     : entry.defaultField
// // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // //     : { [label]: 1 };
 
// // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// // // //   const textOf = (r) => {
// // // //     if (ref === 'uom') {
// // // //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// // // //     }
// // // //     const primary = String(r[label] ?? '').trim();
// // // //     if (primary) return primary;
// // // //     const alt = (entry.nameFallback || [])
// // // //       .map((f) => String(r[f] ?? '').trim())
// // // //       .filter(Boolean)
// // // //       .join(' ');
// // // //     return alt || '(untitled)';
// // // //   };

// // // //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// // // //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// // // //      what gets stored is the reference and never the formatted text. A
// // // //      supplier without a code simply shows its name. */
// // // //   const labelOf = (r) => {
// // // //     const name = textOf(r);
// // // //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// // // //     return code ? name + ' (' + code + ')' : name;
// // // //   };

// // // //   return json({
// // // //     options: rows.map((r) => ({
// // // //       value: String(r._id),
// // // //       label: labelOf(r),
// // // //       /* the parts, unformatted, for a caller that needs them on their own */
// // // //       name: textOf(r),
// // // //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// // // //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // //     })),
// // // //   });
// // // // }
 
// // // // function escapeRegex(s) {
// // // //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // // // }









// // // // import { isValidObjectId } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';

// // // // /* /api/options?ref=<name>&business=<id>
// // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // //    old /api/settings/[action] handler.

// // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // //    name to a model file and the field to display. Nothing here renders a page. */

// // // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // // const REFS = {
// // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // //      the main branch the default selection. */
// // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // //   tax:                       { load: () => import('@/models/Tax') },
// // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // //   uom:                       { load: () => import('@/models/Uom') },
// // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // // //   item:                      { load: () => import('@/models/Item') },
// // // //   logistic:                  { load: () => import('@/models/Logistic') },

// // // //   /* Transportation module */
// // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // //   driver:                    { load: () => import('@/models/Driver') },
// // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // //   'delivery-unassigned':     {
// // // //     load: () => import('@/models/Delivery'),
// // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // //   },
// // // // };

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   const ref = sp.get('ref');
// // // //   const entry = REFS[ref];
// // // //   if (!entry) return json({ options: [] });

// // // //   await dbConnect();

// // // //   const mod = await entry.load();
// // // //   const Model = mod.default;
// // // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // // //   const filter = {};
// // // //   if (entry.scoped !== false) {
// // // //     const b = sp.get('business');
// // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // //   }
// // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // //   if (entry.where) Object.assign(filter, entry.where);

// // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // //   const q = (sp.get('q') || '').trim();
// // // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // //   const sort = entry.defaultField
// // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // //     : { [label]: 1 };

// // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // //   return json({
// // // //     options: rows.map((r) => ({
// // // //       value: String(r._id),
// // // //       label: String(r[label] ?? '(untitled)'),
// // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // //     })),
// // // //   });






 
// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';
 
// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.
 
// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */
 
// // // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// // //    quick-add, and without a cache directive the browser is free to answer a
// // //    repeat GET from its own memory cache - so a record created seconds ago
// // //    did not appear until the page was reloaded. */
// // // const json = (d, s = 200) => Response.json(d, {
// // //   status: s,
// // //   headers: { 'Cache-Control': 'no-store' },
// // // });
 
// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   /* locationScoped: a stock point belongs to ONE location, so offering the
// // //      whole business's list lets an operator standing in the warehouse pick a
// // //      stock point that physically sits in another branch location. */
// // //   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   /* Staff Management -> Sales Persons. Only Active people are offered:
// // //      retiring someone should take them out of the till's picker without
// // //      deleting the record the past bills point at. codeField appends the
// // //      SP Code for display and makes it searchable, the same way supplier
// // //      does with the G-code. */
// // //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   /* The three contact forms each pick a type of their own kind - the Agent
// // //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// // //      Customer/Supplier/Agent selector on the Contact Type master. */
// // //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// // //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// // //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// // //   /* nameFallback: businessName is blank on a contact entered as a person -
// // //      the Agent form does not even ask for it - so fall back to the personal
// // //      name rather than showing "(untitled)" in every picker. This mirrors what
// // //      lib/refLabels.js resolveRefLabels already does for list columns. */
// // //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// // //      business calls the G-code and uses to identify a vendor on paper. It is
// // //      appended to the label, and searched, so typing either the name or the
// // //      code finds the supplier. Without it the code was invisible in every
// // //      picker and unsearchable, even though lists already showed it.

// // //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// // //      which mixed every company's vendors into one list and then truncated
// // //      that list at 200 - so a company with 819 suppliers could not reach most
// // //      of its own, and could pick another company's. */
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },
 
// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// // //   /* Inter Company Sell */
// // //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// // //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// // //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// // //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// // //   /* challans not yet pulled into an inter company sales invoice */
// // //   'ic-delivery-challan-open': {
// // //     load: () => import('@/models/IcDeliveryChallan'),
// // //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// // //   },

// // //   /* Stock Transfers */
// // //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// // //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// // //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// // //   /* packets not yet consolidated into a stock transfer location */
// // //   'stock-transfer-packet-open': {
// // //     load: () => import('@/models/StockTransferPacket'),
// // //     where: {
// // //       $or: [
// // //         { stockTransferLocationId: null },
// // //         { stockTransferLocationId: { $exists: false } },
// // //       ],
// // //     },
// // //   },
// // // };
 
// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });
 
// // //   await dbConnect();
 
// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

// // //      Opt-in per ref, not global: most refs are business-wide (and
// // //      companylocations must never be filtered by the location it is used to
// // //      choose). useOptions already sends `location`; until now nothing read it.

// // //      A row with no locationId is a business-wide one and stays visible - some
// // //      businesses never assigned stock points to a location, and a strict match
// // //      would leave their dropdown empty. */
// // //   if (entry.locationScoped) {
// // //     const l = sp.get('location');
// // //     if (l && isValidObjectId(l)) {
// // //       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
// // //     }
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);
 
// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) {
// // //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// // //     if (entry.nameFallback || entry.codeField) {
// // //       /* Search the label, the fallback name fields AND the code.

// // //          The fallbacks matter because businessName is empty on a contact
// // //          entered as a person - typing "DIRECT" found nothing for them. The
// // //          code matters because the business identifies a vendor by its G-code
// // //          as often as by its name: typing "G524" must find the same supplier
// // //          as typing "KARNATAKA".

// // //          Wrapped in $and so it cannot collide with a ref that already uses
// // //          $or in its own `where`. */
// // //       (filter.$and ||= []).push({
// // //         $or: [
// // //           { [label]: rx },
// // //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// // //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// // //         ],
// // //       });
// // //     } else {
// // //       filter[label] = rx;
// // //     }
// // //   }
  
// // //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// // //   if (ref === 'attribute-addon') {
// // //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// // //   }
 
// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = ref === 'supplier'
// // //     ? { createdAt: -1, [label]: 1 }
// // //     : entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };
 
// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// // //   const textOf = (r) => {
// // //     if (ref === 'uom') {
// // //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// // //     }
// // //     const primary = String(r[label] ?? '').trim();
// // //     if (primary) return primary;
// // //     const alt = (entry.nameFallback || [])
// // //       .map((f) => String(r[f] ?? '').trim())
// // //       .filter(Boolean)
// // //       .join(' ');
// // //     return alt || '(untitled)';
// // //   };

// // //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// // //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// // //      what gets stored is the reference and never the formatted text. A
// // //      supplier without a code simply shows its name. */
// // //   const labelOf = (r) => {
// // //     const name = textOf(r);
// // //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// // //     return code ? name + ' (' + code + ')' : name;
// // //   };

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: labelOf(r),
// // //       /* the parts, unformatted, for a caller that needs them on their own */
// // //       name: textOf(r),
// // //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// // //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });
// // // }
 
// // // function escapeRegex(s) {
// // //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // // }




























// // /////suhas






// // // // import { isValidObjectId } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';

// // // // /* /api/options?ref=<name>&business=<id>
// // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // //    old /api/settings/[action] handler.

// // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // //    name to a model file and the field to display. Nothing here renders a page. */

// // // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // // const REFS = {
// // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // //      the main branch the default selection. */
// // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // //   tax:                       { load: () => import('@/models/Tax') },
// // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // //   uom:                       { load: () => import('@/models/Uom') },
// // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // // //   item:                      { load: () => import('@/models/Item') },
// // // //   logistic:                  { load: () => import('@/models/Logistic') },

// // // //   /* Transportation module */
// // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // //   driver:                    { load: () => import('@/models/Driver') },
// // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // //   'delivery-unassigned':     {
// // // //     load: () => import('@/models/Delivery'),
// // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // //   },
// // // // };

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   const ref = sp.get('ref');
// // // //   const entry = REFS[ref];
// // // //   if (!entry) return json({ options: [] });

// // // //   await dbConnect();

// // // //   const mod = await entry.load();
// // // //   const Model = mod.default;
// // // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // // //   const filter = {};
// // // //   if (entry.scoped !== false) {
// // // //     const b = sp.get('business');
// // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // //   }
// // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // //   if (entry.where) Object.assign(filter, entry.where);

// // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // //   const q = (sp.get('q') || '').trim();
// // // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // //   const sort = entry.defaultField
// // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // //     : { [label]: 1 };

// // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // //   return json({
// // // //     options: rows.map((r) => ({
// // // //       value: String(r._id),
// // // //       label: String(r[label] ?? '(untitled)'),
// // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // //     })),
// // // //   });






 
// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// // //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// // //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// // //    them. */
// // // const contactOptionsModel = (kind) => import('@/lib/contacts')
// // //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.
 
// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */
 
// // // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// // //    quick-add, and without a cache directive the browser is free to answer a
// // //    repeat GET from its own memory cache - so a record created seconds ago
// // //    did not appear until the page was reloaded. */
// // // const json = (d, s = 200) => Response.json(d, {
// // //   status: s,
// // //   headers: { 'Cache-Control': 'no-store' },
// // // });
 
// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   /* Staff Management -> Sales Persons. Only Active people are offered:
// // //      retiring someone should take them out of the till's picker without
// // //      deleting the record the past bills point at. codeField appends the
// // //      SP Code for display and makes it searchable, the same way supplier
// // //      does with the G-code. */
// // //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   /* The three contact forms each pick a type of their own kind - the Agent
// // //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// // //      Customer/Supplier/Agent selector on the Contact Type master. */
// // //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// // //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// // //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// // //   /* nameFallback: businessName is blank on a contact entered as a person -
// // //      the Agent form does not even ask for it - so fall back to the personal
// // //      name rather than showing "(untitled)" in every picker. This mirrors what
// // //      lib/refLabels.js resolveRefLabels already does for list columns. */
// // //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// // //      business calls the G-code and uses to identify a vendor on paper. It is
// // //      appended to the label, and searched, so typing either the name or the
// // //      code finds the supplier. Without it the code was invisible in every
// // //      picker and unsearchable, even though lists already showed it.

// // //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// // //      which mixed every company's vendors into one list and then truncated
// // //      that list at 200 - so a company with 819 suppliers could not reach most
// // //      of its own, and could pick another company's. */
// // //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// // //      right whether the kinds share `contact` or each has its own collection. */
// // //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },
 
// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// // //   /* Inter Company Sell */
// // //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// // //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// // //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// // //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// // //   /* challans not yet pulled into an inter company sales invoice */
// // //   'ic-delivery-challan-open': {
// // //     load: () => import('@/models/IcDeliveryChallan'),
// // //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// // //   },

// // //   /* Stock Transfers */
// // //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// // //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// // //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// // //   /* packets not yet consolidated into a stock transfer location */
// // //   'stock-transfer-packet-open': {
// // //     load: () => import('@/models/StockTransferPacket'),
// // //     where: {
// // //       $or: [
// // //         { stockTransferLocationId: null },
// // //         { stockTransferLocationId: { $exists: false } },
// // //       ],
// // //     },
// // //   },
// // // };
 
// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });
 
// // //   await dbConnect();
 
// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);
 
// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) {
// // //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// // //     if (entry.nameFallback || entry.codeField) {
// // //       /* Search the label, the fallback name fields AND the code.

// // //          The fallbacks matter because businessName is empty on a contact
// // //          entered as a person - typing "DIRECT" found nothing for them. The
// // //          code matters because the business identifies a vendor by its G-code
// // //          as often as by its name: typing "G524" must find the same supplier
// // //          as typing "KARNATAKA".

// // //          Wrapped in $and so it cannot collide with a ref that already uses
// // //          $or in its own `where`. */
// // //       (filter.$and ||= []).push({
// // //         $or: [
// // //           { [label]: rx },
// // //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// // //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// // //         ],
// // //       });
// // //     } else {
// // //       filter[label] = rx;
// // //     }
// // //   }
  
// // //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// // //   if (ref === 'attribute-addon') {
// // //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// // //   }
 
// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = ref === 'supplier'
// // //     ? { createdAt: -1, [label]: 1 }
// // //     : entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };
 
// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// // //   const textOf = (r) => {
// // //     if (ref === 'uom') {
// // //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// // //     }
// // //     const primary = String(r[label] ?? '').trim();
// // //     if (primary) return primary;
// // //     const alt = (entry.nameFallback || [])
// // //       .map((f) => String(r[f] ?? '').trim())
// // //       .filter(Boolean)
// // //       .join(' ');
// // //     return alt || '(untitled)';
// // //   };

// // //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// // //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// // //      what gets stored is the reference and never the formatted text. A
// // //      supplier without a code simply shows its name. */
// // //   const labelOf = (r) => {
// // //     const name = textOf(r);
// // //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// // //     return code ? name + ' (' + code + ')' : name;
// // //   };

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: labelOf(r),
// // //       /* the parts, unformatted, for a caller that needs them on their own */
// // //       name: textOf(r),
// // //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// // //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });
// // // }
 
// // // function escapeRegex(s) {
// // //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // // }









// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   /* locationScoped: a stock point belongs to ONE location, so offering the
// //      whole business's list lets an operator standing in the warehouse pick a
// //      stock point that physically sits in another branch location. */
// //   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   /* cityFields: the picker can be narrowed to one city (&city=...) - the
// //      Master Stock Report chooses the city first, then picks among only that
// //      city's vendors. Billing OR shipping city, since either may be the one
// //      the operator knows the vendor by. */
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityFields: ['billingCity', 'shippingCity'] },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup'), includeAll: true },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

// //      Opt-in per ref, not global: most refs are business-wide (and
// //      companylocations must never be filtered by the location it is used to
// //      choose). useOptions already sends `location`; until now nothing read it.

// //      A row with no locationId is a business-wide one and stays visible - some
// //      businesses never assigned stock points to a location, and a strict match
// //      would leave their dropdown empty. */
// //   if (entry.locationScoped) {
// //     const l = sp.get('location');
// //     if (l && isValidObjectId(l)) {
// //       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
// //     }
// //   }
// //   /* a picker narrowed to one CITY - see cityFields on the supplier ref.
// //      Case-insensitive and tolerant of stray spaces, because the city on a
// //      contact was typed by hand. */
// //   if (entry.cityFields) {
// //     const city = (sp.get('city') || '').trim();
// //     if (city) {
// //       const rx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
// //       (filter.$and ||= []).push({ $or: entry.cityFields.map((f) => ({ [f]: rx })) });
// //     }
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rowsQuery = Model.find(filter).sort(sort);
// //   if (!entry.includeAll) rowsQuery.limit(200);
// //   const rows = await rowsQuery.lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //       /* which location the row belongs to ('' = shared by the whole
// //          business), so a form can pick the row bound to the header LOCATION */
// //       ...(entry.locationScoped ? { locationId: r.locationId ? String(r.locationId) : '' } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }








// // // // import { isValidObjectId } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';

// // // // /* /api/options?ref=<name>&business=<id>
// // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // //    old /api/settings/[action] handler.

// // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // //    name to a model file and the field to display. Nothing here renders a page. */

// // // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // // const REFS = {
// // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // //      the main branch the default selection. */
// // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // //   tax:                       { load: () => import('@/models/Tax') },
// // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // //   uom:                       { load: () => import('@/models/Uom') },
// // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // // //   item:                      { load: () => import('@/models/Item') },
// // // //   logistic:                  { load: () => import('@/models/Logistic') },

// // // //   /* Transportation module */
// // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // //   driver:                    { load: () => import('@/models/Driver') },
// // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // //   'delivery-unassigned':     {
// // // //     load: () => import('@/models/Delivery'),
// // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // //   },
// // // // };

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   const ref = sp.get('ref');
// // // //   const entry = REFS[ref];
// // // //   if (!entry) return json({ options: [] });

// // // //   await dbConnect();

// // // //   const mod = await entry.load();
// // // //   const Model = mod.default;
// // // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // // //   const filter = {};
// // // //   if (entry.scoped !== false) {
// // // //     const b = sp.get('business');
// // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // //   }
// // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // //   if (entry.where) Object.assign(filter, entry.where);

// // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // //   const q = (sp.get('q') || '').trim();
// // // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // //   const sort = entry.defaultField
// // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // //     : { [label]: 1 };

// // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // //   return json({
// // // //     options: rows.map((r) => ({
// // // //       value: String(r._id),
// // // //       label: String(r[label] ?? '(untitled)'),
// // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // //     })),
// // // //   });






 
// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// // //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// // //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// // //    them. */
// // // const contactOptionsModel = (kind) => import('@/lib/contacts')
// // //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.
 
// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */
 
// // // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// // //    quick-add, and without a cache directive the browser is free to answer a
// // //    repeat GET from its own memory cache - so a record created seconds ago
// // //    did not appear until the page was reloaded. */
// // // const json = (d, s = 200) => Response.json(d, {
// // //   status: s,
// // //   headers: { 'Cache-Control': 'no-store' },
// // // });
 
// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   /* Staff Management -> Sales Persons. Only Active people are offered:
// // //      retiring someone should take them out of the till's picker without
// // //      deleting the record the past bills point at. codeField appends the
// // //      SP Code for display and makes it searchable, the same way supplier
// // //      does with the G-code. */
// // //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   /* The three contact forms each pick a type of their own kind - the Agent
// // //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// // //      Customer/Supplier/Agent selector on the Contact Type master. */
// // //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// // //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// // //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// // //   /* nameFallback: businessName is blank on a contact entered as a person -
// // //      the Agent form does not even ask for it - so fall back to the personal
// // //      name rather than showing "(untitled)" in every picker. This mirrors what
// // //      lib/refLabels.js resolveRefLabels already does for list columns. */
// // //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// // //      business calls the G-code and uses to identify a vendor on paper. It is
// // //      appended to the label, and searched, so typing either the name or the
// // //      code finds the supplier. Without it the code was invisible in every
// // //      picker and unsearchable, even though lists already showed it.

// // //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// // //      which mixed every company's vendors into one list and then truncated
// // //      that list at 200 - so a company with 819 suppliers could not reach most
// // //      of its own, and could pick another company's. */
// // //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// // //      right whether the kinds share `contact` or each has its own collection. */
// // //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },
 
// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// // //   /* Inter Company Sell */
// // //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// // //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// // //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// // //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// // //   /* challans not yet pulled into an inter company sales invoice */
// // //   'ic-delivery-challan-open': {
// // //     load: () => import('@/models/IcDeliveryChallan'),
// // //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// // //   },

// // //   /* Stock Transfers */
// // //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// // //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// // //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// // //   /* packets not yet consolidated into a stock transfer location */
// // //   'stock-transfer-packet-open': {
// // //     load: () => import('@/models/StockTransferPacket'),
// // //     where: {
// // //       $or: [
// // //         { stockTransferLocationId: null },
// // //         { stockTransferLocationId: { $exists: false } },
// // //       ],
// // //     },
// // //   },
// // // };
 
// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });
 
// // //   await dbConnect();
 
// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);
 
// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) {
// // //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// // //     if (entry.nameFallback || entry.codeField) {
// // //       /* Search the label, the fallback name fields AND the code.

// // //          The fallbacks matter because businessName is empty on a contact
// // //          entered as a person - typing "DIRECT" found nothing for them. The
// // //          code matters because the business identifies a vendor by its G-code
// // //          as often as by its name: typing "G524" must find the same supplier
// // //          as typing "KARNATAKA".

// // //          Wrapped in $and so it cannot collide with a ref that already uses
// // //          $or in its own `where`. */
// // //       (filter.$and ||= []).push({
// // //         $or: [
// // //           { [label]: rx },
// // //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// // //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// // //         ],
// // //       });
// // //     } else {
// // //       filter[label] = rx;
// // //     }
// // //   }
  
// // //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// // //   if (ref === 'attribute-addon') {
// // //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// // //   }
 
// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = ref === 'supplier'
// // //     ? { createdAt: -1, [label]: 1 }
// // //     : entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };
 
// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// // //   const textOf = (r) => {
// // //     if (ref === 'uom') {
// // //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// // //     }
// // //     const primary = String(r[label] ?? '').trim();
// // //     if (primary) return primary;
// // //     const alt = (entry.nameFallback || [])
// // //       .map((f) => String(r[f] ?? '').trim())
// // //       .filter(Boolean)
// // //       .join(' ');
// // //     return alt || '(untitled)';
// // //   };

// // //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// // //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// // //      what gets stored is the reference and never the formatted text. A
// // //      supplier without a code simply shows its name. */
// // //   const labelOf = (r) => {
// // //     const name = textOf(r);
// // //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// // //     return code ? name + ' (' + code + ')' : name;
// // //   };

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: labelOf(r),
// // //       /* the parts, unformatted, for a caller that needs them on their own */
// // //       name: textOf(r),
// // //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// // //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });
// // // }
 
// // // function escapeRegex(s) {
// // //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // // }









// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   /* locationScoped: a stock point belongs to ONE location, so offering the
// //      whole business's list lets an operator standing in the warehouse pick a
// //      stock point that physically sits in another branch location. */
// //   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

// //      Opt-in per ref, not global: most refs are business-wide (and
// //      companylocations must never be filtered by the location it is used to
// //      choose). useOptions already sends `location`; until now nothing read it.

// //      A row with no locationId is a business-wide one and stays visible - some
// //      businesses never assigned stock points to a location, and a strict match
// //      would leave their dropdown empty. */
// //   if (entry.locationScoped) {
// //     const l = sp.get('location');
// //     if (l && isValidObjectId(l)) {
// //       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
// //     }
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }




























// /////suhas






// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// //    them. */
// // const contactOptionsModel = (kind) => import('@/lib/contacts')
// //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// //      right whether the kinds share `contact` or each has its own collection. */
// //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }









// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.

// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */

// // const json = (d, s = 200) => Response.json(d, { status: s });

// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },

// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// // };

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });

// //   await dbConnect();

// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';

// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);

// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };

// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: String(r[label] ?? '(untitled)'),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });






 
// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
 
// /* /api/options?ref=<name>&business=<id>
//    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
//    old /api/settings/[action] handler.
 
//    This is a model index, not a page registry - it maps a dropdown's target
//    name to a model file and the field to display. Nothing here renders a page. */
 
// /* no-store, explicitly. Dropdown lists change the moment somebody uses a
//    quick-add, and without a cache directive the browser is free to answer a
//    repeat GET from its own memory cache - so a record created seconds ago
//    did not appear until the page was reloaded. */
// const json = (d, s = 200) => Response.json(d, {
//   status: s,
//   headers: { 'Cache-Control': 'no-store' },
// });
 
// const REFS = {
//   /* defaultField: rows where this field is truthy sort first and come back
//      flagged `isDefault`, so a picker can preselect one instead of falling back
//      to whatever happens to be first alphabetically. Business uses it to make
//      the main branch the default selection. */
//   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
//   companylocations:          { load: () => import('@/models/CompanyLocation') },
//   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
//   ledger:                    { load: () => import('@/models/Ledger') },
//   docsetup:                  { load: () => import('@/models/DocSetup') },
//   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
//   /* locationScoped: a stock point belongs to ONE location, so offering the
//      whole business's list lets an operator standing in the warehouse pick a
//      stock point that physically sits in another branch location. */
//   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
//   poscounter:                { load: () => import('@/models/PosCounter') },
//   /* Staff Management -> Sales Persons. Only Active people are offered:
//      retiring someone should take them out of the till's picker without
//      deleting the record the past bills point at. codeField appends the
//      SP Code for display and makes it searchable, the same way supplier
//      does with the G-code. */
//   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
//   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
//   tax:                       { load: () => import('@/models/Tax') },
//   hsn:                       { load: () => import('@/models/Hsn') },
//   citygroup:                 { load: () => import('@/models/CityGroup') },
//   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
//   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
//   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
//   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
//   'contact-type':            { load: () => import('@/models/ContactType') },
//   /* The three contact forms each pick a type of their own kind - the Agent
//      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
//      Customer/Supplier/Agent selector on the Contact Type master. */
//   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
//   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
//   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
//   /* nameFallback: businessName is blank on a contact entered as a person -
//      the Agent form does not even ask for it - so fall back to the personal
//      name rather than showing "(untitled)" in every picker. This mirrors what
//      lib/refLabels.js resolveRefLabels already does for list columns. */
//   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
//      business calls the G-code and uses to identify a vendor on paper. It is
//      appended to the label, and searched, so typing either the name or the
//      code finds the supplier. Without it the code was invisible in every
//      picker and unsearchable, even though lists already showed it.

//      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
//      which mixed every company's vendors into one list and then truncated
//      that list at 200 - so a company with 819 suppliers could not reach most
//      of its own, and could pick another company's. */
//   /* cityFields: the picker can be narrowed to one city (&city=...) - the
//      Master Stock Report chooses the city first, then picks among only that
//      city's vendors. Billing OR shipping city, since either may be the one
//      the operator knows the vendor by. */
//   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityFields: ['billingCity', 'shippingCity'] },
//   agent:                     { load: () => import('@/lib/contacts').then((m) => ({ default: m.Agent })), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityViaSupplier: true },
//   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
//   'product/filter':          { load: () => import('@/models/ProductFilter') },
//   'product/group':           { load: () => import('@/models/ProductGroup'), includeAll: true },
//   uom:                       { load: () => import('@/models/Uom') },
//   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
//   item:                      { load: () => import('@/models/Item'), parentField: 'subGroupId', parentParam: 'groupId' },
//   logistic:                  { load: () => import('@/models/Logistic') },
 
//   /* Transportation module */
//   transporter:               { load: () => import('@/models/Transporter') },
//   vehicle:                   { load: () => import('@/models/Vehicle') },
//   driver:                    { load: () => import('@/models/Driver') },
//   'transport-route':         { load: () => import('@/models/TransportRoute') },
//   dispatch:                  { load: () => import('@/models/Dispatch') },
//   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
//   'delivery-unassigned':     {
//     load: () => import('@/models/Delivery'),
//     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
//   },
//   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
//   /* Inter Company Sell */
//   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
//   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
//   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
//   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
//   /* challans not yet pulled into an inter company sales invoice */
//   'ic-delivery-challan-open': {
//     load: () => import('@/models/IcDeliveryChallan'),
//     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
//   },

//   /* Stock Transfers */
//   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
//   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
//   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
//   /* packets not yet consolidated into a stock transfer location */
//   'stock-transfer-packet-open': {
//     load: () => import('@/models/StockTransferPacket'),
//     where: {
//       $or: [
//         { stockTransferLocationId: null },
//         { stockTransferLocationId: { $exists: false } },
//       ],
//     },
//   },
// };
 
// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
 
//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });
 
//   await dbConnect();
 
//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';
 
//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

//      Opt-in per ref, not global: most refs are business-wide (and
//      companylocations must never be filtered by the location it is used to
//      choose). useOptions already sends `location`; until now nothing read it.

//      A row with no locationId is a business-wide one and stays visible - some
//      businesses never assigned stock points to a location, and a strict match
//      would leave their dropdown empty. */
//   if (entry.locationScoped) {
//     const l = sp.get('location');
//     if (l && isValidObjectId(l)) {
//       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
//     }
//   }
//   if (entry.parentField && entry.parentParam) {
//     const parentId = sp.get(entry.parentParam);
//     if (parentId) {
//       if (!isValidObjectId(parentId)) return json({ error: 'Invalid parent selection' }, 400);
//       filter[entry.parentField] = parentId;
//     }
//   }
//   /* a picker narrowed to one CITY - see cityFields on the supplier ref.
//      Case-insensitive and tolerant of stray spaces, because the city on a
//      contact was typed by hand. */
//   if (entry.cityFields) {
//     const city = (sp.get('city') || '').trim();
//     if (city) {
//       const rx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
//       (filter.$and ||= []).push({ $or: entry.cityFields.map((f) => ({ [f]: rx })) });
//     }
//   }
//   /* An agent is related to a city through the suppliers assigned to that
//      agent, not through the agent's own address fields. */
//   if (entry.cityViaSupplier) {
//     const city = (sp.get('city') || '').trim();
//     if (city) {
//       const { Supplier } = await import('@/lib/contacts');
//       const supplierFilter = {
//         contactKind: 'Supplier',
//         $or: ['billingCity', 'shippingCity'].map((field) => ({
//           [field]: { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' },
//         })),
//       };
//       if (filter.businessId) supplierFilter.businessId = filter.businessId;
//       const suppliers = await Supplier.find(supplierFilter).select('agentId').lean();
//       filter._id = { $in: [...new Set(suppliers.map((supplier) => supplier.agentId).filter(Boolean).map(String))] };
//     }
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);
 
//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) {
//     const rx = { $regex: escapeRegex(q), $options: 'i' };
//     if (entry.nameFallback || entry.codeField) {
//       /* Search the label, the fallback name fields AND the code.

//          The fallbacks matter because businessName is empty on a contact
//          entered as a person - typing "DIRECT" found nothing for them. The
//          code matters because the business identifies a vendor by its G-code
//          as often as by its name: typing "G524" must find the same supplier
//          as typing "KARNATAKA".

//          Wrapped in $and so it cannot collide with a ref that already uses
//          $or in its own `where`. */
//       (filter.$and ||= []).push({
//         $or: [
//           { [label]: rx },
//           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
//           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
//         ],
//       });
//     } else {
//       filter[label] = rx;
//     }
//   }
  
//   /* Ensure SUPPLIER DESCRIPTION is always excluded */
//   if (ref === 'attribute-addon') {
//     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
//   }
 
//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = ref === 'supplier'
//     ? { createdAt: -1, [label]: 1 }
//     : entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };
 
//   const rowsQuery = Model.find(filter).sort(sort);
//   if (!entry.includeAll) rowsQuery.limit(200);
//   const rows = await rowsQuery.lean();

//   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
//   const textOf = (r) => {
//     if (ref === 'uom') {
//       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
//     }
//     const primary = String(r[label] ?? '').trim();
//     if (primary) return primary;
//     const alt = (entry.nameFallback || [])
//       .map((f) => String(r[f] ?? '').trim())
//       .filter(Boolean)
//       .join(' ');
//     return alt || '(untitled)';
//   };

//   /* "KARNATAKA Saree Centre, MYSORE (G524)".

//      The code is appended for DISPLAY only - `value` stays the ObjectId, so
//      what gets stored is the reference and never the formatted text. A
//      supplier without a code simply shows its name. */
//   const labelOf = (r) => {
//     const name = textOf(r);
//     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
//     return code ? name + ' (' + code + ')' : name;
//   };

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: labelOf(r),
//       /* the parts, unformatted, for a caller that needs them on their own */
//       name: textOf(r),
//       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
//       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//       /* which location the row belongs to ('' = shared by the whole
//          business), so a form can pick the row bound to the header LOCATION */
//       ...(entry.locationScoped ? { locationId: r.locationId ? String(r.locationId) : '' } : {}),
//     })),
//   });
// }
 
// function escapeRegex(s) {
//   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }































///////////////////8/10/26






// // // // import { isValidObjectId } from 'mongoose';
// // // // import dbConnect from '@/lib/db';
// // // // import { requireSession } from '@/lib/session';

// // // // /* /api/options?ref=<name>&business=<id>
// // // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // // //    old /api/settings/[action] handler.

// // // //    This is a model index, not a page registry - it maps a dropdown's target
// // // //    name to a model file and the field to display. Nothing here renders a page. */

// // // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // // const REFS = {
// // // //   /* defaultField: rows where this field is truthy sort first and come back
// // // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // // //      to whatever happens to be first alphabetically. Business uses it to make
// // // //      the main branch the default selection. */
// // // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // // //   ledger:                    { load: () => import('@/models/Ledger') },
// // // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // // //   tax:                       { load: () => import('@/models/Tax') },
// // // //   hsn:                       { load: () => import('@/models/Hsn') },
// // // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // // //   uom:                       { load: () => import('@/models/Uom') },
// // // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // // //   item:                      { load: () => import('@/models/Item') },
// // // //   logistic:                  { load: () => import('@/models/Logistic') },

// // // //   /* Transportation module */
// // // //   transporter:               { load: () => import('@/models/Transporter') },
// // // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // // //   driver:                    { load: () => import('@/models/Driver') },
// // // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // // //   'delivery-unassigned':     {
// // // //     load: () => import('@/models/Delivery'),
// // // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // // //   },
// // // // };

// // // // export async function GET(req) {
// // // //   const session = await requireSession();
// // // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // // //   const sp = new URL(req.url).searchParams;
// // // //   const ref = sp.get('ref');
// // // //   const entry = REFS[ref];
// // // //   if (!entry) return json({ options: [] });

// // // //   await dbConnect();

// // // //   const mod = await entry.load();
// // // //   const Model = mod.default;
// // // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // // //   const filter = {};
// // // //   if (entry.scoped !== false) {
// // // //     const b = sp.get('business');
// // // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // // //   }
// // // //   if (entry.kind) filter.contactKind = entry.kind;
// // // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // // //   if (entry.where) Object.assign(filter, entry.where);

// // // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // // //   const q = (sp.get('q') || '').trim();
// // // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // // //   /* the default row sorts first, so it survives the 200-row cap */
// // // //   const sort = entry.defaultField
// // // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // // //     : { [label]: 1 };

// // // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // // //   return json({
// // // //     options: rows.map((r) => ({
// // // //       value: String(r._id),
// // // //       label: String(r[label] ?? '(untitled)'),
// // // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // // //     })),
// // // //   });






 
// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// // //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// // //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// // //    them. */
// // // const contactOptionsModel = (kind) => import('@/lib/contacts')
// // //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.
 
// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */
 
// // // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// // //    quick-add, and without a cache directive the browser is free to answer a
// // //    repeat GET from its own memory cache - so a record created seconds ago
// // //    did not appear until the page was reloaded. */
// // // const json = (d, s = 200) => Response.json(d, {
// // //   status: s,
// // //   headers: { 'Cache-Control': 'no-store' },
// // // });
 
// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   /* Staff Management -> Sales Persons. Only Active people are offered:
// // //      retiring someone should take them out of the till's picker without
// // //      deleting the record the past bills point at. codeField appends the
// // //      SP Code for display and makes it searchable, the same way supplier
// // //      does with the G-code. */
// // //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   /* The three contact forms each pick a type of their own kind - the Agent
// // //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// // //      Customer/Supplier/Agent selector on the Contact Type master. */
// // //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// // //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// // //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// // //   /* nameFallback: businessName is blank on a contact entered as a person -
// // //      the Agent form does not even ask for it - so fall back to the personal
// // //      name rather than showing "(untitled)" in every picker. This mirrors what
// // //      lib/refLabels.js resolveRefLabels already does for list columns. */
// // //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// // //      business calls the G-code and uses to identify a vendor on paper. It is
// // //      appended to the label, and searched, so typing either the name or the
// // //      code finds the supplier. Without it the code was invisible in every
// // //      picker and unsearchable, even though lists already showed it.

// // //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// // //      which mixed every company's vendors into one list and then truncated
// // //      that list at 200 - so a company with 819 suppliers could not reach most
// // //      of its own, and could pick another company's. */
// // //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// // //      right whether the kinds share `contact` or each has its own collection. */
// // //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// // //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },
 
// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// // //   /* Inter Company Sell */
// // //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// // //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// // //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// // //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// // //   /* challans not yet pulled into an inter company sales invoice */
// // //   'ic-delivery-challan-open': {
// // //     load: () => import('@/models/IcDeliveryChallan'),
// // //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// // //   },

// // //   /* Stock Transfers */
// // //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// // //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// // //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// // //   /* packets not yet consolidated into a stock transfer location */
// // //   'stock-transfer-packet-open': {
// // //     load: () => import('@/models/StockTransferPacket'),
// // //     where: {
// // //       $or: [
// // //         { stockTransferLocationId: null },
// // //         { stockTransferLocationId: { $exists: false } },
// // //       ],
// // //     },
// // //   },
// // // };
 
// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });
 
// // //   await dbConnect();
 
// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);
 
// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) {
// // //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// // //     if (entry.nameFallback || entry.codeField) {
// // //       /* Search the label, the fallback name fields AND the code.

// // //          The fallbacks matter because businessName is empty on a contact
// // //          entered as a person - typing "DIRECT" found nothing for them. The
// // //          code matters because the business identifies a vendor by its G-code
// // //          as often as by its name: typing "G524" must find the same supplier
// // //          as typing "KARNATAKA".

// // //          Wrapped in $and so it cannot collide with a ref that already uses
// // //          $or in its own `where`. */
// // //       (filter.$and ||= []).push({
// // //         $or: [
// // //           { [label]: rx },
// // //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// // //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// // //         ],
// // //       });
// // //     } else {
// // //       filter[label] = rx;
// // //     }
// // //   }
  
// // //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// // //   if (ref === 'attribute-addon') {
// // //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// // //   }
 
// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = ref === 'supplier'
// // //     ? { createdAt: -1, [label]: 1 }
// // //     : entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };
 
// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// // //   const textOf = (r) => {
// // //     if (ref === 'uom') {
// // //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// // //     }
// // //     const primary = String(r[label] ?? '').trim();
// // //     if (primary) return primary;
// // //     const alt = (entry.nameFallback || [])
// // //       .map((f) => String(r[f] ?? '').trim())
// // //       .filter(Boolean)
// // //       .join(' ');
// // //     return alt || '(untitled)';
// // //   };

// // //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// // //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// // //      what gets stored is the reference and never the formatted text. A
// // //      supplier without a code simply shows its name. */
// // //   const labelOf = (r) => {
// // //     const name = textOf(r);
// // //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// // //     return code ? name + ' (' + code + ')' : name;
// // //   };

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: labelOf(r),
// // //       /* the parts, unformatted, for a caller that needs them on their own */
// // //       name: textOf(r),
// // //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// // //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });
// // // }
 
// // // function escapeRegex(s) {
// // //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // // }









// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   /* locationScoped: a stock point belongs to ONE location, so offering the
// //      whole business's list lets an operator standing in the warehouse pick a
// //      stock point that physically sits in another branch location. */
// //   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

// //      Opt-in per ref, not global: most refs are business-wide (and
// //      companylocations must never be filtered by the location it is used to
// //      choose). useOptions already sends `location`; until now nothing read it.

// //      A row with no locationId is a business-wide one and stays visible - some
// //      businesses never assigned stock points to a location, and a strict match
// //      would leave their dropdown empty. */
// //   if (entry.locationScoped) {
// //     const l = sp.get('location');
// //     if (l && isValidObjectId(l)) {
// //       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
// //     }
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }




























// /////suhas






// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// //    them. */
// // const contactOptionsModel = (kind) => import('@/lib/contacts')
// //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// //      right whether the kinds share `contact` or each has its own collection. */
// //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }









// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.

// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */

// // const json = (d, s = 200) => Response.json(d, { status: s });

// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },

// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// // };

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });

// //   await dbConnect();

// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';

// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);

// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };

// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: String(r[label] ?? '(untitled)'),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });






 
// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
 
// /* /api/options?ref=<name>&business=<id>
//    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
//    old /api/settings/[action] handler.
 
//    This is a model index, not a page registry - it maps a dropdown's target
//    name to a model file and the field to display. Nothing here renders a page. */
 
// /* no-store, explicitly. Dropdown lists change the moment somebody uses a
//    quick-add, and without a cache directive the browser is free to answer a
//    repeat GET from its own memory cache - so a record created seconds ago
//    did not appear until the page was reloaded. */
// const json = (d, s = 200) => Response.json(d, {
//   status: s,
//   headers: { 'Cache-Control': 'no-store' },
// });
 
// const REFS = {
//   /* defaultField: rows where this field is truthy sort first and come back
//      flagged `isDefault`, so a picker can preselect one instead of falling back
//      to whatever happens to be first alphabetically. Business uses it to make
//      the main branch the default selection. */
//   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
//   companylocations:          { load: () => import('@/models/CompanyLocation') },
//   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
//   ledger:                    { load: () => import('@/models/Ledger') },
//   docsetup:                  { load: () => import('@/models/DocSetup') },
//   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
//   /* locationScoped: a stock point belongs to ONE location, so offering the
//      whole business's list lets an operator standing in the warehouse pick a
//      stock point that physically sits in another branch location. */
//   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
//   poscounter:                { load: () => import('@/models/PosCounter') },
//   /* Staff Management -> Sales Persons. Only Active people are offered:
//      retiring someone should take them out of the till's picker without
//      deleting the record the past bills point at. codeField appends the
//      SP Code for display and makes it searchable, the same way supplier
//      does with the G-code. */
//   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
//   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
//   tax:                       { load: () => import('@/models/Tax') },
//   hsn:                       { load: () => import('@/models/Hsn') },
//   citygroup:                 { load: () => import('@/models/CityGroup') },
//   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
//   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
//   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
//   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
//   'contact-type':            { load: () => import('@/models/ContactType') },
//   /* The three contact forms each pick a type of their own kind - the Agent
//      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
//      Customer/Supplier/Agent selector on the Contact Type master. */
//   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
//   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
//   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
//   /* nameFallback: businessName is blank on a contact entered as a person -
//      the Agent form does not even ask for it - so fall back to the personal
//      name rather than showing "(untitled)" in every picker. This mirrors what
//      lib/refLabels.js resolveRefLabels already does for list columns. */
//   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
//      business calls the G-code and uses to identify a vendor on paper. It is
//      appended to the label, and searched, so typing either the name or the
//      code finds the supplier. Without it the code was invisible in every
//      picker and unsearchable, even though lists already showed it.

//      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
//      which mixed every company's vendors into one list and then truncated
//      that list at 200 - so a company with 819 suppliers could not reach most
//      of its own, and could pick another company's. */
//   /* cityFields: the picker can be narrowed to one city (&city=...) - the
//      Master Stock Report chooses the city first, then picks among only that
//      city's vendors. Billing OR shipping city, since either may be the one
//      the operator knows the vendor by. */
//   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityFields: ['billingCity', 'shippingCity'] },
//   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
//   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
//   'product/filter':          { load: () => import('@/models/ProductFilter') },
//   'product/group':           { load: () => import('@/models/ProductGroup'), includeAll: true },
//   uom:                       { load: () => import('@/models/Uom') },
//   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
//   item:                      { load: () => import('@/models/Item') },
//   logistic:                  { load: () => import('@/models/Logistic') },
 
//   /* Transportation module */
//   transporter:               { load: () => import('@/models/Transporter') },
//   vehicle:                   { load: () => import('@/models/Vehicle') },
//   driver:                    { load: () => import('@/models/Driver') },
//   'transport-route':         { load: () => import('@/models/TransportRoute') },
//   dispatch:                  { load: () => import('@/models/Dispatch') },
//   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
//   'delivery-unassigned':     {
//     load: () => import('@/models/Delivery'),
//     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
//   },
//   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
//   /* Inter Company Sell */
//   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
//   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
//   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
//   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
//   /* challans not yet pulled into an inter company sales invoice */
//   'ic-delivery-challan-open': {
//     load: () => import('@/models/IcDeliveryChallan'),
//     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
//   },

//   /* Stock Transfers */
//   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
//   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
//   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
//   /* packets not yet consolidated into a stock transfer location */
//   'stock-transfer-packet-open': {
//     load: () => import('@/models/StockTransferPacket'),
//     where: {
//       $or: [
//         { stockTransferLocationId: null },
//         { stockTransferLocationId: { $exists: false } },
//       ],
//     },
//   },
// };
 
// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
 
//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });
 
//   await dbConnect();
 
//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';
 
//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

//      Opt-in per ref, not global: most refs are business-wide (and
//      companylocations must never be filtered by the location it is used to
//      choose). useOptions already sends `location`; until now nothing read it.

//      A row with no locationId is a business-wide one and stays visible - some
//      businesses never assigned stock points to a location, and a strict match
//      would leave their dropdown empty. */
//   if (entry.locationScoped) {
//     const l = sp.get('location');
//     if (l && isValidObjectId(l)) {
//       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
//     }
//   }
//   /* a picker narrowed to one CITY - see cityFields on the supplier ref.
//      Case-insensitive and tolerant of stray spaces, because the city on a
//      contact was typed by hand. */
//   if (entry.cityFields) {
//     const city = (sp.get('city') || '').trim();
//     if (city) {
//       const rx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
//       (filter.$and ||= []).push({ $or: entry.cityFields.map((f) => ({ [f]: rx })) });
//     }
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);
 
//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) {
//     const rx = { $regex: escapeRegex(q), $options: 'i' };
//     if (entry.nameFallback || entry.codeField) {
//       /* Search the label, the fallback name fields AND the code.

//          The fallbacks matter because businessName is empty on a contact
//          entered as a person - typing "DIRECT" found nothing for them. The
//          code matters because the business identifies a vendor by its G-code
//          as often as by its name: typing "G524" must find the same supplier
//          as typing "KARNATAKA".

//          Wrapped in $and so it cannot collide with a ref that already uses
//          $or in its own `where`. */
//       (filter.$and ||= []).push({
//         $or: [
//           { [label]: rx },
//           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
//           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
//         ],
//       });
//     } else {
//       filter[label] = rx;
//     }
//   }
  
//   /* Ensure SUPPLIER DESCRIPTION is always excluded */
//   if (ref === 'attribute-addon') {
//     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
//   }
 
//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = ref === 'supplier'
//     ? { createdAt: -1, [label]: 1 }
//     : entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };
 
//   const rowsQuery = Model.find(filter).sort(sort);
//   if (!entry.includeAll) rowsQuery.limit(200);
//   const rows = await rowsQuery.lean();

//   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
//   const textOf = (r) => {
//     if (ref === 'uom') {
//       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
//     }
//     const primary = String(r[label] ?? '').trim();
//     if (primary) return primary;
//     const alt = (entry.nameFallback || [])
//       .map((f) => String(r[f] ?? '').trim())
//       .filter(Boolean)
//       .join(' ');
//     return alt || '(untitled)';
//   };

//   /* "KARNATAKA Saree Centre, MYSORE (G524)".

//      The code is appended for DISPLAY only - `value` stays the ObjectId, so
//      what gets stored is the reference and never the formatted text. A
//      supplier without a code simply shows its name. */
//   const labelOf = (r) => {
//     const name = textOf(r);
//     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
//     return code ? name + ' (' + code + ')' : name;
//   };

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: labelOf(r),
//       /* the parts, unformatted, for a caller that needs them on their own */
//       name: textOf(r),
//       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
//       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//       /* which location the row belongs to ('' = shared by the whole
//          business), so a form can pick the row bound to the header LOCATION */
//       ...(entry.locationScoped ? { locationId: r.locationId ? String(r.locationId) : '' } : {}),
//     })),
//   });
// }
 
// function escapeRegex(s) {
//   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }








// // // import { isValidObjectId } from 'mongoose';
// // // import dbConnect from '@/lib/db';
// // // import { requireSession } from '@/lib/session';

// // // /* /api/options?ref=<name>&business=<id>
// // //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// // //    old /api/settings/[action] handler.

// // //    This is a model index, not a page registry - it maps a dropdown's target
// // //    name to a model file and the field to display. Nothing here renders a page. */

// // // const json = (d, s = 200) => Response.json(d, { status: s });

// // // const REFS = {
// // //   /* defaultField: rows where this field is truthy sort first and come back
// // //      flagged `isDefault`, so a picker can preselect one instead of falling back
// // //      to whatever happens to be first alphabetically. Business uses it to make
// // //      the main branch the default selection. */
// // //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// // //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// // //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// // //   ledger:                    { load: () => import('@/models/Ledger') },
// // //   docsetup:                  { load: () => import('@/models/DocSetup') },
// // //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// // //   stockpoint:                { load: () => import('@/models/StockPoint') },
// // //   poscounter:                { load: () => import('@/models/PosCounter') },
// // //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// // //   tax:                       { load: () => import('@/models/Tax') },
// // //   hsn:                       { load: () => import('@/models/Hsn') },
// // //   citygroup:                 { load: () => import('@/models/CityGroup') },
// // //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// // //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// // //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// // //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// // //   'contact-type':            { load: () => import('@/models/ContactType') },
// // //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// // //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// // //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// // //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// // //   'product/group':           { load: () => import('@/models/ProductGroup') },
// // //   uom:                       { load: () => import('@/models/Uom') },
// // //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// // //   item:                      { load: () => import('@/models/Item') },
// // //   logistic:                  { load: () => import('@/models/Logistic') },

// // //   /* Transportation module */
// // //   transporter:               { load: () => import('@/models/Transporter') },
// // //   vehicle:                   { load: () => import('@/models/Vehicle') },
// // //   driver:                    { load: () => import('@/models/Driver') },
// // //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// // //   dispatch:                  { load: () => import('@/models/Dispatch') },
// // //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// // //   'delivery-unassigned':     {
// // //     load: () => import('@/models/Delivery'),
// // //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// // //   },
// // // };

// // // export async function GET(req) {
// // //   const session = await requireSession();
// // //   if (!session) return json({ error: 'Unauthorized' }, 401);

// // //   const sp = new URL(req.url).searchParams;
// // //   const ref = sp.get('ref');
// // //   const entry = REFS[ref];
// // //   if (!entry) return json({ options: [] });

// // //   await dbConnect();

// // //   const mod = await entry.load();
// // //   const Model = mod.default;
// // //   const label = entry.label || mod.LABEL_FIELD || 'name';

// // //   const filter = {};
// // //   if (entry.scoped !== false) {
// // //     const b = sp.get('business');
// // //     if (b && isValidObjectId(b)) filter.businessId = b;
// // //   }
// // //   if (entry.kind) filter.contactKind = entry.kind;
// // //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// // //   if (entry.where) Object.assign(filter, entry.where);

// // //   /* typing in the control narrows server-side - the old endpoint pulled up to
// // //      2000 rows and filtered in the browser, which does not survive 56k customers */
// // //   const q = (sp.get('q') || '').trim();
// // //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// // //   /* the default row sorts first, so it survives the 200-row cap */
// // //   const sort = entry.defaultField
// // //     ? { [entry.defaultField]: -1, [label]: 1 }
// // //     : { [label]: 1 };

// // //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// // //   return json({
// // //     options: rows.map((r) => ({
// // //       value: String(r._id),
// // //       label: String(r[label] ?? '(untitled)'),
// // //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// // //     })),
// // //   });






 
// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* A contact kind's model, in the { default } shape REFS' loaders return - from
// //    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
// //    customers and the agent picker agents, wherever lib/contactStorage.js keeps
// //    them. */
// // const contactOptionsModel = (kind) => import('@/lib/contacts')
// //   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.
 
// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */
 
// // /* no-store, explicitly. Dropdown lists change the moment somebody uses a
// //    quick-add, and without a cache directive the browser is free to answer a
// //    repeat GET from its own memory cache - so a record created seconds ago
// //    did not appear until the page was reloaded. */
// // const json = (d, s = 200) => Response.json(d, {
// //   status: s,
// //   headers: { 'Cache-Control': 'no-store' },
// // });
 
// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   /* Staff Management -> Sales Persons. Only Active people are offered:
// //      retiring someone should take them out of the till's picker without
// //      deleting the record the past bills point at. codeField appends the
// //      SP Code for display and makes it searchable, the same way supplier
// //      does with the G-code. */
// //   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   /* The three contact forms each pick a type of their own kind - the Agent
// //      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
// //      Customer/Supplier/Agent selector on the Contact Type master. */
// //   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
// //   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
// //   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
// //   /* nameFallback: businessName is blank on a contact entered as a person -
// //      the Agent form does not even ask for it - so fall back to the personal
// //      name rather than showing "(untitled)" in every picker. This mirrors what
// //      lib/refLabels.js resolveRefLabels already does for list columns. */
// //   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
// //      business calls the G-code and uses to identify a vendor on paper. It is
// //      appended to the label, and searched, so typing either the name or the
// //      code finds the supplier. Without it the code was invisible in every
// //      picker and unsearchable, even though lists already showed it.

// //      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
// //      which mixed every company's vendors into one list and then truncated
// //      that list at 200 - so a company with 819 suppliers could not reach most
// //      of its own, and could pick another company's. */
// //   /* load: the kind's own model. `kind` still filters on contactKind, which is
// //      right whether the kinds share `contact` or each has its own collection. */
// //   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
// //   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },
 
// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// //   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
// //   /* Inter Company Sell */
// //   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
// //   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
// //   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
// //   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
// //   /* challans not yet pulled into an inter company sales invoice */
// //   'ic-delivery-challan-open': {
// //     load: () => import('@/models/IcDeliveryChallan'),
// //     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
// //   },

// //   /* Stock Transfers */
// //   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
// //   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
// //   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
// //   /* packets not yet consolidated into a stock transfer location */
// //   'stock-transfer-packet-open': {
// //     load: () => import('@/models/StockTransferPacket'),
// //     where: {
// //       $or: [
// //         { stockTransferLocationId: null },
// //         { stockTransferLocationId: { $exists: false } },
// //       ],
// //     },
// //   },
// // };
 
// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);
 
// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });
 
// //   await dbConnect();
 
// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';
 
// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);
 
// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) {
// //     const rx = { $regex: escapeRegex(q), $options: 'i' };
// //     if (entry.nameFallback || entry.codeField) {
// //       /* Search the label, the fallback name fields AND the code.

// //          The fallbacks matter because businessName is empty on a contact
// //          entered as a person - typing "DIRECT" found nothing for them. The
// //          code matters because the business identifies a vendor by its G-code
// //          as often as by its name: typing "G524" must find the same supplier
// //          as typing "KARNATAKA".

// //          Wrapped in $and so it cannot collide with a ref that already uses
// //          $or in its own `where`. */
// //       (filter.$and ||= []).push({
// //         $or: [
// //           { [label]: rx },
// //           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
// //           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
// //         ],
// //       });
// //     } else {
// //       filter[label] = rx;
// //     }
// //   }
  
// //   /* Ensure SUPPLIER DESCRIPTION is always excluded */
// //   if (ref === 'attribute-addon') {
// //     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
// //   }
 
// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = ref === 'supplier'
// //     ? { createdAt: -1, [label]: 1 }
// //     : entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };
 
// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
// //   const textOf = (r) => {
// //     if (ref === 'uom') {
// //       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
// //     }
// //     const primary = String(r[label] ?? '').trim();
// //     if (primary) return primary;
// //     const alt = (entry.nameFallback || [])
// //       .map((f) => String(r[f] ?? '').trim())
// //       .filter(Boolean)
// //       .join(' ');
// //     return alt || '(untitled)';
// //   };

// //   /* "KARNATAKA Saree Centre, MYSORE (G524)".

// //      The code is appended for DISPLAY only - `value` stays the ObjectId, so
// //      what gets stored is the reference and never the formatted text. A
// //      supplier without a code simply shows its name. */
// //   const labelOf = (r) => {
// //     const name = textOf(r);
// //     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
// //     return code ? name + ' (' + code + ')' : name;
// //   };

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: labelOf(r),
// //       /* the parts, unformatted, for a caller that needs them on their own */
// //       name: textOf(r),
// //       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
// //       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });
// // }
 
// // function escapeRegex(s) {
// //   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// // }









// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.

// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */

// // const json = (d, s = 200) => Response.json(d, { status: s });

// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },

// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// // };

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });

// //   await dbConnect();

// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';

// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);

// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };

// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: String(r[label] ?? '(untitled)'),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });






 
// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';
 
// /* /api/options?ref=<name>&business=<id>
//    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
//    old /api/settings/[action] handler.
 
//    This is a model index, not a page registry - it maps a dropdown's target
//    name to a model file and the field to display. Nothing here renders a page. */
 
// /* no-store, explicitly. Dropdown lists change the moment somebody uses a
//    quick-add, and without a cache directive the browser is free to answer a
//    repeat GET from its own memory cache - so a record created seconds ago
//    did not appear until the page was reloaded. */
// const json = (d, s = 200) => Response.json(d, {
//   status: s,
//   headers: { 'Cache-Control': 'no-store' },
// });
 
// const REFS = {
//   /* defaultField: rows where this field is truthy sort first and come back
//      flagged `isDefault`, so a picker can preselect one instead of falling back
//      to whatever happens to be first alphabetically. Business uses it to make
//      the main branch the default selection. */
//   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
//   companylocations:          { load: () => import('@/models/CompanyLocation') },
//   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
//   ledger:                    { load: () => import('@/models/Ledger') },
//   docsetup:                  { load: () => import('@/models/DocSetup') },
//   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
//   /* locationScoped: a stock point belongs to ONE location, so offering the
//      whole business's list lets an operator standing in the warehouse pick a
//      stock point that physically sits in another branch location. */
//   stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
//   poscounter:                { load: () => import('@/models/PosCounter') },
//   /* Staff Management -> Sales Persons. Only Active people are offered:
//      retiring someone should take them out of the till's picker without
//      deleting the record the past bills point at. codeField appends the
//      SP Code for display and makes it searchable, the same way supplier
//      does with the G-code. */
//   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
//   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
//   tax:                       { load: () => import('@/models/Tax') },
//   hsn:                       { load: () => import('@/models/Hsn') },
//   citygroup:                 { load: () => import('@/models/CityGroup') },
//   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
//   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
//   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
//   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
//   'contact-type':            { load: () => import('@/models/ContactType') },
//   /* The three contact forms each pick a type of their own kind - the Agent
//      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
//      Customer/Supplier/Agent selector on the Contact Type master. */
//   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
//   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
//   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
//   /* nameFallback: businessName is blank on a contact entered as a person -
//      the Agent form does not even ask for it - so fall back to the personal
//      name rather than showing "(untitled)" in every picker. This mirrors what
//      lib/refLabels.js resolveRefLabels already does for list columns. */
//   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
//      business calls the G-code and uses to identify a vendor on paper. It is
//      appended to the label, and searched, so typing either the name or the
//      code finds the supplier. Without it the code was invisible in every
//      picker and unsearchable, even though lists already showed it.

//      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
//      which mixed every company's vendors into one list and then truncated
//      that list at 200 - so a company with 819 suppliers could not reach most
//      of its own, and could pick another company's. */
//   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
//   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
//   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
//   'product/filter':          { load: () => import('@/models/ProductFilter') },
//   'product/group':           { load: () => import('@/models/ProductGroup') },
//   uom:                       { load: () => import('@/models/Uom') },
//   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
//   item:                      { load: () => import('@/models/Item') },
//   logistic:                  { load: () => import('@/models/Logistic') },
 
//   /* Transportation module */
//   transporter:               { load: () => import('@/models/Transporter') },
//   vehicle:                   { load: () => import('@/models/Vehicle') },
//   driver:                    { load: () => import('@/models/Driver') },
//   'transport-route':         { load: () => import('@/models/TransportRoute') },
//   dispatch:                  { load: () => import('@/models/Dispatch') },
//   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
//   'delivery-unassigned':     {
//     load: () => import('@/models/Delivery'),
//     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
//   },
//   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
//   /* Inter Company Sell */
//   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
//   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
//   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
//   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
//   /* challans not yet pulled into an inter company sales invoice */
//   'ic-delivery-challan-open': {
//     load: () => import('@/models/IcDeliveryChallan'),
//     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
//   },

//   /* Stock Transfers */
//   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
//   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
//   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
//   /* packets not yet consolidated into a stock transfer location */
//   'stock-transfer-packet-open': {
//     load: () => import('@/models/StockTransferPacket'),
//     where: {
//       $or: [
//         { stockTransferLocationId: null },
//         { stockTransferLocationId: { $exists: false } },
//       ],
//     },
//   },
// };
 
// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
 
//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });
 
//   await dbConnect();
 
//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';
 
//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

//      Opt-in per ref, not global: most refs are business-wide (and
//      companylocations must never be filtered by the location it is used to
//      choose). useOptions already sends `location`; until now nothing read it.

//      A row with no locationId is a business-wide one and stays visible - some
//      businesses never assigned stock points to a location, and a strict match
//      would leave their dropdown empty. */
//   if (entry.locationScoped) {
//     const l = sp.get('location');
//     if (l && isValidObjectId(l)) {
//       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
//     }
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);
 
//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) {
//     const rx = { $regex: escapeRegex(q), $options: 'i' };
//     if (entry.nameFallback || entry.codeField) {
//       /* Search the label, the fallback name fields AND the code.

//          The fallbacks matter because businessName is empty on a contact
//          entered as a person - typing "DIRECT" found nothing for them. The
//          code matters because the business identifies a vendor by its G-code
//          as often as by its name: typing "G524" must find the same supplier
//          as typing "KARNATAKA".

//          Wrapped in $and so it cannot collide with a ref that already uses
//          $or in its own `where`. */
//       (filter.$and ||= []).push({
//         $or: [
//           { [label]: rx },
//           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
//           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
//         ],
//       });
//     } else {
//       filter[label] = rx;
//     }
//   }
  
//   /* Ensure SUPPLIER DESCRIPTION is always excluded */
//   if (ref === 'attribute-addon') {
//     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
//   }
 
//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = ref === 'supplier'
//     ? { createdAt: -1, [label]: 1 }
//     : entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };
 
//   const rows = await Model.find(filter).sort(sort).limit(200).lean();

//   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
//   const textOf = (r) => {
//     if (ref === 'uom') {
//       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
//     }
//     const primary = String(r[label] ?? '').trim();
//     if (primary) return primary;
//     const alt = (entry.nameFallback || [])
//       .map((f) => String(r[f] ?? '').trim())
//       .filter(Boolean)
//       .join(' ');
//     return alt || '(untitled)';
//   };

//   /* "KARNATAKA Saree Centre, MYSORE (G524)".

//      The code is appended for DISPLAY only - `value` stays the ObjectId, so
//      what gets stored is the reference and never the formatted text. A
//      supplier without a code simply shows its name. */
//   const labelOf = (r) => {
//     const name = textOf(r);
//     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
//     return code ? name + ' (' + code + ')' : name;
//   };

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: labelOf(r),
//       /* the parts, unformatted, for a caller that needs them on their own */
//       name: textOf(r),
//       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
//       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//     })),
//   });
// }
 
// function escapeRegex(s) {
//   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }




























/////suhas






// // import { isValidObjectId } from 'mongoose';
// // import dbConnect from '@/lib/db';
// // import { requireSession } from '@/lib/session';

// // /* /api/options?ref=<name>&business=<id>
// //    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
// //    old /api/settings/[action] handler.

// //    This is a model index, not a page registry - it maps a dropdown's target
// //    name to a model file and the field to display. Nothing here renders a page. */

// // const json = (d, s = 200) => Response.json(d, { status: s });

// // const REFS = {
// //   /* defaultField: rows where this field is truthy sort first and come back
// //      flagged `isDefault`, so a picker can preselect one instead of falling back
// //      to whatever happens to be first alphabetically. Business uses it to make
// //      the main branch the default selection. */
// //   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
// //   companylocations:          { load: () => import('@/models/CompanyLocation') },
// //   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
// //   ledger:                    { load: () => import('@/models/Ledger') },
// //   docsetup:                  { load: () => import('@/models/DocSetup') },
// //   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
// //   stockpoint:                { load: () => import('@/models/StockPoint') },
// //   poscounter:                { load: () => import('@/models/PosCounter') },
// //   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
// //   tax:                       { load: () => import('@/models/Tax') },
// //   hsn:                       { load: () => import('@/models/Hsn') },
// //   citygroup:                 { load: () => import('@/models/CityGroup') },
// //   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
// //   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
// //   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
// //   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

// //   'contact-type':            { load: () => import('@/models/ContactType') },
// //   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
// //   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
// //   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

// //   'product/filter':          { load: () => import('@/models/ProductFilter') },
// //   'product/group':           { load: () => import('@/models/ProductGroup') },
// //   uom:                       { load: () => import('@/models/Uom') },
// //   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
// //   item:                      { load: () => import('@/models/Item') },
// //   logistic:                  { load: () => import('@/models/Logistic') },

// //   /* Transportation module */
// //   transporter:               { load: () => import('@/models/Transporter') },
// //   vehicle:                   { load: () => import('@/models/Vehicle') },
// //   driver:                    { load: () => import('@/models/Driver') },
// //   'transport-route':         { load: () => import('@/models/TransportRoute') },
// //   dispatch:                  { load: () => import('@/models/Dispatch') },
// //   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
// //   'delivery-unassigned':     {
// //     load: () => import('@/models/Delivery'),
// //     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
// //   },
// // };

// // export async function GET(req) {
// //   const session = await requireSession();
// //   if (!session) return json({ error: 'Unauthorized' }, 401);

// //   const sp = new URL(req.url).searchParams;
// //   const ref = sp.get('ref');
// //   const entry = REFS[ref];
// //   if (!entry) return json({ options: [] });

// //   await dbConnect();

// //   const mod = await entry.load();
// //   const Model = mod.default;
// //   const label = entry.label || mod.LABEL_FIELD || 'name';

// //   const filter = {};
// //   if (entry.scoped !== false) {
// //     const b = sp.get('business');
// //     if (b && isValidObjectId(b)) filter.businessId = b;
// //   }
// //   if (entry.kind) filter.contactKind = entry.kind;
// //   /* a ref can narrow its own pool - see 'delivery-unassigned' */
// //   if (entry.where) Object.assign(filter, entry.where);

// //   /* typing in the control narrows server-side - the old endpoint pulled up to
// //      2000 rows and filtered in the browser, which does not survive 56k customers */
// //   const q = (sp.get('q') || '').trim();
// //   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

// //   /* the default row sorts first, so it survives the 200-row cap */
// //   const sort = entry.defaultField
// //     ? { [entry.defaultField]: -1, [label]: 1 }
// //     : { [label]: 1 };

// //   const rows = await Model.find(filter).sort(sort).limit(200).lean();

// //   return json({
// //     options: rows.map((r) => ({
// //       value: String(r._id),
// //       label: String(r[label] ?? '(untitled)'),
// //       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
// //     })),
// //   });






 
// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';

// /* A contact kind's model, in the { default } shape REFS' loaders return - from
//    lib/contacts.js, so the supplier picker reads suppliers, the customer picker
//    customers and the agent picker agents, wherever lib/contactStorage.js keeps
//    them. */
// const contactOptionsModel = (kind) => import('@/lib/contacts')
//   .then((m) => ({ default: m.CONTACT_MODEL_BY_KIND[kind], LABEL_FIELD: m.LABEL_FIELD }));
 
// /* /api/options?ref=<name>&business=<id>
//    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
//    old /api/settings/[action] handler.
 
//    This is a model index, not a page registry - it maps a dropdown's target
//    name to a model file and the field to display. Nothing here renders a page. */
 
// /* no-store, explicitly. Dropdown lists change the moment somebody uses a
//    quick-add, and without a cache directive the browser is free to answer a
//    repeat GET from its own memory cache - so a record created seconds ago
//    did not appear until the page was reloaded. */
// const json = (d, s = 200) => Response.json(d, {
//   status: s,
//   headers: { 'Cache-Control': 'no-store' },
// });
 
// const REFS = {
//   /* defaultField: rows where this field is truthy sort first and come back
//      flagged `isDefault`, so a picker can preselect one instead of falling back
//      to whatever happens to be first alphabetically. Business uses it to make
//      the main branch the default selection. */
//   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
//   companylocations:          { load: () => import('@/models/CompanyLocation') },
//   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
//   ledger:                    { load: () => import('@/models/Ledger') },
//   docsetup:                  { load: () => import('@/models/DocSetup') },
//   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
//   stockpoint:                { load: () => import('@/models/StockPoint') },
//   poscounter:                { load: () => import('@/models/PosCounter') },
//   /* Staff Management -> Sales Persons. Only Active people are offered:
//      retiring someone should take them out of the till's picker without
//      deleting the record the past bills point at. codeField appends the
//      SP Code for display and makes it searchable, the same way supplier
//      does with the G-code. */
//   salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
//   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
//   tax:                       { load: () => import('@/models/Tax') },
//   hsn:                       { load: () => import('@/models/Hsn') },
//   citygroup:                 { load: () => import('@/models/CityGroup') },
//   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
//   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
//   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
//   'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
//   'contact-type':            { load: () => import('@/models/ContactType') },
//   /* The three contact forms each pick a type of their own kind - the Agent
//      form must not offer "RETAIL" or "Vendor for Goods". contactType is the
//      Customer/Supplier/Agent selector on the Contact Type master. */
//   'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
//   'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
//   'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
//   /* nameFallback: businessName is blank on a contact entered as a person -
//      the Agent form does not even ask for it - so fall back to the personal
//      name rather than showing "(untitled)" in every picker. This mirrors what
//      lib/refLabels.js resolveRefLabels already does for list columns. */
//   /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
//      business calls the G-code and uses to identify a vendor on paper. It is
//      appended to the label, and searched, so typing either the name or the
//      code finds the supplier. Without it the code was invisible in every
//      picker and unsearchable, even though lists already showed it.

//      supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
//      which mixed every company's vendors into one list and then truncated
//      that list at 200 - so a company with 819 suppliers could not reach most
//      of its own, and could pick another company's. */
//   /* load: the kind's own model. `kind` still filters on contactKind, which is
//      right whether the kinds share `contact` or each has its own collection. */
//   supplier:                  { load: () => contactOptionsModel('Supplier'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
//   agent:                     { load: () => contactOptionsModel('Agent'), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
//   customer:                  { load: () => contactOptionsModel('Customer'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
//   'product/filter':          { load: () => import('@/models/ProductFilter') },
//   'product/group':           { load: () => import('@/models/ProductGroup') },
//   uom:                       { load: () => import('@/models/Uom') },
//   'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
//   item:                      { load: () => import('@/models/Item') },
//   logistic:                  { load: () => import('@/models/Logistic') },
 
//   /* Transportation module */
//   transporter:               { load: () => import('@/models/Transporter') },
//   vehicle:                   { load: () => import('@/models/Vehicle') },
//   driver:                    { load: () => import('@/models/Driver') },
//   'transport-route':         { load: () => import('@/models/TransportRoute') },
//   dispatch:                  { load: () => import('@/models/Dispatch') },
//   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
//   'delivery-unassigned':     {
//     load: () => import('@/models/Delivery'),
//     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
//   },
//   'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
//   /* Inter Company Sell */
//   'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
//   'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
//   'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
//   'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
//   /* challans not yet pulled into an inter company sales invoice */
//   'ic-delivery-challan-open': {
//     load: () => import('@/models/IcDeliveryChallan'),
//     where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
//   },

//   /* Stock Transfers */
//   'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
//   'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
//   'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
//   /* packets not yet consolidated into a stock transfer location */
//   'stock-transfer-packet-open': {
//     load: () => import('@/models/StockTransferPacket'),
//     where: {
//       $or: [
//         { stockTransferLocationId: null },
//         { stockTransferLocationId: { $exists: false } },
//       ],
//     },
//   },
// };
 
// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
 
//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });
 
//   await dbConnect();
 
//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';
 
//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);
 
//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) {
//     const rx = { $regex: escapeRegex(q), $options: 'i' };
//     if (entry.nameFallback || entry.codeField) {
//       /* Search the label, the fallback name fields AND the code.

//          The fallbacks matter because businessName is empty on a contact
//          entered as a person - typing "DIRECT" found nothing for them. The
//          code matters because the business identifies a vendor by its G-code
//          as often as by its name: typing "G524" must find the same supplier
//          as typing "KARNATAKA".

//          Wrapped in $and so it cannot collide with a ref that already uses
//          $or in its own `where`. */
//       (filter.$and ||= []).push({
//         $or: [
//           { [label]: rx },
//           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
//           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
//         ],
//       });
//     } else {
//       filter[label] = rx;
//     }
//   }
  
//   /* Ensure SUPPLIER DESCRIPTION is always excluded */
//   if (ref === 'attribute-addon') {
//     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
//   }
 
//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = ref === 'supplier'
//     ? { createdAt: -1, [label]: 1 }
//     : entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };
 
//   const rows = await Model.find(filter).sort(sort).limit(200).lean();

//   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
//   const textOf = (r) => {
//     if (ref === 'uom') {
//       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
//     }
//     const primary = String(r[label] ?? '').trim();
//     if (primary) return primary;
//     const alt = (entry.nameFallback || [])
//       .map((f) => String(r[f] ?? '').trim())
//       .filter(Boolean)
//       .join(' ');
//     return alt || '(untitled)';
//   };

//   /* "KARNATAKA Saree Centre, MYSORE (G524)".

//      The code is appended for DISPLAY only - `value` stays the ObjectId, so
//      what gets stored is the reference and never the formatted text. A
//      supplier without a code simply shows its name. */
//   const labelOf = (r) => {
//     const name = textOf(r);
//     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
//     return code ? name + ' (' + code + ')' : name;
//   };

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: labelOf(r),
//       /* the parts, unformatted, for a caller that needs them on their own */
//       name: textOf(r),
//       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
//       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//     })),
//   });
// }
 
// function escapeRegex(s) {
//   return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
// }









// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { requireSession } from '@/lib/session';

// /* /api/options?ref=<name>&business=<id>
//    Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
//    old /api/settings/[action] handler.

//    This is a model index, not a page registry - it maps a dropdown's target
//    name to a model file and the field to display. Nothing here renders a page. */

// const json = (d, s = 200) => Response.json(d, { status: s });

// const REFS = {
//   /* defaultField: rows where this field is truthy sort first and come back
//      flagged `isDefault`, so a picker can preselect one instead of falling back
//      to whatever happens to be first alphabetically. Business uses it to make
//      the main branch the default selection. */
//   business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch' },
//   companylocations:          { load: () => import('@/models/CompanyLocation') },
//   ledgergroups:              { load: () => import('@/models/LedgerGroup') },
//   ledger:                    { load: () => import('@/models/Ledger') },
//   docsetup:                  { load: () => import('@/models/DocSetup') },
//   purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
//   stockpoint:                { load: () => import('@/models/StockPoint') },
//   poscounter:                { load: () => import('@/models/PosCounter') },
//   paymentmethod:             { load: () => import('@/models/PaymentMethod') },
//   tax:                       { load: () => import('@/models/Tax') },
//   hsn:                       { load: () => import('@/models/Hsn') },
//   citygroup:                 { load: () => import('@/models/CityGroup') },
//   barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
//   'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
//   'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
//   'sales/master/term':       { load: () => import('@/models/SalesTerm') },

//   'contact-type':            { load: () => import('@/models/ContactType') },
//   supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName' },
//   agent:                     { load: () => import('@/models/Contact'), kind: 'Agent', label: 'businessName' },
//   customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName' },

//   'product/filter':          { load: () => import('@/models/ProductFilter') },
//   'product/group':           { load: () => import('@/models/ProductGroup') },
//   uom:                       { load: () => import('@/models/Uom') },
//   'attribute-addon':         { load: () => import('@/models/AttributeAddon') },
//   item:                      { load: () => import('@/models/Item') },
//   logistic:                  { load: () => import('@/models/Logistic') },

//   /* Transportation module */
//   transporter:               { load: () => import('@/models/Transporter') },
//   vehicle:                   { load: () => import('@/models/Vehicle') },
//   driver:                    { load: () => import('@/models/Driver') },
//   'transport-route':         { load: () => import('@/models/TransportRoute') },
//   dispatch:                  { load: () => import('@/models/Dispatch') },
//   /* consignments no dispatch has claimed yet - the Dispatch form's picker */
//   'delivery-unassigned':     {
//     load: () => import('@/models/Delivery'),
//     where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
//   },
// };

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });

//   await dbConnect();

//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';

//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);

//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) filter[label] = { $regex: escapeRegex(q), $options: 'i' };

//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };

//   const rows = await Model.find(filter).sort(sort).limit(200).lean();

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: String(r[label] ?? '(untitled)'),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//     })),
//   });






 
import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import { requireSession } from '@/lib/session';
import { getSessionLocationAccess, resolveAuthorizedScope } from '@/lib/locationAccess';
import { contactTypeDisplayName } from '@/lib/contactTypeLabels';
import {
  screenDenialAnyAction,
  effectivePermissions,
  SCREENS,
  ACTIONS as PERM,
  ITEM_LOOKUP_SCREENS,
  COUNTER_PICKER_SCREENS,
  HSN_LOOKUP_SCREENS,
  TAX_LOOKUP_SCREENS,
} from '@/lib/screenPermission';
import { MASTER_STOCK_OPTION_REF_PERM, hasMasterStockPerm } from '@/lib/masterStockPermissions';

const TRANSFER_DEST_SCREENS = [
  SCREENS.TRANSFER_PACKET,
  SCREENS.TRANSFER_LOCATION,
  SCREENS.IC_DELIVERY_CHALLAN,
  SCREENS.IC_ITEM_INVOICE,
  SCREENS.SELL_DELIVERY_CHALLAN,
];

const SUPPLIER_PICKER_SCREENS = [
  SCREENS.SUPPLIER,
  SCREENS.GRC,
  SCREENS.GRT,
  SCREENS.BARCODE_ITEM,
  SCREENS.PRINT_LABEL,
  SCREENS.ITEM,
  SCREENS.MASTER_STOCK_REPORT,
  SCREENS.ITEM_BARCODE_REPORT,
  SCREENS.SALES_REPORT,
  SCREENS.PERFORMANCE_LOG_REPORT,
  SCREENS.STOCK_GALLERY_VIEW,
  SCREENS.SUPPLIER_BILL_REPORT,
  SCREENS.SUPPLIER_OUTSTANDING_REPORT,
  SCREENS.SUPPLIER_SUMMARY_REPORT,
  SCREENS.SUPPLIER_BILL_WISE_REPORT,
  SCREENS.SUPPLIER_BATCH_WISE_REPORT,
  SCREENS.PAYMENT_VOUCHER,
];

const AGENT_PICKER_SCREENS = [
  SCREENS.AGENT,
  SCREENS.SUPPLIER,
  SCREENS.GRC,
  SCREENS.GRT,
  SCREENS.DELIVERY,
  SCREENS.MASTER_STOCK_REPORT,
];

const GRC_PICKER_SCREENS = [
  SCREENS.GRC,
  SCREENS.GRT,
  SCREENS.BARCODE_ITEM,
  SCREENS.PRINT_LABEL,
  SCREENS.MASTER_STOCK_REPORT,
  SCREENS.SUPPLIER_SUMMARY_REPORT,
  SCREENS.SUPPLIER_BILL_WISE_REPORT,
];

const LEDGER_PICKER_SCREENS = [
  SCREENS.LEDGER_GROUP,
  SCREENS.LEDGER,
  SCREENS.LEDGER_MAPPING,
  SCREENS.ACCOUNTS_CHART,
  SCREENS.ACCOUNTS_JOURNAL,
  SCREENS.ACCOUNTS_SETTINGS,
  SCREENS.ACCOUNTS_LEDGER,
  SCREENS.RECEIPT_VOUCHER,
  SCREENS.PAYMENT_VOUCHER,
  SCREENS.CONTRA_VOUCHER,
  SCREENS.SUPPLIER,
  SCREENS.CUSTOMER,
];

const TRANSPORT_PICKER_SCREENS = [
  SCREENS.TRANSPORTER,
  SCREENS.VEHICLE,
  SCREENS.DRIVER,
  SCREENS.ROUTE,
  SCREENS.DISPATCH,
  SCREENS.DELIVERY,
  SCREENS.LOGISTIC,
  SCREENS.GRC,
  SCREENS.SELL_DELIVERY_CHALLAN,
  SCREENS.IC_DELIVERY_CHALLAN,
];

const REF_GATES = {
  salesperson: { screens: [SCREENS.SALES_PERSON], actions: [PERM.READ], label: 'sales persons' },
  customer: { screens: [SCREENS.CUSTOMER], actions: [PERM.READ], label: 'customers' },
  supplier: { screens: SUPPLIER_PICKER_SCREENS, actions: [PERM.READ], label: 'suppliers' },
  'supplier-code': { screens: SUPPLIER_PICKER_SCREENS, actions: [PERM.READ], label: 'supplier codes' },
  agent: { screens: AGENT_PICKER_SCREENS, actions: [PERM.READ], label: 'agents' },
  'grc-number': { screens: GRC_PICKER_SCREENS, actions: [PERM.READ], label: 'GRC numbers' },
  'contact-type': { screens: [SCREENS.CONTACT_TYPE, SCREENS.CUSTOMER, SCREENS.SUPPLIER, SCREENS.AGENT], actions: [PERM.READ], label: 'contact types' },
  'contact-type-customer': { screens: [SCREENS.CONTACT_TYPE, SCREENS.CUSTOMER], actions: [PERM.READ], label: 'customer contact types' },
  'contact-type-supplier': { screens: [SCREENS.CONTACT_TYPE, SCREENS.SUPPLIER], actions: [PERM.READ], label: 'supplier contact types' },
  'contact-type-agent': { screens: [SCREENS.CONTACT_TYPE, SCREENS.AGENT], actions: [PERM.READ], label: 'agent contact types' },
  poscounter: { screens: COUNTER_PICKER_SCREENS, actions: [PERM.READ], label: 'POS counters' },
  paymentmethod: { screens: [SCREENS.PAYMENT_METHOD, SCREENS.POS, SCREENS.POS_RETURN, SCREENS.RECEIPT_VOUCHER, SCREENS.PAYMENT_VOUCHER], actions: [PERM.READ], label: 'payment methods' },
  item: { screens: [...ITEM_LOOKUP_SCREENS, SCREENS.MASTER_STOCK_REPORT, SCREENS.ITEM_BARCODE_REPORT, SCREENS.STOCK_GALLERY_VIEW], actions: [PERM.READ], label: 'items' },
  'item-code': { screens: [...ITEM_LOOKUP_SCREENS, SCREENS.MASTER_STOCK_REPORT, SCREENS.ITEM_BARCODE_REPORT, SCREENS.STOCK_GALLERY_VIEW], actions: [PERM.READ], label: 'item codes' },
  hsn: { screens: [...HSN_LOOKUP_SCREENS, SCREENS.MASTER_STOCK_REPORT, SCREENS.HSN_SUMMARY], actions: [PERM.READ], label: 'HSN codes' },
  tax: { screens: TAX_LOOKUP_SCREENS, actions: [PERM.READ], label: 'taxes' },
  uom: { screens: [SCREENS.UOM, SCREENS.ITEM, SCREENS.UOM_CONVERSION, SCREENS.GRC], actions: [PERM.READ], label: 'UOMs' },
  'attribute-addon': { screens: [SCREENS.ATTRIBUTE_ADDON, SCREENS.ITEM, SCREENS.GRC, SCREENS.BARCODE_ITEM], actions: [PERM.READ], label: 'attributes' },
  'product/filter': { screens: [SCREENS.PRODUCT_FILTER, SCREENS.ITEM, SCREENS.MASTER_STOCK_REPORT], actions: [PERM.READ], label: 'product filters' },
  'product/group': { screens: [SCREENS.PRODUCT_GROUP, SCREENS.ITEM, SCREENS.MASTER_STOCK_REPORT, SCREENS.STOCK_GALLERY_VIEW, SCREENS.BARCODE_ITEM], actions: [PERM.READ], label: 'product groups' },
  'product/group-parent': { screens: [SCREENS.PRODUCT_GROUP, SCREENS.ITEM, SCREENS.MASTER_STOCK_REPORT, SCREENS.STOCK_GALLERY_VIEW, SCREENS.BARCODE_ITEM], actions: [PERM.READ], label: 'product groups' },
  stockpoint: { screens: [SCREENS.STOCK_POINT, SCREENS.COMPANY_LOCATION, SCREENS.GRC, SCREENS.TRANSFER_PACKET, SCREENS.TRANSFER_LOCATION, SCREENS.IC_DELIVERY_CHALLAN, SCREENS.SELL_DELIVERY_CHALLAN, SCREENS.STOCK_ADJUSTMENT], actions: [PERM.READ], label: 'stock points' },
  purchasegroup: { screens: [SCREENS.PURCHASE_GROUP, SCREENS.GRC, SCREENS.GRT, SCREENS.ITEM], actions: [PERM.READ], label: 'purchase groups' },
  'purchase/master/charge': { screens: [SCREENS.PURCHASE_CHARGE, SCREENS.GRC, SCREENS.GRT], actions: [PERM.READ], label: 'purchase charges' },
  'purchase/master/term': { screens: [SCREENS.PURCHASE_TERM, SCREENS.GRC, SCREENS.GRT], actions: [PERM.READ], label: 'purchase terms' },
  'sales/master/term': { screens: [SCREENS.SALES_TERM, SCREENS.SELL_DELIVERY_CHALLAN, SCREENS.IC_ITEM_INVOICE], actions: [PERM.READ], label: 'sales terms' },
  ledgergroups: { screens: LEDGER_PICKER_SCREENS, actions: [PERM.READ], label: 'ledger groups' },
  ledger: { screens: LEDGER_PICKER_SCREENS, actions: [PERM.READ], label: 'ledgers' },
  accounts: { screens: LEDGER_PICKER_SCREENS, actions: [PERM.READ], label: 'accounts' },
  docsetup: { screens: [SCREENS.DOC_SETUP], actions: [PERM.READ], label: 'document setup' },
  citygroup: { screens: [SCREENS.CITY_GROUP, SCREENS.SUPPLIER, SCREENS.MASTER_STOCK_REPORT], actions: [PERM.READ], label: 'city groups' },
  barcodesetting: { screens: [SCREENS.BARCODE_SETTING, SCREENS.PRINT_LABEL, SCREENS.BARCODE_ITEM, SCREENS.GRC], actions: [PERM.READ], label: 'barcode settings' },
  logistic: { screens: TRANSPORT_PICKER_SCREENS, actions: [PERM.READ], label: 'logistics' },
  transporter: { screens: TRANSPORT_PICKER_SCREENS, actions: [PERM.READ], label: 'transporters' },
  vehicle: { screens: TRANSPORT_PICKER_SCREENS, actions: [PERM.READ], label: 'vehicles' },
  driver: { screens: TRANSPORT_PICKER_SCREENS, actions: [PERM.READ], label: 'drivers' },
  'transport-route': { screens: TRANSPORT_PICKER_SCREENS, actions: [PERM.READ], label: 'routes' },
  dispatch: { screens: [SCREENS.DISPATCH, SCREENS.DELIVERY], actions: [PERM.READ], label: 'dispatches' },
  'delivery-unassigned': { screens: [SCREENS.DISPATCH, SCREENS.DELIVERY], actions: [PERM.READ], label: 'deliveries' },
  'delivery-available-grc': { screens: [SCREENS.DELIVERY, SCREENS.GRC], actions: [PERM.READ], label: 'deliveries' },
  'ic-delivery-challan': { screens: [SCREENS.IC_DELIVERY_CHALLAN, SCREENS.IC_RECEIVE_DELIVERY_CHALLAN, SCREENS.IC_ITEM_INVOICE], actions: [PERM.READ], label: 'inter-company delivery challans' },
  'ic-delivery-challan-open': { screens: [SCREENS.IC_DELIVERY_CHALLAN, SCREENS.IC_ITEM_INVOICE], actions: [PERM.READ], label: 'inter-company delivery challans' },
  'ic-sales-invoice': { screens: [SCREENS.IC_ITEM_INVOICE, SCREENS.IC_PURCHASE_RECEIVED], actions: [PERM.READ], label: 'inter-company sales invoices' },
  'ic-auto-purchase-return': { screens: [SCREENS.IC_RETURN_APPROVAL, SCREENS.IC_PURCHASE_RECEIVED], actions: [PERM.READ], label: 'inter-company returns' },
  'ic-sales-return': { screens: [SCREENS.IC_RETURN_APPROVAL], actions: [PERM.READ], label: 'inter-company sales returns' },
  'stock-transfer-packet': { screens: [SCREENS.TRANSFER_PACKET, SCREENS.TRANSFER_LOCATION], actions: [PERM.READ], label: 'stock transfer packets' },
  'stock-transfer-packet-open': { screens: [SCREENS.TRANSFER_PACKET, SCREENS.TRANSFER_LOCATION], actions: [PERM.READ], label: 'stock transfer packets' },
  'stock-transfer-location': { screens: [SCREENS.TRANSFER_LOCATION, SCREENS.TRANSFER_RECEIVED], actions: [PERM.READ], label: 'stock transfer locations' },
  'stock-transfer-received': { screens: [SCREENS.TRANSFER_RECEIVED], actions: [PERM.READ], label: 'stock transfer receipts' },
};
 
/* /api/options?ref=<name>&business=<id>
   Feeds every `ref` dropdown in the app. Replaces the `options` branch of the
   old /api/settings/[action] handler.
 
   This is a model index, not a page registry - it maps a dropdown's target
   name to a model file and the field to display. Nothing here renders a page. */
 
/* no-store, explicitly. Dropdown lists change the moment somebody uses a
   quick-add, and without a cache directive the browser is free to answer a
   repeat GET from its own memory cache - so a record created seconds ago
   did not appear until the page was reloaded. */
const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});
 
const REFS = {
  /* defaultField: rows where this field is truthy sort first and come back
     flagged `isDefault`, so a picker can preselect one instead of falling back
     to whatever happens to be first alphabetically. Business uses it to make
     the main branch the default selection. */
  business:                  { load: () => import('@/models/Business'), scoped: false, defaultField: 'isMainBranch', nameFallback: ['businessPrintName'], includeAll: true },
  companylocations:          { load: () => import('@/models/CompanyLocation'), includeAll: true },
  ledgergroups:              { load: () => import('@/models/LedgerGroup') },
  ledger:                    { load: () => import('@/models/Ledger') },
  /* Accounts module: the CHART of accounts a journal line posts to. Not the
     party Ledger above - see the note at the top of models/AccountsMaster.js.
     The account code is appended for display and searched, so a bookkeeper
     who knows the code can type it. */
  accounts:                  { load: () => import('@/models/AccountsMaster'), label: 'accountName', codeField: 'accountCode', locationScoped: true },
  docsetup:                  { load: () => import('@/models/DocSetup') },
  purchasegroup:             { load: () => import('@/models/PurchaseGroup') },
  /* locationScoped: a stock point belongs to ONE location, so offering the
     whole business's list lets an operator standing in the warehouse pick a
     stock point that physically sits in another branch location. */
  stockpoint:                { load: () => import('@/models/StockPoint'), locationScoped: true },
  poscounter:                { load: () => import('@/models/PosCounter') },
  /* Staff Management -> Sales Persons. Only Active people are offered:
     retiring someone should take them out of the till's picker without
     deleting the record the past bills point at. codeField appends the
     SP Code for display and makes it searchable, the same way supplier
     does with the G-code. */
  salesperson:               { load: () => import('@/models/SalesPerson'), where: { status: 'Active' }, codeField: 'spCode' },
  paymentmethod:             { load: () => import('@/models/PaymentMethod') },
  tax:                       { load: () => import('@/models/Tax') },
  hsn:                       { load: () => import('@/models/Hsn') },
  citygroup:                 { load: () => import('@/models/CityGroup') },
  barcodesetting:            { load: () => import('@/models/BarcodeSetting') },
  'purchase/master/charge':  { load: () => import('@/models/PurchaseCharge') },
  'purchase/master/term':    { load: () => import('@/models/PurchaseTerm') },
  'sales/master/term':       { load: () => import('@/models/SalesTerm') },
 
  'contact-type':            { load: () => import('@/models/ContactType') },
  /* The three contact forms each pick a type of their own kind - the Agent
     form must not offer "RETAIL" or "Vendor for Goods". contactType is the
     Customer/Supplier/Agent selector on the Contact Type master. */
  'contact-type-agent':      { load: () => import('@/models/ContactType'), where: { contactType: 'Agent' } },
  'contact-type-supplier':   { load: () => import('@/models/ContactType'), where: { contactType: 'Supplier' } },
  'contact-type-customer':   { load: () => import('@/models/ContactType'), where: { contactType: 'Customer' } },
  /* nameFallback: businessName is blank on a contact entered as a person -
     the Agent form does not even ask for it - so fall back to the personal
     name rather than showing "(untitled)" in every picker. This mirrors what
     lib/refLabels.js resolveRefLabels already does for list columns. */
  /* codeField: the contact's own code - "G524", "PO8", "IC16" - which the
     business calls the G-code and uses to identify a vendor on paper. It is
     appended to the label, and searched, so typing either the name or the
     code finds the supplier. Without it the code was invisible in every
     picker and unsearchable, even though lists already showed it.

     supplier is BUSINESS-SCOPED like the other two. It carried scoped:false,
     which mixed every company's vendors into one list and then truncated
     that list at 200 - so a company with 819 suppliers could not reach most
     of its own, and could pick another company's. */
  /* cityFields: the picker can be narrowed to one city (&city=...) - the
     Master Stock Report chooses the city first, then picks among only that
     city's vendors. Billing OR shipping city, since either may be the one
     the operator knows the vendor by. */
  supplier:                  { load: () => import('@/models/Contact'), kind: 'Supplier', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityFields: ['billingCity', 'shippingCity'] },
  agent:                     { load: () => import('@/lib/contacts').then((m) => ({ default: m.Agent })), kind: 'Agent', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId', cityViaSupplier: true },
  customer:                  { load: () => import('@/models/Contact'), kind: 'Customer', label: 'businessName', nameFallback: ['firstName', 'lastName'], codeField: 'contactId' },
 
  'product/filter':          { load: () => import('@/models/ProductFilter') },
'product/group':           { load: () => import('@/models/ProductGroup'), parentField: 'parentId', parentParam: 'parentId', includeAll: true },
  'product/group-parent':    { load: () => import('@/models/ProductGroup'), where: { parentId: null }, includeAll: true },
  uom:                       { load: () => import('@/models/Uom') },
  'attribute-addon':         { load: () => import('@/models/AttributeAddon'), where: { name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } } },
   item:                      {
    load: () => import('@/models/Item'),
    parentField: 'subGroupId',
    parentParam: 'groupId',
    parentGroupParam: 'parentGroupId',
  },
  'item-code':               { load: () => import('@/models/Item'), label: 'itemCode', nameFallback: ['name'], parentField: 'subGroupId', parentParam: 'groupId', includeAll: true },
  logistic:                  { load: () => import('@/models/Logistic') },
 
  /* Transportation module */
  transporter:               { load: () => import('@/models/Transporter') },
  vehicle:                   { load: () => import('@/models/Vehicle') },
  driver:                    { load: () => import('@/models/Driver') },
  'transport-route':         { load: () => import('@/models/TransportRoute') },
  dispatch:                  { load: () => import('@/models/Dispatch') },
  /* consignments no dispatch has claimed yet - the Dispatch form's picker */
  'delivery-unassigned':     {
    load: () => import('@/models/Delivery'),
    where: { $or: [{ dispatchId: null }, { dispatchId: { $exists: false } }] },
  },
  'delivery-available-grc':  { load: () => import('@/models/Delivery') },
 
  /* Inter Company Sell */
  'ic-delivery-challan':      { load: () => import('@/models/IcDeliveryChallan') },
  'ic-sales-invoice':         { load: () => import('@/models/IcSalesInvoice') },
  'ic-auto-purchase-return':  { load: () => import('@/models/IcAutoPurchaseReturn') },
  'ic-sales-return':          { load: () => import('@/models/IcSalesReturn') },
  /* challans not yet pulled into an inter company sales invoice */
  'ic-delivery-challan-open': {
    load: () => import('@/models/IcDeliveryChallan'),
    where: { $or: [{ icSalesInvoiceId: null }, { icSalesInvoiceId: { $exists: false } }] },
  },

  /* Stock Transfers */
  'stock-transfer-packet':   { load: () => import('@/models/StockTransferPacket') },
  'stock-transfer-location': { load: () => import('@/models/StockTransferLocation') },
  'stock-transfer-received': { load: () => import('@/models/StockTransferReceived') },
  /* packets not yet consolidated into a stock transfer location */
  'stock-transfer-packet-open': {
    load: () => import('@/models/StockTransferPacket'),
    where: {
      $or: [
        { stockTransferLocationId: null },
        { stockTransferLocationId: { $exists: false } },
      ],
    },
  },
};
 
// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);
 
//   const sp = new URL(req.url).searchParams;
//   const ref = sp.get('ref');
//   const entry = REFS[ref];
//   if (!entry) return json({ options: [] });
 
//   await dbConnect();
 
//   const mod = await entry.load();
//   const Model = mod.default;
//   const label = entry.label || mod.LABEL_FIELD || 'name';
 
//   const filter = {};
//   if (entry.scoped !== false) {
//     const b = sp.get('business');
//     if (b && isValidObjectId(b)) filter.businessId = b;
//   }
//   /* Narrow to the top bar's LOCATION as well, for refs that live at one.

//      Opt-in per ref, not global: most refs are business-wide (and
//      companylocations must never be filtered by the location it is used to
//      choose). useOptions already sends `location`; until now nothing read it.

//      A row with no locationId is a business-wide one and stays visible - some
//      businesses never assigned stock points to a location, and a strict match
//      would leave their dropdown empty. */
//   if (entry.locationScoped) {
//     const l = sp.get('location');
//     if (l && isValidObjectId(l)) {
//       filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
//     }
//   }
//   if (entry.parentField && entry.parentParam) {
//     const parentId = sp.get(entry.parentParam);
//     if (parentId) {
//       if (!isValidObjectId(parentId)) return json({ error: 'Invalid parent selection' }, 400);
//       filter[entry.parentField] = parentId;
//     }
//   }
//   /* a picker narrowed to one CITY - see cityFields on the supplier ref.
//      Case-insensitive and tolerant of stray spaces, because the city on a
//      contact was typed by hand. */
//   if (entry.cityFields) {
//     const city = (sp.get('city') || '').trim();
//     if (city) {
//       const rx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
//       (filter.$and ||= []).push({ $or: entry.cityFields.map((f) => ({ [f]: rx })) });
//     }
//   }
//   /* An agent is related to a city through the suppliers assigned to that
//      agent, not through the agent's own address fields. */
//   if (entry.cityViaSupplier) {
//     const city = (sp.get('city') || '').trim();
//     if (city) {
//       const { Supplier } = await import('@/lib/contacts');
//       const supplierFilter = {
//         contactKind: 'Supplier',
//         $or: ['billingCity', 'shippingCity'].map((field) => ({
//           [field]: { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' },
//         })),
//       };
//       if (filter.businessId) supplierFilter.businessId = filter.businessId;
//       const suppliers = await Supplier.find(supplierFilter).select('agentId').lean();
//       filter._id = { $in: [...new Set(suppliers.map((supplier) => supplier.agentId).filter(Boolean).map(String))] };
//     }
//   }
//   if (entry.kind) filter.contactKind = entry.kind;
//   /* a ref can narrow its own pool - see 'delivery-unassigned' */
//   if (entry.where) Object.assign(filter, entry.where);
 
//   /* typing in the control narrows server-side - the old endpoint pulled up to
//      2000 rows and filtered in the browser, which does not survive 56k customers */
//   const q = (sp.get('q') || '').trim();
//   if (q) {
//     const rx = { $regex: escapeRegex(q), $options: 'i' };
//     if (entry.nameFallback || entry.codeField) {
//       /* Search the label, the fallback name fields AND the code.

//          The fallbacks matter because businessName is empty on a contact
//          entered as a person - typing "DIRECT" found nothing for them. The
//          code matters because the business identifies a vendor by its G-code
//          as often as by its name: typing "G524" must find the same supplier
//          as typing "KARNATAKA".

//          Wrapped in $and so it cannot collide with a ref that already uses
//          $or in its own `where`. */
//       (filter.$and ||= []).push({
//         $or: [
//           { [label]: rx },
//           ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
//           ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
//         ],
//       });
//     } else {
//       filter[label] = rx;
//     }
//   }
  
//   /* Ensure SUPPLIER DESCRIPTION is always excluded */
//   if (ref === 'attribute-addon') {
//     (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
//   }
 
//   /* the default row sorts first, so it survives the 200-row cap */
//   const sort = ref === 'supplier'
//     ? { createdAt: -1, [label]: 1 }
//     : entry.defaultField
//     ? { [entry.defaultField]: -1, [label]: 1 }
//     : { [label]: 1 };
 
//   const rowsQuery = Model.find(filter).sort(sort);
//   if (!entry.includeAll) rowsQuery.limit(200);
//   const rows = await rowsQuery.lean();

//   /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
//   const textOf = (r) => {
//     if (ref === 'uom') {
//       return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
//     }
//     const primary = String(r[label] ?? '').trim();
//     if (primary) return primary;
//     const alt = (entry.nameFallback || [])
//       .map((f) => String(r[f] ?? '').trim())
//       .filter(Boolean)
//       .join(' ');
//     return alt || '(untitled)';
//   };

//   /* "KARNATAKA Saree Centre, MYSORE (G524)".

//      The code is appended for DISPLAY only - `value` stays the ObjectId, so
//      what gets stored is the reference and never the formatted text. A
//      supplier without a code simply shows its name. */
//   const labelOf = (r) => {
//     const name = textOf(r);
//     const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
//     return code ? name + ' (' + code + ')' : name;
//   };

//   return json({
//     options: rows.map((r) => ({
//       value: String(r._id),
//       label: labelOf(r),
//       /* the parts, unformatted, for a caller that needs them on their own */
//       name: textOf(r),
//       ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
//       ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
//       ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
//       /* which location the row belongs to ('' = shared by the whole
//          business), so a form can pick the row bound to the header LOCATION */
//       ...(entry.locationScoped ? { locationId: r.locationId ? String(r.locationId) : '' } : {}),
//     })),
//   });
// }


///sushmita


export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);
 
  const sp = new URL(req.url).searchParams;
  const ref = sp.get('ref');
  const entry = REFS[ref];
  await dbConnect();

  const access = await getSessionLocationAccess(session);
  const forTransferDestination =
    (sp.get('transferTarget') === '1' || sp.get('groupStores') === '1') &&
    (ref === 'companylocations' || ref === 'stockpoint');
  if (forTransferDestination) {
    const destDenied = await screenDenialAnyAction({
      session,
      screens: TRANSFER_DEST_SCREENS,
      actions: [PERM.READ, PERM.CREATE, PERM.UPDATE],
      businessId: sp.get('business') || '',
      label: 'transfer destinations',
    });
    if (destDenied) return json({ error: destDenied.message, code: destDenied.code }, 403);
  }

  let scopedCheckBusinessId = '';
  /* Enforce company & location restrictions on all scoped reference lookups,
     except explicit destination pickers used by outbound inter-branch transfers. */
  if (access.isRestricted && !forTransferDestination) {
    const reqBiz = sp.get('business');
    const reqLoc = sp.get('location');
    if (ref === 'business') {
      if (reqBiz && isValidObjectId(reqBiz) && !access.allowedBusinessIdSet.has(reqBiz)) {
        return json({ error: 'Your account is not authorized to access this company.', code: 'FORBIDDEN_BUSINESS' }, 403);
      }
    } else if (!entry || entry.scoped !== false) {
      const check = await resolveAuthorizedScope(session, {
        businessId: reqBiz || '',
        locationId: entry?.locationScoped ? (reqLoc || '') : '',
      });
      if (!check.ok) {
        return json({ error: check.error, code: check.code }, check.status || 403);
      }
      scopedCheckBusinessId = check.businessId || '';
    }
  }

  const gateSpec = REF_GATES[ref];
  if (gateSpec) {
    const gateBiz = scopedCheckBusinessId || (isValidObjectId(sp.get('business') || '') ? sp.get('business') : '') || access.allowedBusinessIds?.[0] || '';
    const refDenied = await screenDenialAnyAction({
      session,
      screens: gateSpec.screens,
      actions: gateSpec.actions,
      businessId: gateBiz,
      label: gateSpec.label,
    });
    if (refDenied) return json({ error: refDenied.message, code: refDenied.code }, 403);
    const msFilterKey = MASTER_STOCK_OPTION_REF_PERM[ref];
    if (msFilterKey && gateSpec.screens.includes(SCREENS.MASTER_STOCK_REPORT)) {
      const nonMsScreens = gateSpec.screens.filter((s) => s !== SCREENS.MASTER_STOCK_REPORT);
      const nonMsDenied = nonMsScreens.length
        ? await screenDenialAnyAction({
            session,
            screens: nonMsScreens,
            actions: gateSpec.actions,
            businessId: gateBiz,
            label: gateSpec.label,
          })
        : { denied: true };
      if (nonMsDenied) {
        const eff = await effectivePermissions({ session, businessId: gateBiz });
        if (!hasMasterStockPerm(eff.masterStock, msFilterKey)) {
          return json({
            error: `Your role does not have permission to access ${gateSpec.label} via Master Stock Report filters.`,
            code: 'FIELD_FORBIDDEN',
          }, 403);
        }
      }
    }
  }

  if (ref === 'supplier-code') {
    const { Supplier } = await import('@/lib/contacts');
    const Grc = (await import('@/models/Grc')).default;
    const filter = {
      contactKind: 'Supplier',
      contactId: { $nin: ['', null] },
    };
    const business = sp.get('business');
    if (business && isValidObjectId(business)) filter.businessId = business;
    const grcNo = (sp.get('grcNo') || '').trim();
    if (grcNo) {
      const grcFilter = { grcNumber: grcNo };
      if (business && isValidObjectId(business)) grcFilter.businessId = business;
      const location = sp.get('location');
      if (location && isValidObjectId(location)) grcFilter.locationId = location;
      const finYear = sp.get('finYear');
      if (finYear) grcFilter.finYear = finYear;
      const supplierIds = await Grc.distinct('supplierId', grcFilter);
      filter._id = { $in: supplierIds };
    }

    const suppliers = await Supplier.find(filter)
      .select('contactId businessName firstName middleName lastName')
      .lean();
    const optionsByCode = new Map();
    suppliers.forEach((supplier) => {
      const code = String(supplier.contactId || '').trim();
      if (!code || optionsByCode.has(code)) return;
      const name = String(supplier.businessName || '').trim()
        || [supplier.firstName, supplier.middleName, supplier.lastName]
          .map((part) => String(part || '').trim())
          .filter(Boolean)
          .join(' ');
      optionsByCode.set(code, {
        value: code,
        label: name ? `${name} (${code})` : code,
      });
    });
    return json({
      options: [...optionsByCode.values()]
        .sort((a, b) => a.value.localeCompare(b.value)),
    });
  }

  if (ref === 'grc-number') {
    const Grc = (await import('@/models/Grc')).default;
    const filter = { grcNumber: { $nin: ['', null] } };
    const business = sp.get('business');
    const location = sp.get('location');
    const finYear = sp.get('finYear');
    if (business && isValidObjectId(business)) filter.businessId = business;
    if (location && isValidObjectId(location)) filter.locationId = location;
    if (finYear) filter.finYear = finYear;
    /* Which supplier's bills.

       Two spellings, because the two callers send different ones: the
       supplier-code picker sends the vendor's contactId (&supplierNo=G524),
       while a report's Supplier filter sends the vendor's _id
       (&supplierId=...). A comma-joined list is accepted from both - the
       filter on those screens can hold several suppliers.

       Grc.supplierId is an ObjectId, so a code has to be resolved to the
       vendor first; an id is used as it stands. Either way the answer is a
       list of ids, and a pick that matches no vendor means no bills. */
    const rawSupplier = (sp.get('supplierId') || sp.get('supplierNo') || '').trim();
    if (rawSupplier) {
      const picks = rawSupplier.split(',').map((v) => v.trim()).filter(Boolean);
      const ids = picks.filter((v) => isValidObjectId(v));
      const codes = picks.filter((v) => !isValidObjectId(v));
      const or = [];
      if (ids.length) or.push({ _id: { $in: ids } });
      if (codes.length) or.push({ contactId: { $in: codes } });
      const { Supplier } = await import('@/lib/contacts');
      const supplierIds = or.length
        ? await Supplier.distinct('_id', {
          contactKind: 'Supplier',
          $or: or,
          ...(business && isValidObjectId(business) ? { businessId: business } : {}),
        })
        : [];
      filter.supplierId = { $in: supplierIds };
    }

    const numbers = await Grc.distinct('grcNumber', filter);
    return json({
      options: numbers
        .map((number) => String(number || '').trim())
        .filter(Boolean)
        .sort((a, b) => b.localeCompare(a, undefined, { numeric: true, sensitivity: 'base' }))
        .map((number) => ({ value: number, label: number })),
    });
  }

  if (!entry) return json({ options: [] });

  const mod = await entry.load();
  const Model = mod.default;
  const label = entry.label || mod.LABEL_FIELD || 'name';
 
  const filter = {};
  if (entry.scoped !== false) {
    const b = sp.get('business');
    if (b && isValidObjectId(b)) filter.businessId = b;
    else if (access.isRestricted && !forTransferDestination) {
      filter.businessId = access.allowedBusinessIds.length === 1
        ? access.allowedBusinessIds[0]
        : { $in: access.allowedBusinessIds };
    }
  }
  if (ref === 'business' && access.isRestricted) {
    filter._id = { $in: access.allowedBusinessIds };
  }
  if (ref === 'companylocations' && access.isRestricted && !forTransferDestination) {
    filter._id = { $in: access.allowedLocationIds };
  }
  if (entry.locationScoped) {
    const l = sp.get('location');
    if (l && isValidObjectId(l)) {
      filter.$and = [...(filter.$and || []), { $or: [{ locationId: l }, { locationId: null }] }];
    } else if (access.isRestricted) {
      filter.$and = [...(filter.$and || []), { $or: [{ locationId: { $in: access.allowedLocationIds } }, { locationId: null }] }];
    }
  }
  if (entry.parentField && entry.parentParam) {
    const parentId = sp.get(entry.parentParam);
    if (parentId) {
      if (!isValidObjectId(parentId)) return json({ error: 'Invalid parent selection' }, 400);
      filter[entry.parentField] = parentId;
    }
  }
  /* a picker narrowed to one CITY - see cityFields on the supplier ref.
     Case-insensitive and tolerant of stray spaces, because the city on a
     contact was typed by hand. */


      if (entry.parentGroupParam) {
    const parentGroupId = sp.get(entry.parentGroupParam);
    if (parentGroupId) {
      if (!isValidObjectId(parentGroupId)) return json({ error: 'Invalid parent selection' }, 400);
      const ProductGroup = (await import('@/models/ProductGroup')).default;
      const childFilter = { parentId: parentGroupId };
      if (filter.businessId) childFilter.businessId = filter.businessId;
      const childIds = await ProductGroup.distinct('_id', childFilter);
      filter.subGroupId = { $in: [parentGroupId, ...childIds] };
    }
  }

  if (entry.cityFields) {
    const city = (sp.get('city') || '').trim();
    if (city) {
      const rx = { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' };
      (filter.$and ||= []).push({ $or: entry.cityFields.map((f) => ({ [f]: rx })) });
    }
  }
  /* An agent is related to a city through the suppliers assigned to that
     agent, not through the agent's own address fields. */
  if (entry.cityViaSupplier) {
    const city = (sp.get('city') || '').trim();
    if (city) {
      const { Supplier } = await import('@/lib/contacts');
      const supplierFilter = {
        contactKind: 'Supplier',
        $or: ['billingCity', 'shippingCity'].map((field) => ({
          [field]: { $regex: '^\\s*' + escapeRegex(city) + '\\s*$', $options: 'i' },
        })),
      };
      if (filter.businessId) supplierFilter.businessId = filter.businessId;
      const suppliers = await Supplier.find(supplierFilter).select('agentId').lean();
      filter._id = { $in: [...new Set(suppliers.map((supplier) => supplier.agentId).filter(Boolean).map(String))] };
    }
  }
  if (entry.kind) filter.contactKind = entry.kind;
  /* a ref can narrow its own pool - see 'delivery-unassigned' */
  if (entry.where) Object.assign(filter, entry.where);
 
  /* typing in the control narrows server-side - the old endpoint pulled up to
     2000 rows and filtered in the browser, which does not survive 56k customers */
  const q = (sp.get('q') || '').trim();
  if (q) {
    const rx = { $regex: escapeRegex(q), $options: 'i' };
    if (entry.nameFallback || entry.codeField) {
      /* Search the label, the fallback name fields AND the code.

         The fallbacks matter because businessName is empty on a contact
         entered as a person - typing "DIRECT" found nothing for them. The
         code matters because the business identifies a vendor by its G-code
         as often as by its name: typing "G524" must find the same supplier
         as typing "KARNATAKA".

         Wrapped in $and so it cannot collide with a ref that already uses
         $or in its own `where`. */
      (filter.$and ||= []).push({
        $or: [
          { [label]: rx },
          ...(entry.nameFallback || []).map((f) => ({ [f]: rx })),
          ...(entry.codeField ? [{ [entry.codeField]: rx }] : []),
        ],
      });
    } else {
      filter[label] = rx;
    }
  }
  
  /* Ensure SUPPLIER DESCRIPTION is always excluded */
  if (ref === 'attribute-addon') {
    (filter.$and ||= []).push({ name: { $nin: ['SUPPLIER DESCRIPTION', 'Supplier Description', 'supplier description'] } });
  }
 
  /* the default row sorts first, so it survives the 200-row cap */
  const sort = ref === 'supplier'
    ? { createdAt: -1, [label]: 1 }
    : entry.valueField
    ? { [label]: 1 }
    : entry.defaultField
    ? { [entry.defaultField]: -1, [label]: 1 }
    : { [label]: 1 };
 
  const rowsQuery = Model.find(filter).sort(sort);
  if (!entry.includeAll) rowsQuery.limit(200);
  const rows = await rowsQuery.lean();

  /* label, or the fallback name fields, or "(untitled)" - see nameFallback */
  const textOf = (r) => {
    if (ref === 'uom') {
      return [r[label], r.shortName].map((value) => String(value || '').trim()).filter(Boolean).join(' / ');
    }
    const primary = String(r[label] ?? '').trim();
    if (primary) return primary;
    const alt = (entry.nameFallback || [])
      .map((f) => String(r[f] ?? '').trim())
      .filter(Boolean)
      .join(' ');
    return alt || '(untitled)';
  };

  /* "KARNATAKA Saree Centre, MYSORE (G524)".

     The code is appended for DISPLAY only - `value` stays the ObjectId, so
     what gets stored is the reference and never the formatted text. A
     supplier without a code simply shows its name. */
  const labelOf = (r) => {
    const name = textOf(r);
    const code = entry.codeField ? String(r[entry.codeField] ?? '').trim() : '';
    return code ? name + ' (' + code + ')' : name;
  };

  /* Contact Type rows carry a `contactType` kind (Customer/Supplier/Agent);
     the customer-kind display aliases live in lib/contactTypeLabels.js so the
     stored name - and the contact-code prefix derived from it - stays intact. */
  const isContactTypeRef = ref.startsWith('contact-type');
  const displayName = (r, text) =>
    isContactTypeRef ? contactTypeDisplayName(text, r.contactType) : text;

  return json({
    options: rows.map((r) => ({
      value: String(entry.valueField ? r[entry.valueField] : r._id),
      label: displayName(r, labelOf(r)),
      /* the parts, unformatted, for a caller that needs them on their own -
         kept as the stored name so programmatic matching still works */
      name: textOf(r),
      ...(entry.codeField ? { code: String(r[entry.codeField] ?? '') } : {}),
      ...(entry.codeField === 'contactId' ? { gstNo: String(r.gstNo ?? '') } : {}),
        ...(ref === 'citygroup' ? { cities: Array.isArray(r.cities) ? r.cities : [] } : {}),
      ...(entry.defaultField && r[entry.defaultField] ? { isDefault: true } : {}),
      /* which location the row belongs to ('' = shared by the whole
         business), so a form can pick the row bound to the header LOCATION */
      ...(entry.locationScoped ? { locationId: r.locationId ? String(r.locationId) : '' } : {}),
      ...(isContactTypeRef ? {
        loyaltySchemeId: r.loyaltySchemeId ? String(r.loyaltySchemeId) : '',
        loyaltyPointsApplicable: Boolean(r.loyaltySchemeId),
      } : {}),
    })),
  });
}
 
 
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}