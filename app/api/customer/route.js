// import { isValidObjectId } from 'mongoose';
// import dbConnect from '@/lib/db';
// import { Customer } from '@/lib/contacts';
// import { requireSession } from '@/lib/session';
// import { resolveRefLabels } from '@/lib/refLabels';
// import { validate, escapeRegex } from '@/lib/validate';
// import { TABS } from '@/app/admin/contact/customer/tabs';

// import ContactType from '@/models/ContactType';
// import { nextContactId } from '@/lib/contactId';

// const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
//   ...(s.fields || []),
//   ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
// ]));

// /* /api/customer - list + create. */

// const json = (d, s = 200) => Response.json(d, {
//   status: s,
//   headers: { 'Cache-Control': 'no-store' },
// });
// const PER_PAGE = 10;
// /* The POS quick-add contract. Anything not named here is dropped on save, so
//    this list has to stay in step with the dialog in components/PosTill.jsx -
//    a field the form offers but this omits saves silently as blank.

//    Widened to cover the whole Basic Information tab of the full customer form
//    (short name, DOB, gender, and the complete billing block) because the till's
//    dialog now mirrors that layout. Still deliberately excludes the Sales and
//    Financial tabs and the shipping block - the counter does not collect them. */
// const QUICK_FIELDS = FIELDS.filter((field) => [
//   'typeId', 'businessType', 'gstNo', 'businessName', 'shortName',
//   'prefix', 'firstName', 'middleName', 'lastName', 'dob', 'gender',
//   'billingAddressLine1', 'billingAddressLine2', 'billingCity', 'billingState',
//   'billingCountry', 'billingDistrict', 'billingTaluk', 'billingZipCode',
//   'billingMobile', 'billingAlternateContactNumber', 'billingLandline', 'billingFax',
//   'billingEmail', 'billingEmail2', 'billingWebsiteUrl',
//   'additionalDetails',
// ].includes(field.k));

// export async function GET(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const sp = new URL(req.url).searchParams;
//   await dbConnect();

//   const page = Math.max(1, Number(sp.get('page') || 1));
//   const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
//   const search = (sp.get('search') || '').trim();

//   const filter = {};
//   const b = sp.get('business'); if (b && isValidObjectId(b)) filter.businessId = b;
//   /* pinned server-side so the discriminator can't be spoofed */
//   filter.contactKind = 'Customer';

//   if (search) {
//     const rx = { $regex: escapeRegex(search), $options: 'i' };
//     filter.$or = [{ gstNo: rx }, { businessName: rx }, { shortName: rx }, { firstName: rx }, { middleName: rx }, { lastName: rx }, { userName: rx }, { billingAddressLine1: rx }, { billingMobile: rx }, { billingAlternateContactNumber: rx }];
//   }

//   const total = await Customer.countDocuments(filter);
//   const rows = await Customer.find(filter)
//     .sort({ createdAt: -1 })
//     .skip((page - 1) * perPage)
//     .limit(perPage)
//     .lean();

//   return json({
//     rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
//     labels: await resolveRefLabels(rows),
//     total,
//     page,
//     pages: Math.max(1, Math.ceil(total / perPage)),
//     perPage,
//   });
// }

// export async function POST(req) {
//   const session = await requireSession();
//   if (!session) return json({ error: 'Unauthorized' }, 401);

//   const body = await req.json();
//   await dbConnect();

//   /* POS quick-add deliberately omits the full customer page's sales and
//      ledger tabs. Keep that smaller contract explicit instead of making those
//      fields optional for every customer submission. */
//   const fields = body.quick ? QUICK_FIELDS : FIELDS;
//   const quickData = body.quick
//     ? { priceList: 'ON RSP', openingBalance: 0, ...(body.data || {}) }
//     : body.data || {};
//   const { errors, doc, ok } = validate(fields, quickData);
//   if (!ok) return json({ errors }, 422);
//   if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

//   /* stamped here, never taken from the client */
//   doc.contactKind = 'Customer';
//   doc.contactId = await nextContactId(ContactType, doc.typeId);

//   const created = await Customer.create(doc);
//   return json({
//     ok: true,
//     id: String(created._id),
//     customer: {
//       _id: String(created._id),
//       businessId: created.businessId ? String(created.businessId) : '',
//       contactKind: created.contactKind,
//       contactId: created.contactId,
//       businessName: created.businessName || '',
//       firstName: created.firstName || '',
//       lastName: created.lastName || '',
//       billingMobile: created.billingMobile || '',
//     },
//   });
// }




//sagar


import { isValidObjectId } from 'mongoose';
import dbConnect from '@/lib/db';
import Contact from '@/models/Contact';
import { requireSession } from '@/lib/session';
import { resolveRefLabels } from '@/lib/refLabels';
import { validate, escapeRegex } from '@/lib/validate';
import { TABS } from '@/app/admin/contact/customer/tabs';

import ContactType from '@/models/ContactType';
import { ROLES } from '@/models/User';
import { nextContactId } from '@/lib/contactId';
import { screenDenial, SCREENS, ACTIONS as PERM } from '@/lib/screenPermission';
import { resolveAuthorizedScope, scopeErrorResponse } from '@/lib/locationAccess';
import { sortedPage } from '@/lib/listSort';
import { validateCustomerLoyaltySettings } from '@/lib/loyalty';

const CUSTOMER = { screen: SCREENS.CUSTOMER, label: 'customers' };

const FIELDS = TABS.flatMap((t) => (t.sections || []).flatMap((s) => [
  ...(s.fields || []),
  ...(s.toggle ? [{ k: s.toggle.k, label: s.toggle.label, type: 'checkbox' }] : []),
]));

/* /api/customer - list + create. */

const json = (d, s = 200) => Response.json(d, {
  status: s,
  headers: { 'Cache-Control': 'no-store' },
});
const PER_PAGE = 10;
/* The POS quick-add contract. Anything not named here is dropped on save, so
   this list has to stay in step with the dialog in components/PosTill.jsx -
   a field the form offers but this omits saves silently as blank.

   Widened to cover the whole Basic Information tab of the full customer form
   (short name, DOB, gender, and the complete billing block) because the till's
   dialog now mirrors that layout. Still deliberately excludes the Sales and
   Financial tabs and the shipping block - the counter does not collect them. */
const QUICK_FIELDS = FIELDS.filter((field) => [
  'typeId', 'businessType', 'gstNo', 'businessName', 'shortName',
  'prefix', 'firstName', 'middleName', 'lastName', 'dob', 'gender',
  'billingAddressLine1', 'billingAddressLine2', 'billingCity', 'billingState',
  'billingCountry', 'billingDistrict', 'billingTaluk', 'billingZipCode',
  'billingMobile', 'billingAlternateContactNumber', 'billingLandline', 'billingFax',
  'billingEmail', 'billingEmail2', 'billingWebsiteUrl',
  'additionalDetails',
].includes(field.k));

export async function GET(req) {
  const session = await requireSession();
  if (!session) return json({ error: 'Unauthorized' }, 401);

  const sp = new URL(req.url).searchParams;
  await dbConnect();

  const page = Math.max(1, Number(sp.get('page') || 1));
  const perPage = Math.min(500, Number(sp.get('perPage') || PER_PAGE));
  const search = (sp.get('search') || '').trim();

  const scope = await resolveAuthorizedScope(session, { businessId: sp.get('business') });
  if (!scope.ok) return scopeErrorResponse(scope);

  /* Only refuses when this role has a saved permission matrix that withholds
     it - see lib/screenPermission.js. */
  const denied = await screenDenial({
    session, ...CUSTOMER, action: PERM.READ, businessId: scope.businessId || sp.get('business'),
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const filter = {};
  if (scope.businessFilter) filter.businessId = scope.businessFilter;
  /* pinned server-side so the discriminator can't be spoofed */
  filter.contactKind = 'Customer';

  if (search) {
    const rx = { $regex: escapeRegex(search), $options: 'i' };
    filter.$or = [{ gstNo: rx }, { businessName: rx }, { shortName: rx }, { firstName: rx }, { middleName: rx }, { lastName: rx }, { userName: rx }, { billingAddressLine1: rx }, { billingMobile: rx }, { billingAlternateContactNumber: rx }];
  }

  const total = await Contact.countDocuments(filter);
  /* column-header sort (lib/listSort.js); without ?sortBy= the query
     below runs exactly as before */
  const rows = (await sortedPage(Contact, filter, sp, {
    page,
    perPage,
    keys: ['businessName', 'contactId', 'firstName', 'billingMobile', 'billingEmail', 'billingAddressLine1'],
  })) ?? await Contact.find(filter)
    .sort({ createdAt: -1 })
    .skip((page - 1) * perPage)
    .limit(perPage)
    .lean();

  return json({
    rows: rows.map((r) => ({ ...r, _id: String(r._id) })),
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

  /* POS quick-add deliberately omits the full customer page's sales and
     ledger tabs. Keep that smaller contract explicit instead of making those
     fields optional for every customer submission. */
  /* ALSO COVERS THE TILL'S QUICK-ADD (body.quick). Creating a customer is
     creating a customer wherever the form lives, so the permission that
     governs it is Customers > Create - a counter that should be able to add a
     walk-in needs that ticked for its role. Gating quick-add on the POS screen
     instead would give one question two answers.

     Asked before the fields are validated: a request that is not allowed to
     happen should be refused as not allowed. */
  const scope = await resolveAuthorizedScope(session, { businessId: body.business });
  if (!scope.ok) return scopeErrorResponse(scope);

  const denied = await screenDenial({
    session, ...CUSTOMER, action: PERM.CREATE, businessId: scope.businessId || body.business,
  });
  if (denied) return json({ error: denied.message, code: denied.code }, 403);

  const fields = body.quick ? QUICK_FIELDS : FIELDS;
  const quickData = body.quick
    ? { priceList: 'ON RSP', openingBalance: 0, ...(body.data || {}) }
    : body.data || {};
  const { errors, doc, ok } = validate(fields, quickData);
  if (!ok) return json({ errors }, 422);
  if (scope.businessId) doc.businessId = scope.businessId;
  else if (body.business && isValidObjectId(body.business)) doc.businessId = body.business;

  /* stamped here, never taken from the client */
  doc.contactKind = 'Customer';

  /* A Cashier sells to walk-in POS customers only, so the only type they may
     file under is this business's POS CUSTOMER contact type. The till locks
     its Type box for the same reason, but a hand-edited request must not be
     able to create B2B SALES or E-COMM customers - this check is the one
     that counts. Every other role keeps the existing behaviour. */
  if (String(session.role || '').trim() === ROLES.CASHIER) {
    const typeBusinessId = scope.businessId
      || (body.business && isValidObjectId(body.business) ? String(body.business) : '');
    const posTypes = await ContactType.find({
      contactType: 'Customer',
      name: { $regex: '^\\s*pos\\b', $options: 'i' },
      ...(typeBusinessId ? { businessId: typeBusinessId } : {}),
    }).select('_id name').lean();
    /* "POS CUSTOMER" exactly, when the business has one, wins over any other
       type that merely starts with POS. */
    const posType = posTypes.find((t) => /^\s*pos\s*customer\s*$/i.test(String(t.name || '')))
      || posTypes[0];
    if (!posType || String(doc.typeId || '') !== String(posType._id)) {
      return json({
        error: 'Cashier accounts can only create POS Customer records.',
        code: 'CASHIER_POS_CUSTOMER_ONLY',
        errors: { typeId: 'Cashier accounts can only create POS Customer records.' },
      }, 403);
    }
  }

  if (body.quick) {
    doc.loyaltyPointsApplicable = '';
    doc.loyaltyPointSchemeId = null;
  } else {
    const loyaltyCheck = await validateCustomerLoyaltySettings({
      businessId: doc.businessId || body.business,
      loyaltyPointsApplicable: doc.loyaltyPointsApplicable,
      loyaltyPointSchemeId: doc.loyaltyPointSchemeId,
    });
    if (!loyaltyCheck.ok) {
      return json({ errors: { loyaltyPointSchemeId: loyaltyCheck.error } }, 422);
    }
    doc.loyaltyPointsApplicable = loyaltyCheck.loyaltyPointsApplicable;
    doc.loyaltyPointSchemeId = loyaltyCheck.loyaltyPointSchemeId;
  }

  const mobile = String(doc.billingMobile || '').trim();
  if (mobile) {
    const dupFilter = { contactKind: 'Customer', billingMobile: mobile };
    if (doc.businessId) dupFilter.businessId = doc.businessId;
    const existingCustomer = await Contact.findOne(dupFilter)
      .select('_id businessId typeId contactKind contactId businessName firstName middleName lastName billingMobile')
      .lean();
    if (existingCustomer) {
      return json({
        error: 'A customer with this mobile number already exists.',
        code: 'CUSTOMER_ALREADY_EXISTS',
        errors: { billingMobile: 'A customer with this mobile number already exists.' },
        existingCustomer: {
          ...existingCustomer,
          _id: String(existingCustomer._id),
          businessId: existingCustomer.businessId ? String(existingCustomer.businessId) : '',
          typeId: existingCustomer.typeId ? String(existingCustomer.typeId) : '',
        },
      }, 409);
    }
  }

  /* Two arguments, not three. nextContactId(ContactType, typeId) takes the
     Contact Type model and the chosen type's id; the extra Contact model this
     used to pass landed in the typeId slot, and a Mongoose model is a
     function, so findById() read it as a callback and threw. Suppliers and
     agents have always called it this way. */
  doc.contactId = await nextContactId(ContactType, doc.typeId);

  const created = await Contact.create(doc);
  return json({
    ok: true,
    id: String(created._id),
    customer: {
      _id: String(created._id),
      businessId: created.businessId ? String(created.businessId) : '',
      typeId: created.typeId ? String(created.typeId) : '',
      contactKind: created.contactKind,
      contactId: created.contactId,
      businessName: created.businessName || '',
      firstName: created.firstName || '',
      lastName: created.lastName || '',
      billingMobile: created.billingMobile || '',
    },
  });
}
