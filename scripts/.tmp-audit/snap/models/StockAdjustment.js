import mongoose from 'mongoose';

/* Stock Adjustments
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'adjustmentNo';

const StockAdjustmentSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    /* Both of these are already columns on the list screen but were never
       declared here, so Mongoose's strict mode dropped them on every write
       and the Adjustment No / Created By cells rendered blank. */
    adjustmentNo: { type: String, default: '', index: true },
    createdBy: { type: String, default: '' },
    adjustmentReason: { type: String, default: '' },
    adjustmentDate: { type: Date, default: null },
    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    remarks: { type: String, default: '' },
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    type: { type: String, default: '' },
  },
  { timestamps: true }
);

export default mongoose.models.stockAdjustment ||
  mongoose.model('stockAdjustment', StockAdjustmentSchema, 'stockadjustment');
