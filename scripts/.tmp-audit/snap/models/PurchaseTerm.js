import mongoose from 'mongoose';

/* All Purchase Term Masters
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const PurchaseTermSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.purchaseTerm ||
  mongoose.model('purchaseTerm', PurchaseTermSchema, 'purchaseterm');
