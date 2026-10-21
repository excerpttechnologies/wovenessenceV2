import mongoose from 'mongoose';

/* Barcode Print Label
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'batchNo';

const BarcodePrintBatchSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    barcodeSettingId: { type: mongoose.Schema.Types.ObjectId, ref: 'barcodeLabelSetting', default: null },
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.barcodePrintBatch ||
  mongoose.model('barcodePrintBatch', BarcodePrintBatchSchema, 'barcodeprintbatch');
