/* Supplier GST uniqueness - the server side.

   Server-only: it queries the supplier collection (lib/contacts.js). The client-safe half -
   normalising a GSTIN, the format rule, the messages - is lib/gstin.js, and
   this uses it, so the form and the API cannot disagree about what "the same
   GST number" means.

   THE RULE
   One supplier per GSTIN within a business. Scoped by business because that
   is how POST /api/supplier has always scoped it (each business keeps its own
   supplier master). Customers and agents are not bound by it. The unique index
   in models/Supplier.js enforces the same thing in the database, so two saves
   racing each other cannot both win. */

import { isValidObjectId } from 'mongoose';
import { Supplier } from '@/lib/contacts';
import { SUPPLIER_GST_INDEX } from '@/models/Supplier';
import { normalizeGstin, GSTIN_DUPLICATE_MESSAGE } from '@/lib/gstin';

/* the index's own collation, so a lookup matches exactly what the index would
   refuse - a legacy row stored in lower case included */
const COLLATION = SUPPLIER_GST_INDEX.options.collation;

/* Another supplier already holding this GSTIN, or null.

   businessId - a valid id scopes the search to that business; anything else
                searches every business, the stricter answer when the scope
                is not known.
   excludeId  - the supplier being edited. Its own number is never its own
                duplicate. */
export async function findSupplierGstConflict({ gstNo, businessId, excludeId }) {
  const gst = normalizeGstin(gstNo);
  if (!gst) return null;
  const filter = { contactKind: 'Supplier', gstNo: gst };
  if (businessId && isValidObjectId(businessId)) filter.businessId = businessId;
  if (excludeId && isValidObjectId(excludeId)) filter._id = { $ne: excludeId };
  return Supplier.findOne(filter, { businessName: 1, shortName: 1, contactId: 1 })
    .collation(COLLATION)
    .lean();
}

/* What a screen may show about the supplier holding the number: the name and
   code the supplier list already displays, nothing more. */
export function supplierSummary(doc) {
  if (!doc) return null;
  return {
    id: String(doc._id),
    name: doc.businessName || doc.shortName || '',
    contactId: doc.contactId || '',
  };
}

/* 409 in the shape lib/apiError.js gives a conflict ({ error, code, field }),
   plus errors.gstNo so a form that highlights fields can highlight this one. */
export function gstConflictResponse(conflict) {
  return Response.json({
    error: GSTIN_DUPLICATE_MESSAGE,
    code: 'DUPLICATE_GST',
    field: 'gstNo',
    errors: { gstNo: GSTIN_DUPLICATE_MESSAGE },
    supplier: supplierSummary(conflict),
  }, { status: 409 });
}

/* The unique index refused the write: the pre-check passed, and another save
   claimed the number in the moment between. */
export function isSupplierGstKeyError(err) {
  if (err?.code !== 11000) return false;
  return err.keyPattern?.gstNo !== undefined
    || String(err.message || '').includes(SUPPLIER_GST_INDEX.options.name);
}
