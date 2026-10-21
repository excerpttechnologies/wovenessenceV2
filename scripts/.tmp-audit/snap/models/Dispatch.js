// import mongoose from 'mongoose';

// /* Dispatch - doc no / date / party / amount / status. */

// export const LABEL_FIELD = 'docNo';

// const DispatchSchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
//     locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
//     finYear: { type: String, default: '', index: true },
//     docNo: { type: String, default: '' },
//     date: { type: Date, default: null },
//     party: { type: String, default: '' },
//     amount: { type: Number, default: null },
//     status: { type: String, default: 'Pending' },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.dispatch ||
//   mongoose.model('dispatch', DispatchSchema, 'dispatch');









import mongoose from 'mongoose';

/* Dispatch

   A dispatch is a vehicle leaving with a driver on a route, carrying one or
   more Delivery / LR consignments. It is a transaction, not a master:

     - docNo is issued on save (DSP/<fy>/<seq>), never typed
     - deliveryIds are claimed at creation and released if the dispatch is
       deleted; each delivery carries the matching dispatchId back-reference
     - amount and freightTotal are summed from the claimed deliveries rather
       than entered, so the figures cannot drift from the consignments */

export const LABEL_FIELD = 'docNo';

const DispatchSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    docNo: { type: String, default: '', index: true },
    date: { type: Date, default: null },

    vehicleId: { type: mongoose.Schema.Types.ObjectId, ref: 'vehicle', default: null },
    driverId: { type: mongoose.Schema.Types.ObjectId, ref: 'driver', default: null },
    routeId: { type: mongoose.Schema.Types.ObjectId, ref: 'transportRoute', default: null },

    deliveryIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'delivery', default: [] },

    party: { type: String, default: '' },
    /* summed from the consignments on save */
    amount: { type: Number, default: 0 },
    freightTotal: { type: Number, default: 0 },
    parcelTotal: { type: Number, default: 0 },

    status: { type: String, default: 'Pending' },
  },
  { timestamps: true }
);

export default mongoose.models.dispatch ||
  mongoose.model('dispatch', DispatchSchema, 'dispatch');