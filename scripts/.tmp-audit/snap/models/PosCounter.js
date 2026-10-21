import mongoose from 'mongoose';

/* Pos Counters
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'counterName';

const PosCounterSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    counterName: { type: String, default: '' },
    status: { type: String, default: "Active" },
    invoiceLayout: { type: String, default: "Thermal printer 4 inch" },
    repeatInvoice: { type: Number, default: 1 },
  },
  { timestamps: true }
);

export default mongoose.models.posCounter ||
  mongoose.model('posCounter', PosCounterSchema, 'poscounter');
