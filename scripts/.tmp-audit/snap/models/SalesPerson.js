import mongoose from 'mongoose';

/* Sales Persons - the Staff Management master behind
   /admin/staff-management/staff/salesperson.

   Deliberately its own collection rather than another `contactKind` on
   models/Contact.js. A sales person is staff, not a party you trade with:
   nothing here has a GST number, a billing address, a ledger or an opening
   balance, and a contactKind row would carry all of that unused.

   NOTE for whoever wires attribution later: the `salesPersonId` already
   stamped on Delivery Challan / Sales Invoice / IC documents resolves through
   lib/refLabels.js to models/Contact.js, NOT to this model. Those existing
   documents point at a Contact. Repointing them is a data migration and a
   refLabels change, so it is left alone here - this master stands on its own
   until that call is made.

   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const SalesPersonSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    email: { type: String, default: '' },
    spCode: { type: String, default: '', index: true },
    isDefault: { type: String, default: 'No' },
    status: { type: String, default: 'Active' },
  },
  { timestamps: true }
);

const SalesPerson = mongoose.models.salesPerson ||
  mongoose.model('salesPerson', SalesPersonSchema, 'salesperson');

export default SalesPerson;

/* Drops the Default flag on every OTHER sales person in the same business,
   so "Default" stays single-valued however the row was created.

   Lives here rather than in the route because a Next.js `route.js` may only
   export HTTP handlers - any other export fails the build - and both the
   create and the update route need it. */
export async function clearOtherDefaults(saved) {
  await SalesPerson.updateMany(
    { _id: { $ne: saved._id }, businessId: saved.businessId ?? null },
    { $set: { isDefault: 'No' } }
  );
}
