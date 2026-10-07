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
    supplierId: { type: mongoose.Schema.Types.ObjectId, ref: 'supplier', default: null },
    lrTransactionId: { type: mongoose.Schema.Types.ObjectId, ref: 'delivery', default: null, index: true },
    lrTransactionNo: { type: String, default: '' },
    vendorGstNo: { type: String, default: '' },
    grcDate: { type: Date, default: null },
    vendorDocNo: { type: String, default: '' },
    purchaseTermId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseTerm', default: null },
    grcNumber: { type: String, default: '' },
    purchaseGroupId: { type: mongoose.Schema.Types.ObjectId, ref: 'purchaseGroup', default: null },
    occasion: { type: String, default: '' },
    agentId: { type: mongoose.Schema.Types.ObjectId, ref: 'agent', default: null },
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
    /* The operator's own adjustment to the final amount, entered in the
       Voucher Section. SIGNED: -0.50 takes fifty paise off the total and
       +0.50 adds it, so it is never clamped to positive. The Edit screen's
       Net Purchases Value has always added it
       (app/admin/transaction/purchase/grc/[id]/page.jsx) - it simply had
       nowhere to be entered and no path to be stored on until now. */
    roundOff: { type: Number, default: 0 },
    taxable: { type: Number, default: 0 },
    totalQuantity: { type: Number, default: 0 },
    gst: { type: Number, default: 0 },
    netAmount: { type: Number, default: 0 },
    /* The highest SEQ this GRC has given a barcode - its running number
       across the whole GRC. Only ever raised. Values composed before
       2026-09-17 carry it as their fourth part. */
    lastBarcodeSeq: { type: Number, default: 0 },
    /* The highest SERIAL_NO given on each Bill Sl No. (key serialFloorKey,
       "b5" for line 5) - the fourth part of SUPPLIER_CODE * GRC_NUMBER *
       BILL_SL_NO * SERIAL_NO. Only ever raised, so the value of a deleted
       barcode, whose label may still exist, is never given out again.
       serialFloorBase is the floor every line started from when a GRC made
       before per-line serials got its map. No default: an absent map is how
       lib/barcodeValue.js serialFloorOf recognises such a GRC. Written by the
       save route through the driver. */
    lastSerialByBill: { type: mongoose.Schema.Types.Mixed, default: undefined },
    serialFloorBase: { type: Number, default: undefined },
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
