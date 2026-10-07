import mongoose from 'mongoose';

/* Purchase Groups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'purchaseGroup';

const PurchaseGroupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    purchaseGroup: { type: String, default: '' },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export default mongoose.models.purchaseGroup ||
  mongoose.model('purchaseGroup', PurchaseGroupSchema, 'purchasegroup');
