import mongoose from 'mongoose';

/* Inter Company Auto Purchase Received.

   The receiving half of an Inter Company Sales Invoice. When the destination
   branch accepts a pending invoice, one of these is written AND a real Goods
   Receipt Challan is created in that branch's own scope - which is why the
   deployed list has a "GRC No" column. From that point the goods behave like
   any other receipt: the GRC appears in Purchase -> Goods Receipt Challan and
   can be turned into a Purchase Invoice.

   The tenant scope here is the RECEIVER. fromBusinessId / fromLocationId are
   the branch that sent it, shown as "Form Business" / "Form Location" on the
   deployed screen (their spelling).

   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'recNo';

const IcAutoPurchaseReceivedSchema = new mongoose.Schema(
  {
    /* receiver scope */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },

    recNo: { type: String, default: '', index: true },
    date: { type: Date, default: null },

    /* what was accepted, and what it became */
    icSalesInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'icSalesInvoice', default: null, index: true },
    invoiceNo: { type: String, default: '' },
    grcId: { type: mongoose.Schema.Types.ObjectId, ref: 'grc', default: null },
    grcNo: { type: String, default: '' },

    /* sender */
    fromBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },

    totalQty: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.icAutoPurchaseReceived ||
  mongoose.model('icAutoPurchaseReceived', IcAutoPurchaseReceivedSchema, 'icautopurchasereceived');
