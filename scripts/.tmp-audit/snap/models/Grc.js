import mongoose from 'mongoose';

/* Goods Receiptc Challans
   Collection name pinned lowercase - Mongoose would pluralise it otherwise
   and MongoDB collection names are case-sensitive. */

export const LABEL_FIELD = 'grcNumber';

const GrcSchema = new mongoose.Schema(
  {
    businessId: { type: mongoose.Schema.Types.ObjectId, ref: 'business', default: null, index: true },
    locationId: { type: mongoose.Schema.Types.ObjectId, ref: 'companyLocation', default: null, index: true },
    finYear: { type: String, default: '', index: true },
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    lrTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'delivery', default: null, index: true },
    lrTransactionNo: { type: String, default: '' },
    vendorGstNo: { type: String, default: '' },
    grcDate: { type: Date, default: null },
    vendorDocNo: { type: String, default: '' },
    purchaseTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
    grcNumber: { type: String, default: '' },
    purchaseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
    occasion: { type: String, default: '' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'contact', default: null },
    logisticId: { type: mongoose.Schema.Types.ObjectId, ref: 'logistic', default: null },
    stockPointId: { type: mongoose.Schema.Types.ObjectId, ref: 'stockPoint', default: null },
    stockPointName: { type: String, default: 'Warehouse' },
    vendorInvoiceCopy: { type: String, default: '' },
    vendorWaybill: { type: String, default: '' },
    hsnCode: { type: String, default: '' },
    invoiceQty: { type: Number, default: null },
    taxableValue: { type: Number, default: null },
    taxAmount: { type: Number, default: null },
    totalAmount: { type: Number, default: null },
    freightMode: { type: String, default: 'Before Tax' },
    freightAmount: { type: Number, default: null },
    taxable: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    /* The highest SEQ this GRC has given a barcode (SUPPLIER_CODE * GRC_NUMBER
       * SEQ * QTY). Only ever raised, so a deleted barcode's SEQ - and the
       value on a label that may still exist - is never given out again. */
    lastBarcodeSeq: { type: Number, default: 0 },
    /* set when this document is converted downstream; null = still available */
    purchaseInvoiceId: { type: mongoose.Schema.Types.ObjectId, default: null, index: true },

    /* line items are free-form per document type */
    items: { type: mongoose.Schema.Types.Mixed, default: [] },
    voucherRows: { type: mongoose.Schema.Types.Mixed, default: [] },
  },
  { timestamps: true }
);

export default mongoose.models.grc ||
  mongoose.model('grc', GrcSchema, 'grc');
