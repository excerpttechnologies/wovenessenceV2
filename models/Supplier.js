import mongoose from 'mongoose';
import { buildContactSchema, COLLECTION_BY_KIND, LABEL_FIELD } from './contactSchema.js';

/* Suppliers - their own collection, `supplier`.

   Moved out of the shared `contact` collection with their original _id
   (scripts/migrateContactsToSeparateCollections.mjs), so every supplierId on a
   GRC, a delivery, a purchase invoice or a barcode row still resolves here. */

export { LABEL_FIELD };

const SupplierSchema = buildContactSchema({ kind: 'Supplier' });

/* One supplier per GST NO within a business.

   Partial: only suppliers that actually carry a GST number are indexed - most
   have none. Collation strength 2 makes the comparison case-blind, so a legacy
   row stored in lower case still blocks the same number in capitals. The
   supplier API normalises (trim + upper case) and checks before every write;
   this index is what stops two saves racing each other from both landing.
   lib/supplierGst.js queries with the same collation.

   The same rule the `contact` collection enforced, minus its
   `contactKind: 'Supplier'` condition - every record in this collection is a
   supplier. The name is unchanged, because lib/supplierGst.js recognises a
   refusal by it. */
export const SUPPLIER_GST_INDEX = {
  key: { businessId: 1, gstNo: 1 },
  options: {
    name: 'supplier_gstNo_unique',
    unique: true,
    partialFilterExpression: { gstNo: { $gt: '' } },
    collation: { locale: 'en', strength: 2 },
  },
};
SupplierSchema.index(SUPPLIER_GST_INDEX.key, SUPPLIER_GST_INDEX.options);

export const SUPPLIER_COLLECTION = COLLECTION_BY_KIND.Supplier;

export default mongoose.models.supplier ||
  mongoose.model('supplier', SupplierSchema, SUPPLIER_COLLECTION);
