import mongoose from 'mongoose';
import { buildContactSchema, COLLECTION_BY_KIND, LABEL_FIELD } from './contactSchema.js';

/* Customers - their own collection, `customer`.

   Moved out of the shared `contact` collection with their original _id
   (scripts/migrateContactsToSeparateCollections.mjs), so every customerId on a
   POS bill, a sales invoice or a return still resolves here.

   NOT the `customers` collection: that one already exists and holds the
   e-commerce storefront's shopper accounts (Google sign-in, a unique index on
   email). ERP customers are billing parties, not storefront logins, and the
   two are kept apart. */

export { LABEL_FIELD };

const CustomerSchema = buildContactSchema({ kind: 'Customer' });

export const CUSTOMER_COLLECTION = COLLECTION_BY_KIND.Customer;

export default mongoose.models.customer ||
  mongoose.model('customer', CustomerSchema, CUSTOMER_COLLECTION);
