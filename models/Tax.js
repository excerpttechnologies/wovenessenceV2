import mongoose from 'mongoose';

/* All Tax
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'taxName';

const TaxSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    taxName: { type: String, default: '' },
    status: { type: String, default: "Active" },
    igstLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    cgstLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    sgstLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    cessLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    igst: { type: Number, default: null },
    cgst: { type: Number, default: null },
    sgst: { type: Number, default: null },
    cess: { type: Number, default: null },
    note: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.tax ||
  mongoose.model('tax', TaxSchema, 'tax');
