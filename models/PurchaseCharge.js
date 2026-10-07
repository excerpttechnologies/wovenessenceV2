import mongoose from 'mongoose';

/* All Purchase Charge Master
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'chargeName';

const PurchaseChargeSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    chargeName: { type: String, default: '' },
    chargeType: { type: String, default: '' },
    status: { type: String, default: "Active" },
    gstPosition: { type: String, default: '' },
    purchaseChargeLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
  },
  { timestamps: true }
);

export default mongoose.models.purchaseCharge ||
  mongoose.model('purchaseCharge', PurchaseChargeSchema, 'purchasecharge');
