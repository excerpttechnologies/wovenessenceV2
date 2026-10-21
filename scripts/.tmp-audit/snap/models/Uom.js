import mongoose from 'mongoose';

/* Unit of Measurements
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const UomSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    name: { type: String, default: '' },
    shortName: { type: String, default: '' },
    allowDecimal: { type: String, default: '' },
    defaultValue: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.uom ||
  mongoose.model('uom', UomSchema, 'uom');
