import mongoose from 'mongoose';

/* Driver Master - name / code / status. */

export const LABEL_FIELD = 'name';

const DriverSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    name: { type: String, default: '' },
    code: { type: String, default: '' },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.driver ||
  mongoose.model('driver', DriverSchema, 'driver');
