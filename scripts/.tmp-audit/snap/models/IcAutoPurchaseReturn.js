import mongoose from 'mongoose';

/* Inter Company Auto Purchase Return.

   Goods going BACK from the branch that received them to the branch that sent
   them. Raised at the receiving end, it lands on the sender's Sales Return
   screen as a pending row.

   Scope is the branch raising the return. toBusinessId / toLocationId are
   where the goods are going - the original sender - which the deployed list
   shows as "To Business" / "To Location".

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'returnNo';

const IcAutoPurchaseReturnSchema = new mongoose.Schema(
  {
    /* source scope - the branch sending the goods back */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    /* destination - the original sender */
    toBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    toLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },

    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },

    returnNo: { type: String, default: '', index: true },
    returnDate: { type: Date, default: null },
    /* the debit note this return is settled against, once one is raised */
    debitNoteNo: { type: String, default: '' },

    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    salesPersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    salesTerm: { type: String, default: '' },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    customerWaybill: { type: String, default: '' },

    taxableValue: { type: Number, default: 0 },
    discountPercent: { type: Number, default: 0 },
    roundOffDiscountAmt: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    /* set when the receiving branch accepts it as a Sales Return;
       null = still pending on their side */
    icSalesReturnId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.icAutoPurchaseReturn ||
  mongoose.model('icAutoPurchaseReturn', IcAutoPurchaseReturnSchema, 'icautopurchasereturn');
