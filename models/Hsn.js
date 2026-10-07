import mongoose from 'mongoose';

/* HSN Codes
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'code';

const HsnSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    code: { type: String, default: '' },
    status: { type: String, default: "Active" },
    effectiveDate: { type: Date, default: null },
    description: { type: String, default: '' },
    taxSlabs: {
      type: [new mongoose.Schema({
      gstTaxNameId: { type: mongoose.Schema.Types.ObjectId, ref: 'tax', default: null },
      amountFrom: { type: Number, default: null },
      amountTo: { type: Number, default: null },
      }, { _id: false })],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.models.hsn ||
  mongoose.model('hsn', HsnSchema, 'hsn');
