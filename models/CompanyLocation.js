// import mongoose from 'mongoose';

// /* Company Locations
//    Collection name is pinned lowercase: Mongoose would pluralise it
//    otherwise, and MongoDB collection names are case-sensitive. */

// export const LABEL_FIELD = 'name';

// const CompanyLocationSchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
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
//     termsAndConditions: { type: String, default: '' },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.companyLocation ||
//   mongoose.model('companyLocation', CompanyLocationSchema, 'companylocation');


//sagar 


import mongoose from 'mongoose';

/* Company Locations
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const CompanyLocationSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
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
    termsAndConditions: { type: String, default: '' },

    /* The mediating location for Inter Company Sell.

       Goods moving between two child branches route through the main
       branch, and this flag says WHICH of its locations receives them -
       the warehouse rather than a shop floor. A flag rather than a name
       match, so renaming the warehouse cannot silently break routing.

       Only meaningful on a location whose business is the main branch. */
    /* 'Yes' / 'No' rather than a Boolean: the form posts radio strings and
       lib/validate.js passes them through as text, the same way
       PaymentMethod.isActive and PosCounter.status already work. */
    isMediator: { type: String, default: 'No', index: true },
  },
  { timestamps: true }
);

export default mongoose.models.companyLocation ||
  mongoose.model('companyLocation', CompanyLocationSchema, 'companylocation');
