import mongoose from 'mongoose';

/* Logistics
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'logisticNo';

const LogisticSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    logisticNo: { type: String, default: '' },
    logisticDate: { type: Date, default: null },
    ewayBillDate: { type: Date, default: null },
    vehicleNo: { type: String, default: '' },
    ewayBillNo: { type: String, default: '' },
    shippingType: { type: String, default: '' },
    freightAmount: { type: Number, default: null },
    paymentStatus: { type: String, default: "To be Paid" },
    noOfParcels: { type: Number, default: null },
  },
  { timestamps: true }
);

export default mongoose.models.logistic ||
  mongoose.model('logistic', LogisticSchema, 'logistic');
