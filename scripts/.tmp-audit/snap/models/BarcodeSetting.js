// import mongoose from 'mongoose';

// /* Barcode Settings
//    Collection name is pinned lowercase: Mongoose would pluralise it
//    otherwise, and MongoDB collection names are case-sensitive. */

// export const LABEL_FIELD = 'name';

// const BarcodeSettingSchema = new mongoose.Schema(
//   {
//     businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
//     finYear: { type: String, default: '', index: true },
//     type: { type: String, default: "Periodic" },
//     subType: { type: String, default: "Monthly" },
//     periods: {
//       type: [new mongoose.Schema({
//         periodLabel: { type: String, default: '' },
//       prefix: { type: String, default: '' },
//       suffix: { type: String, default: '' },
//       startNumber: { type: Number, default: null },
//       numberLenght: { type: Number, default: null },
//       sampleBarcode: { type: String, default: '' },
//       effectiveDate: { type: Date, default: null },
//       expiryDate: { type: Date, default: null },
//       }, { _id: false })],
//       default: [],
//     },
//   },
//   { timestamps: true }
// );

// export default mongoose.models.barcodeSetting ||
//   mongoose.model('barcodeSetting', BarcodeSettingSchema, 'barcodesetting');









import mongoose from 'mongoose';

/* Barcode Settings

   One document per PERIOD row, matching the deployed list: a Monthly
   configuration for a financial year produces 12 rows, Quarterly 4, Yearly 1.
   Each row carries its own type/subType so the list can show them per row and
   a single period can be edited or deleted without touching its siblings.

   This replaces the earlier single-document-with-periods[] shape, which the
   list, the edit dialog and the delete action could not address individually.

   Collection name is pinned lowercase: Mongoose would pluralise it otherwise,
   and MongoDB collection names are case-sensitive. */

/* Dropdowns resolve a barcode setting through this field - /api/options and
   lib/refLabels both read LABEL_FIELD. It is derived on save (see the hook
   below), never entered by hand; before this, the model had no `name` at all
   and every barcode-setting dropdown rendered "(untitled)". */
export const LABEL_FIELD = 'name';

const BarcodeSettingSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    type: { type: String, default: 'Periodic' },
    subType: { type: String, default: 'Monthly' },

    /* position within the financial year: 1..12 monthly, 1..4 quarterly, 1 yearly */
    periodIndex: { type: Number, default: 1 },
    periodLabel: { type: String, default: '' },

    prefix: { type: String, default: '' },
    suffix: { type: String, default: '' },
    startNumber: { type: Number, default: null },
    numberLenght: { type: Number, default: null },
    sampleBarcode: { type: String, default: '' },
    effectiveDate: { type: Date, default: null },
    expiryDate: { type: Date, default: null },

    name: { type: String, default: '' },
  },
  { timestamps: true }
);

/* `name` is written by the API routes via rowName() in the page's fields.js -
   deliberately not a schema hook. A pre('findOneAndUpdate') hook looked
   tidier but silently failed to apply on update, leaving dropdown labels
   showing the pre-edit barcode; one explicit assignment per write path is
   easier to follow and to test. */

BarcodeSettingSchema.index({ businessId: 1, finYear: 1, subType: 1, periodIndex: 1 });

export default mongoose.models.barcodeSetting ||
  mongoose.model('barcodeSetting', BarcodeSettingSchema, 'barcodesetting');