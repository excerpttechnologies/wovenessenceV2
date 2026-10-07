import mongoose from 'mongoose';

/* Inter Company Sales Return.

   The accepting half of an Inter Company Auto Purchase Return. The branch
   that originally sent the goods sees the other side's return as a pending
   row; accepting it writes one of these, which is what the deployed
   "Accepted Inter Company Sale Returns" list shows.

   Scope is the ACCEPTING branch. fromBusinessId / fromLocationId are the
   branch returning the goods.

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'returnCode';

const IcSalesReturnSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    returnCode: { type: String, default: '', index: true },
    date: { type: Date, default: null },

    /* the other side's document */
    icAutoPurchaseReturnId: { type: mongoose.Schema.Types.ObjectId, ref: 'icAutoPurchaseReturn', default: null, index: true },
    refNo: { type: String, default: '' },

    fromBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },

    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.icSalesReturn ||
  mongoose.model('icSalesReturn', IcSalesReturnSchema, 'icsalesreturn');
