import mongoose from 'mongoose';

/* Delivery Challans
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'deliveryChallanNo';

const DeliveryChallanSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    customerId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    customerGstn: { type: String, default: '' },
    customerAddress: { type: String, default: '' },
    dcDate: { type: Date, default: null },
    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    salesTerm: { type: String, default: '' },
    salesGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
    salesPersonId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    salesLedgerId: { type: mongoose.Schema.Types.ObjectId, ref: 'ledger', default: null },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    customerWaybill: { type: String, default: '' },
    taxableValue: { type: Number, default: null },
    discountPercent: { type: Number, default: 0 },
    roundOffDiscountAmt: { type: Number, default: 0 },
    roundOff: { type: Number, default: null },
    netValue: { type: Number, default: null },
    deliveryChallanNo: { type: String, default: '' },
    stockTransferLocationId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'stockTransferLocation', default: null, index: true,
    },
    stockTransferReceivedId: {
      type: mongoose.Schema.Types.ObjectId, ref: 'stockTransferReceived', default: null, index: true,
    },
    sourceDocNo: { type: String, default: '' },
    totalQty: { type: Number, default: 0 },
    totalAmount: { type: Number, default: 0 },
    status: { type: String, default: 'generated' },
    customerMobile: { type: String, default: '' },
    /* set when this document is converted downstream; null = still available */
    salesInvoiceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.deliveryChallan ||
  mongoose.model('deliveryChallan', DeliveryChallanSchema, 'deliverychallan');
