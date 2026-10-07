import mongoose from 'mongoose';

/* Location Setting
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const LocationSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    taxBasis: { type: String, default: "Inclusive" },
    posDuplicateScan: { type: String, default: "No" },
  },
  { timestamps: true }
);

export default mongoose.models.locationSetting ||
  mongoose.model('locationSetting', LocationSettingSchema, 'locationsetting');
