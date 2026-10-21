import mongoose from 'mongoose';

/* Product Filters
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const ProductFilterSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    description: { type: String, default: '' },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'productFilter', default: null },
  },
  { timestamps: true }
);

export default mongoose.models.productFilter ||
  mongoose.model('productFilter', ProductFilterSchema, 'productfilter');
