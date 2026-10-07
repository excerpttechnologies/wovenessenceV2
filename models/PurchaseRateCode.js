import mongoose from 'mongoose';

/* Purchase Rate Code Master - the digit -> letter table used to encode a
   purchase rate on a barcode label.

   ONE ACTIVE RECORD PER SCOPE, upserted in place, the same shape as
   models/BarcodeLabelSetting.js: a second row would leave two answers to
   "which code is in force", and every save would silently create another.

   digitMappings is Mixed because its keys are the digits themselves ('0'
   through '9'), which a typed sub-schema cannot express. The shape is
   enforced by validateMapping() in lib/purchaseRateCode.js, on the API route,
   before anything is written.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

const PurchaseRateCodeSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },

    /* { '1': 'A', '2': 'B', ... '9': 'I', '0': 'J' } - stored upper-cased and trimmed */
    digitMappings: { type: mongoose.Schema.Types.Mixed, default: {} },

    /* Lets an admin park a configuration without deleting it. Encoding treats
       an inactive record as "not configured" and prints nothing, rather than
       falling back to some built-in alphabet. */
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

export default mongoose.models.purchaseRateCode ||
  mongoose.model('purchaseRateCode', PurchaseRateCodeSchema, 'purchaseratecode');
