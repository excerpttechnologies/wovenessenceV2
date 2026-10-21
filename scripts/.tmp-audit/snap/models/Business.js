// import mongoose from 'mongoose';

// /* Business
//    Collection name is pinned lowercase: Mongoose would pluralise it
//    otherwise, and MongoDB collection names are case-sensitive. */

// export const LABEL_FIELD = 'name';

// const BusinessSchema = new mongoose.Schema(
//   {
//     name: { type: String, default: '' },
//     businessPrintName: { type: String, default: '' },
//     landmark: { type: String, default: '' },
//     city: { type: String, default: '' },
//     state: { type: String, default: '' },
//     country: { type: String, default: '' },
//     zipCode: { type: String, default: '' },
//     addressLine1: { type: String, default: '' },
//     addressLine2: { type: String, default: '' },
//     mobile: { type: String, default: '' },
//     alternateContactNumber: { type: String, default: '' },
//     email: { type: String, default: '' },
//     websiteUrl: { type: String, default: '' },
//     gstin: { type: String, default: '' },
//     isActive: { type: String, default: "Active" },
//     currency: { type: String, default: '' },
//     timezone: { type: String, default: '' },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.business ||
//   mongoose.model('business', BusinessSchema, 'business');




import mongoose from 'mongoose';

/* Business
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const BusinessSchema = new mongoose.Schema(
  {
    name: { type: String, default: '' },
    businessPrintName: { type: String, default: '' },
    landmark: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    mobile: { type: String, default: '' },
    alternateContactNumber: { type: String, default: '' },
    email: { type: String, default: '' },
    websiteUrl: { type: String, default: '' },
    gstin: { type: String, default: '' },
    isActive: { type: String, default: "Active" },
    currency: { type: String, default: '' },
    timezone: { type: String, default: '' },

    /* Branch hierarchy.

       Exactly one business is the main store - the one scripts/seed.mjs
       creates. Every business added through the UI is a sub-branch hanging
       off it. The flag is deliberately NOT part of the add/edit form's
       FIELDS list, so validate() can never carry it in from a request body:
       it is set by the seed and by the create route, never by the client.

       Identity lives in this flag rather than in the name, so renaming the
       main store doesn't demote it. */
    isMainBranch: { type: Boolean, default: false, index: true },
    parentBusinessId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'business',
      default: null,
      index: true,
    },
  },
  { timestamps: true }
);

export default mongoose.models.business ||
  mongoose.model('business', BusinessSchema, 'business');