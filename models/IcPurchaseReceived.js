import mongoose from 'mongoose';

/* Inter Company AUTO PURCHASE RECEIVED - the RECEIVER's record of a
   consignment Sales Invoice (models/IcItemInvoice.js) it has accepted.

   Flow (user, 14-10-2026): the sender bills sold units on Inter Company
   Sell > Sales Invoice and generates the e-invoice (IRN); the invoice then
   waits on the receiver's Auto Purchases Receiveds page, where the receiver
   checks each line (Product Group / HSN may be corrected) and Saves. Saving
   writes ONE of these per invoice.

   RECORD ONLY - no stock moves. The receiver's stock already arrived when it
   approved the Delivery Challan; adding it again here would double count.

   NOT models/IcAutoPurchaseReceived.js: that belongs to the older hidden
   whole-challan flow and writes GRCs. The two do not mix, so this has its
   own collection. Collection name pinned lowercase. */

export const LABEL_FIELD = 'recNo';

const IcPurchaseReceivedSchema = new mongoose.Schema(
  {
    /* the RECEIVER - whose purchase this is */
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '' },
    recNo: { type: String, default: '' },
    receivedAt: { type: Date, default: null },

    /* the sender's invoice it came from - one record per invoice */
    icItemInvoiceId: { type: mongoose.Schema.Types.ObjectId, ref: 'icItemInvoice', default: null, unique: true, sparse: true },
    invoiceNo: { type: String, default: '' },
    invoiceDate: { type: Date, default: null },
    irn: { type: String, default: '' },
    fromBusinessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null },
    fromLocationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null },
    fromBusinessName: { type: String, default: '' },
    fromLocationName: { type: String, default: '' },

    /* the invoice's lines as received, plus the receiver's
       productGroupId / productGroupName / hsn for each */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },

    totalQty: { type: Number, default: 0 },
    taxableValue: { type: Number, default: 0 },
    igstTotal: { type: Number, default: 0 },
    cgstTotal: { type: Number, default: 0 },
    sgstTotal: { type: Number, default: 0 },
    roundOff: { type: Number, default: 0 },
    netValue: { type: Number, default: 0 },

    createdBy: { type: String, default: '' },
  },
  { timestamps: true }
);

IcPurchaseReceivedSchema.index({ businessId: 1, createdAt: -1 });

export default mongoose.models.icPurchaseReceived ||
  mongoose.model('icPurchaseReceived', IcPurchaseReceivedSchema, 'icpurchasereceived');
