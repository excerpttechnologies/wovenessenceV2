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
  },
  { timestamps: true }
);

export default mongoose.models.companyLocation ||
  mongoose.model('companyLocation', CompanyLocationSchema, 'companylocation');
