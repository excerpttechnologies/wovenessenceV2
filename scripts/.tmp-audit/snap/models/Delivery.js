// import mongoose from 'mongoose';

// /* Delivery / LR Transaction

//    One consignment booked with a transporter. Transaction No is generated on
//    save (LR/<fy>/<seq>) and never entered by hand.

//    The freight figures are stored rather than recomputed on read, so a rate
//    change later doesn't silently rewrite historical documents. */

// export const LABEL_FIELD = 'transactionNo';

// const DeliverySchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
//     locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
//     finYear: { type: String, default: '', index: true },

//     transactionNo: { type: String, default: '', index: true },
//     transactionDate: { type: Date, default: null },
//     transporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'transporter', default: null, index: true },
//     lrNumber: { type: String, default: '' },
//     bookingDate: { type: Date, default: null },

//     supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
//     invPmNumber: { type: String, default: '' },
//     parcelQty: { type: Number, default: null },
//     value: { type: Number, default: null },

//     freightAmount: { type: Number, default: 0 },
//     gstApplicable: { type: String, default: 'No' },
//     /* split out so the view dialog can show "Input CGST @ x%" without
//        reverse-engineering it from the totals */
//     gstRate: { type: Number, default: 0 },
//     inputCgst: { type: Number, default: 0 },
//     inputSgst: { type: Number, default: 0 },
//     totalFreight: { type: Number, default: 0 },

//     autoCharges: { type: Number, default: 0 },
//     tips: { type: Number, default: 0 },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.delivery ||
//   mongoose.model('delivery', DeliverySchema, 'delivery');










import mongoose from 'mongoose';

/* Delivery / LR Transaction

   One consignment booked with a transporter. Transaction No is generated on
   save (LR/<fy>/<seq>) and never entered by hand.

   The freight figures are stored rather than recomputed on read, so a rate
   change later doesn't silently rewrite historical documents. */

export const LABEL_FIELD = 'transactionNo';

const DeliverySchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    transactionNo: { type: String, default: '', index: true },
   document: { type: String, default: '' },
    transactionDate: { type: Date, default: null },
    transporterId: { type: mongoose.Schema.Types.ObjectId, ref: 'transporter', default: null, index: true },
    lrNumber: { type: String, default: '' },
    bookingDate: { type: Date, default: null },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    invPmNumber: { type: String, default: '' },
    parcelQty: { type: Number, default: null },
    value: { type: Number, default: null },

    freightAmount: { type: Number, default: 0 },
    gstApplicable: { type: String, default: 'No' },
    /* split out so the view dialog can show "Input CGST @ x%" without
       reverse-engineering it from the totals */
    gstRate: { type: Number, default: 0 },
    inputCgst: { type: Number, default: 0 },
    inputSgst: { type: Number, default: 0 },
    totalFreight: { type: Number, default: 0 },

    autoCharges: { type: Number, default: 0 },
    tips: { type: Number, default: 0 },
    supplierContactId: { type: String, default: '' },

    /* Set when a dispatch picks this consignment up; null means it is still
       available. Same pattern as GRC -> Purchase Invoice elsewhere in the
       app, so the "unassigned" filter reads the same way. */
    dispatchId: { type: mongoose.Schema.Types.ObjectId, ref: 'dispatch', default: null, index: true },
  },
  { timestamps: true }
);

/* Unique transaction number per business + location + financial year.
   Prevents duplicate LR numbers when two users save simultaneously. */
DeliverySchema.index(
  { businessId: 1, locationId: 1, finYear: 1, transactionNo: 1 },
  { unique: true, partialFilterExpression: { transactionNo: { $gt: '' } } }
);

export default mongoose.models.delivery ||
  mongoose.model('delivery', DeliverySchema, 'delivery');