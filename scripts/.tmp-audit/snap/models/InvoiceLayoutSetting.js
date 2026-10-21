import mongoose from 'mongoose';

/* Invoice Layout Settings
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const InvoiceLayoutSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    rows: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.invoiceLayoutSetting ||
  mongoose.model('invoiceLayoutSetting', InvoiceLayoutSettingSchema, 'invoicelayoutsetting');
