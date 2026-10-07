import mongoose from 'mongoose';

/* Product Groups
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const ProductGroupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    prefix: { type: String, default: '' },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'productGroup', default: null },
  },
  { timestamps: true }
);

export default mongoose.models.productGroup ||
  mongoose.model('productGroup', ProductGroupSchema, 'productgroup');
