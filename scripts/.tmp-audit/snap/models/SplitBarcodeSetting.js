import mongoose from 'mongoose';

/* Split Barcode Settings
   Collection name is pinned lowercase: Mongoose would pluralise it
   otherwise, and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'name';

const SplitBarcodeSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    useFor: { type: String, default: "Current Setting" },
    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    startNumber: { type: Number, default: null },
    numberLenght: { type: Number, default: null },
    sampleBarcode: { type: String, default: '' },
    effectiveDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },
    status: { type: String, default: "Active" },
  },
  { timestamps: true }
);

export default mongoose.models.splitBarcodeSetting ||
  mongoose.model('splitBarcodeSetting', SplitBarcodeSettingSchema, 'splitbarcodesetting');
