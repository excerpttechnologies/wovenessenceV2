import mongoose from 'mongoose';

/* Credit Notes
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'creditNoteCode';

const CreditNoteSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    customerId: { type: mongoose.Schema.Types.ObjectId, default: null },
    creditNoteCode: { type: String, default: '' },
    totalQty: { type: Number, default: 0 },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.creditNote ||
  mongoose.model('creditNote', CreditNoteSchema, 'creditnote');
