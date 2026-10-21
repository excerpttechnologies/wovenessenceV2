import mongoose from 'mongoose';

/* Stock Points
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'stockPoint';

const StockPointSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    stockPoint: { type: String, default: '' },
    type: { type: String, default: '' },
    status: { type: String, default: "Active" },
    parentId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    description: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.stockPoint ||
  mongoose.model('stockPoint', StockPointSchema, 'stockpoint');
