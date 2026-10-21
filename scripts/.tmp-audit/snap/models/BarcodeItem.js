import mongoose from 'mongoose';

/* Barcode Items
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'barcodeNo';

const BarcodeItemSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
  },
  { timestamps: true }
);

export default mongoose.models.barcodeItem ||
  mongoose.model('barcodeItem', BarcodeItemSchema, 'barcodeitem');
