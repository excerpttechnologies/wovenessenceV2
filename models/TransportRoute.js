import mongoose from 'mongoose';

/* Route Master - name / code / status.

   Model name is `transportRoute` rather than `route`: `route` is generic
   enough to collide with anything else added later, and the collection is
   pinned explicitly. */

export const LABEL_FIELD = 'name';

const TransportRouteSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    name: { type: String, default: '' },
    code: { type: String, default: '' },
    status: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.transportRoute ||
  mongoose.model('transportRoute', TransportRouteSchema, 'transportroute');
