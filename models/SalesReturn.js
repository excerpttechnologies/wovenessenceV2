import mongoose from 'mongoose';

/* Sales Returns
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'salesReturnNo';

const SalesReturnSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'customer', default: null },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    returnDate: { type: Date, default: null },
    salesReturnNo: { type: String, default: '' },
    /* set when this document is converted downstream; null = still available */
    creditNoteId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /* Same attribution rule as a sale (lib/salesChannel.js): only
       "instagram" is stored, everything else - including every legacy
       document - is an offline store return. */
    salesChannel: {
      type: String,
      enum: ['', 'instagram'],
      default: '',
      index: true,
    },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

/* Return dates can be null on legacy rows; createdAt is the fallback. */
SalesReturnSchema.index({ businessId: 1, returnDate: 1 });
SalesReturnSchema.index({ businessId: 1, locationId: 1, returnDate: 1 });

export default mongoose.models.salesReturn ||
  mongoose.model('salesReturn', SalesReturnSchema, 'salesreturn');
