import mongoose from 'mongoose';

/* Payment Methods
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'paymentMethodName';

const PaymentMethodSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    paymentMethodName: { type: String, default: '' },
    methodType: { type: String, default: "None" },
    counterId: { type: mongoose.Schema.Types.ObjectId, ref: 'posCounter', default: null },
    ledgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    isActive: { type: String, default: "Yes" },
    isDefault: { type: String, default: "No" },
  },
  { timestamps: true }
);

export default mongoose.models.paymentMethod ||
  mongoose.model('paymentMethod', PaymentMethodSchema, 'paymentmethod');
