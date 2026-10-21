import mongoose from 'mongoose';

/* E-commerce Settings
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const EcomSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    markupType: { type: String, default: "Fixed" },
    markupValue: { type: Number, default: 0 },
    billGenerationBasedOn: { type: String, default: "Location" },
    cod: { type: String, default: "Yes" },
    codProcessingCharge: { type: Number, default: 0 },
    shippingChargeType: { type: String, default: "Fixed" },
    shippingFee: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export default mongoose.models.ecomSetting ||
  mongoose.model('ecomSetting', EcomSettingSchema, 'ecomsetting');
