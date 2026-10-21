import mongoose from 'mongoose';

/* City Groups
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'groupName';

const CityGroupSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    groupName: { type: String, default: '' },
    cities: { type: [String], default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.cityGroup ||
  mongoose.model('cityGroup', CityGroupSchema, 'citygroup');
