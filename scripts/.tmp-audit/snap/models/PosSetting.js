import mongoose from 'mongoose';

/* POS Setting
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const PosSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    rspPriceEditable: { type: String, default: "Disable" },
    discountPriority: { type: String, default: "Global" },
    discountType: { type: String, default: "Percentage" },
    discountValue: { type: Number, default: 0 },
    slNoOnPosScreen: { type: String, default: "Hide" },
    itemColumnOnPosScreen: { type: String, default: "Both" },
  },
  { timestamps: true }
);

export default mongoose.models.posSetting ||
  mongoose.model('posSetting', PosSettingSchema, 'possetting');
