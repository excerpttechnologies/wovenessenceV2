import mongoose from 'mongoose';

/* Ledgers
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const LedgerSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    ledgerGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledgerGroup', default: null },
    isActive: { type: String, default: "Active" },
    isDefault: { type: String, default: "No" },
    openingBalance: { type: Number, default: 0 },
    gstNo: { type: String, default: '' },
    addressLine1: { type: String, default: '' },
    addressLine2: { type: String, default: '' },
    addressLine3: { type: String, default: '' },
    zipCode: { type: String, default: '' },
    mobile: { type: String, default: '' },
    alternateContactNumber: { type: String, default: '' },
    landline: { type: String, default: '' },
    fax: { type: String, default: '' },
    email: { type: String, default: '' },
    email2: { type: String, default: '' },
    websiteUrl: { type: String, default: '' },
    city: { type: String, default: '' },
    state: { type: String, default: '' },
    country: { type: String, default: '' },
    contactPerson: { type: String, default: '' },
    contactPersonMobile: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.ledger ||
  mongoose.model('ledger', LedgerSchema, 'ledger');
