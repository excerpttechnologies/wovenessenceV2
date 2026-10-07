import mongoose from 'mongoose';

/* Vehicle Master - name / code / status, same shape as Driver and Route. */

export const LABEL_FIELD = 'name';

const VehicleSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    name: { type: String, default: '' },
    code: { type: String, default: '' },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.vehicle ||
  mongoose.model('vehicle', VehicleSchema, 'vehicle');
