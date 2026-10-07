import mongoose from 'mongoose';

/* All Sales Term Master
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const SalesTermSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.salesTerm ||
  mongoose.model('salesTerm', SalesTermSchema, 'salesterm');
